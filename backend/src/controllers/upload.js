// =============================================================================
// upload.js  —  ImageKit auth + compressed image upload proxy
// =============================================================================
//
// npm install sharp
//
// ENV vars needed:
//   IMAGEKIT_PRIVATE_KEY
//   IMAGEKIT_PUBLIC_KEY
//   IMAGEKIT_URL_ENDPOINT   e.g. https://ik.imagekit.io/your_id
//
// Routes to register in authRoute.js:
//   router.get ("/upload",        imagekitAuth);
//   router.post("/upload-image",  requireAuth, uploadImage);
//
// The POST route expects multipart/form-data with:
//   file    — the image file
//   folder  — destination folder in ImageKit (e.g. "products", "reviews")
//   fileName — optional custom file name (defaults to original name)
// =============================================================================

import crypto    from "crypto";
import sharp     from "sharp";
import FormData  from "form-data";
// =============================================================================
// IMAGEKIT AUTH  (GET /api/auth/upload)
// Returns signed token so the frontend SDK can upload directly.
// =============================================================================
export function imagekitAuth(req, res) {
    const IMAGEKIT_PRIVATE_KEY = process.env.IMAGEKIT_PRIVATE_KEY;
    const IMAGEKIT_PUBLIC_KEY  = process.env.IMAGEKIT_PUBLIC_KEY;

    const token     = crypto.randomUUID();
    const expire    = Math.floor(Date.now() / 1000) + 600; // 10 min
    const signature = crypto
        .createHmac("sha1", IMAGEKIT_PRIVATE_KEY)
        .update(token + expire)
        .digest("hex");

    return res.json({ token, expire, signature, publicKey: IMAGEKIT_PUBLIC_KEY });
}

// =============================================================================
// COMPRESSION SETTINGS
// Strategy: convert everything to WebP for best size/quality ratio.
//   - quality 82  →  very hard to distinguish from lossless at normal viewing sizes
//   - resize max 1600px on the longest side — enough for full-screen on 1080p monitors
//   - strip all metadata (EXIF, GPS, color profiles) — saves ~10-30KB per photo
//
// Why WebP?
//   ImageKit serves it natively and falls back to JPEG for older browsers.
//   Same perceived quality as JPEG at ~25-35% smaller file size.
//
// Tweak these if you need sharper product shots (raise quality to 88)
// or smaller thumbnails (lower maxDimension to 1200).
// =============================================================================
const COMPRESS_OPTIONS = {
    maxDimension: 1600,   // px — longest side; shorter side scales proportionally
    quality:      82,     // 0-100; 80-85 is the sweet spot for product images
    format:       "webp", // "webp" | "jpeg" | "png"
};

async function compressImage(buffer, originalName) {
    const image = sharp(buffer);
    const meta  = await image.metadata();

    // Determine if resize is needed
    const needsResize = (meta.width  > COMPRESS_OPTIONS.maxDimension)
                     || (meta.height > COMPRESS_OPTIONS.maxDimension);

    let pipeline = image;

    if (needsResize) {
        pipeline = pipeline.resize({
            width:  COMPRESS_OPTIONS.maxDimension,
            height: COMPRESS_OPTIONS.maxDimension,
            fit:    "inside",       // preserves aspect ratio, never crops
            withoutEnlargement: true, // never upscale small images
        });
    }

    // Strip metadata + convert to WebP
    pipeline = pipeline
        .withMetadata(false)  // strips EXIF / GPS / color profiles
        .webp({ quality: COMPRESS_OPTIONS.quality });

    const compressed = await pipeline.toBuffer();

    // Build a clean .webp filename
    const baseName = originalName.replace(/\.[^/.]+$/, ""); // strip extension
    const fileName = `${baseName}.webp`;

    return { buffer: compressed, fileName, mimeType: "image/webp" };
}

// =============================================================================
// UPLOAD IMAGE  (POST /api/auth/upload-image)
//
// Expects multer or similar middleware to parse multipart — OR raw Buffer.
// This controller handles both:
//   A) req.file from multer (memory storage)
//   B) raw buffer passed via other means
//
// Add multer to your project:  npm install multer
// Mount in authRoute.js:
//   import multer from "multer";
//   const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
//   router.post("/upload-image", requireAuth, upload.single("file"), uploadImage);
// =============================================================================
export async function uploadImage(req, res) {
    // ── Get the raw file buffer ───────────────────────────────────────────────
    const rawBuffer    = req.file?.buffer;
    const originalName = req.file?.originalname || "upload.jpg";
    const folder       = req.body?.folder       || "general";
    const customName   = req.body?.fileName;

    if (!rawBuffer) {
        return res.status(400).json({ message: "No file uploaded." });
    }

    // ── Validate it's actually an image ───────────────────────────────────────
    const allowedMimes = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];
    if (req.file?.mimetype && !allowedMimes.includes(req.file.mimetype)) {
        return res.status(400).json({ message: "Only image files are accepted." });
    }

    try {
        // ── Compress ──────────────────────────────────────────────────────────
        const { buffer: compressed, fileName, mimeType } =
            await compressImage(rawBuffer, customName || originalName);

        // Log compression savings (useful during dev; remove in production if noisy)
        const savingPct = (((rawBuffer.length - compressed.length) / rawBuffer.length) * 100).toFixed(1);
        console.log(
            `[uploadImage] ${originalName} → ${fileName} | ` +
            `${(rawBuffer.length / 1024).toFixed(0)}KB → ${(compressed.length / 1024).toFixed(0)}KB ` +
            `(${savingPct}% smaller)`
        );

        // ── Upload to ImageKit ────────────────────────────────────────────────
        const IMAGEKIT_PRIVATE_KEY  = process.env.IMAGEKIT_PRIVATE_KEY;
        const IMAGEKIT_UPLOAD_URL   = "https://upload.imagekit.io/api/v1/files/upload";

        const form = new FormData();
        form.append("file",       compressed,  { filename: fileName, contentType: mimeType });
        form.append("fileName",   fileName);
        form.append("folder",     `/${folder}`);
        form.append("useUniqueFileName", "true");

        // ImageKit uses HTTP Basic auth: privateKey as username, empty password
        const authHeader = "Basic " + Buffer.from(IMAGEKIT_PRIVATE_KEY + ":").toString("base64");

        const ikRes  = await fetch(IMAGEKIT_UPLOAD_URL, {
            method:  "POST",
            headers: { ...form.getHeaders(), Authorization: authHeader },
            body:    form,
        });

        const ikData = await ikRes.json();

        if (!ikRes.ok) {
            console.error("[uploadImage] ImageKit error:", ikData);
            return res.status(502).json({ message: "Image upload failed.", detail: ikData });
        }

        // ── Return the URL to the frontend ────────────────────────────────────
        return res.status(200).json({
            url:      ikData.url,
            fileId:   ikData.fileId,
            name:     ikData.name,
            width:    ikData.width,
            height:   ikData.height,
            size:     ikData.size,
        });

    } catch (err) {
        console.error("[uploadImage]", err);
        return res.status(500).json({ message: "Something went wrong during upload." });
    }
}

import { Wishlist, Product } from "../models/modelCenter.js";

// =============================================================================
// TOGGLE WISHLIST  (requireAuth — customers only, not guests)
// =============================================================================
/**
 * POST /api/auth/wishlist/toggle
 *
 * If the product is NOT in the wishlist  → adds it.
 * If the product IS already in wishlist  → removes it.
 *
 * Guests hit this and get 403 — the frontend should redirect to /pages/signin.html
 * before this is even called, but the server enforces it as a safety net.
 *
 * Body:
 *   required  product_id
 *   optional  variant_id  (stores a preferred variant, e.g. the one viewed)
 *
 * Response 200:
 *   { action: "added" | "removed", product_id }
 *
 * Response 400 — missing product_id
 * Response 403 — guest user
 * Response 404 — product not found
 */
async function toggleWishlist(req, res) {
    const { product_id, variant_id = null } = req.body;

    // ── Guests cannot wishlist ────────────────────────────────────────────────
    if (req.user.role === "guest") {
        return res.status(403).json({
            message:  "Please sign in to save items to your wishlist.",
            redirect: "/pages/signin.html",
        });
    }

    if (!product_id) {
        return res.status(400).json({ message: "product_id is required." });
    }

    try {
        // ── Verify the product exists and is active ───────────────────────────
        const product = await Product.findOne({
            _id:        product_id,
            is_active:  true,
            deleted_at: null,
        }).select("_id");

        if (!product) {
            return res.status(404).json({ message: "Product not found." });
        }

        // ── Get or create wishlist ────────────────────────────────────────────
        let wishlist = await Wishlist.findOne({ user_id: req.user._id });

        if (!wishlist) {
            // First wishlist item — create the document
            wishlist = await Wishlist.create({
                user_id: req.user._id,
                items: [{
                    product_id,
                    variant_id: variant_id || null,
                }],
            });

            return res.status(200).json({
                action:     "added",
                product_id,
            });
        }

        // ── Check if already wishlisted ───────────────────────────────────────
        const existingIndex = wishlist.items.findIndex(
            item => item.product_id.toString() === String(product_id)
        );

        if (existingIndex !== -1) {
            // ── Remove ────────────────────────────────────────────────────────
            wishlist.items.splice(existingIndex, 1);
            await wishlist.save();

            return res.status(200).json({
                action:     "removed",
                product_id,
            });
        }

        // ── Add ───────────────────────────────────────────────────────────────
        wishlist.items.push({
            product_id,
            variant_id: variant_id || null,
        });
        await wishlist.save();

        return res.status(200).json({
            action:     "added",
            product_id,
        });

    } catch (err) {
        console.error("[toggleWishlist]", err);
        return res.status(500).json({ message: "Something went wrong. Please try again." });
    }
}

// =============================================================================
// GET WISHLIST PRODUCT IDS  (requireAuth — customers only)
// =============================================================================
/**
 * GET /api/auth/wishlist/ids
 *
 * Returns just the product_ids in the user's wishlist.
 * Used on page load so the frontend can highlight heart icons for products
 * already wishlisted — without fetching full product detail again.
 *
 * Response 200:
 *   { product_ids: ["...", "..."] }
 */
async function getWishlistIds(req, res) {
    if (req.user.role === "guest") {
        return res.status(200).json({ product_ids: [] });
    }

    try {
        const wishlist = await Wishlist.findOne({ user_id: req.user._id })
            .select("items.product_id")
            .lean();

        if (!wishlist) {
            return res.status(200).json({ product_ids: [] });
        }

        const product_ids = wishlist.items.map(i => i.product_id.toString());

        return res.status(200).json({ product_ids });

    } catch (err) {
        console.error("[getWishlistIds]", err);
        return res.status(500).json({ message: "Something went wrong." });
    }
}
// =============================================================================
// GET WISHLIST  (requireAuth — customer only)
// =============================================================================
/**
 * GET /api/auth/wishlist?page=1&limit=12
 *
 * Returns paginated wishlist items populated with product details.
 * Skips products that have been deleted or deactivated since being wishlisted.
 *
 * Response 200:
 *   {
 *     items: [{
 *       wishlist_item_id,
 *       added_at,
 *       product: { _id, name, slug, base_price, is_preorder, images, variants }
 *     }],
 *     total,       // total active wishlist items (after filtering deleted products)
 *     page,
 *     limit,
 *     has_more
 *   }
 *
 * Response 200 (guest): { items: [], total: 0, page: 1, limit: 12, has_more: false }
 */
async function getWishlist(req, res) {
    if (req.user.role === "guest") {
        return res.status(200).json({ items: [], total: 0, page: 1, limit: 12, has_more: false });
    }
 
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(24, parseInt(req.query.limit) || 12);
    const skip  = (page - 1) * limit;
 
    try {
        const wishlist = await Wishlist.findOne({ user_id: req.user._id }).lean();
 
        if (!wishlist || !wishlist.items.length) {
            return res.status(200).json({ items: [], total: 0, page, limit, has_more: false });
        }
 
        // ── Collect product IDs preserving wishlist order ─────────────────────
        const productIds = wishlist.items.map(i => i.product_id);
 
        // ── Fetch active products only ────────────────────────────────────────
        const products = await Product.find({
            _id:        { $in: productIds },
            is_active:  true,
            deleted_at: null,
        })
        .select("_id name slug base_price is_preorder images variants")
        .lean();
 
        const productMap = new Map(products.map(p => [String(p._id), p]));
 
        // ── Build ordered items, skip unavailable products ────────────────────
        const activeItems = wishlist.items
            .map(item => {
                const product = productMap.get(String(item.product_id));
                if (!product) return null;
 
                return {
                    wishlist_item_id: item._id,
                    added_at:         item.added_at,
                    product: {
                        ...product,
                        variants: (product.variants || []).filter(v => v.is_active && !v.deleted_at),
                    },
                };
            })
            .filter(Boolean);
 
        const total    = activeItems.length;
        const paged    = activeItems.slice(skip, skip + limit);
        const has_more = skip + limit < total;
 
        return res.status(200).json({ items: paged, total, page, limit, has_more });
 
    } catch (err) {
        console.error("[getWishlist]", err);
        return res.status(500).json({ message: "Something went wrong." });
    }
}

// =============================================================================
// REMOVE FROM WISHLIST  (requireAuth — customer only)
// =============================================================================
/**
 * DELETE /api/auth/wishlist/:product_id
 *
 * Removes a specific product from the wishlist.
 *
 * Response 200: { message, product_id }
 * Response 404: product not in wishlist
 */
async function removeFromWishlist(req, res) {
    const { product_id } = req.params;
 
    if (req.user.role === "guest") {
        return res.status(403).json({ message: "Please sign in to manage your wishlist." });
    }
 
    if (!product_id) {
        return res.status(400).json({ message: "product_id is required." });
    }
 
    try {
        const wishlist = await Wishlist.findOne({ user_id: req.user._id });
 
        if (!wishlist) {
            return res.status(404).json({ message: "Wishlist not found." });
        }
 
        const index = wishlist.items.findIndex(
            item => item.product_id.toString() === String(product_id)
        );
 
        if (index === -1) {
            return res.status(404).json({ message: "Product not found in wishlist." });
        }
 
        wishlist.items.splice(index, 1);
        await wishlist.save();
 
        return res.status(200).json({ message: "Removed from wishlist.", product_id });
 
    } catch (err) {
        console.error("[removeFromWishlist]", err);
        return res.status(500).json({ message: "Something went wrong." });
    }
}

export {removeFromWishlist, getWishlist, toggleWishlist, getWishlistIds };
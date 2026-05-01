import mongoose from "mongoose";
import { Product, Category, Tag } from "../models/modelCenter.js";

// =============================================================================
// GET FILTER META  (public)
// =============================================================================
/**
 * GET /api/auth/products/filter-meta
 *
 * Returns all values needed to populate the sidebar filters:
 *   categories  — all non-deleted categories
 *   tags        — all tags that appear on at least one active product
 *   colors      — distinct color strings across all active product variants
 *   sizes       — distinct size strings across all active product variants
 *   price_range — { min, max } base_price across all active products
 *
 * This is called once on gallery page load and cached in JS.
 */
async function getFilterMeta(req, res) {
    try {
        const [categories, tags, priceAgg, variantAgg] = await Promise.all([
            // All non-deleted categories
            Category.find({ deleted_at: null }).select("_id name slug").lean(),

            // Tags that exist on active products
            Tag.find().select("_id name slug").lean(),

            // Price range
            Product.aggregate([
                { $match: { is_active: true, deleted_at: null } },
                { $group: {
                    _id: null,
                    min: { $min: "$base_price" },
                    max: { $max: "$base_price" },
                }},
            ]),

            // Distinct colors + sizes from active variants
            Product.aggregate([
                { $match: { is_active: true, deleted_at: null } },
                { $unwind: "$variants" },
                { $match: {
                    "variants.is_active": true,
                    "variants.deleted_at": null,
                    "variants.stock": { $gt: 0 },
                }},
                { $group: {
                    _id:    null,
                    colors: { $addToSet: "$variants.color" },
                    sizes:  { $addToSet: "$variants.size" },
                }},
            ]),
        ]);

        const priceRange = priceAgg[0] || { min: 0, max: 0 };
        const variantMeta = variantAgg[0] || { colors: [], sizes: [] };

        return res.status(200).json({
            categories,
            tags,
            colors:      variantMeta.colors.sort(),
            sizes:        variantMeta.sizes,
            price_range: { min: priceRange.min, max: priceRange.max },
        });

    } catch (err) {
        console.error("[getFilterMeta]", err);
        return res.status(500).json({ message: "Something went wrong." });
    }
}

// =============================================================================
// GET GALLERY PRODUCTS  (public, paginated + filtered)
// =============================================================================
/**
 * GET /api/auth/products/gallery
 *
 * Query params (all optional):
 *   page       — default 1
 *   limit      — default 30, max 60
 *   q          — text search on name + description
 *   category   — category _id
 *   tags       — comma-separated tag name strings (matches tag_names[])
 *   colors     — comma-separated color strings
 *   sizes      — comma-separated size strings
 *   minPrice   — minimum base_price
 *   maxPrice   — maximum base_price
 *   sort       — "newest" (default) | "price_asc" | "price_desc" | "popular"
 *
 * Response 200:
 *   { products: [...], total, page, limit, has_more }
 *
 * Each product includes:
 *   _id, name, slug, base_price, is_preorder, total_stock, images,
 *   variants (active only), category_id, tag_names
 */
async function getGalleryProducts(req, res) {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(60, parseInt(req.query.limit) || 30);
    const skip  = (page - 1) * limit;

    const {
        q, category, tags,
        colors, sizes,
        minPrice, maxPrice,
        sort = "newest",
    } = req.query;

    // ── Build match stage ─────────────────────────────────────────────────────
    const match = { is_active: true, deleted_at: null };

    if (q?.trim()) {
        match.$text = { $search: q.trim() };
    }
    if (category) {
        match.category_id = new mongoose.Types.ObjectId(category);
    }
    if (tags) {
        const tagList = tags.split(",").map(t => t.trim().toLowerCase()).filter(Boolean);
        if (tagList.length) match.tag_names = { $in: tagList };
    }
    if (minPrice || maxPrice) {
        match.base_price = {};
        if (minPrice) match.base_price.$gte = parseFloat(minPrice);
        if (maxPrice) match.base_price.$lte = parseFloat(maxPrice);
    }

    // ── Color / size filter needs variant-level matching ──────────────────────
    // We use a pipeline so we can filter on embedded variants then group back.
    const colorList = colors ? colors.split(",").map(c => c.trim()).filter(Boolean) : [];
    const sizeList  = sizes  ? sizes.split(",").map(s => s.trim()).filter(Boolean)  : [];

    // ── Sort ──────────────────────────────────────────────────────────────────
    const sortStage = {
        newest:     { createdAt: -1 },
        price_asc:  { base_price: 1 },
        price_desc: { base_price: -1 },
        popular:    { total_stock: -1 }, // rough proxy; good enough without aggregation
    }[sort] || { createdAt: -1 };

    try {
        // If no variant-level filters, use a simpler find() path
        if (!colorList.length && !sizeList.length) {
            const [products, total] = await Promise.all([
                Product.find(match, q?.trim() ? { score: { $meta: "textScore" } } : undefined)
                    .select("_id name slug base_price is_preorder total_stock images variants category_id tag_names")
                    .sort(q?.trim() ? { score: { $meta: "textScore" } } : sortStage)
                    .skip(skip)
                    .limit(limit)
                    .lean(),
                Product.countDocuments(match),
            ]);

            return res.status(200).json({
                products: cleanVariants(products),
                total, page, limit,
                has_more: skip + limit < total,
            });
        }

        // Variant-level filter path — aggregate
        const pipeline = [
            { $match: match },
            { $addFields: {
                variants: {
                    $filter: {
                        input: "$variants",
                        as:    "v",
                        cond:  {
                            $and: [
                                { $eq: ["$$v.is_active", true] },
                                { $eq: ["$$v.deleted_at", null] },
                                ...(colorList.length ? [{ $in: ["$$v.color", colorList] }] : []),
                                ...(sizeList.length  ? [{ $in: ["$$v.size",  sizeList]  }] : []),
                            ],
                        },
                    },
                },
            }},
            // Keep only products that still have matching variants
            { $match: { "variants.0": { $exists: true } } },
            { $sort: sortStage },
            { $facet: {
                data:  [
                    { $skip: skip },
                    { $limit: limit },
                    { $project: {
                        name: 1, slug: 1, base_price: 1, is_preorder: 1,
                        total_stock: 1, images: 1, variants: 1,
                        category_id: 1, tag_names: 1,
                    }},
                ],
                count: [{ $count: "total" }],
            }},
        ];

        const [result] = await Product.aggregate(pipeline);
        const products = result?.data  || [];
        const total    = result?.count?.[0]?.total || 0;

        return res.status(200).json({
            products: cleanVariants(products),
            total, page, limit,
            has_more: skip + limit < total,
        });

    } catch (err) {
        console.error("[getGalleryProducts]", err);
        return res.status(500).json({ message: "Something went wrong." });
    }
}

// Strip deleted/inactive variants from results
function cleanVariants(products) {
    return products.map(p => ({
        ...p,
        variants: (p.variants || []).filter(v => v.is_active && !v.deleted_at),
    }));
}

export { getFilterMeta, getGalleryProducts };
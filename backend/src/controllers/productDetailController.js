// =============================================================================
// productDetailController.js
//
// Add to authRoute.js (public — no requireAuth):
//   import { getProductBySlug } from "../controllers/productDetailController.js";
//   router.get("/products/detail/:slug", getProductBySlug);
//
// Register AFTER /products/filter-meta and /products/gallery to avoid
// "detail" being caught as a slug param.
// =============================================================================

import { Product, Category, Tag, Review } from "../models/modelCenter.js";

// =============================================================================
// GET PRODUCT BY SLUG  (public)
// =============================================================================
/**
 * GET /api/auth/products/detail/:slug
 *
 * Returns full product document including:
 *   - all active variants with stock/preorder info
 *   - all images sorted by sort_order
 *   - populated category name
 *   - tag names
 *   - approved review summary: count + average rating
 *
 * Response 200:
 *   { product: { ...full doc, category: { name }, review_summary: { count, avg } } }
 *
 * Response 404: product not found or inactive
 */
async function getProductBySlug(req, res) {
    const { slug } = req.params;

    if (!slug) return res.status(400).json({ message: "slug is required." });

    try {
        const product = await Product.findOne({
            slug:       slug.toLowerCase().trim(),
            is_active:  true,
            deleted_at: null,
        })
        .populate("category_id", "name slug")
        .lean();

        if (!product) {
            return res.status(404).json({ message: "Product not found." });
        }

        // Clean variants — only active, non-deleted
        product.variants = (product.variants || []).filter(v => v.is_active && !v.deleted_at);

        // Sort images by sort_order
        product.images = (product.images || []).sort((a, b) => a.sort_order - b.sort_order);

        // Review summary
        const Review = (await import("../models/modelCenter.js")).Review;
        const reviewAgg = await Review.aggregate([
            {
                $match: {
                    product_id:  product._id,
                    is_approved: true,
                    deleted_at:  null,
                },
            },
            {
                $group: {
                    _id:   null,
                    count: { $sum: 1 },
                    avg:   { $avg: "$rating" },
                },
            },
        ]);

        const review_summary = reviewAgg[0]
            ? { count: reviewAgg[0].count, avg: Math.round(reviewAgg[0].avg * 10) / 10 }
            : { count: 0, avg: 0 };

        return res.status(200).json({
            product: {
                ...product,
                category: product.category_id,   // already populated
                review_summary,
            },
        });

    } catch (err) {
        console.error("[getProductBySlug]", err);
        return res.status(500).json({ message: "Something went wrong." });
    }
}

export { getProductBySlug };
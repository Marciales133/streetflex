import mongoose from "mongoose";
import { Product, Review, Session, User, Cart, Wishlist, Order } from "../models/modelCenter.js";

// =============================================================================
// GET SESSION  (public)
// =============================================================================
/**
 * GET /api/auth/session
 * Reads auth_token cookie first, then guest_token.
 * Response 200: { user } or { user: null }
 */
async function getSession(req, res) {
    try {
        const authToken  = req.cookies?.auth_token;
        const guestToken = req.cookies?.guest_token;
        const token      = authToken || guestToken;

        if (!token) return res.status(200).json({ user: null });

        const session = await Session.findOne({
            $or: [{ token }, { guest_token: token }],
            expires_at: { $gt: new Date() },
        });

        if (!session) return res.status(200).json({ user: null });

        const user = await User.findOne({
            _id:        session.user_id,
            deleted_at: null,
            is_banned:  false,
        }).select("_id email role profile addresses");

        if (!user) return res.status(200).json({ user: null });

        const userObj = user.toObject();
        userObj.addresses = (userObj.addresses || []).filter(a => !a.deleted_at);

        return res.status(200).json({ user: userObj });

    } catch (err) {
        console.error("[getSession]", err);
        return res.status(500).json({ message: "Something went wrong." });
    }
}

// =============================================================================
// GET NEW ARRIVALS  (public)
// =============================================================================
/**
 * GET /api/auth/products/new-arrivals?limit=15
 *
 * FIX: removed total_stock > 0 filter — new arrivals shows ALL active products
 * regardless of stock. Out-of-stock items still appear but the dialog disables
 * the confirm button when a variant has no stock.
 *
 * Sorted by createdAt desc. Limit default 15, max 20.
 */
async function getNewArrivals(req, res) {
    const limit = Math.min(20, parseInt(req.query.limit) || 15);
    try {
        const products = await Product.find({
            is_active:  true,
            deleted_at: null,
            // FIX: no total_stock filter — show all active products
        })
        .select("_id name slug base_price is_preorder images variants")
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();

        const cleaned = products.map(p => ({
            ...p,
            variants: p.variants.filter(v => v.is_active && !v.deleted_at),
        }));

        return res.status(200).json({ products: cleaned });

    } catch (err) {
        console.error("[getNewArrivals]", err);
        return res.status(500).json({ message: "Something went wrong." });
    }
}

// =============================================================================
// GET POPULAR PRODUCTS  (public)
// =============================================================================
/**
 * GET /api/auth/products/popular?limit=15
 *
 * Popularity score per product (weighted):
 *   confirmed/processing/to_be_delivered/delivered orders  → 3 pts × quantity
 *   active cart items                                       → 2 pts × quantity
 *   wishlist entries                                        → 1 pt
 *
 * Aggregates across Order.items[], Cart.items[], and Wishlist.items[].
 * Falls back to newest active products if fewer than `limit` scored products.
 */
async function getPopularProducts(req, res) {
    const limit = Math.min(20, parseInt(req.query.limit) || 15);

    try {
        // ── Step 1: order scores (3 pts × qty per line item, all statuses) ──────
        const orderScores = await Order.aggregate([
            { $match: { deleted_at: null } },
            { $unwind: "$items" },
            {
                $group: {
                    _id:   "$items.product_id",
                    score: { $sum: { $multiply: ["$items.quantity", 3] } },
                },
            },
        ]);

        // ── Step 2: cart scores (2 pts × qty per cart item) ───────────────────
        const cartScores = await Cart.aggregate([
            { $unwind: "$items" },
            { $match: { "items.saved_for_later": { $ne: true } } },
            {
                $group: {
                    _id:   "$items.product_id",
                    score: { $sum: { $multiply: ["$items.quantity", 2] } },
                },
            },
        ]);

        // ── Step 3: wishlist scores (1 pt per entry) ──────────────────────────
        const wishlistScores = await Wishlist.aggregate([
            { $unwind: "$items" },
            {
                $group: {
                    _id:   "$items.product_id",
                    score: { $sum: 1 },
                },
            },
        ]);

        // ── Step 4: merge all scores into one map ─────────────────────────────
        const scoreMap = new Map();

        const addScores = (arr) => {
            arr.forEach(({ _id, score }) => {
                const key = String(_id);
                scoreMap.set(key, (scoreMap.get(key) || 0) + score);
            });
        };

        addScores(orderScores);
        addScores(cartScores);
        addScores(wishlistScores);

        // ── Step 5: sort product IDs by score desc ────────────────────────────
        const sortedIds = [...scoreMap.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit)
            .map(([id]) => new mongoose.Types.ObjectId(id));

        // ── Step 6: fetch product docs for top IDs ────────────────────────────
        let products = [];

        if (sortedIds.length > 0) {
            const found = await Product.find({
                _id:        { $in: sortedIds },
                is_active:  true,
                deleted_at: null,
            })
            .select("_id name slug base_price is_preorder images variants")
            .lean();

            // Restore sort order from scoreMap (find() doesn't preserve $in order)
            const productMap = new Map(found.map(p => [String(p._id), p]));
            products = sortedIds
                .map(id => productMap.get(String(id)))
                .filter(Boolean);
        }

        // ── Step 7: fallback — pad with newest if under limit ─────────────────
        if (products.length < limit) {
            const existingIds = products.map(p => p._id);
            const fallback = await Product.find({
                _id:        { $nin: existingIds },
                is_active:  true,
                deleted_at: null,
            })
            .select("_id name slug base_price is_preorder images variants")
            .sort({ createdAt: -1 })
            .limit(limit - products.length)
            .lean();

            products = [...products, ...fallback];
        }

        // ── Step 8: strip inactive/deleted variants ───────────────────────────
        const cleaned = products.map(p => ({
            ...p,
            variants: (p.variants || []).filter(v => v.is_active && !v.deleted_at),
        }));

        return res.status(200).json({ products: cleaned });

    } catch (err) {
        console.error("[getPopularProducts]", err);
        return res.status(500).json({ message: "Something went wrong." });
    }
}

// =============================================================================
// GET CURATED REVIEWS  (public)
// =============================================================================
/**
 * GET /api/auth/reviews/curated?limit=8
 * Approved reviews sorted by helpful_count desc.
 * Populated: user display_name + avatar, product name + primary image.
 */
async function getCuratedReviews(req, res) {
    const limit = Math.min(20, parseInt(req.query.limit) || 8);
    try {
        const reviews = await Review.find({
            is_approved: true,
            deleted_at:  null,
        })
        .select("_id product_id user_id rating comment helpful_count not_helpful_count images createdAt")
        .populate("user_id",    "profile.display_name profile.avatar_url")
        .populate("product_id", "name images")
        .sort({ helpful_count: -1, createdAt: -1 })
        .limit(limit)
        .lean();

        const shaped = reviews.map(r => ({
            ...r,
            product_id: r.product_id ? {
                _id:   r.product_id._id,
                name:  r.product_id.name,
                image: r.product_id.images?.find(i => i.is_primary)
                    || r.product_id.images?.[0]
                    || null,
            } : null,
        }));

        return res.status(200).json({ reviews: shaped });

    } catch (err) {
        console.error("[getCuratedReviews]", err);
        return res.status(500).json({ message: "Something went wrong." });
    }
}

// =============================================================================
// SEARCH SUGGESTIONS  (public)
// =============================================================================
/**
 * GET /api/auth/products/search?q=TERM&limit=8
 *
 * Returns lightweight product suggestions for the header search box.
 * Uses MongoDB text index on name + description (already defined on Product).
 * Falls back to a regex on name if the text search returns nothing.
 *
 * Response 200:
 *   { suggestions: [{ _id, name, slug, base_price, image_url }] }
 *
 * Each suggestion carries a slug so the frontend can build the link:
 *   /pages/item.html?slug=SLUG
 */
async function getSearchSuggestions(req, res) {
    const q     = (req.query.q || "").trim();
    const limit = Math.min(10, parseInt(req.query.limit) || 8);

    if (!q) return res.status(200).json({ suggestions: [] });

    try {
        // Primary: text index search (fast, ranked by relevance)
        let products = await Product.find(
            {
                $text:      { $search: q },
                is_active:  true,
                deleted_at: null,
            },
            { score: { $meta: "textScore" } }
        )
        .select("_id name slug base_price images")
        .sort({ score: { $meta: "textScore" } })
        .limit(limit)
        .lean();

        // Fallback: prefix regex on name if text search returns nothing
        if (!products.length) {
            products = await Product.find({
                name:       { $regex: q, $options: "i" },
                is_active:  true,
                deleted_at: null,
            })
            .select("_id name slug base_price images")
            .limit(limit)
            .lean();
        }

        const suggestions = products.map(p => ({
            _id:        p._id,
            name:       p.name,
            slug:       p.slug,
            base_price: p.base_price,
            image_url:  p.images?.find(i => i.is_primary)?.url
                    || p.images?.[0]?.url
                    || null,
        }));

        return res.status(200).json({ suggestions });

    } catch (err) {
        console.error("[getSearchSuggestions]", err);
        return res.status(500).json({ message: "Something went wrong." });
    }
}

export {
    getSession,
    getNewArrivals,
    getPopularProducts,
    getCuratedReviews,
    getSearchSuggestions,
};
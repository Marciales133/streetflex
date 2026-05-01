import {ReviewVote, Review, Notification, Order } from "../models/modelCenter.js";


const DEFAULT_AVATAR = "/assets/default_user_icon/defaultUserIcon.png";

// =============================================================================
// HELPERS
// =============================================================================
async function createNotification(user_id, type, message, ref_type, ref_id) {
    await Notification.create({ user_id, type, message, ref_type, ref_id });
}

// =============================================================================
// GET ALL REVIEWS
// =============================================================================
/**
 * GET /api/auth/reviews
 * Returns all reviews including deleted, oldest first.
 * Populates user, product, and order references.
 */
async function getReviews(req, res) {
    try {
        const reviews = await Review.find()
            .populate("user_id",    "email profile.display_name profile.avatar_url")
            .populate("product_id", "name variants images")
            .populate("order_id",   "createdAt items")
            .sort({ createdAt: 1 });

        return res.status(200).json({ reviews });
    } catch (err) {
        console.error("[getReviews]", err);
        return res.status(500).json({ message: "Something went wrong. Please try again." });
    }
}

// =============================================================================
// APPROVE REVIEW
// =============================================================================
/**
 * PATCH /api/auth/reviews/:id/approve
 *
 * Sets is_approved: true and notifies the user.
 */
async function approveReview(req, res) {
    try {
        const review = await Review.findOne({
            _id:        req.params.id,
            deleted_at: null,
        });

        if (!review) {
            return res.status(404).json({ message: "Review not found." });
        }
        if (review.is_approved) {
            return res.status(400).json({ message: "Review is already approved." });
        }

        review.is_approved = true;
        await review.save();

        await createNotification(
            review.user_id,
            "order_update",
            "Your review has been approved and is now live.",
            "reviews",
            review._id
        );

        return res.status(200).json({
            message: "Review approved.",
            review_id: review._id,
        });
    } catch (err) {
        console.error("[approveReview]", err);
        return res.status(500).json({ message: "Something went wrong. Please try again." });
    }
}

// =============================================================================
// DELETE REVIEW
// =============================================================================
/**
 * DELETE /api/auth/reviews/:id
 *
 * Soft deletes the review. No notification sent to user.
 */
async function deleteReview(req, res) {
    try {
        const review = await Review.findOne({
            _id:        req.params.id,
            deleted_at: null,
        });

        if (!review) {
            return res.status(404).json({ message: "Review not found or already deleted." });
        }

        review.deleted_at  = new Date();
        review.is_approved = false;
        await review.save();

        return res.status(200).json({ message: "Review deleted." });
    } catch (err) {
        console.error("[deleteReview]", err);
        return res.status(500).json({ message: "Something went wrong. Please try again." });
    }
}

// =============================================================================
// SUBMIT REVIEW (customer-facing)
// =============================================================================
/**
 * POST /api/auth/reviews
 *
 * Body: product_id, order_id, rating, comment (optional), images (optional)
 *
 * Rules:
 * - Only registered users (not guests)
 * - order_id must belong to the user and be in "delivered" status
 * - one review per user per product per order (enforced by unique index)
 */
async function submitReview(req, res) {
    const { product_id, order_id, rating, comment, images } = req.body;

    if (!product_id || !order_id || !rating) {
        return res.status(400).json({ message: "product_id, order_id, and rating are required." });
    }
    if (rating < 1 || rating > 5) {
        return res.status(400).json({ message: "Rating must be between 1 and 5." });
    }
    if (req.user.role === "guest") {
        return res.status(403).json({ message: "Guests cannot submit reviews. Please register first." });
    }

    try {
        // verify the order belongs to this user and is delivered
        const order = await Order.findOne({
            _id:     order_id,
            user_id: req.user._id,
            status:  "delivered",
        });

        if (!order) {
            return res.status(403).json({
                message: "Order not found, not delivered yet, or does not belong to you.",
            });
        }

        // verify the product is actually in that order
        const itemInOrder = order.items.find(i =>
            String(i.product_id) === String(product_id)
        );
        if (!itemInOrder) {
            return res.status(403).json({
                message: "This product was not part of the specified order.",
            });
        }

        const review = await Review.create({
            product_id,
            user_id:  req.user._id,
            order_id,
            rating,
            comment:  comment || "",
            images:   images  || [],
        });

        return res.status(201).json({
            message: "Review submitted. It will appear after admin approval.",
            review,
        });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(409).json({
                message: "You have already reviewed this product for this order.",
            });
        }
        console.error("[submitReview]", err);
        return res.status(500).json({ message: "Something went wrong. Please try again." });
    }
}


// =============================================================================
// reviewController.js  —  ADDITION
// Add getReviews to your existing review controller (wherever createReview lives).
//
// NEW ROUTE in authRoute.js  (public — no requireAuth needed):
//   router.get("/reviews", getReviews);
//
// NOTE: The existing getCuratedReviews route stays as-is at /reviews/curated.
//       Register THIS route at /reviews (without /curated) so they don't clash.
//       Express matches /reviews/curated first if you register it before /reviews.
// =============================================================================

// =============================================================================
// GET REVIEWS  (public — paginated, star-filtered)
// =============================================================================
/**
 * GET /api/auth/reviews?page=1&limit=25&rating=5
 *
 * Returns approved, non-deleted reviews sorted by helpful_count desc,
 * then createdAt desc as a tiebreaker.
 *
 * Query params:
 *   page   — default 1
 *   limit  — default 25, max 50
 *   rating — 1|2|3|4|5  (omit for all stars)
 *
 * Response 200:
 *   {
 *     reviews: [{
 *       _id, rating, comment, helpful_count, not_helpful_count,
 *       createdAt, images,
 *       user_id:    { profile: { display_name, avatar_url } },
 *       product_id: { name, images }   ← shaped to { name, image: { url } }
 *     }],
 *     total, page, limit, has_more
 *   }
 */
async function getPageReviews(req, res) {
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(50, parseInt(req.query.limit) || 25);
    const skip   = (page - 1) * limit;
    const rating = parseInt(req.query.rating);

    const filter = {
        is_approved: true,
        deleted_at:  null,
    };
    if (rating >= 1 && rating <= 5) filter.rating = rating;

    try {
        const [rawReviews, total] = await Promise.all([
            Review.find(filter)
                .select("_id product_id user_id rating comment helpful_count not_helpful_count images createdAt")
                .populate("user_id",    "profile.display_name profile.avatar_url")
                .populate("product_id", "name images")
                .sort({ helpful_count: -1, createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Review.countDocuments(filter),
        ]);

        // Shape product_id to match the format renderReviewSlides already expects
        const reviews = rawReviews.map(r => ({
            ...r,
            product_id: r.product_id ? {
                _id:   r.product_id._id,
                name:  r.product_id.name,
                image: r.product_id.images?.find(i => i.is_primary)
                    || r.product_id.images?.[0]
                    || null,
            } : null,
        }));

        return res.status(200).json({ reviews, total, page, limit, has_more: skip + limit < total });

    } catch (err) {
        console.error("[getReviews]", err);
        return res.status(500).json({ message: "Something went wrong." });
    }
}

/**
 * POST /api/auth/reviews/:id/vote
 * Body: { vote: "helpful" | "not_helpful" }
 *
 * - First vote: creates the doc, increments the tally
 * - Same vote again: removes the doc (toggle off), decrements
 * - Different vote: updates doc, adjusts both tallies
 */
async function voteReview(req, res) {
    const { vote } = req.body;
    const review_id = req.params.id;
    const user_id = req.user._id;

    if (!["helpful", "not_helpful"].includes(vote)) {
        return res.status(400).json({ message: "vote must be 'helpful' or 'not_helpful'." });
    }

    try {
        const existing = await ReviewVote.findOne({ review_id, user_id });

        if (!existing) {
            // First time voting
            await ReviewVote.create({ review_id, user_id, vote });
            await Review.findByIdAndUpdate(review_id, {
                $inc: { [`${vote === "helpful" ? "helpful_count" : "not_helpful_count"}`]: 1 },
            });
            return res.status(200).json({ action: "added", vote });
        }

        if (existing.vote === vote) {
            // Same vote — toggle off (remove)
            await existing.deleteOne();
            await Review.findByIdAndUpdate(review_id, {
                $inc: { [`${vote === "helpful" ? "helpful_count" : "not_helpful_count"}`]: -1 },
            });
            return res.status(200).json({ action: "removed", vote });
        }

        // Different vote — switch
        const oldVoteField = existing.vote === "helpful" ? "helpful_count" : "not_helpful_count";
        const newVoteField = vote === "helpful" ? "helpful_count" : "not_helpful_count";

        existing.vote = vote;
        await existing.save();
        await Review.findByIdAndUpdate(review_id, {
            $inc: { [oldVoteField]: -1, [newVoteField]: 1 },
        });
        return res.status(200).json({ action: "switched", vote });

    } catch (err) {
        console.error("[voteReview]", err);
        return res.status(500).json({ message: "Something went wrong." });
    }
}

export { voteReview, getReviews, approveReview, deleteReview, submitReview, getPageReviews };
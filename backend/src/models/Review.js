import mongoose from "mongoose";

const { Schema } = mongoose;

// =============================================================================
// ⭐  REVIEW  (collection: reviews)
// =============================================================================
//
// Verified-purchase only. order_id is the proof a user actually bought it.
// Admin must approve (is_approved: true) before the review goes live.
//
// helpful_count / not_helpful_count are denormalized tallies — sync them
// via $inc in the ReviewVote controller after every vote upsert/change.

// ── Embedded: review image ────────────────────────────────────────────────────
const ReviewImageSchema = new Schema(
  {
    file_url:   { type: String, required: true },
    alt_text:   { type: String, default: "" },
    sort_order: { type: Number, default: 0 },
  },
  { _id: true }
);

// ── Schema ────────────────────────────────────────────────────────────────────
const ReviewSchema = new Schema(
  {
    product_id:  { type: Schema.Types.ObjectId, ref: "Product", required: true },
    user_id:     { type: Schema.Types.ObjectId, ref: "User",    required: true },
    order_id:    { type: Schema.Types.ObjectId, ref: "Order",   required: true },
    rating:      { type: Number, required: true, min: 1, max: 5 },
    comment:     { type: String, default: "" },
    is_approved: { type: Boolean, default: false },
    deleted_at:  { type: Date, default: null },

    helpful_count:     { type: Number, default: 0, min: 0 },
    not_helpful_count: { type: Number, default: 0, min: 0 },

    images: { type: [ReviewImageSchema], default: [] },
  },
  { timestamps: true }
);

ReviewSchema.index({ product_id: 1, is_approved: 1 });
ReviewSchema.index({ user_id: 1 });
ReviewSchema.index({ deleted_at: 1 });
ReviewSchema.index({ product_id: 1, user_id: 1, order_id: 1 }, { unique: true });

const Review = mongoose.model("Review", ReviewSchema);


// =============================================================================
// 👍  REVIEW VOTE  (collection: reviewvotes)
// =============================================================================
//
// Separate collection — one vote per user per review; unbounded.
// After every insert/update also $inc the tally on the Review document.

const ReviewVoteSchema = new Schema(
  {
    review_id: { type: Schema.Types.ObjectId, ref: "Review", required: true },
    user_id:   { type: Schema.Types.ObjectId, ref: "User",   required: true },
    vote:      { type: String, enum: ["helpful", "not_helpful"], required: true },
  },
  { timestamps: true }
);

ReviewVoteSchema.index({ review_id: 1, user_id: 1 }, { unique: true });

const ReviewVote = mongoose.model("ReviewVote", ReviewVoteSchema);


export { Review, ReviewVote };

import mongoose from "mongoose";

const { Schema } = mongoose;

// =============================================================================
// 🗓️  PREORDER REGISTRATION  (collection: preorderregistrations)
// =============================================================================
//
// Tracks exactly which users preordered which variant so the system knows
// who to notify when admin marks a preorder batch as ready to ship.
//
// Why this is a separate collection and not just queried from orders:
//   Querying orders to find all preorder buyers requires scanning order items
//   across potentially thousands of documents. This collection is a fast,
//   purpose-built lookup — one document per user per variant preorder.
//
// Lifecycle:
//   1. User places a preorder → INSERT PreorderRegistration + $inc claimed_slots
//      on the variant's preorder sub-doc.
//   2. Admin marks the preorder as ready (sets release_date or triggers manually)
//      → query PreorderRegistration by product_id + variant_id WHERE notified = false
//      → send "preorder_ready" notification to each user_id
//      → set notified = true on each document.
//
// The compound unique index on { order_id, variant_id } ensures one
// registration per line item — no duplicates if checkout is retried.

const PreorderRegistrationSchema = new Schema(
  {
    user_id: {
      type:     Schema.Types.ObjectId,
      ref:      "User",
      required: true,
    },

    order_id: {
      type:     Schema.Types.ObjectId,
      ref:      "Order",
      required: true,
    },

    product_id: {
      type:     Schema.Types.ObjectId,
      ref:      "Product",
      required: true,
    },

    variant_id: {
      type:     Schema.Types.ObjectId,
      required: true,
    },

    // set to true after the preorder_ready notification has been sent
    notified:    { type: Boolean, default: false },
    notified_at: { type: Date, default: null },
  },
  { timestamps: true }
);

// ── Indexes ───────────────────────────────────────────────────────────────────
PreorderRegistrationSchema.index({ order_id: 1, variant_id: 1 }, { unique: true });
PreorderRegistrationSchema.index({ product_id: 1, variant_id: 1, notified: 1 });   // batch notify query
PreorderRegistrationSchema.index({ user_id: 1 });

const PreorderRegistration = mongoose.model("PreorderRegistration", PreorderRegistrationSchema);

export default PreorderRegistration;

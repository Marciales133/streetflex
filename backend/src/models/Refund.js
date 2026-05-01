import mongoose from "mongoose";

const { Schema } = mongoose;

// =============================================================================
// 💸  REFUND  (collection: refunds)
// =============================================================================
//
// One refund per order (enforced by unique index on order_id).
// Admin reviews proofs, sets status, leaves an optional note.
// Every status change is appended to status_history.

// ── Embedded: proof file ──────────────────────────────────────────────────────
const RefundProofSchema = new Schema(
  {
    file_url:    { type: String, required: true },
    media_type:  { type: String, enum: ["image", "video"], required: true },
    uploaded_at: { type: Date, default: Date.now },
  },
  { _id: true }
);

// ── Embedded: status history entry ────────────────────────────────────────────
const RefundStatusHistorySchema = new Schema(
  {
    old_status: { type: String, default: null },
    new_status: { type: String, required: true },
    changed_by: { type: Schema.Types.ObjectId, ref: "User", default: null },
    note:       { type: String, default: "" },
    changed_at: { type: Date, default: Date.now },
  },
  { _id: false }
);

// ── Schema ────────────────────────────────────────────────────────────────────
const RefundSchema = new Schema(
  {
    order_id:   { type: Schema.Types.ObjectId, ref: "Order", required: true, unique: true },
    user_id:    { type: Schema.Types.ObjectId, ref: "User",  required: true },
    reason:     { type: String, required: true },
    status:     { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
    admin_note: { type: String, default: "" },

    proofs:         { type: [RefundProofSchema], default: [] },
    status_history: { type: [RefundStatusHistorySchema], default: [] },
  },
  { timestamps: true }
);

// order_id: covered by unique:true above
RefundSchema.index({ user_id: 1 });

const Refund = mongoose.model("Refund", RefundSchema);

export default Refund;

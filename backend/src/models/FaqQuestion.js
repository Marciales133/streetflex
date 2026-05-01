import mongoose from "mongoose";

const { Schema } = mongoose;

// =============================================================================
// ❓  FAQ QUESTION  (collection: faqquestions)
// =============================================================================
//
// Registered users (not guests) submit questions.
// Admins answer, hide, or soft-delete them.
//
// answer is embedded (1-to-1, always read together).
// tags[] are plain strings for UI grouping — not Tag documents.

// ── Embedded: answer ──────────────────────────────────────────────────────────
const FaqAnswerSchema = new Schema(
  {
    text:        { type: String, required: true },
    answered_by: { type: Schema.Types.ObjectId, ref: "User", required: true },
    is_deleted:  { type: Boolean, default: false },
    updated_at:  { type: Date, default: Date.now },
  },
  { _id: false }
);

// ── Schema ────────────────────────────────────────────────────────────────────
const FaqQuestionSchema = new Schema(
  {
    user_id:    { type: Schema.Types.ObjectId, ref: "User", required: true },
    question:   { type: String, required: true, trim: true },
    is_visible: { type: Boolean, default: true },
    deleted_at: { type: Date, default: null },
    tags:       [{ type: String }],

    answer: { type: FaqAnswerSchema, default: null },
  },
  { timestamps: true }
);

FaqQuestionSchema.index({ question: "text" });
FaqQuestionSchema.index({ is_visible: 1 });
FaqQuestionSchema.index({ tags: 1 });
FaqQuestionSchema.index({ deleted_at: 1 });

const FaqQuestion = mongoose.model("FaqQuestion", FaqQuestionSchema);

export default FaqQuestion;

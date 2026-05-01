import mongoose from "mongoose";

const { Schema } = mongoose;

// =============================================================================
// 📜  POLICY AGREEMENT  (collection: policyagreements)
// =============================================================================
//
// Full audit trail for every policy acceptance — required for legal compliance.
//
// How it works together with User:
//   User.policy_version_accepted  — fast gate. Checked on every request to
//                                   decide if the policy modal should appear.
//                                   Updated when the user accepts.
//
//   PolicyAgreement (this file)   — the permanent legal record. One document
//                                   per acceptance event. Never deleted.
//                                   Stores which version, when, from where.
//
// When the user clicks "Accept":
//   1. INSERT a new PolicyAgreement document.
//   2. UPDATE User.policy_version_accepted = policy_version.
//
// When you release a new policy version (e.g. "2.0"):
//   - Bump CURRENT_POLICY_VERSION in your config.
//   - On next login, User.policy_version_accepted !== CURRENT_POLICY_VERSION
//     → show the modal again → user accepts → new PolicyAgreement document
//     is created, User field is updated.
//
// policy_type supports multiple agreement types in case you add Terms of
// Service or Cookie Policy later.

const PolicyAgreementSchema = new Schema(
  {
    user_id: {
      type:     Schema.Types.ObjectId,
      ref:      "User",
      required: true,
    },

    policy_type: {
      type:     String,
      enum:     ["privacy_policy", "terms_of_service", "cookie_policy"],
      required: true,
    },

    policy_version: { type: String, required: true },   // e.g. "1.0", "2.0"

    accepted_at: { type: Date, default: Date.now },

    // stored for legal compliance — shows acceptance was deliberate and traceable
    ip_address: { type: String, default: null },
    user_agent: { type: String, default: null },
  },
  {
    timestamps: false,    // accepted_at already serves as the timestamp
  }
);

// ── Indexes ───────────────────────────────────────────────────────────────────
PolicyAgreementSchema.index({ user_id: 1, policy_type: 1 });   // "show all agreements for this user"
PolicyAgreementSchema.index({ policy_version: 1 });             // "how many users accepted v2.0"

const PolicyAgreement = mongoose.model("PolicyAgreement", PolicyAgreementSchema);

export default PolicyAgreement;

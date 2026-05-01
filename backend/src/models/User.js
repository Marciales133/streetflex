import mongoose from "mongoose";

const { Schema } = mongoose;

// =============================================================================
// 👤  USER  (collection: users)
// =============================================================================
//
// Roles:
//   guest       — auto-created on first page visit. No email/password.
//                 Cart is keyed to this _id from the start, so when the guest
//                 registers we just fill in email + password_hash and flip the
//                 role to "customer" — no document swap, no cart migration.
//   customer    — registered; full access to cart, orders, reviews, FAQ.
//   admin       — manages products, orders, FAQ, reviews via admin panel.
//                 Can only be promoted/demoted by super_admin.
//   super_admin — full platform access; the only role that can promote/demote
//                 admins. Every promotion is logged in RoleChangeLog.

// ── Embedded: profile ────────────────────────────────────────────────────────
const UserProfileSchema = new Schema(
  {
    display_name: { type: String, trim: true, default: "" },
    avatar_url:   { type: String, default: null },
  },
  { _id: false }
);

// ── Embedded: address ────────────────────────────────────────────────────────
const AddressSchema = new Schema(
  {
    label:       { type: String, default: "Home" },
    recipient:   { type: String, required: true },
    phone:       { type: String, required: true },
    line1:       { type: String, required: true },
    line2:       { type: String, default: "" },
    city:        { type: String, required: true },
    province:    { type: String, required: true },
    postal_code: { type: String, required: true },
    country:     { type: String, default: "PH" },
    is_default:  { type: Boolean, default: false },
    deleted_at:  { type: Date, default: null },
  },
  { _id: true }
);

// ── Schema ────────────────────────────────────────────────────────────────────
const UserSchema = new Schema(
  {
    email: {
      type:      String,
      unique:    true,
      sparse:    true,    // sparse = multiple guest docs can all have null email
      lowercase: true,
      trim:      true,
      default:   null,
    },

    password_hash: { type: String, default: null },   // null for guests

    role: {
      type:    String,
      enum:    ["guest", "customer", "admin", "super_admin"],
      default: "guest",
    },

    is_banned:  { type: Boolean, default: false },
    ban_reason: { type: String, default: null },

    // ── Privacy policy ─────────────────────────────────────────────────────
    // Quick lookup field — checked on every request to decide if the modal
    // should show. The full audit trail lives in PolicyAgreement collection.
    // When the user accepts, write to PolicyAgreement AND update this field.
    policy_version_accepted: { type: String, default: null },   // e.g. "1.0"

    last_login_at: { type: Date, default: null },
    deleted_at:    { type: Date, default: null },

    // ── Embedded sub-docs ─────────────────────────────────────────────────
    profile:   { type: UserProfileSchema, default: () => ({}) },
    addresses: { type: [AddressSchema], default: [] },
  },
  { timestamps: true }
);

UserSchema.index({ role: 1 });
UserSchema.index({ deleted_at: 1 });
UserSchema.index(
    { email: "text", "profile.display_name": "text" },
    { name: "user_search_text" }
);

const User = mongoose.model("User", UserSchema);

export default User;

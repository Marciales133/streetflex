import mongoose from "mongoose";

const { Schema } = mongoose;

// =============================================================================
// 📋  ROLE CHANGE LOG  (collection: rolechangelogs)
// =============================================================================
//
// Append-only audit trail for every admin promotion and demotion.
//
// Rules (enforced at controller level):
//   - Only super_admin can create a log entry.
//   - Admins cannot promote or demote each other.
//   - Documents are never updated or deleted — permanent record.

const RoleChangeLogSchema = new Schema(
  {
    user_id:    { type: Schema.Types.ObjectId, ref: "User", required: true },
    changed_by: { type: Schema.Types.ObjectId, ref: "User", required: true },   // must be super_admin
    old_role:   { type: String, required: true },
    new_role:   { type: String, required: true },
    reason:     { type: String, default: "" },
  },
  { timestamps: true }
);

RoleChangeLogSchema.index({ user_id: 1 });
RoleChangeLogSchema.index({ changed_by: 1 });

const RoleChangeLog = mongoose.model("RoleChangeLog", RoleChangeLogSchema);

export default RoleChangeLog;

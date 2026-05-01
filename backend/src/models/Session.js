import mongoose from "mongoose";

const { Schema } = mongoose;

// =============================================================================
// 🔑  SESSION  (collection: sessions)
// =============================================================================
//
// One document per device/browser tab.
//
// token       — stored in the "auth_token" cookie after login/register.
//               Used to authenticate every subsequent request.
//
// guest_token — stored in the "guest_token" cookie before login.
//               Ties a browsing session to a guest User doc so the cart
//               persists. Cleared when the guest registers or logs in.

const SessionSchema = new Schema(
  {
    user_id: {
      type:    Schema.Types.ObjectId,
      ref:     "User",
      default: null,
    },

    token: {
      type:     String,
      required: true,
      unique:   true,
    },

    guest_token: {
      type:    String,
      unique:  true,
      sparse:  true,    // authenticated sessions have null guest_token
      default: undefined,
    },

    is_guest:   { type: Boolean, default: false },
    ip_address: { type: String, default: null },
    user_agent: { type: String, default: null },
    expires_at: { type: Date, required: true },
  },
  { timestamps: true }
);

// token + guest_token indexes covered by unique / unique+sparse above
SessionSchema.index({ user_id: 1 });
SessionSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });   // TTL auto-delete

const Session = mongoose.model("Session", SessionSchema);

export default Session;

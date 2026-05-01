import mongoose from "mongoose";

const { Schema } = mongoose;

// =============================================================================
// 🔔  NOTIFICATION  (collection: notifications)
// =============================================================================
//
// Created server-side on key events. Frontend polls or uses websocket
// to show unread count in the nav bell.
//
// Polymorphic ref: ref_type names the collection, ref_id is the doc _id.
//   { type: "order_update",   ref_type: "orders",            ref_id: ObjectId }
//   { type: "faq_answered",   ref_type: "faqquestions",      ref_id: ObjectId }
//   { type: "refund_update",  ref_type: "refunds",           ref_id: ObjectId }
//   { type: "restock",        ref_type: "products",          ref_id: ObjectId }
//   { type: "preorder_ready", ref_type: "products",          ref_id: ObjectId }
//   { type: "promo",          ref_type: null,                ref_id: null     }

const NOTIFICATION_TYPES = [
  "order_update",
  "faq_answered",
  "refund_update",
  "restock",
  "preorder_ready",
  "promo",
];

const NotificationSchema = new Schema(
  {
    user_id:  { type: Schema.Types.ObjectId, ref: "User", required: true },
    type:     { type: String, enum: NOTIFICATION_TYPES, required: true },
    message:  { type: String, required: true },
    is_read:  { type: Boolean, default: false },
    ref_type: { type: String, default: null },
    ref_id:   { type: Schema.Types.ObjectId, default: null },
  },
  { timestamps: true }
);

NotificationSchema.index({ user_id: 1, is_read: 1 });
NotificationSchema.index({ user_id: 1, createdAt: -1 });

const Notification = mongoose.model("Notification", NotificationSchema);

export default Notification;

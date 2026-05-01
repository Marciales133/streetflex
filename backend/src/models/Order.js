import mongoose from "mongoose";

const { Schema } = mongoose;

// =============================================================================
// 🎟️  DISCOUNT  (collection: discounts)
// =============================================================================

const DiscountSchema = new Schema(
  {
    code:             { type: String, required: true, unique: true, uppercase: true, trim: true },
    type:             { type: String, enum: ["percent", "fixed"], required: true },
    value:            { type: Number, required: true, min: 0 },
    min_order_amount: { type: Number, default: 0 },
    max_uses:         { type: Number, default: null },   // null = unlimited
    used_count:       { type: Number, default: 0 },
    expires_at:       { type: Date, default: null },
    is_active:        { type: Boolean, default: true },
  },
  { timestamps: true }
);

// code: covered by unique:true above

const Discount = mongoose.model("Discount", DiscountSchema);


// =============================================================================
// 📦  ORDER  (collection: orders)
// =============================================================================
//
// Embedding strategy:
//   items[]          — price + product snapshot, frozen at checkout.
//   shipping_address — address snapshot, frozen at checkout.
//   status_history[] — full audit trail of every status change. Bounded.
//
// discount_code is a string snapshot (not a ref) so order history stays
// accurate even if the Discount document is later deleted.

// ── Embedded: order item ──────────────────────────────────────────────────────
const OrderItemSchema = new Schema(
  {
    product_id: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    variant_id: { type: Schema.Types.ObjectId, required: true },

    // snapshot — frozen at checkout, never retroactively changed
    name:       { type: String, required: true },
    sku:        { type: String, required: true },
    size:       { type: String, required: true },
    color:      { type: String, required: true },
    image_url:  { type: String, default: null },
    unit_price: { type: Number, required: true },
    quantity:   { type: Number, required: true, min: 1 },
    subtotal:   { type: Number, required: true },
  },
  { _id: true }
);

// ── Embedded: status history entry ───────────────────────────────────────────
const OrderStatusHistorySchema = new Schema(
  {
    old_status: { type: String, default: null },
    new_status: { type: String, required: true },
    changed_by: { type: Schema.Types.ObjectId, ref: "User", default: null },
    note:       { type: String, default: "" },
    changed_at: { type: Date, default: Date.now },
  },
  { _id: false }
);

// ── Embedded: shipping address snapshot ───────────────────────────────────────
const ShippingAddressSchema = new Schema(
  {
    recipient:   { type: String, required: true },
    phone:       { type: String, required: true },
    line1:       { type: String, required: true },
    line2:       { type: String, default: "" },
    city:        { type: String, required: true },
    province:    { type: String, required: true },
    postal_code: { type: String, required: true },
    country:     { type: String, default: "PH" },
  },
  { _id: false }
);

// ── Order statuses ────────────────────────────────────────────────────────────
const ORDER_STATUSES = [
  "pending",
  "confirmed",
  "processing",
  "to_be_delivered",
  "delivered",
  "cancelled",
  "refund_requested",
  "refunded",
];

// ── Schema ────────────────────────────────────────────────────────────────────
const OrderSchema = new Schema(
  {
    user_id:         { type: Schema.Types.ObjectId, ref: "User", required: true },
    subtotal:        { type: Number, required: true },
    discount_amount: { type: Number, default: 0 },
    total:           { type: Number, required: true },
    discount_code:   { type: String, default: null },
    payment_method:  { type: String, enum: ["cod"], default: "cod" },
    cod_confirmed:   { type: Boolean, default: false },
    is_preorder:     { type: Boolean, default: false },
    status:          { type: String, enum: ORDER_STATUSES, default: "pending" },
    note:            { type: String, default: "" },
    deleted_at:      { type: Date, default: null },

    shipping_address: { type: ShippingAddressSchema, required: true },
    items:            { type: [OrderItemSchema], default: [] },
    status_history:   { type: [OrderStatusHistorySchema], default: [] },
  },
  { timestamps: true }
);

OrderSchema.index({ user_id: 1 });
OrderSchema.index({ status: 1 });
OrderSchema.index({ deleted_at: 1 });

const Order = mongoose.model("Order", OrderSchema);


export { Discount, Order };

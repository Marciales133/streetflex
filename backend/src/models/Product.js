import mongoose from "mongoose";

const { Schema } = mongoose;

// =============================================================================
// 🛍️  PRODUCT  (collection: products)
// =============================================================================
//
// Embedding strategy:
//   variants[]  — embedded. Always fetched together. Bounded per product.
//   images[]    — embedded. Always fetched together. Bounded per product.
//   tag_ids[]   — reference array. Used when you need full Tag docs (populate).
//   tag_names[] — embedded strings. Denormalized copy for fast catalog filtering
//                 without a join. When a Tag is renamed, update this too.

// ── Embedded: image ──────────────────────────────────────────────────────────
const ProductImageSchema = new Schema(
  {
    url:        { type: String, required: true },
    alt_text:   { type: String, default: "" },
    is_primary: { type: Boolean, default: false },
    sort_order: { type: Number, default: 0 },
  },
  { _id: true }
);

// ── Embedded: preorder slots (nested inside each variant) ────────────────────
//
// Tracks slot capacity per variant for preorder products.
// claimed_slots is incremented via $inc at checkout.
// release_date is when the batch ships — used to send preorder_ready
// notifications and to populate the PreorderRegistration collection.
const PreorderSlotSchema = new Schema(
  {
    max_slots:     { type: Number, default: 50 },
    claimed_slots: { type: Number, default: 0 },
    release_date:  { type: Date, default: null },
  },
  { _id: false }
);

// ── Embedded: variant ────────────────────────────────────────────────────────
const ProductVariantSchema = new Schema(
  {
    sku:            { type: String, required: true },
    size:           { type: String, required: true },
    color:          { type: String, required: true },
    stock:          { type: Number, default: 0, min: 0 },
    price_modifier: { type: Number, default: 0 },    // added to base_price; can be negative
    is_active:      { type: Boolean, default: true },
    deleted_at:     { type: Date, default: null },
    preorder:       { type: PreorderSlotSchema, default: () => ({}) },
  },
  { _id: true }
);

// ── Schema ────────────────────────────────────────────────────────────────────
const ProductSchema = new Schema(
  {
    name:         { type: String, required: true, trim: true },
    slug:         { type: String, required: true, unique: true, lowercase: true },
    description:  { type: String, default: "" },
    total_stock: { type: Number, default: 0 },  // denormalized sum of all variant stocks
    base_price:   { type: Number, required: true, min: 0 },
    weight_grams: { type: Number, default: null },
    category_id:  { type: Schema.Types.ObjectId, ref: "Category", required: true },
    created_by:   { type: Schema.Types.ObjectId, ref: "User", required: true },
    is_active:    { type: Boolean, default: true },
    is_preorder:  { type: Boolean, default: false },
    deleted_at:   { type: Date, default: null },

    tag_ids:   [{ type: Schema.Types.ObjectId, ref: "Tag" }],   // authoritative
    tag_names: [{ type: String }],                               // denormalized fast filter

    images:   { type: [ProductImageSchema], default: [] },
    variants: { type: [ProductVariantSchema], default: [] },
  },
  { timestamps: true }
);

ProductSchema.index({ name: "text", description: "text" });
ProductSchema.index({ category_id: 1 });
ProductSchema.index({ tag_ids: 1 });
ProductSchema.index({ is_active: 1 });
ProductSchema.index({ deleted_at: 1 });
ProductSchema.index({ total_stock: 1 });

ProductSchema.pre("save", function () {
    this.total_stock = this.variants
        .filter(v => !v.deleted_at && v.is_active)
        .reduce((sum, v) => sum + v.stock, 0);
});

ProductSchema.statics.syncTotalStock = async function (productId) {
    const product = await this.findById(productId);
    if (!product) return;
    const total_stock = product.variants
        .filter(v => !v.deleted_at && v.is_active)
        .reduce((sum, v) => sum + v.stock, 0);
    await this.updateOne({ _id: productId }, { $set: { total_stock } });
};
// slug: covered by unique:true above

const Product = mongoose.model("Product", ProductSchema);

export default Product;

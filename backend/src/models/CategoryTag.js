import mongoose from "mongoose";

const { Schema } = mongoose;

// =============================================================================
// 🗂️  CATEGORY  (collection: categories)
// =============================================================================
//
// Small, mostly-static lookup collection.
// Examples: T-Shirts, Pants, Shorts, Hoodies, Accessories.
// Soft-deleted so existing product references don't break.

const CategorySchema = new Schema(
  {
    name:        { type: String, required: true, trim: true },
    slug:        { type: String, required: true, unique: true, lowercase: true },
    description: { type: String, default: "" },
    deleted_at:  { type: Date, default: null },
  },
  { timestamps: true }
);

CategorySchema.index({ deleted_at: 1 });
// slug: covered by unique:true above

const Category = mongoose.model("Category", CategorySchema);


// =============================================================================
// 🏷️  TAG  (collection: tags)
// =============================================================================
//
// Small lookup collection for product filtering and FAQ grouping.
// Examples: Oversized, New Arrival, Collab, Limited, On Sale.
//
// Products store both tag_ids[] (reference) and tag_names[] (denormalized).
// If you rename a tag here, also update tag_names on affected products.

const TagSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
  },
  { timestamps: false }
);

// slug: covered by unique:true above

const Tag = mongoose.model("Tag", TagSchema);


export { Category, Tag };

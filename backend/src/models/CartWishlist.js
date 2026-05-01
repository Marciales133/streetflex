import mongoose from "mongoose";

const { Schema } = mongoose;

// =============================================================================
// 🛒  CART  (collection: carts)
// =============================================================================
//
// One Cart per user — including guests.
// Because guests are real User documents (role: "guest"), user_id is always
// available. No migration needed on register since User._id never changes —
// just update the role on the User doc.
//
// Each item snapshots price + product info so the cart stays accurate even
// if the admin later edits the product or changes the price.

// ── Embedded: cart item ───────────────────────────────────────────────────────
const CartItemSchema = new Schema(
  {
    product_id: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    variant_id: { type: Schema.Types.ObjectId, required: true },

    // snapshot — frozen at time of adding to cart
    name:       { type: String, required: true },
    sku:        { type: String, required: true },
    size:       { type: String, required: true },
    color:      { type: String, required: true },
    image_url:  { type: String, default: null },
    unit_price: { type: Number, required: true },

    quantity:        { type: Number, default: 1, min: 1 },
    saved_for_later: { type: Boolean, default: false },
    added_at:        { type: Date, default: Date.now },
  },
  { _id: true }
);

// ── Schema ────────────────────────────────────────────────────────────────────
const CartSchema = new Schema(
  {
    user_id:    { type: Schema.Types.ObjectId, ref: "User",    default: null },
    session_id: { type: Schema.Types.ObjectId, ref: "Session", default: null },
    items:      { type: [CartItemSchema], default: [] },
  },
  { timestamps: true }
);

CartSchema.index({ user_id: 1 },    { unique: true, sparse: true });
CartSchema.index({ session_id: 1 }, { unique: true, sparse: true });

const Cart = mongoose.model("Cart", CartSchema);


// =============================================================================
// ❤️  WISHLIST  (collection: wishlists)
// =============================================================================
//
// One Wishlist per registered user. Guests cannot wishlist — the heart icon
// is shown but clicking it prompts login.

// ── Embedded: wishlist item ───────────────────────────────────────────────────
const WishlistItemSchema = new Schema(
  {
    product_id: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    variant_id: { type: Schema.Types.ObjectId, default: null },
    added_at:   { type: Date, default: Date.now },
  },
  { _id: true }
);

// ── Schema ────────────────────────────────────────────────────────────────────
const WishlistSchema = new Schema(
  {
    user_id: {
      type:     Schema.Types.ObjectId,
      ref:      "User",
      required: true,
      unique:   true,
    },
    items: { type: [WishlistItemSchema], default: [] },
  },
  { timestamps: true }
);

// user_id: covered by unique:true above

const Wishlist = mongoose.model("Wishlist", WishlistSchema);


export { Cart, Wishlist };

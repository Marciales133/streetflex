import { Router } from "express";
import multer from "multer";
import { imagekitAuth, uploadImage } from "../controllers/upload.js";
import { requireAuth, requireRole } from "../middleWare/authMiddleWare.js";

import {
    register, login, logout,
    acceptPolicy, editProfile, addAddress,
    editAddress, deleteAddress, getUsers,
    searchUsers,
} from "../controllers/authController.js";

import { createOrder, createRefund, getMyOrders, cancelOrder } from "../controllers/customerOrderController.js";
import { submitQuestion, getMyQuestions, getQuestions  } from "../controllers/FAQsController.js";
import { submitReview, getPageReviews, voteReview } from "../controllers/reviewController.js";

// ── Home page controllers ─────────────────────────────────────────────────────
import {
    getSession,
    getNewArrivals,
    getPopularProducts,
    getCuratedReviews,
    getSearchSuggestions,
} from "../controllers/HomeController.js";

import { getCart, updateCartItem, removeCartItem, removeCartItems, addToCart, getCartCount } from "../controllers/userCartController.js";
import { toggleWishlist, getWishlistIds, removeFromWishlist, getWishlist} from "../controllers/userWishlist.js";
import { getNotifications, markOneRead, markAllRead } from "../controllers/notificationController.js";
import {getFilterMeta, getGalleryProducts } from "../controllers/galeryController.js"
import { getProductBySlug } from "../controllers/productDetailController.js";




const router = Router();

// =============================================================================
// AUTH ROUTES  —  /api/auth
// =============================================================================

/**
 * POST /api/auth/register
 *
 * Create a new customer account.
 * If the request carries a guest_token cookie the guest User doc is upgraded
 * in-place (cart survives, _id never changes).
 *
 * Body:
 *   required  email, password
 *   optional  username, avatar_url
 *   optional  address { recipient, phone, line1, line2, city, province, postal_code, country }
 */
router.post("/register", register);

/**
 * POST /api/auth/login
 *
 * Body: email, password
 * Sets auth_token cookie on success.
 */
router.post("/login", login);

/**
 * POST /api/auth/logout
 *
 * Deletes the server-side session and clears the auth_token cookie.
 * Works even if the token is already expired (safe no-op).
 */
router.post("/logout", logout);

/**
 * POST /api/auth/accept-policy
 *
 * Records a policy acceptance — writes a permanent PolicyAgreement doc
 * and updates User.policy_version_accepted when type is "privacy_policy".
 *
 * Body: policy_type ("privacy_policy" | "terms_of_service" | "cookie_policy"), policy_version
 */
router.post("/accept-policy", requireAuth, acceptPolicy);

// =============================================================================
// SESSION  —  /api/auth/session
// =============================================================================

/**
 * GET /api/auth/session
 *
 * Public — no middleware.
 * Reads auth_token or guest_token cookie, returns the matching User doc.
 * Returns { user: null } when no valid session exists.
 *
 * Used by every customer-facing page to populate the header on load.
 */
router.get("/session", getSession);

// =============================================================================
// USER PROFILE & ADDRESS ROUTES  —  /api/auth/users/me
// =============================================================================

/**
 * PUT /api/auth/users/me/profile
 * Body (all optional): display_name, avatar_url
 */
router.put("/users/me/profile", requireAuth, editProfile);

/**
 * POST /api/auth/users/me/addresses
 * Body:
 *   required  recipient, phone, line1, city, province, postal_code
 *   optional  label, line2, country, is_default
 */
router.post("/users/me/addresses", requireAuth, addAddress);

/**
 * PUT /api/auth/users/me/addresses/:addressId
 * Body (all optional): label, recipient, phone, line1, line2, city, province,
 *                      postal_code, country, is_default
 */
router.put("/users/me/addresses/:addressId", requireAuth, editAddress);

/**
 * DELETE /api/auth/users/me/addresses/:addressId
 * Soft-deletes address; auto-promotes next active address to default.
 */
router.delete("/users/me/addresses/:addressId", requireAuth, deleteAddress);

// =============================================================================
// PRODUCTS (public)  —  /api/auth/products
// =============================================================================

/**
 * GET /api/auth/products/search?q=TERM&limit=8
 *
 * Public. Lightweight suggestions for the header search box.
 * Returns: [{ _id, name, slug, base_price, image_url }]
 * Frontend uses slug to build link: /pages/item.html?slug=SLUG
 */
router.get("/products/search", getSearchSuggestions);

/**
 * GET /api/auth/products/new-arrivals
 *
 * Public. Latest 10 active in-stock products, newest first.
 * Returns: _id, name, slug, base_price, is_preorder, images, variants
 */
router.get("/products/new-arrivals", getNewArrivals);

/**
 * GET /api/auth/products/popular
 *
 * Public. Top 10 products ranked by sum of approved review helpful_count.
 * Falls back to newest when there are fewer than 10 reviewed products.
 */
router.get("/products/popular", getPopularProducts);

// =============================================================================
// REVIEWS (public)  —  /api/auth/reviews
// =============================================================================

/**
 * GET /api/auth/reviews/curated
 *
 * Public. Up to 8 approved reviews sorted by helpful_count desc.
 * Populated: user display_name + avatar, product name + primary image.
 */
router.get("/reviews/curated", getCuratedReviews);

/**
 * POST /api/auth/reviews
 * requireAuth. Verified-purchase only — order must be in "delivered" status.
 * Body: product_id, order_id, rating, comment (optional), images (optional)
 */
router.post("/reviews", requireAuth, submitReview);

// =============================================================================
// CART  —  /api/auth/cart
// =============================================================================

/**
 * POST /api/auth/cart
 *
 * requireAuth. Adds item to cart or increments quantity if variant exists.
 * Validates stock (or preorder slots) before writing.
 *
 * Body:
 *   required  product_id, variant_id
 *   optional  quantity (default 1)
 */
router.post("/cart", requireAuth, addToCart);

/**
 * GET /api/auth/cart/count
 *
 * requireAuth. Returns number of active (non saved-for-later) cart items.
 * Used to populate the cart badge in the nav on page load.
 */
router.get("/cart/count", requireAuth, getCartCount);

// =============================================================================
// WISHLIST  —  /api/auth/wishlist
// =============================================================================

/**
 * POST /api/auth/wishlist/toggle
 *
 * requireAuth. Guests get 403 with redirect hint.
 * Adds product if not in wishlist; removes it if already there.
 *
 * Body:
 *   required  product_id
 *   optional  variant_id
 */
router.post("/wishlist/toggle", requireAuth, toggleWishlist);

/**
 * GET /api/auth/wishlist/ids
 *
 * requireAuth. Returns an array of product_id strings in the user's wishlist.
 * Used on page load to pre-highlight heart icons for already-wishlisted items.
 */
router.get("/wishlist/ids", requireAuth, getWishlistIds);

// =============================================================================
// IMAGEKIT
// =============================================================================
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024 }  // 15MB max raw input
});
router.get ("/upload",       imagekitAuth);
router.post("/upload-image", requireAuth, upload.single("file"), uploadImage);

// =============================================================================
// ORDERS & REFUNDS
// =============================================================================
router.post("/orders",  requireAuth, createOrder);
router.post("/refunds", requireAuth, createRefund);

// =============================================================================
// FAQS
// =============================================================================
router.get("/faqs/my-questions", requireAuth, getMyQuestions);  // ← FIRST
router.get("/faqs",              getQuestions);                  // ← SECOND
router.post("/faqs",             requireAuth, submitQuestion);      

router.get("/notifications",              requireAuth, getNotifications);
router.patch("/notifications/read-all",   requireAuth, markAllRead);   


router.get("/wishlist",          requireAuth, getWishlist);
router.delete("/wishlist/:product_id", requireAuth, removeFromWishlist);

router.get   ("/cart",          requireAuth, getCart);
router.patch ("/cart/:item_id", requireAuth, updateCartItem); 
router.delete("/cart/:item_id", requireAuth, removeCartItem);
router.delete("/cart/items",    requireAuth, removeCartItems);

router.get  ("/orders",              requireAuth, getMyOrders);
router.patch("/orders/:id/cancel",   requireAuth, cancelOrder);

router.get("/reviews",    getPageReviews);

router.get("/products/filter-meta", getFilterMeta);
router.get("/products/gallery",     getGalleryProducts);

router.get("/products/detail/:slug", getProductBySlug);
// Place AFTER /products/filter-meta and /products/gallery


// Requires login — guests shouldn't vote
router.post("/reviews/:id/vote", requireAuth, voteReview);
export default router;
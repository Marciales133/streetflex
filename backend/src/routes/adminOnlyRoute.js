
import { Router } from "express";
import {imagekitAuth} from "../controllers/upload.js";
import { requireAuth, requireRole } from "../middleWare/authMiddleWare.js";
import {
    register, login, logout,
    acceptPolicy, editProfile, addAddress,
    editAddress, deleteAddress, changeUserRole,
    banUser, unbanUser,  getUsers, searchUsers,
} from "../controllers/authController.js";
import rateLimit from "express-rate-limit";
import {
    getProducts, searchProducts, getProduct,
    createProduct, editProduct, toggleProduct, deleteProduct,
} from "../controllers/productController.js";
import {
    getCategories, createCategory, editCategory, deleteCategory,
    getTags, createTag, editTag, deleteTag,
} from "../controllers/categoryTagController.js";
import {
    getOrders, getOrder, updateOrderStatus,
    getRefunds, updateRefundStatus,
} from "../controllers/orderController.js";
import {
    getQuestions,
    answerQuestion,
    editAnswer,
    toggleVisibility,
    updateTags,
    deleteQuestion,
} from "../controllers/FAQsController.js";
import {
    getReviews,
    approveReview,
    deleteReview,
} from "../controllers/reviewController.js";
import { getOverview } from "../controllers/overviewController.js";



const searchLimiter = rateLimit({
    windowMs: 60 * 1000,   // 1 minute
    max:      30,           // 30 search requests per minute per IP
    message:  { message: "Too many search requests. Please slow down." },
});
const router = Router();


// adminOnlyRoute.js
router.get("/users",        requireAuth, requireRole("admin", "super_admin"), getUsers);
router.get("/users/search", searchLimiter, requireAuth, requireRole("admin", "super_admin"), searchUsers);
router.put("/users/:userId/role",  requireAuth, requireRole("super_admin"), changeUserRole);
router.put("/users/:userId/ban",   requireAuth, requireRole("admin", "super_admin"), banUser);
router.put("/users/:userId/unban", requireAuth, requireRole("admin", "super_admin"), unbanUser);


// ── Products ─────────────────────────────────────────────────────────────────
router.get("/products",              requireAuth, requireRole("admin", "super_admin"), getProducts);
router.get("/products/search",       requireAuth, requireRole("admin", "super_admin"), searchProducts);
router.get("/products/:id",          requireAuth, requireRole("admin", "super_admin"), getProduct);
router.post("/products",             requireAuth, requireRole("admin", "super_admin"), createProduct);
router.put("/products/:id",          requireAuth, requireRole("admin", "super_admin"), editProduct);
router.put("/products/:id/toggle",   requireAuth, requireRole("admin", "super_admin"), toggleProduct);
router.delete("/products/:id",       requireAuth, requireRole("admin", "super_admin"), deleteProduct);

// ── Categories ────────────────────────────────────────────────────────────────
router.get("/categories",            requireAuth, requireRole("admin", "super_admin"), getCategories);
router.post("/categories",           requireAuth, requireRole("admin", "super_admin"), createCategory);
router.put("/categories/:id",        requireAuth, requireRole("admin", "super_admin"), editCategory);
router.delete("/categories/:id",     requireAuth, requireRole("admin", "super_admin"), deleteCategory);

// ── Tags ──────────────────────────────────────────────────────────────────────
router.get("/tags",                  requireAuth, requireRole("admin", "super_admin"), getTags);
router.post("/tags",                 requireAuth, requireRole("admin", "super_admin"), createTag);
router.put("/tags/:id",              requireAuth, requireRole("admin", "super_admin"), editTag);
router.delete("/tags/:id",           requireAuth, requireRole("admin", "super_admin"), deleteTag);

// ── Orders ────────────────────────────────────────────────────────────────────
router.get("/orders",              requireAuth, requireRole("admin", "super_admin"), getOrders);
router.get("/orders/:id",          requireAuth, requireRole("admin", "super_admin"), getOrder);
router.patch("/orders/:id/status", requireAuth, requireRole("admin", "super_admin"), updateOrderStatus);
router.get("/refunds",             requireAuth, requireRole("admin", "super_admin"), getRefunds);
router.patch("/refunds/:id/status",requireAuth, requireRole("admin", "super_admin"), updateRefundStatus);

// ── FAQs ──────────────────────────────────────────────────────────────────────
router.get("/faqs",                      requireAuth, requireRole("admin", "super_admin"), getQuestions);
router.post("/faqs/:id/answer",          requireAuth, requireRole("admin", "super_admin"), answerQuestion);
router.patch("/faqs/:id/answer",         requireAuth, requireRole("admin", "super_admin"), editAnswer);
router.patch("/faqs/:id/visibility",     requireAuth, requireRole("admin", "super_admin"), toggleVisibility);
router.patch("/faqs/:id/tags",           requireAuth, requireRole("admin", "super_admin"), updateTags);
router.delete("/faqs/:id",               requireAuth, requireRole("admin", "super_admin"), deleteQuestion);

// ── Reviews ───────────────────────────────────────────────────────────────────
router.get("/reviews",              requireAuth, requireRole("admin", "super_admin"), getReviews);
router.patch("/reviews/:id/approve",requireAuth, requireRole("admin", "super_admin"), approveReview);
router.delete("/reviews/:id",       requireAuth, requireRole("admin", "super_admin"), deleteReview);

// ── Overview ──────────────────────────────────────────────────────────────────
router.get("/overview", requireAuth, requireRole("admin", "super_admin"), getOverview);


export default router;
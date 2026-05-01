import { User, Product, Order, Refund, FaqQuestion, Review } from "../models/modelCenter.js";

// =============================================================================
// GET OVERVIEW STATS
// =============================================================================
/**
 * GET /api/auth/overview
 *
 * Returns all counts and totals needed for the admin home page.
 */
async function getOverview(req, res) {
    try {
        const now             = new Date();
        const startOfMonth    = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth      = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

        const [
            totalAdmins,
            totalCustomers,
            totalBanned,

            totalActiveProducts,
            totalInactiveProducts,

            totalCurrentOrders,
            thisMonthSales,

            totalPendingRefunds,

            totalPendingQuestions,

            totalPendingReviews,
        ] = await Promise.all([

            // ── Users ─────────────────────────────────────────────────────────
            User.countDocuments({
                role:       { $in: ["admin", "super_admin"] },
                deleted_at: null,
            }),
            User.countDocuments({
                role:       "customer",
                deleted_at: null,
            }),
            User.countDocuments({
                is_banned:  true,
                deleted_at: null,
            }),

            // ── Products ──────────────────────────────────────────────────────
            Product.countDocuments({
                is_active:  true,
                deleted_at: null,
            }),
            Product.countDocuments({
                is_active:  false,
                deleted_at: null,
            }),

            // ── Orders ────────────────────────────────────────────────────────
            Order.countDocuments({
                status:     { $in: ["pending", "confirmed", "processing", "to_be_delivered"] },
                deleted_at: null,
            }),

            // ── This month delivered sales total ──────────────────────────────
            Order.aggregate([
                {
                    $match: {
                        status:     "delivered",
                        deleted_at: null,
                        createdAt:  { $gte: startOfMonth, $lte: endOfMonth },
                    },
                },
                {
                    $group: {
                        _id:   null,
                        total: { $sum: "$total" },
                    },
                },
            ]),

            // ── Refunds ───────────────────────────────────────────────────────
            Refund.countDocuments({
                status: "pending",
            }),

            // ── FAQ ───────────────────────────────────────────────────────────
            FaqQuestion.countDocuments({
                answer:     null,
                is_visible: true,
                deleted_at: null,
            }),

            // ── Reviews ───────────────────────────────────────────────────────
            Review.countDocuments({
                is_approved: false,
                deleted_at:  null,
            }),
        ]);

        return res.status(200).json({
            users: {
                total_admins:    totalAdmins,
                total_customers: totalCustomers,
                total_banned:    totalBanned,
            },
            products: {
                total_active:   totalActiveProducts,
                total_inactive: totalInactiveProducts,
            },
            orders: {
                total_current:        totalCurrentOrders,
                this_month_sales:     thisMonthSales[0]?.total || 0,
            },
            refunds: {
                total_pending: totalPendingRefunds,
            },
            faqs: {
                total_pending: totalPendingQuestions,
            },
            reviews: {
                total_pending: totalPendingReviews,
            },
        });

    } catch (err) {
        console.error("[getOverview]", err);
        return res.status(500).json({ message: "Something went wrong. Please try again." });
    }
}

export { getOverview };
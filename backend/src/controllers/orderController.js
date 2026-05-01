import mongoose from "mongoose";
import { Order, Refund, Notification, PreorderRegistration, Product } from "../models/modelCenter.js";
// =============================================================================
// HELPERS
// =============================================================================
async function createNotification(user_id, type, message, ref_type, ref_id) {
    await Notification.create({ user_id, type, message, ref_type, ref_id });
}

const STATUS_MESSAGES = {
    confirmed:       "Your order has been confirmed and is being prepared.",
    processing:      "Your order is now being processed.",
    to_be_delivered: "Your order is on its way!",
    delivered:       "Your order has been delivered. Enjoy!",
    cancelled:       "Your order has been cancelled.",
    refunded:        "Your refund has been processed.",
};

// =============================================================================
// GET ORDERS
// =============================================================================
/**
 * GET /api/admin/orders
 * Returns all non-deleted orders, oldest first.
 * Query: is_preorder=true|false to filter
 */
async function getOrders(req, res) {
    try {
        const filter = { deleted_at: null };
        if (req.query.is_preorder === "true")  filter.is_preorder = true;
        if (req.query.is_preorder === "false") filter.is_preorder = false;

        const orders = await Order.find(filter)
            .populate("user_id", "email profile.display_name")
            .sort({ createdAt: 1 });   // oldest first

        return res.status(200).json({ orders });
    } catch (err) {
        console.error("[getOrders]", err);
        return res.status(500).json({ message: "Something went wrong. Please try again." });
    }
}

// =============================================================================
// GET SINGLE ORDER
// =============================================================================
/**
 * GET /api/admin/orders/:id
 */
async function getOrder(req, res) {
    try {
        const order = await Order.findOne({ _id: req.params.id, deleted_at: null })
            .populate("user_id", "email profile.display_name");

        if (!order) return res.status(404).json({ message: "Order not found." });

        return res.status(200).json({ order });
    } catch (err) {
        console.error("[getOrder]", err);
        return res.status(500).json({ message: "Something went wrong. Please try again." });
    }
}

// =============================================================================
// UPDATE ORDER STATUS
// =============================================================================
/**
 * PATCH /api/admin/orders/:id/status
 *
 * Body: new_status, note (optional)
 *
 * Valid transitions:
 *   pending → confirmed → processing → to_be_delivered → delivered
 *   any → cancelled (except delivered/refunded)
 */
const VALID_TRANSITIONS = {
    pending:         ["confirmed", "cancelled"],
    confirmed:       ["processing", "cancelled"],
    processing:      ["to_be_delivered", "cancelled"],
    to_be_delivered: ["delivered", "cancelled"],
    delivered:       ["refund_requested"],
    cancelled:       [],
    refund_requested:["refunded", "delivered"],
    refunded:        [],
};

async function updateOrderStatus(req, res) {
    const { new_status, note } = req.body;

    if (!new_status) {
        return res.status(400).json({ message: "new_status is required." });
    }

    try {
        const order = await Order.findOne({ _id: req.params.id, deleted_at: null });
        if (!order) return res.status(404).json({ message: "Order not found." });

        const allowed = VALID_TRANSITIONS[order.status] || [];
        if (!allowed.includes(new_status)) {
            return res.status(400).json({
                message: `Cannot transition from "${order.status}" to "${new_status}".`,
            });
        }

        const old_status = order.status;
        // inside updateOrderStatus, after order.status = new_status
        if (new_status === "confirmed") {
            for (const item of order.items) {
                await Product.updateOne(
                    { _id: item.product_id, "variants._id": item.variant_id },
                    { $inc: { "variants.$.stock": -item.quantity } }
                );
                await Product.syncTotalStock(item.product_id);
            }
        }
        order.status = new_status;
        order.status_history.push({
            old_status,
            new_status,
            changed_by: req.user._id,
            note:       note || "",
            changed_at: new Date(),
        });

        await order.save();

        // ── Notification ──────────────────────────────────────────────────────
        const message = order.is_preorder && new_status === "to_be_delivered"
            ? "Your preorder is ready and on its way!"
            : STATUS_MESSAGES[new_status];

        if (message) {
            const notifType = new_status === "refunded" ? "refund_update" : "order_update";
            await createNotification(order.user_id, notifType, message, "orders", order._id);
        }

        return res.status(200).json({
            message:    `Order status updated to "${new_status}".`,
            order_id:   order._id,
            old_status,
            new_status,
        });

    } catch (err) {
        console.error("[updateOrderStatus]", err);
        return res.status(500).json({ message: "Something went wrong. Please try again." });
    }
}

// =============================================================================
// GET REFUNDS
// =============================================================================
/**
 * GET /api/admin/refunds
 * Returns all refunds, oldest first.
 */
async function getRefunds(req, res) {
    try {
        const refunds = await Refund.find()
            .populate("user_id",  "email profile.display_name")
            .populate("order_id", "total status items")
            .sort({ createdAt: 1 });

        return res.status(200).json({ refunds });
    } catch (err) {
        console.error("[getRefunds]", err);
        return res.status(500).json({ message: "Something went wrong. Please try again." });
    }
}

// =============================================================================
// UPDATE REFUND STATUS
// =============================================================================
/**
 * PATCH /api/admin/refunds/:id/status
 *
 * Body: new_status ("approved" | "rejected"), admin_note (optional)
 */
async function updateRefundStatus(req, res) {
    const { new_status, admin_note } = req.body;

    if (!new_status || !["approved", "rejected"].includes(new_status)) {
        return res.status(400).json({ message: "new_status must be 'approved' or 'rejected'." });
    }

    try {
        const refund = await Refund.findById(req.params.id);
        if (!refund) return res.status(404).json({ message: "Refund not found." });

        if (refund.status !== "pending") {
            return res.status(400).json({ message: "Only pending refunds can be reviewed." });
        }

        const old_status  = refund.status;
        refund.status     = new_status;
        refund.admin_note = admin_note || "";
        refund.status_history.push({
            old_status,
            new_status,
            changed_by: req.user._id,
            note:       admin_note || "",
            changed_at: new Date(),
        });

        await refund.save();

        // ── If approved — update order status to refunded ─────────────────────
        if (new_status === "approved") {
            const order = await Order.findById(refund.order_id);
            if (order) {
                const old_order_status = order.status;
                order.status = "refunded";
                order.status_history.push({
                    old_status: old_order_status,
                    new_status: "refunded",
                    changed_by: req.user._id,
                    note:       "Refund approved.",
                    changed_at: new Date(),
                });
                await order.save();
            }
        }

        // ── Notification ──────────────────────────────────────────────────────
        const message = new_status === "approved"
            ? "Your refund request has been approved. Your refund is being processed."
            : "Your refund request has been reviewed and was not approved.";

        await createNotification(refund.user_id, "refund_update", message, "refunds", refund._id);

        return res.status(200).json({
            message:    `Refund ${new_status}.`,
            refund_id:  refund._id,
            old_status,
            new_status,
        });

    } catch (err) {
        console.error("[updateRefundStatus]", err);
        return res.status(500).json({ message: "Something went wrong. Please try again." });
    }
}

export { getOrders, getOrder, updateOrderStatus, getRefunds, updateRefundStatus };
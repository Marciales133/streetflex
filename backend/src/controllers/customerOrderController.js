import mongoose from "mongoose";
import { Order, Discount, Notification, Refund, Product, Cart } from "../models/modelCenter.js";

// =============================================================================
// CREATE ORDER  (customer)
// =============================================================================
/**
 * POST /api/orders
 *
 * Accepts either:
 *   A) items[] directly in the body (Postman testing)
 *   B) address_id to pull from user's saved addresses
 *
 * Body:
 *   required  items[], shipping_address, subtotal, total
 *   optional  discount_code, note, is_preorder
 */
async function createOrder(req, res) {
    const {
        items,
        shipping_address,
        subtotal,
        total,
        discount_code,
        note,
        is_preorder,
    } = req.body;

    // ── Validation ────────────────────────────────────────────────────────────
    if (!items || !items.length) {
        return res.status(400).json({ message: "Order must have at least one item." });
    }
    if (!shipping_address) {
        return res.status(400).json({ message: "Shipping address is required." });
    }
    const { recipient, phone, line1, city, province, postal_code } = shipping_address;
    if (!recipient || !phone || !line1 || !city || !province || !postal_code) {
        return res.status(400).json({ message: "Shipping address is missing required fields." });
    }
    if (subtotal === undefined || total === undefined) {
        return res.status(400).json({ message: "subtotal and total are required." });
    }

    const dbSession = await mongoose.startSession();
    dbSession.startTransaction();

    try {
        // ── Validate each item against live product/variant ───────────────────
        const validatedItems = [];
        let   discount_amount = 0;

        for (const item of items) {
            const product = await Product.findOne({
                _id:        item.product_id,
                is_active:  true,
                deleted_at: null,
            }).session(dbSession);

            if (!product) {
                await dbSession.abortTransaction();
                dbSession.endSession();
                return res.status(404).json({ message: `Product not found: ${item.product_id}` });
            }

            const variantId = String(item.variant_id).trim();

            console.log("product id:", product._id.toString());
            console.log("requested variant id:", variantId);
            console.log("available variant ids:", product.variants.map(v => v._id.toString()));

            const variant = product.variants.find(v => v._id.toString() === variantId);

            if (!variant || variant.deleted_at || !variant.is_active) {
                await dbSession.abortTransaction();
                dbSession.endSession();
                return res.status(404).json({ message: `Variant not found: ${item.variant_id}` });
            }

            // ── For non-preorder: check stock ─────────────────────────────────
            if (!is_preorder && variant.stock < item.quantity) {
                await dbSession.abortTransaction();
                dbSession.endSession();
                return res.status(409).json({
                    message: `Insufficient stock for "${product.name}" (${variant.size}/${variant.color}). Available: ${variant.stock}.`,
                });
            }

            // ── For preorder: check claimed_slots ─────────────────────────────
            if (is_preorder) {
                const available = variant.preorder.max_slots - variant.preorder.claimed_slots;
                if (available < item.quantity) {
                    await dbSession.abortTransaction();
                    dbSession.endSession();
                    return res.status(409).json({
                        message: `Not enough preorder slots for "${product.name}". Available: ${available}.`,
                    });
                }
                // claim slots immediately
                await Product.updateOne(
                    { _id: product._id, "variants._id": variant._id },
                    { $inc: { "variants.$.preorder.claimed_slots": item.quantity } },
                    { session: dbSession }
                );
            }

            const unit_price = product.base_price + (variant.price_modifier || 0);  
            const subtotalItem = unit_price * item.quantity;

            validatedItems.push({
                product_id: product._id,
                variant_id: variant._id,
                name:       product.name,
                sku:        variant.sku,
                size:       variant.size,
                color:      variant.color,
                image_url:  product.images?.find(i => i.is_primary)?.url || product.images?.[0]?.url || null,
                unit_price,
                quantity:   item.quantity,
                subtotal:   subtotalItem,
            });
        }

        // ── Validate discount code if provided ────────────────────────────────
        if (discount_code) {
            const discount = await Discount.findOne({
                code:      discount_code.toUpperCase().trim(),
                is_active: true,
            }).session(dbSession);

            if (!discount) {
                await dbSession.abortTransaction();
                dbSession.endSession();
                return res.status(404).json({ message: "Discount code is invalid or expired." });
            }
            if (discount.expires_at && discount.expires_at < new Date()) {
                await dbSession.abortTransaction();
                dbSession.endSession();
                return res.status(400).json({ message: "Discount code has expired." });
            }
            if (discount.max_uses !== null && discount.used_count >= discount.max_uses) {
                await dbSession.abortTransaction();
                dbSession.endSession();
                return res.status(400).json({ message: "Discount code has reached its usage limit." });
            }
            if (subtotal < discount.min_order_amount) {
                await dbSession.abortTransaction();
                dbSession.endSession();
                return res.status(400).json({
                    message: `Minimum order amount for this code is ₱${discount.min_order_amount}.`,
                });
            }

            discount_amount = discount.type === "percent"
                ? Math.round(subtotal * (discount.value / 100))
                : discount.value;

            // increment used_count
            await Discount.updateOne(
                { _id: discount._id },
                { $inc: { used_count: 1 } },
                { session: dbSession }
            );
        }

        const finalTotal = subtotal - discount_amount;

        // ── Create order ──────────────────────────────────────────────────────
        const [order] = await Order.create(
            [{
                user_id:          req.user._id,
                subtotal,
                discount_amount,
                total:            finalTotal,
                discount_code:    discount_code || null,
                payment_method:   "cod",
                is_preorder:      is_preorder ?? false,
                note:             note || "",
                shipping_address: {
                    recipient:   shipping_address.recipient,
                    phone:       shipping_address.phone,
                    line1:       shipping_address.line1,
                    line2:       shipping_address.line2 || "",
                    city:        shipping_address.city,
                    province:    shipping_address.province,
                    postal_code: shipping_address.postal_code,
                    country:     shipping_address.country || "PH",
                },
                items:          validatedItems,
                status_history: [{
                    old_status: null,
                    new_status: "pending",
                    changed_by: req.user._id,
                    note:       "Order placed.",
                    changed_at: new Date(),
                }],
            }],
            { session: dbSession }
        );

        // ── Clear cart if exists ──────────────────────────────────────────────
        await Cart.updateOne(
            { user_id: req.user._id },
            { $set: { items: [] } },
            { session: dbSession }
        );

        await dbSession.commitTransaction();
        dbSession.endSession();

        // ── Notify user ───────────────────────────────────────────────────────
        await Notification.create({
            user_id:  req.user._id,
            type:     "order_update",
            message:  "Your order has been placed and is awaiting confirmation.",
            ref_type: "orders",
            ref_id:   order._id,
        });

        return res.status(201).json({
            message: "Order placed successfully.",
            order_id: order._id,
            status:   order.status,
            total:    order.total,
        });

    } catch (err) {
        await dbSession.abortTransaction();
        dbSession.endSession();
        console.error("[createOrder]", err);
        return res.status(500).json({ message: "Something went wrong. Please try again." });
    }
}

// =============================================================================
// CREATE REFUND  (customer)
// =============================================================================
/**
 * POST /api/refunds
 *
 * Body:
 *   required  order_id, reason
 *   optional  proofs[] — [{ file_url, media_type }]
 *
 * Rules:
 *   - Order must belong to the requesting user
 *   - Order must be in "delivered" status
 *   - One refund per order enforced by unique index
 */
async function createRefund(req, res) {
    const { order_id, reason, proofs } = req.body;

    if (!order_id) return res.status(400).json({ message: "order_id is required." });
    if (!reason || !reason.trim()) return res.status(400).json({ message: "reason is required." });

    try {
        // ── Verify order ownership and status ─────────────────────────────────
        const order = await Order.findOne({
            _id:        order_id,
            user_id:    req.user._id,
            deleted_at: null,
        });

        if (!order) {
            return res.status(404).json({ message: "Order not found." });
        }
        if (order.status !== "delivered") {
            return res.status(400).json({
                message: "Refunds can only be requested for delivered orders.",
            });
        }

        // ── Check no refund already exists ────────────────────────────────────
        const existing = await Refund.findOne({ order_id });
        if (existing) {
            return res.status(409).json({ message: "A refund request already exists for this order." });
        }

        // ── Validate proofs ───────────────────────────────────────────────────
        const validProofs = [];
        if (proofs && proofs.length) {
            for (const proof of proofs) {
                if (!proof.file_url || !proof.media_type) {
                    return res.status(400).json({ message: "Each proof must have file_url and media_type." });
                }
                if (!["image", "video"].includes(proof.media_type)) {
                    return res.status(400).json({ message: "media_type must be 'image' or 'video'." });
                }
                validProofs.push({ file_url: proof.file_url, media_type: proof.media_type });
            }
        }

        // ── Update order status to refund_requested ───────────────────────────
        order.status = "refund_requested";
        order.status_history.push({
            old_status: "delivered",
            new_status: "refund_requested",
            changed_by: req.user._id,
            note:       "Customer requested a refund.",
            changed_at: new Date(),
        });
        await order.save();

        // ── Create refund ─────────────────────────────────────────────────────
        const refund = await Refund.create({
            order_id,
            user_id: req.user._id,
            reason:  reason.trim(),
            proofs:  validProofs,
            status_history: [{
                old_status: null,
                new_status: "pending",
                changed_by: req.user._id,
                note:       "Refund request submitted.",
                changed_at: new Date(),
            }],
        });

        // ── Notify user ───────────────────────────────────────────────────────
        await Notification.create({
            user_id:  req.user._id,
            type:     "refund_update",
            message:  "Your refund request has been submitted and is under review.",
            ref_type: "refunds",
            ref_id:   refund._id,
        });

        return res.status(201).json({
            message:   "Refund request submitted.",
            refund_id: refund._id,
            status:    refund.status,
        });

    } catch (err) {
        console.error("[createRefund]", err);
        return res.status(500).json({ message: "Something went wrong. Please try again." });
    }
}

// =============================================================================
// customerOrderController.js  —  ADDITIONS
// Add getMyOrders and cancelOrder to your existing customer order controller.
//
// NEW ROUTES in authRoute.js:
//   router.get   ("/orders",          requireAuth, requireRole("customer","admin","super_admin"), getMyOrders);
//   router.patch ("/orders/:id/cancel",requireAuth, requireRole("customer","admin","super_admin"), cancelOrder);
// =============================================================================


// =============================================================================
// GET MY ORDERS  (customer)
// =============================================================================
/**
 * GET /api/auth/orders?page=1&limit=10&status=pending
 *
 * Returns the requesting user's orders, newest first.
 * Excludes soft-deleted orders.
 *
 * Response 200:
 *   { orders: [...], total, page, limit, has_more }
 */
async function getMyOrders(req, res) {
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(20, parseInt(req.query.limit) || 10);
    const skip   = (page - 1) * limit;
    const filter = { user_id: req.user._id, deleted_at: null };

    if (req.query.status) filter.status = req.query.status;

    try {
        const [orders, total] = await Promise.all([
            Order.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Order.countDocuments(filter),
        ]);

        return res.status(200).json({
            orders,
            total,
            page,
            limit,
            has_more: skip + limit < total,
        });

    } catch (err) {
        console.error("[getMyOrders]", err);
        return res.status(500).json({ message: "Something went wrong." });
    }
}

// =============================================================================
// CANCEL ORDER  (customer)
// =============================================================================
/**
 * PATCH /api/auth/orders/:id/cancel
 *
 * Customers may only cancel their own orders that are still
 * in "pending" or "confirmed" status (before processing begins).
 *
 * Response 200: { message, order_id, new_status }
 * Response 400: order not cancellable
 * Response 404: order not found / not owned by user
 */
const CUSTOMER_CANCELLABLE = ["pending", "confirmed"];

async function cancelOrder(req, res) {
    try {
        const order = await Order.findOne({
            _id:        req.params.id,
            user_id:    req.user._id,
            deleted_at: null,
        });

        if (!order) {
            return res.status(404).json({ message: "Order not found." });
        }

        if (!CUSTOMER_CANCELLABLE.includes(order.status)) {
            return res.status(400).json({
                message: `This order cannot be cancelled (current status: ${order.status}).`,
            });
        }

        const old_status = order.status;
        order.status     = "cancelled";
        order.status_history.push({
            old_status,
            new_status: "cancelled",
            changed_by: req.user._id,
            note:       "Cancelled by customer.",
            changed_at: new Date(),
        });

        await order.save();

        return res.status(200).json({
            message:    "Order cancelled.",
            order_id:   order._id,
            old_status,
            new_status: "cancelled",
        });

    } catch (err) {
        console.error("[cancelOrder]", err);
        return res.status(500).json({ message: "Something went wrong." });
    }
}





export { createOrder, createRefund, getMyOrders, cancelOrder };
import { Cart, Product } from "../models/modelCenter.js";

// =============================================================================
// ADD TO CART  (requireAuth — guests included via guest session)
// =============================================================================
/**
 * POST /api/auth/cart
 *
 * Upserts a cart item. If the same product+variant already exists in the cart,
 * increments the quantity. Otherwise pushes a new item with a price snapshot.
 *
 * Body:
 *   required  product_id, variant_id, quantity (min 1)
 *
 * Response 201 — item added / quantity updated
 * Response 400 — validation error
 * Response 404 — product or variant not found
 * Response 409 — not enough stock
 */
async function addToCart(req, res) {
    const { product_id, variant_id, quantity = 1 } = req.body;

    // ── Validation ────────────────────────────────────────────────────────────
    if (!product_id || !variant_id) {
        return res.status(400).json({ message: "product_id and variant_id are required." });
    }
    const qty = parseInt(quantity);
    if (isNaN(qty) || qty < 1) {
        return res.status(400).json({ message: "quantity must be a positive integer." });
    }

    try {
        // ── Verify product + variant exist and are available ──────────────────
        const product = await Product.findOne({
            _id:        product_id,
            is_active:  true,
            deleted_at: null,
        });

        if (!product) {
            return res.status(404).json({ message: "Product not found." });
        }

        const variant = product.variants.find(
            v => v._id.toString() === String(variant_id) && v.is_active && !v.deleted_at
        );

        if (!variant) {
            return res.status(404).json({ message: "Variant not found." });
        }

        // ── Stock check (skip for preorder products) ──────────────────────────
        if (!product.is_preorder && variant.stock < qty) {
            return res.status(409).json({
                message:   `Only ${variant.stock} unit(s) available for this variant.`,
                available: variant.stock,
            });
        }

        // ── Preorder: check available slots ───────────────────────────────────
        if (product.is_preorder) {
            const available = variant.preorder.max_slots - variant.preorder.claimed_slots;
            if (available < qty) {
                return res.status(409).json({
                    message:   `Only ${available} preorder slot(s) remaining.`,
                    available,
                });
            }
        }

        const unit_price = product.base_price + (variant.price_modifier || 0);

        // ── Upsert cart ───────────────────────────────────────────────────────
        // Try to find an existing cart for this user
        let cart = await Cart.findOne({ user_id: req.user._id });

        if (!cart) {
            // First time — create cart with this item
            cart = await Cart.create({
                user_id: req.user._id,
                items: [{
                    product_id,
                    variant_id,
                    name:       product.name,
                    sku:        variant.sku,
                    size:       variant.size,
                    color:      variant.color,
                    image_url:  product.images?.find(i => i.is_primary)?.url
                                || product.images?.[0]?.url
                                || null,
                    unit_price,
                    quantity:   qty,
                }],
            });

            return res.status(201).json({
                message:    "Item added to cart.",
                cart_count: cart.items.length,
            });
        }

        // Cart exists — check if this variant is already in it
        const existingIndex = cart.items.findIndex(
            item =>
                item.product_id.toString() === String(product_id) &&
                item.variant_id.toString() === String(variant_id) &&
                !item.saved_for_later
        );

        if (existingIndex !== -1) {
            // ── Increment quantity ────────────────────────────────────────────
            const newQty = cart.items[existingIndex].quantity + qty;

            // Re-check stock against the new total quantity
            if (!product.is_preorder && variant.stock < newQty) {
                return res.status(409).json({
                    message:   `Cannot add ${qty} more. Only ${variant.stock} unit(s) available and you already have ${cart.items[existingIndex].quantity} in your cart.`,
                    available: variant.stock,
                });
            }

            cart.items[existingIndex].quantity = newQty;
        } else {
            // ── Push new item ─────────────────────────────────────────────────
            cart.items.push({
                product_id,
                variant_id,
                name:       product.name,
                sku:        variant.sku,
                size:       variant.size,
                color:      variant.color,
                image_url:  product.images?.find(i => i.is_primary)?.url
                            || product.images?.[0]?.url
                            || null,
                unit_price,
                quantity:   qty,
            });
        }

        await cart.save();

        const activeCount = cart.items.filter(i => !i.saved_for_later).length;

        return res.status(201).json({
            message:    existingIndex !== -1 ? "Cart quantity updated." : "Item added to cart.",
            cart_count: activeCount,
        });

    } catch (err) {
        console.error("[addToCart]", err);
        return res.status(500).json({ message: "Something went wrong. Please try again." });
    }
}

// =============================================================================
// GET CART COUNT  (requireAuth)
// =============================================================================
/**
 * GET /api/auth/cart/count
 *
 * Returns the number of active (not saved-for-later) items in the user's cart.
 * Used to update the nav badge on page load.
 *
 * Response 200:
 *   { count: <number> }
 */
async function getCartCount(req, res) {
    try {
        const cart = await Cart.findOne({ user_id: req.user._id })
            .select("items.saved_for_later")
            .lean();

        if (!cart) {
            return res.status(200).json({ count: 0 });
        }

        const count = cart.items.filter(i => !i.saved_for_later).length;

        return res.status(200).json({ count });

    } catch (err) {
        console.error("[getCartCount]", err);
        return res.status(500).json({ message: "Something went wrong." });
    }
}

// =============================================================================
// cartController.js  —  ADDITIONS
// Add these functions to your existing cart controller file alongside
// addToCart and getCartCount. Then export and register the new routes.
//
// NEW ROUTES to add in authRoute.js:
//   router.get("/cart",                   requireAuth, getCart);
//   router.patch("/cart/:item_id",         requireAuth, updateCartItem);
//   router.delete("/cart/items",           requireAuth, removeCartItems);   // bulk — MUST be before /:item_id
//   router.delete("/cart/:item_id",        requireAuth, removeCartItem);
// =============================================================================

// =============================================================================
// GET CART  (requireAuth)
// =============================================================================
/**
 * GET /api/auth/cart
 *
 * Returns the full cart with live stock/preorder info merged in so the
 * frontend can show stock badges and disable qty controls accurately.
 *
 * Response 200:
 *   {
 *     items: [{
 *       _id,               ← cart item _id (use as item_id in PATCH/DELETE)
 *       product_id,
 *       variant_id,
 *       name, sku, size, color, image_url, unit_price, quantity,
 *       saved_for_later, added_at,
 *       slug,              ← from live product (for item page link)
 *       stock,             ← live variant stock (0 if not found)
 *       is_preorder,       ← live product flag
 *       preorder_available ← max_slots - claimed_slots (only relevant if is_preorder)
 *     }],
 *     item_count   ← active (not saved-for-later) item count
 *   }
 */
async function getCart(req, res) {
    try {
        const cart = await Cart.findOne({ user_id: req.user._id }).lean();

        if (!cart || !cart.items.length) {
            return res.status(200).json({ items: [], item_count: 0 });
        }

        const activeItems = cart.items.filter(i => !i.saved_for_later);

        // Collect unique product_ids to batch-fetch live data
        const productIds = [...new Set(activeItems.map(i => String(i.product_id)))];

        const products = await Product.find({
            _id: { $in: productIds },
        })
        .select("_id slug is_preorder variants is_active deleted_at")
        .lean();

        const productMap = new Map(products.map(p => [String(p._id), p]));

        const enriched = activeItems.map(item => {
            const product = productMap.get(String(item.product_id));
            const variant = product?.variants?.find(
                v => String(v._id) === String(item.variant_id)
            );

            const isDeleted   = !product || product.deleted_at || !product.is_active;
            const isPreorder  = product?.is_preorder ?? false;

            const stock = isDeleted
                ? 0
                : isPreorder
                    ? (variant?.preorder?.max_slots ?? 0) - (variant?.preorder?.claimed_slots ?? 0)
                    : (variant?.stock ?? 0);

            return {
                ...item,
                slug:               product?.slug ?? null,
                is_preorder:        isPreorder,
                stock,                           // 0 means out of stock
                preorder_available: isPreorder ? stock : null,
                is_unavailable:     isDeleted || (!isPreorder && !variant?.is_active),
            };
        });

        return res.status(200).json({
            items:      enriched,
            item_count: enriched.length,
        });

    } catch (err) {
        console.error("[getCart]", err);
        return res.status(500).json({ message: "Something went wrong." });
    }
}

// =============================================================================
// UPDATE CART ITEM QTY  (requireAuth)
// =============================================================================
/**
 * PATCH /api/auth/cart/:item_id
 *
 * Body: { quantity }  — must be >= 1
 *
 * Validates against live stock/preorder slots before saving.
 *
 * Response 200: { message, cart_count }
 * Response 400: invalid quantity
 * Response 404: item not in cart
 * Response 409: not enough stock
 */
async function updateCartItem(req, res) {
    const { item_id } = req.params;
    const { quantity } = req.body;

    const qty = parseInt(quantity);
    if (isNaN(qty) || qty < 1) {
        return res.status(400).json({ message: "quantity must be at least 1." });
    }

    try {
        const cart = await Cart.findOne({ user_id: req.user._id });

        if (!cart) return res.status(404).json({ message: "Cart not found." });

        const itemIndex = cart.items.findIndex(i => String(i._id) === String(item_id));
        if (itemIndex === -1) return res.status(404).json({ message: "Item not found in cart." });

        const item = cart.items[itemIndex];

        // Live stock check
        const product = await Product.findById(item.product_id)
            .select("is_preorder variants is_active deleted_at").lean();

        if (!product || product.deleted_at || !product.is_active) {
            return res.status(409).json({ message: "This product is no longer available." });
        }

        const variant = product.variants.find(v => String(v._id) === String(item.variant_id));
        if (!variant || variant.deleted_at || !variant.is_active) {
            return res.status(409).json({ message: "This variant is no longer available." });
        }

        const available = product.is_preorder
            ? (variant.preorder?.max_slots ?? 0) - (variant.preorder?.claimed_slots ?? 0)
            : variant.stock;

        if (qty > available) {
            return res.status(409).json({
                message:   `Only ${available} unit(s) available.`,
                available,
            });
        }

        cart.items[itemIndex].quantity = qty;
        await cart.save();

        const activeCount = cart.items.filter(i => !i.saved_for_later).length;
        return res.status(200).json({ message: "Cart updated.", cart_count: activeCount });

    } catch (err) {
        console.error("[updateCartItem]", err);
        return res.status(500).json({ message: "Something went wrong." });
    }
}

// =============================================================================
// REMOVE SINGLE CART ITEM  (requireAuth)
// =============================================================================
/**
 * DELETE /api/auth/cart/:item_id
 *
 * Response 200: { message, cart_count }
 * Response 404: item not in cart
 */
async function removeCartItem(req, res) {
    const { item_id } = req.params;

    try {
        const cart = await Cart.findOne({ user_id: req.user._id });
        if (!cart) return res.status(404).json({ message: "Cart not found." });

        const before = cart.items.length;
        cart.items = cart.items.filter(i => String(i._id) !== String(item_id));

        if (cart.items.length === before) {
            return res.status(404).json({ message: "Item not found in cart." });
        }

        await cart.save();

        const activeCount = cart.items.filter(i => !i.saved_for_later).length;
        return res.status(200).json({ message: "Item removed.", cart_count: activeCount });

    } catch (err) {
        console.error("[removeCartItem]", err);
        return res.status(500).json({ message: "Something went wrong." });
    }
}

// =============================================================================
// REMOVE MULTIPLE CART ITEMS  (requireAuth)
// =============================================================================
/**
 * DELETE /api/auth/cart/items
 *
 * Body: { item_ids: ["...", "..."] }
 *
 * Silently skips IDs that aren't in the cart.
 *
 * Response 200: { message, removed_count, cart_count }
 */
async function removeCartItems(req, res) {
    const { item_ids } = req.body;

    if (!item_ids?.length) {
        return res.status(400).json({ message: "item_ids array is required." });
    }

    try {
        const cart = await Cart.findOne({ user_id: req.user._id });
        if (!cart) return res.status(404).json({ message: "Cart not found." });

        const idSet  = new Set(item_ids.map(String));
        const before = cart.items.length;
        cart.items   = cart.items.filter(i => !idSet.has(String(i._id)));

        const removed_count = before - cart.items.length;
        await cart.save();

        const activeCount = cart.items.filter(i => !i.saved_for_later).length;
        return res.status(200).json({
            message: `${removed_count} item(s) removed.`,
            removed_count,
            cart_count: activeCount,
        });

    } catch (err) {
        console.error("[removeCartItems]", err);
        return res.status(500).json({ message: "Something went wrong." });
    }
}

// =============================================================================
// ROUTE REGISTRATION  —  add to authRoute.js
// =============================================================================
// import { addToCart, getCartCount, getCart, updateCartItem, removeCartItem, removeCartItems }
//     from "../controllers/cartController.js";
//
// router.get   ("/cart",          requireAuth, getCart);
// router.patch ("/cart/:item_id", requireAuth, updateCartItem);
// router.delete("/cart/items",    requireAuth, removeCartItems);  // ← MUST be before /:item_id
// router.delete("/cart/:item_id", requireAuth, removeCartItem);



export { getCart, updateCartItem, removeCartItem, removeCartItems, addToCart, getCartCount };

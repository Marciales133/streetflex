// =============================================================================
// cart.js  —  StreetFlex Cart Page
// Depends on: main.js (state, formatPrice, showToast, handlePlaceOrder,
//             updateCartBadgeCount, htmlEncode, safeParseProduct)
// =============================================================================

// ── DOM refs ──────────────────────────────────────────────────────────────────
const cartList          = document.getElementById("cartList");
const cartMeta          = document.getElementById("cartMeta");
const selectAllChk      = document.getElementById("selectAllCheckbox");
const bulkRemoveBtn     = document.getElementById("bulkRemoveBtn");
const checkoutBar       = document.getElementById("cartCheckoutBar");
const checkoutCount     = document.getElementById("checkoutCount");
const checkoutTotal     = document.getElementById("checkoutTotal");
const cartOrderBtn      = document.getElementById("cartOrderBtn");
const cartPreorderBtn   = document.getElementById("cartPreorderBtn");
const mixedDialog       = document.getElementById("cartMixedDialog");
const mixedClose        = document.getElementById("cartMixedClose");
const mixedCancel       = document.getElementById("cartMixedCancel");
const mixedOrderBtn     = document.getElementById("cartMixedOrderBtn");
const mixedReserveBtn   = document.getElementById("cartMixedReserveBtn");
const mixedInStockList  = document.getElementById("mixedInStockList");
const mixedPreorderList = document.getElementById("mixedPreorderList");

// ── State ─────────────────────────────────────────────────────────────────────
let cartItems   = [];          // full enriched list from GET /api/auth/cart
let checkedIds  = new Set();   // Set of cart item _id strings currently checked

// =============================================================================
// LOAD CART
// =============================================================================

async function loadCart() {
    renderCartSkeletons(4);
    try {
        const res  = await fetch("/api/auth/cart", { credentials: "include" });
        const data = await res.json();

        cartItems = data.items || [];
        cartList.innerHTML = "";

        if (!cartItems.length) {
            renderCartEmpty();
            updateBulkBar();
            updateCheckoutBar();
            updateCartMeta();
            return;
        }

        cartItems.forEach(item => {
            const card = buildCartCard(item);
            cartList.appendChild(card);
        });

        updateCartMeta();
        updateBulkBar();
        updateCheckoutBar();

    } catch (err) {
        console.error("[loadCart]", err);
        cartList.innerHTML = "";
        showToast("Failed to load cart.", "danger");
    }
}

// =============================================================================
// BUILD CARD
// =============================================================================

function buildCartCard(item) {
    const itemUrl = item.slug ? `./productDetail.html?slug=${item.slug}` : "#";

    const stockBadge = item.is_unavailable
        ? `<span class="cartStockBadge out-of-stock"><i class="fa-solid fa-ban"></i> Unavailable</span>`
        : item.is_preorder
            ? `<span class="cartStockBadge preorder"><i class="fa-solid fa-clock"></i> Preorder</span>`
            : item.stock > 0
                ? `<span class="cartStockBadge in-stock"><i class="fa-solid fa-check"></i> In Stock (${item.stock})</span>`
                : `<span class="cartStockBadge out-of-stock"><i class="fa-solid fa-xmark"></i> Out of Stock</span>`;

    const subtotal = item.unit_price * item.quantity;
    const isChecked = checkedIds.has(String(item._id));

    const wrapper = document.createElement("div");
    wrapper.className = `cartItem${isChecked ? " is-checked" : ""}${item.is_unavailable ? " is-unavailable" : ""}`;
    wrapper.dataset.itemId = item._id;

    wrapper.innerHTML = `
        <div class="cartItemCheck">
            <input type="checkbox" class="cartCheckbox"
                data-item-id="${item._id}"
                ${isChecked ? "checked" : ""}
                ${item.is_unavailable ? "disabled" : ""}>
        </div>

        <a class="cartItemImgLink" href="${itemUrl}" title="View product">
            <img src="${item.image_url || ""}" alt="${item.name}" loading="lazy">
        </a>

        <div class="cartItemInfo">
            <p class="cartItemName" title="${item.name}">${item.name}</p>
            <div class="cartItemVariant">
                <span>${item.size}</span>
                <span>${item.color}</span>
                <span>SKU: ${item.sku}</span>
            </div>
            ${stockBadge}
            <div class="cartItemPriceRow">
                <p class="cartItemPrice">${formatPrice(item.unit_price)}</p>
                <p class="cartItemSubtotal">= ${formatPrice(subtotal)}</p>
            </div>
            <div class="cartQtyRow">
                <div class="cartQtyControls">
                    <button class="cartQtyBtn qtyMinus" data-item-id="${item._id}"
                        ${item.quantity <= 1 ? "disabled" : ""}>
                        <i class="fa-solid fa-minus"></i>
                    </button>
                    <span class="cartQtyVal" data-item-id="${item._id}">${item.quantity}</span>
                    <button class="cartQtyBtn qtyPlus" data-item-id="${item._id}"
                        ${item.stock <= item.quantity ? "disabled" : ""}>
                        <i class="fa-solid fa-plus"></i>
                    </button>
                </div>
                <button class="cartItemRemove" data-item-id="${item._id}" title="Remove item">
                    <i class="fa-solid fa-trash"></i> Remove
                </button>
            </div>
        </div>`;

    // ── Checkbox ──────────────────────────────────────────────────────────────
    wrapper.querySelector(".cartCheckbox").addEventListener("change", e => {
        const id = e.target.dataset.itemId;
        if (e.target.checked) checkedIds.add(id);
        else                   checkedIds.delete(id);
        wrapper.classList.toggle("is-checked", e.target.checked);
        syncSelectAll();
        updateBulkBar();
        updateCheckoutBar();
    });

    // ── Qty minus ─────────────────────────────────────────────────────────────
    wrapper.querySelector(".qtyMinus").addEventListener("click", () =>
        changeQty(item, -1, wrapper));

    // ── Qty plus ──────────────────────────────────────────────────────────────
    wrapper.querySelector(".qtyPlus").addEventListener("click", () =>
        changeQty(item, +1, wrapper));

    // ── Remove ────────────────────────────────────────────────────────────────
    wrapper.querySelector(".cartItemRemove").addEventListener("click", () =>
        removeItem(item._id, wrapper));

    return wrapper;
}

// =============================================================================
// QTY CHANGE
// =============================================================================

async function changeQty(item, delta, cardEl) {
    const newQty = item.quantity + delta;
    if (newQty < 1) return;

    const maxAvail = item.is_preorder ? (item.preorder_available ?? 0) : item.stock;
    if (newQty > maxAvail) {
        showToast(`Only ${maxAvail} available.`, "danger");
        return;
    }

    try {
        const res  = await fetch(`/api/auth/cart/${item._id}`, {
            method:  "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body:    JSON.stringify({ quantity: newQty }),
        });
        const data = await res.json();
        if (!res.ok) { showToast(data.message || "Failed to update.", "danger"); return; }

        // Update local state
        item.quantity = newQty;
        updateCartBadgeCount(data.cart_count);

        // Re-render qty display in this card
        const qtyVal  = cardEl.querySelector(`.cartQtyVal[data-item-id="${item._id}"]`);
        const minusBtn = cardEl.querySelector(".qtyMinus");
        const plusBtn  = cardEl.querySelector(".qtyPlus");
        const subtotalEl = cardEl.querySelector(".cartItemSubtotal");

        if (qtyVal)    qtyVal.textContent = newQty;
        if (minusBtn)  minusBtn.disabled  = newQty <= 1;
        if (plusBtn)   plusBtn.disabled   = newQty >= maxAvail;
        if (subtotalEl) subtotalEl.textContent = `= ${formatPrice(item.unit_price * newQty)}`;

        // Refresh checkout total if this item is checked
        if (checkedIds.has(String(item._id))) updateCheckoutBar();

    } catch (err) {
        console.error("[changeQty]", err);
        showToast("Something went wrong.", "danger");
    }
}

// =============================================================================
// REMOVE ITEM
// =============================================================================

async function removeItem(itemId, cardEl) {
    try {
        const res  = await fetch(`/api/auth/cart/${itemId}`, {
            method: "DELETE",
            credentials: "include",
        });
        const data = await res.json();
        if (!res.ok) { showToast(data.message || "Failed to remove.", "danger"); return; }

        // Animate out
        cardEl.style.transition = "opacity 0.18s ease, transform 0.18s ease";
        cardEl.style.opacity    = "0";
        cardEl.style.transform  = "translateX(10px)";

        setTimeout(() => {
            cardEl.remove();
            cartItems = cartItems.filter(i => String(i._id) !== String(itemId));
            checkedIds.delete(String(itemId));
            updateCartBadgeCount(data.cart_count);
            updateCartMeta();
            updateBulkBar();
            updateCheckoutBar();
            syncSelectAll();
            if (!cartItems.length) renderCartEmpty();
        }, 180);

        showToast("Item removed.", "success");

    } catch (err) {
        console.error("[removeItem]", err);
        showToast("Something went wrong.", "danger");
    }
}

// =============================================================================
// BULK REMOVE
// =============================================================================

async function bulkRemove() {
    const ids = [...checkedIds];
    if (!ids.length) return;

    try {
        const res  = await fetch("/api/auth/cart/items", {
            method:  "DELETE",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body:    JSON.stringify({ item_ids: ids }),
        });
        const data = await res.json();
        if (!res.ok) { showToast(data.message || "Failed.", "danger"); return; }

        // Animate out all checked cards
        ids.forEach(id => {
            const card = cartList.querySelector(`[data-item-id="${id}"]`);
            if (card) {
                card.style.transition = "opacity 0.15s, transform 0.15s";
                card.style.opacity    = "0";
                card.style.transform  = "translateX(10px)";
                setTimeout(() => card.remove(), 160);
            }
        });

        setTimeout(() => {
            cartItems = cartItems.filter(i => !ids.includes(String(i._id)));
            checkedIds.clear();
            updateCartBadgeCount(data.cart_count);
            updateCartMeta();
            updateBulkBar();
            updateCheckoutBar();
            syncSelectAll();
            if (!cartItems.length) renderCartEmpty();
        }, 180);

        showToast(`${ids.length} item(s) removed.`, "success");

    } catch (err) {
        console.error("[bulkRemove]", err);
        showToast("Something went wrong.", "danger");
    }
}

// =============================================================================
// SELECT ALL
// =============================================================================

if (selectAllChk) {
    selectAllChk.addEventListener("change", () => {
        const available = cartItems.filter(i => !i.is_unavailable);
        if (selectAllChk.checked) {
            available.forEach(i => checkedIds.add(String(i._id)));
        } else {
            checkedIds.clear();
        }
        // Re-sync checkboxes on cards
        cartList.querySelectorAll(".cartCheckbox").forEach(chk => {
            const id = chk.dataset.itemId;
            chk.checked = checkedIds.has(id);
            chk.closest(".cartItem")?.classList.toggle("is-checked", chk.checked);
        });
        updateBulkBar();
        updateCheckoutBar();
    });
}

function syncSelectAll() {
    if (!selectAllChk) return;
    const available = cartItems.filter(i => !i.is_unavailable);
    if (!available.length) { selectAllChk.checked = false; selectAllChk.indeterminate = false; return; }
    const checkedCount = available.filter(i => checkedIds.has(String(i._id))).length;
    selectAllChk.indeterminate = checkedCount > 0 && checkedCount < available.length;
    selectAllChk.checked       = checkedCount === available.length;
}

// =============================================================================
// UI STATE HELPERS
// =============================================================================

function updateCartMeta() {
    if (cartMeta) {
        const n = cartItems.length;
        cartMeta.textContent = n === 0 ? "0 items" : n === 1 ? "1 item" : `${n} items`;
    }
}

function updateBulkBar() {
    if (bulkRemoveBtn) bulkRemoveBtn.disabled = checkedIds.size === 0;
}

function updateCheckoutBar() {
    if (!checkoutBar) return;

    const selected = cartItems.filter(i => checkedIds.has(String(i._id)));

    if (!selected.length) {
        checkoutBar.classList.remove("visible");
        if (cartOrderBtn)   cartOrderBtn.disabled   = true;
        if (cartPreorderBtn) cartPreorderBtn.disabled = true;
        return;
    }

    checkoutBar.classList.add("visible");

    const total = selected.reduce((sum, i) => sum + i.unit_price * i.quantity, 0);
    if (checkoutCount) checkoutCount.textContent = `${selected.length} selected`;
    if (checkoutTotal) checkoutTotal.textContent = formatPrice(total);

    const hasInStock  = selected.some(i => !i.is_preorder && i.stock > 0);
    const hasPreorder = selected.some(i => i.is_preorder);
    const hasMixed    = hasInStock && hasPreorder;

    if (cartOrderBtn) {
        cartOrderBtn.disabled = !hasInStock && !hasMixed;
        cartOrderBtn.style.display = (hasInStock || hasMixed) ? "" : "none";
    }
    if (cartPreorderBtn) {
        cartPreorderBtn.disabled = !hasPreorder && !hasMixed;
        cartPreorderBtn.style.display = (hasPreorder || hasMixed) ? "" : "none";
    }
}

// =============================================================================
// CHECKOUT ACTIONS
// =============================================================================

if (cartOrderBtn) {
    cartOrderBtn.addEventListener("click", () => initiateCheckout("order"));
}
if (cartPreorderBtn) {
    cartPreorderBtn.addEventListener("click", () => initiateCheckout("preorder"));
}

function initiateCheckout(intent) {
    const selected   = cartItems.filter(i => checkedIds.has(String(i._id)));
    const inStockItems  = selected.filter(i => !i.is_preorder && i.stock > 0);
    const preorderItems = selected.filter(i => i.is_preorder);
    const hasMixed      = inStockItems.length > 0 && preorderItems.length > 0;

    if (hasMixed) {
        openMixedDialog(inStockItems, preorderItems);
        return;
    }

    const isPreorder = intent === "preorder" || preorderItems.length > 0;
    placeCartOrder(selected, isPreorder);
}

// =============================================================================
// MIXED DIALOG
// =============================================================================

function openMixedDialog(inStockItems, preorderItems) {
    if (!mixedDialog) return;

    // Populate lists
    mixedInStockList.innerHTML  = inStockItems.map(i =>
        `<li title="${i.name} — ${i.size}/${i.color}">${i.name} (${i.size}/${i.color})</li>`
    ).join("");
    mixedPreorderList.innerHTML = preorderItems.map(i =>
        `<li title="${i.name} — ${i.size}/${i.color}">${i.name} (${i.size}/${i.color})</li>`
    ).join("");

    mixedDialog.showModal();

    // One-time listeners for the action buttons (re-bind each open to avoid stale closures)
    const onOrder = () => {
        mixedDialog.close();
        placeCartOrder(inStockItems, false);
    };
    const onReserve = () => {
        mixedDialog.close();
        placeCartOrder(preorderItems, true);
    };

    mixedOrderBtn.onclick  = onOrder;
    mixedReserveBtn.onclick = onReserve;
}

if (mixedClose)  mixedClose.addEventListener("click",  () => mixedDialog?.close());
if (mixedCancel) mixedCancel.addEventListener("click", () => mixedDialog?.close());
if (mixedDialog) {
    mixedDialog.addEventListener("click", e => { if (e.target === mixedDialog) mixedDialog.close(); });
}

// =============================================================================
// PLACE ORDER  (delegates to main.js handlePlaceOrder per item)
// =============================================================================

async function placeCartOrder(items, isPreorder) {
    if (!items.length) return;

    if (!state.user?.addresses?.find(a => a.is_default && !a.deleted_at)) {
        showToast("Please add a default shipping address first.", "danger");
        return;
    }

    // Disable checkout buttons while processing
    if (cartOrderBtn)   cartOrderBtn.disabled   = true;
    if (cartPreorderBtn) cartPreorderBtn.disabled = true;

    const defaultAddress = state.user.addresses.find(a => a.is_default && !a.deleted_at);
    const subtotal = items.reduce((sum, i) => sum + i.unit_price * i.quantity, 0);

    const body = {
        items: items.map(i => ({
            product_id: i.product_id,
            variant_id: i.variant_id,
            quantity:   i.quantity,
        })),
        shipping_address: {
            recipient:   defaultAddress.recipient,
            phone:       defaultAddress.phone,
            line1:       defaultAddress.line1,
            line2:       defaultAddress.line2 || "",
            city:        defaultAddress.city,
            province:    defaultAddress.province,
            postal_code: defaultAddress.postal_code,
            country:     defaultAddress.country || "PH",
        },
        subtotal,
        total: subtotal,
        is_preorder: isPreorder,
    };

    try {
        const res  = await fetch("/api/auth/orders", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body:    JSON.stringify(body),
        });
        const data = await res.json();

        if (!res.ok) {
            showToast(data.message || "Failed to place order.", "danger");
            updateCheckoutBar(); // re-enable buttons
            return;
        }

        showToast(isPreorder ? "Preorder reserved!" : "Order placed!", "success");
        setTimeout(() => { window.location.href = "./orders.html"; }, 1500);

    } catch (err) {
        console.error("[placeCartOrder]", err);
        showToast("Something went wrong.", "danger");
        updateCheckoutBar();
    }
}

// =============================================================================
// RENDER HELPERS
// =============================================================================

function renderCartSkeletons(n = 4) {
    cartList.innerHTML = "";
    for (let i = 0; i < n; i++) {
        const skel = document.createElement("div");
        skel.className = "cartSkeleton";
        cartList.appendChild(skel);
    }
}

function renderCartEmpty() {
    cartList.innerHTML = "";
    const empty = document.createElement("div");
    empty.className = "cartEmpty";
    empty.innerHTML = `
        <i class="fa-solid fa-cart-shopping"></i>
        <p>Your cart is empty.</p>
        <a class="btn" href="./galery.html">Browse Products</a>`;
    cartList.appendChild(empty);
}

// =============================================================================
// BULK REMOVE BUTTON
// =============================================================================

if (bulkRemoveBtn) {
    bulkRemoveBtn.addEventListener("click", bulkRemove);
}

// =============================================================================
// BOOT — same defineProperty pattern as wishlist.js
// =============================================================================

async function bootCart() {
    if (!state.user || state.user.role === "guest") {
        cartList.innerHTML = "";
        const empty = document.createElement("div");
        empty.className = "cartEmpty";
        empty.innerHTML = `
            <i class="fa-solid fa-cart-shopping"></i>
            <p>Sign in to view your cart.</p>
            <a class="btn" href="./signin.html">Sign In</a>`;
        cartList.appendChild(empty);
        updateCartMeta();
        return;
    }

    await loadCart();
}

window.addEventListener("load", () => {
    if (window.__sfBootDone instanceof Promise) {
        window.__sfBootDone.then(bootCart);
        return;
    }

    let _booted = false;
    const _runOnce = () => { if (!_booted) { _booted = true; bootCart(); } };

    if (state.user !== null) {
        _runOnce();
    } else {
        Object.defineProperty(state, "user", {
            configurable: true,
            get() { return null; },
            set(v) {
                Object.defineProperty(state, "user", {
                    configurable: true, writable: true, enumerable: true, value: v
                });
                _runOnce();
            }
        });
        setTimeout(_runOnce, 3000);
    }
});
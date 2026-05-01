// =============================================================================
// orders.js  —  StreetFlex Orders Page
// Depends on: main.js (state, formatPrice, showToast, formatDate, buildStars)
// =============================================================================

// ── DOM refs ──────────────────────────────────────────────────────────────────
const ordersList       = document.getElementById("ordersList");
const ordersShowMore   = document.getElementById("ordersShowMore");
const ordersMeta       = document.getElementById("ordersMeta");

// ── Pagination + filter state ─────────────────────────────────────────────────
let ordersPage    = 1;
const ORDERS_LIMIT = 10;
let  orderTotal   = 0;
let  activeFilter = "all";  // "all" | any ORDER_STATUS string

// ── ImageKit public key (used for review image uploads) ───────────────────────
// Replace with your actual ImageKit public key + upload endpoint.
const IK_UPLOAD_URL = "/api/auth/upload-image";  // your existing ImageKit proxy route

// =============================================================================
// STATUS CONFIG
// =============================================================================

const STATUS_LABELS = {
    pending:          "Pending",
    confirmed:        "Confirmed",
    processing:       "Processing",
    to_be_delivered:  "On the Way",
    delivered:        "Delivered",
    cancelled:        "Cancelled",
    refund_requested: "Refund Requested",
    refunded:         "Refunded",
};

const STATUS_ICONS = {
    pending:          "fa-clock",
    confirmed:        "fa-check",
    processing:       "fa-gear",
    to_be_delivered:  "fa-truck",
    delivered:        "fa-box-open",
    cancelled:        "fa-ban",
    refund_requested: "fa-rotate-left",
    refunded:         "fa-coins",
};

// Statuses where customer can still cancel
const CANCELLABLE_STATUSES = ["pending", "confirmed"];

// =============================================================================
// FILTER TABS  (injected below the heading by JS)
// =============================================================================

const FILTER_OPTIONS = [
    { label: "All",         value: "all" },
    { label: "Pending",     value: "pending" },
    { label: "Confirmed",   value: "confirmed" },
    { label: "Processing",  value: "processing" },
    { label: "On the Way",  value: "to_be_delivered" },
    { label: "Delivered",   value: "delivered" },
    { label: "Cancelled",   value: "cancelled" },
    { label: "Refund",      value: "refund_requested" },
    { label: "Refunded",    value: "refunded" },
];

function buildFilterBar() {
    const section = document.querySelector(".ordersSection");
    if (!section || section.querySelector(".ordersFilterBar")) return;

    const bar = document.createElement("div");
    bar.className = "ordersFilterBar";

    FILTER_OPTIONS.forEach(opt => {
        const tab = document.createElement("button");
        tab.className   = `orderFilterTab${opt.value === "all" ? " active" : ""}`;
        tab.textContent = opt.label;
        tab.dataset.filter = opt.value;
        tab.addEventListener("click", () => {
            document.querySelectorAll(".orderFilterTab").forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            activeFilter = opt.value;
            loadOrders(true);
        });
        bar.appendChild(tab);
    });

    // Insert after meta
    const meta = section.querySelector(".ordersMeta") || section.querySelector("h2");
    if (meta) meta.insertAdjacentElement("afterend", bar);
    else section.prepend(bar);
}

// =============================================================================
// LOAD ORDERS
// =============================================================================

async function loadOrders(reset = false) {
    if (!ordersList) return;

    if (reset) {
        ordersPage = 1;
        ordersList.innerHTML = "";
    }

    if (ordersPage === 1) renderOrderSkeletons(3);

    const params = new URLSearchParams({
        page:  ordersPage,
        limit: ORDERS_LIMIT,
    });
    if (activeFilter !== "all") params.set("status", activeFilter);

    try {
        const res  = await fetch(`/api/auth/orders?${params}`, { credentials: "include" });
        const data = await res.json();

        if (ordersPage === 1) ordersList.innerHTML = "";

        orderTotal = data.total || 0;
        updateOrdersMeta();

        if (!data.orders?.length && ordersPage === 1) {
            renderOrdersEmpty();
            if (ordersShowMore) ordersShowMore.classList.add("hidden");
            return;
        }

        data.orders.forEach(order => {
            ordersList.appendChild(buildOrderCard(order));
        });

        if (ordersShowMore) {
            data.has_more
                ? ordersShowMore.classList.remove("hidden")
                : ordersShowMore.classList.add("hidden");
        }

        ordersPage++;

    } catch (err) {
        console.error("[loadOrders]", err);
        if (ordersPage === 1) ordersList.innerHTML = "";
        showToast("Failed to load orders.", "danger");
    }
}

// =============================================================================
// BUILD ORDER CARD
// =============================================================================

function buildOrderCard(order) {
    const statusClass = `status-${order.status}`;
    const statusLabel = STATUS_LABELS[order.status] || order.status;
    const statusIcon  = STATUS_ICONS[order.status]  || "fa-circle";
    const dateStr     = formatDate(order.createdAt);
    const shortId     = String(order._id).slice(-8).toUpperCase();

    // Items: show up to 4 thumbs, then "+N more"
    const MAX_THUMBS = 4;
    const items      = order.items || [];
    const thumbItems = items.slice(0, MAX_THUMBS);
    const overflow   = items.length - MAX_THUMBS;

    const thumbsHTML = thumbItems.map(item => `
        <div class="orderItemThumb">
            <img src="${item.image_url || ""}" alt="${item.name}" loading="lazy">
            <span class="thumbQty">×${item.quantity}</span>
        </div>`).join("");

    const overflowHTML = overflow > 0
        ? `<div class="orderItemsOverflow">+${overflow}</div>` : "";

    // Expanded item rows
    const itemRowsHTML = items.map(item => `
        <div class="orderItemRow">
            <div class="orderItemRowImg">
                <img src="${item.image_url || ""}" alt="${item.name}" loading="lazy">
            </div>
            <div class="orderItemRowInfo">
                <p class="orderItemRowName" title="${item.name}">${item.name}</p>
                <p class="orderItemRowMeta">${item.size} / ${item.color} &nbsp;·&nbsp; ×${item.quantity} &nbsp;·&nbsp; ${formatPrice(item.subtotal)}</p>
            </div>
        </div>`).join("");

    // CTA buttons — logic based on status
    const canCancel  = CANCELLABLE_STATUSES.includes(order.status);
    const isDelivered = order.status === "delivered";
    const ctaHTML    = buildCTA(order, canCancel, isDelivered);

    const preorderTag = order.is_preorder
        ? `<span class="orderPreorderTag">Preorder</span>` : "";

    const card = document.createElement("div");
    card.className = "orderCard";
    card.dataset.orderId = order._id;

    card.innerHTML = `
        <div class="orderCardHead">
            <div class="orderCardHeadLeft">
                <p class="orderIdLabel">Order ID</p>
                <p class="orderIdValue">#${shortId}</p>
                <p class="orderDateLabel">${dateStr}</p>
            </div>
            <div style="display:flex;gap:.4rem;align-items:center;flex-wrap:wrap;">
                ${preorderTag}
                <span class="orderStatusPill ${statusClass}">
                    <i class="fa-solid ${statusIcon}"></i> ${statusLabel}
                </span>
            </div>
        </div>

        <div class="orderItemsStrip">
            ${thumbsHTML}${overflowHTML}
        </div>

        <button class="orderExpandToggle" data-order-id="${order._id}">
            <i class="fa-solid fa-chevron-down"></i> Show ${items.length} item${items.length !== 1 ? "s" : ""}
        </button>

        <div class="orderItemsList" data-order-id="${order._id}">
            ${itemRowsHTML}
        </div>

        <div class="orderCardFooter">
            <div class="orderTotalBlock">
                <p class="orderTotalLabel">Total${order.discount_amount > 0 ? " (after discount)" : ""}</p>
                <p class="orderTotalValue">${formatPrice(order.total)}</p>
            </div>
            <div class="orderCTAGroup">
                ${ctaHTML}
            </div>
        </div>`;

    // ── Expand/collapse toggle ────────────────────────────────────────────────
    card.querySelector(".orderExpandToggle").addEventListener("click", function () {
        const listEl = card.querySelector(`.orderItemsList`);
        const expanded = listEl.classList.toggle("expanded");
        this.innerHTML = `<i class="fa-solid fa-chevron-${expanded ? "up" : "down"}"></i>
            ${expanded ? "Hide" : "Show"} ${items.length} item${items.length !== 1 ? "s" : ""}`;
    });

    // ── Cancel ────────────────────────────────────────────────────────────────
    const cancelBtn = card.querySelector(".orderCancelBtn");
    if (cancelBtn) {
        cancelBtn.addEventListener("click", () => openCancelConfirm(order._id, card));
    }

    // ── Review ────────────────────────────────────────────────────────────────
    const reviewBtn = card.querySelector(".orderReviewBtn");
    if (reviewBtn) {
        reviewBtn.addEventListener("click", () => openReviewDialog(order));
    }

    // ── Refund ────────────────────────────────────────────────────────────────
    const refundBtn = card.querySelector(".orderRefundBtn");
    if (refundBtn) {
        refundBtn.addEventListener("click", () => {
            window.location.href = "./FAQs.html#refund";
        });
    }

    return card;
}

function buildCTA(order, canCancel, isDelivered) {
    const parts = [];

    if (canCancel) {
        parts.push(`<button class="orderCancelBtn" data-order-id="${order._id}">
            <i class="fa-solid fa-xmark"></i> Cancel
        </button>`);
    }

    if (isDelivered) {
        parts.push(`<button class="orderReviewBtn" data-order-id="${order._id}">
            <i class="fa-solid fa-star"></i> Review
        </button>`);
        parts.push(`<button class="orderRefundBtn" data-order-id="${order._id}">
            <i class="fa-solid fa-rotate-left"></i> Refund
        </button>`);
    }

    return parts.join("");
}

// =============================================================================
// CANCEL CONFIRM DIALOG
// =============================================================================

let cancelTargetId  = null;
let cancelTargetCard = null;

const cancelDialog = (() => {
    const el = document.getElementById("cancelConfirmDialog");
    return el;
})();

function openCancelConfirm(orderId, cardEl) {
    cancelTargetId   = orderId;
    cancelTargetCard = cardEl;
    if (cancelDialog) cancelDialog.showModal();
}

const cancelConfirmBtn = document.getElementById("cancelConfirmBtn");
const cancelAbortBtn   = document.getElementById("cancelAbortBtn");

if (cancelConfirmBtn) {
    cancelConfirmBtn.addEventListener("click", async () => {
        if (!cancelTargetId) return;
        cancelConfirmBtn.disabled = true;
        cancelConfirmBtn.textContent = "Cancelling…";

        try {
            const res  = await fetch(`/api/auth/orders/${cancelTargetId}/cancel`, {
                method: "PATCH", credentials: "include",
            });
            const data = await res.json();

            if (!res.ok) {
                showToast(data.message || "Failed to cancel.", "danger");
                return;
            }

            showToast("Order cancelled.", "success");
            cancelDialog?.close();

            // Re-render just this card's status pill and CTA
            if (cancelTargetCard) {
                const pill = cancelTargetCard.querySelector(".orderStatusPill");
                if (pill) {
                    pill.className = "orderStatusPill status-cancelled";
                    pill.innerHTML = `<i class="fa-solid fa-ban"></i> Cancelled`;
                }
                const cta = cancelTargetCard.querySelector(".orderCTAGroup");
                if (cta) cta.innerHTML = "";  // no more actions on cancelled
            }

        } catch (err) {
            console.error("[cancelOrder]", err);
            showToast("Something went wrong.", "danger");
        } finally {
            cancelConfirmBtn.disabled = false;
            cancelConfirmBtn.textContent = "Yes, Cancel";
        }
    });
}

if (cancelAbortBtn) {
    cancelAbortBtn.addEventListener("click", () => cancelDialog?.close());
}

if (cancelDialog) {
    cancelDialog.addEventListener("click", e => {
        if (e.target === cancelDialog) cancelDialog.close();
    });
}

// =============================================================================
// REVIEW DIALOG
// =============================================================================

let reviewOrder      = null;
let reviewRating     = 0;
let reviewImageFiles = [];  // File objects staged for upload

const reviewDialog     = document.getElementById("reviewDialog");
const reviewCloseBtn   = document.getElementById("reviewDialogClose");
const starPicker       = document.getElementById("starPicker");
const reviewComment    = document.getElementById("reviewComment");
const reviewImgInput   = document.getElementById("reviewImgInput");
const reviewImgPreview = document.getElementById("reviewImgPreviews");
const reviewSubmitBtn  = document.getElementById("reviewSubmitBtn");
const reviewCancelBtn  = document.getElementById("reviewDialogCancel");

function openReviewDialog(order) {
    reviewOrder      = order;
    reviewRating     = 0;
    reviewImageFiles = [];

    if (reviewComment)    reviewComment.value = "";
    if (reviewImgPreview) reviewImgPreview.innerHTML = "";
    if (starPicker)       resetStars(0);

    reviewDialog?.showModal();
}

// ── Star picker ───────────────────────────────────────────────────────────────
if (starPicker) {
    const stars = starPicker.querySelectorAll("i");

    stars.forEach((star, idx) => {
        star.addEventListener("click", () => {
            reviewRating = idx + 1;
            resetStars(reviewRating);
        });
        star.addEventListener("mouseenter", () => highlightStars(idx + 1));
        star.addEventListener("mouseleave", () => resetStars(reviewRating));
    });
}

function highlightStars(n) {
    if (!starPicker) return;
    starPicker.querySelectorAll("i").forEach((s, i) => {
        s.classList.toggle("filled", i < n);
    });
}

function resetStars(n) {
    highlightStars(n);
}

// ── Image upload staging ──────────────────────────────────────────────────────
if (reviewImgInput) {
    reviewImgInput.addEventListener("change", () => {
        const files = Array.from(reviewImgInput.files);
        files.forEach(file => {
            if (reviewImageFiles.length >= 3) {
                showToast("Maximum 3 images.", "danger"); return;
            }
            if (!file.type.startsWith("image/")) {
                showToast("Only image files are allowed.", "danger"); return;
            }
            reviewImageFiles.push(file);
            addImagePreview(file, reviewImageFiles.length - 1);
        });
        reviewImgInput.value = "";  // reset so same file can be re-added after removal
    });
}

function addImagePreview(file, index) {
    if (!reviewImgPreview) return;
    const reader = new FileReader();
    reader.onload = e => {
        const thumb = document.createElement("div");
        thumb.className = "reviewImgPreviewThumb";
        thumb.dataset.index = index;
        thumb.innerHTML = `
            <img src="${e.target.result}" alt="preview">
            <button class="removeThumb" type="button" title="Remove">
                <i class="fa-solid fa-xmark"></i>
            </button>`;
        thumb.querySelector(".removeThumb").addEventListener("click", () => {
            reviewImageFiles.splice(index, 1);
            thumb.remove();
            // Re-index remaining thumbs
            reviewImgPreview.querySelectorAll(".reviewImgPreviewThumb").forEach((t, i) => {
                t.dataset.index = i;
            });
        });
        reviewImgPreview.appendChild(thumb);
    };
    reader.readAsDataURL(file);
}

// ── Upload image via ImageKit proxy ───────────────────────────────────────────
async function uploadReviewImage(file) {
    const authRes  = await fetch("/api/auth/upload", { credentials: "include" });
    const authData = await authRes.json();

    const form = new FormData();
    form.append("file",              file);
    form.append("fileName",          file.name);
    form.append("publicKey",         authData.publicKey);
    form.append("signature",         authData.signature);
    form.append("expire",            authData.expire);
    form.append("token",             authData.token);
    form.append("folder",            "/StreetFlex/reviews");
    form.append("useUniqueFileName", "true");
    const uploadRes  = await fetch("https://upload.imagekit.io/api/v1/files/upload", {
        method: "POST", headers: { Accept: "application/json" }, body: form,
    });
    console.log("review body:", JSON.stringify(uploadRes.body));
    const uploadData = await uploadRes.json();
    if (!uploadRes.ok) throw new Error(uploadData.message || "Upload failed.");
    return uploadData.url;
}

// ── Submit review ─────────────────────────────────────────────────────────────
if (reviewSubmitBtn) {
    reviewSubmitBtn.addEventListener("click", submitReview);
}

async function submitReview() {
    if (!reviewOrder) return;

    if (reviewRating === 0) {
        showToast("Please select a rating.", "danger"); return;
    }
    const comment = reviewComment?.value.trim() || "";
    if (!comment) {
        showToast("Please write a comment.", "danger"); return;
    }
    if (!reviewImageFiles.length) {
        showToast("Please add at least one photo.", "danger"); return;
    }

    reviewSubmitBtn.disabled = true;
    reviewSubmitBtn.textContent = "Uploading…";

    try {
        // Upload images first
        const uploadedUrls = [];
        for (const file of reviewImageFiles) {
            const url = await uploadReviewImage(file);
            uploadedUrls.push(url);
        }

        reviewSubmitBtn.textContent = "Submitting…";

        // Pick one product_id from the order items (first item)
        const product_id = reviewOrder.items?.[0]?.product_id;

        const body = {
            product_id,
            order_id:  reviewOrder._id,
            rating:    reviewRating,
            comment,
            images:    uploadedUrls.map(url => ({ file_url: url, media_type: "image" })),
        };

        const res  = await fetch("/api/auth/reviews", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body:    JSON.stringify(body),
        });
        const data = await res.json();

        if (!res.ok) {
            showToast(data.message || "Failed to submit review.", "danger");
            return;
        }

        showToast("Review submitted!", "success");
        reviewDialog?.close();

        // Hide the review button on the card to prevent re-submission
        const card = ordersList?.querySelector(`[data-order-id="${reviewOrder._id}"]`);
        card?.querySelector(".orderReviewBtn")?.remove();

    } catch (err) {
        console.error("[submitReview]", err);
        showToast("Something went wrong.", "danger");
    } finally {
        reviewSubmitBtn.disabled = false;
        reviewSubmitBtn.textContent = "Submit Review";
    }
}

if (reviewCloseBtn) reviewCloseBtn.addEventListener("click", () => reviewDialog?.close());
if (reviewCancelBtn) reviewCancelBtn.addEventListener("click", () => reviewDialog?.close());
if (reviewDialog) {
    reviewDialog.addEventListener("click", e => {
        if (e.target === reviewDialog) reviewDialog.close();
    });
}

// =============================================================================
// SHOW MORE + META
// =============================================================================

if (ordersShowMore) {
    ordersShowMore.addEventListener("click", () => loadOrders(false));
}

function updateOrdersMeta() {
    if (ordersMeta) {
        ordersMeta.textContent = orderTotal === 0 ? "No orders"
            : orderTotal === 1 ? "1 order"
            : `${orderTotal} orders`;
    }
}

// =============================================================================
// RENDER HELPERS
// =============================================================================

function renderOrderSkeletons(n = 3) {
    ordersList.innerHTML = "";
    for (let i = 0; i < n; i++) {
        const s = document.createElement("div");
        s.className = "orderSkeleton";
        ordersList.appendChild(s);
    }
}

function renderOrdersEmpty() {
    ordersList.innerHTML = "";
    const el = document.createElement("div");
    el.className = "ordersEmpty";
    el.innerHTML = `
        <i class="fa-solid fa-box-open"></i>
        <p>No orders found.</p>
        <a class="btn" href="./galery.html">Start Shopping</a>`;
    ordersList.appendChild(el);
}

// =============================================================================
// BOOT — same defineProperty timing pattern
// =============================================================================

async function bootOrders() {
    buildFilterBar();

    if (!state.user || state.user.role === "guest") {
        if (ordersList) {
            ordersList.innerHTML = "";
            const el = document.createElement("div");
            el.className = "ordersEmpty";
            el.innerHTML = `
                <i class="fa-solid fa-box-open"></i>
                <p>Sign in to view your orders.</p>
                <a class="btn" href="./signin.html">Sign In</a>`;
            ordersList.appendChild(el);
        }
        return;
    }

    await loadOrders(true);
}

window.addEventListener("load", () => {
    if (window.__sfBootDone instanceof Promise) {
        window.__sfBootDone.then(bootOrders);
        return;
    }

    let _booted = false;
    const _runOnce = () => { if (!_booted) { _booted = true; bootOrders(); } };

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
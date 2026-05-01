// =============================================================================
// wishlist.js  —  StreetFlex Wishlist Page
// Depends on: main.js (state, formatPrice, showToast, safeParseProduct, etc.)
// =============================================================================

// ── DOM refs ──────────────────────────────────────────────────────────────────
const wishlistContainer = document.querySelector(".wishlistContainer");
const showMoreBtn       = document.getElementById("showMore");
const wishlistCountEl   = document.querySelector(".wishlistCount");

// ── Pagination state ──────────────────────────────────────────────────────────
let wishPage     = 1;
const WISH_LIMIT = 12;
let   wishTotal  = 0;

// =============================================================================
// WISH-ACTION DIALOG
// A separate dialog for the wishlist page that offers "Add to Cart" AND
// "Order / Preorder" — both as first-class buttons.
// Shares the same visual shell as #productActionCard from main.css.
// =============================================================================

// Build the dialog once and append to <main>
function buildWishActionDialog() {
    const existing = document.getElementById("wishActionDialog");
    if (existing) return existing;

    const dialog = document.createElement("dialog");
    dialog.id = "wishActionDialog";
    // Inherit the productActionCard styling via the same class
    dialog.className = "";

    dialog.innerHTML = `
        <div class="dialogContainer">
            <div class="swiper wishCtaImages">
                <div class="swiper-wrapper">
                    <div class="swiper-slide">
                        <div class="image-container variantProductImage">
                            <img src="" alt="">
                        </div>
                    </div>
                </div>
                <div class="swiper-pagination"></div>
            </div>
            <div class="productNameAndPrice">
                <p class="wishCtaName">Product Name</p>
                <h6 class="wishCtaPrice">₱0.00</h6>
            </div>
            <div class="colorContainer">
                <span>Color</span>
                <div class="wishColorWrapper productColorWrapper"></div>
            </div>
            <div class="sizeContainer">
                <span>Size</span>
                <div class="wishSizeWrapper productSizeWrapper"></div>
            </div>
            <div class="quantityContainer">
                <span>Qty</span>
                <div class="productQuantityWrapper">
                    <span class="wishMinusBtn"><i class="fa-solid fa-minus"></i></span>
                    <span class="wishQty">1</span>
                    <span class="wishPlusBtn"><i class="fa-solid fa-plus"></i></span>
                </div>
            </div>
            <div class="ctaActionContainer">
                <div id="wishDialogBack" class="btn back">Back</div>
                <div class="btn wish-cart wishCartBtn">Add to Cart</div>
                <div class="btn wish-order wishOrderBtn">Order</div>
            </div>
        </div>`;

    const mainEl = document.querySelector(".mainContent");
    if (mainEl) mainEl.appendChild(dialog);
    else document.body.appendChild(dialog);

    return dialog;
}

// ── Dialog state ──────────────────────────────────────────────────────────────
const wishDialog = {
    el:        null,
    product:   null,
    variantId: null,
    swiper:    null,
};

function initWishDialog() {
    wishDialog.el = buildWishActionDialog();

    // Close on backdrop click
    wishDialog.el.addEventListener("click", e => {
        if (e.target === wishDialog.el) wishDialog.el.close();
    });

    // Back button
    wishDialog.el.querySelector("#wishDialogBack")
        .addEventListener("click", () => wishDialog.el.close());

    // Qty controls
    wishDialog.el.querySelector(".wishPlusBtn").addEventListener("click", () => {
        const variant  = getWishSelectedVariant();
        if (!variant) return;
        const maxStock = wishDialog.product?.is_preorder
            ? (variant.preorder?.max_slots || 0) - (variant.preorder?.claimed_slots || 0)
            : variant.stock;
        const cur = getWishQty();
        if (cur < maxStock) setWishQty(cur + 1);
    });

    wishDialog.el.querySelector(".wishMinusBtn").addEventListener("click", () => {
        const cur = getWishQty();
        if (cur > 1) setWishQty(cur - 1);
    });

    // Cart button — swap dialogEl so handleAddToCart's dialogEl.close() hits our dialog
    wishDialog.el.querySelector(".wishCartBtn").addEventListener("click", async () => {
        const { product, variantId } = wishDialog;
        if (!variantId) { showToast("Please select a size and color.", "danger"); return; }
        setWishBtnsLoading(true);
        const _orig = dialogEl;
        dialogEl = wishDialog.el;
        try {
            await handleAddToCart(product._id, variantId, getWishQty());
        } finally {
            dialogEl = _orig;
            setWishBtnsLoading(false);
        }
    });

    // Order / Preorder button — same dialogEl swap
    wishDialog.el.querySelector(".wishOrderBtn").addEventListener("click", async () => {
        const { product, variantId } = wishDialog;
        if (!variantId) { showToast("Please select a size and color.", "danger"); return; }
        setWishBtnsLoading(true);
        const _orig = dialogEl;
        dialogEl = wishDialog.el;
        try {
            await (product, variantId, getWishQty(), product.is_preorder);
        } finally {
            dialogEl = _orig;
            setWishBtnsLoading(false);
        }
    });

    // Init swiper for wish dialog images
    if (document.querySelector(".wishCtaImages")) {
        wishDialog.swiper = new Swiper(".wishCtaImages", {
            direction: "horizontal",
            loop: true,
            autoplay: { delay: 4000, disableOnInteraction: false },
            pagination: { el: ".swiper-pagination", clickable: true },
            slidesPerView: 1, spaceBetween: 0,
            on: { init(s) { applyInputMode(s); } },
        });
    }
}

function openWishDialog(product) {
    const d = wishDialog.el;
    wishDialog.product   = product;
    wishDialog.variantId = null;

    // Populate images
    const imgWrapper = d.querySelector(".wishCtaImages .swiper-wrapper");
    imgWrapper.innerHTML = "";
    const images = product.images?.length ? product.images : [{ url: "", alt_text: "No image" }];
    images.forEach(img => {
        const slide = document.createElement("div");
        slide.className = "swiper-slide";
        slide.innerHTML = `<div class="image-container variantProductImage">
            <img class="img" src="${img.url || ""}" alt="${img.alt_text || ""}">
        </div>`;
        imgWrapper.appendChild(slide);
    });
    if (wishDialog.swiper) wishDialog.swiper.update();

    // Name + base price
    d.querySelector(".wishCtaName").textContent  = product.name;
    d.querySelector(".wishCtaPrice").textContent = formatPrice(product.base_price);

    // Colors + sizes
    populateWishColors(product.variants);
    populateWishSizes(product.variants);

    // Auto-select first active variant
    const firstVariant = product.variants[0];
    if (firstVariant) selectWishVariant(firstVariant._id, product.variants);

    // Reset qty
    setWishQty(1);

    // Order button label
    updateWishOrderBtn();

    d.showModal();
}

function populateWishColors(variants) {
    const wrapper = wishDialog.el.querySelector(".wishColorWrapper");
    wrapper.innerHTML = "";
    variants.forEach(v => {
        const dot = document.createElement("div");
        dot.className         = "color";
        dot.title             = v.color;
        dot.dataset.variantId = v._id;
        dot.style.backgroundColor = cssColorFromString(v.color);
        dot.addEventListener("click", () => selectWishVariant(v._id, variants));
        wrapper.appendChild(dot);
    });
}

function populateWishSizes(variants) {
    const wrapper = wishDialog.el.querySelector(".wishSizeWrapper");
    wrapper.innerHTML = "";
    variants.forEach(v => {
        const span = document.createElement("span");
        span.textContent       = v.size;
        span.dataset.variantId = v._id;
        span.addEventListener("click", () => selectWishVariant(v._id, variants));
        wrapper.appendChild(span);
    });
}

function selectWishVariant(variantId, variants) {
    wishDialog.variantId = variantId;
    const d       = wishDialog.el;
    const variant = variants.find(v => String(v._id) === String(variantId));
    if (!variant) return;

    // Highlight selected color/size
    d.querySelectorAll(".wishColorWrapper .color").forEach(dot =>
        dot.classList.toggle("selected", dot.dataset.variantId === String(variantId)));
    d.querySelectorAll(".wishSizeWrapper span").forEach(span =>
        span.classList.toggle("selected", span.dataset.variantId === String(variantId)));

    // Update price
    const price = wishDialog.product.base_price + (variant.price_modifier || 0);
    d.querySelector(".wishCtaPrice").textContent = formatPrice(price);

    // Cap qty
    const product  = wishDialog.product;
    const maxStock = product.is_preorder
        ? (variant.preorder?.max_slots || 0) - (variant.preorder?.claimed_slots || 0)
        : variant.stock;
    if (getWishQty() > maxStock) setWishQty(Math.max(1, maxStock));

    updateWishOrderBtn();
}

function updateWishOrderBtn() {
    const btn      = wishDialog.el.querySelector(".wishOrderBtn");
    const product  = wishDialog.product;
    if (!product) return;

    const variant = getWishSelectedVariant();
    const isPreorder = product.is_preorder;
    const available  = variant
        ? (isPreorder
            ? (variant.preorder?.max_slots || 0) - (variant.preorder?.claimed_slots || 0)
            : variant.stock)
        : 0;

    // Remove all state classes
    btn.classList.remove("wish-order", "wish-preorder", "out-of-stock");

    if (available <= 0) {
        btn.classList.add("out-of-stock");
        btn.textContent = "Out of Stock";
    } else if (isPreorder) {
        btn.classList.add("wish-preorder");
        btn.textContent = "Reserve";
    } else {
        btn.classList.add("wish-order");
        btn.textContent = "Order";
    }

    // Cart btn — always available unless overall no stock at all
    const cartBtn = wishDialog.el.querySelector(".wishCartBtn");
    cartBtn.classList.remove("out-of-stock");
    if (available <= 0) {
        cartBtn.classList.add("out-of-stock");
    }
}

function getWishQty() {
    return parseInt(wishDialog.el.querySelector(".wishQty").textContent) || 1;
}

function setWishQty(n) {
    wishDialog.el.querySelector(".wishQty").textContent = n;
}

function getWishSelectedVariant() {
    const { product, variantId } = wishDialog;
    if (!product || !variantId) return null;
    return product.variants.find(v => String(v._id) === String(variantId)) || null;
}

function setWishBtnsLoading(loading) {
    const btns = wishDialog.el.querySelectorAll(".wishCartBtn, .wishOrderBtn");
    btns.forEach(b => {
        if (loading) {
            b.dataset.origText = b.textContent;
            b.textContent = "Please wait…";
            b.classList.add("out-of-stock");
        } else {
            if (b.dataset.origText) b.textContent = b.dataset.origText;
            b.classList.remove("out-of-stock");
        }
    });
    if (!loading) updateWishOrderBtn();
}

// =============================================================================
// LOAD + RENDER WISHLIST
// =============================================================================

async function loadWishlist(reset = false) {
    if (!wishlistContainer) return;

    if (reset) {
        wishPage = 1;
        wishlistContainer.innerHTML = "";
    }

    // Show skeleton on first load
    if (wishPage === 1) renderWishSkeletons();

    try {
        const res  = await fetch(`/api/auth/wishlist?page=${wishPage}&limit=${WISH_LIMIT}`);
        const data = await res.json();

        // Clear skeletons on first page
        if (wishPage === 1) wishlistContainer.innerHTML = "";

        wishTotal = data.total || 0;
        updateWishlistCount(wishTotal);

        if (!data.items?.length && wishPage === 1) {
            renderWishlistEmpty();
            if (showMoreBtn) showMoreBtn.classList.add("hidden");
            return;
        }

        data.items.forEach(item => {
            const card = buildWishCard(item);
            wishlistContainer.appendChild(card);
        });

        // Show/hide "Show More"
        if (showMoreBtn) {
            if (data.has_more) showMoreBtn.classList.remove("hidden");
            else               showMoreBtn.classList.add("hidden");
        }

        wishPage++;

    } catch (err) {
        console.error("[loadWishlist]", err);
        if (wishPage === 1) wishlistContainer.innerHTML = "";
    }
}

function renderWishSkeletons(count = WISH_LIMIT) {
    wishlistContainer.innerHTML = "";
    for (let i = 0; i < count; i++) {
        const skel = document.createElement("div");
        skel.className = "wishSkeleton";
        wishlistContainer.appendChild(skel);
    }
}

function renderWishlistEmpty() {
    const empty = document.createElement("div");
    empty.className = "wishlistEmpty";
    empty.innerHTML = `
        <i class="fa-regular fa-heart"></i>
        <p>Your wishlist is empty.<br>Start saving products you love!</p>
        <a class="btn" href="./galery.html">Browse Products</a>`;
    wishlistContainer.appendChild(empty);
}

function updateWishlistCount(total) {
    if (wishlistCountEl) {
        wishlistCountEl.textContent = total === 0 ? "No saved items"
            : total === 1 ? "1 saved item"
            : `${total} saved items`;
    }
}

function buildWishCard(item) {
    const { product, wishlist_item_id } = item;

    const primaryImage = product.images?.find(i => i.is_primary)?.url
                      || product.images?.[0]?.url || "";
    const price        = formatPrice(product.base_price);
    const productJson  = htmlEncode(JSON.stringify(product));

    const card = document.createElement("div");
    card.className = "cardContainer wishlistCard";
    card.dataset.productId      = product._id;
    card.dataset.wishlistItemId = wishlist_item_id;

    card.innerHTML = `
        ${product.is_preorder ? '<span class="wishPreorderBadge">Preorder</span>' : ""}
        <button class="wishRemoveBtn" title="Remove from wishlist" aria-label="Remove">
            <i class="fa-solid fa-xmark"></i>
        </button>
        <div class="image-container wishCardHead">
            <img class="productImg img" src="${primaryImage}" alt="${product.name}" loading="lazy">
        </div>
        <div class="wishCardBody">
            <p class="productName" title="${product.name}">${product.name}</p>
            <p class="productPrice">${price}</p>
        </div>`;

    // Remove button
    card.querySelector(".wishRemoveBtn").addEventListener("click", e => {
        e.stopPropagation();
        removeWishItem(product._id, card);
    });

    // Open wish-action dialog on card click
    card.addEventListener("click", () => {
        if (!product.variants?.length) {
            showToast("No variants available for this product.", "danger");
            return;
        }
        openWishDialog(product);
    });

    return card;
}

// =============================================================================
// REMOVE ITEM
// =============================================================================

async function removeWishItem(productId, cardEl) {
    try {
        const res  = await fetch(`/api/auth/wishlist/${productId}`, { method: "DELETE" });
        const data = await res.json();

        if (!res.ok) { showToast(data.message || "Failed to remove.", "danger"); return; }

        // Animate out
        cardEl.style.transition = "opacity 0.2s ease, transform 0.2s ease";
        cardEl.style.opacity    = "0";
        cardEl.style.transform  = "scale(0.9)";

        setTimeout(() => {
            cardEl.remove();
            wishTotal = Math.max(0, wishTotal - 1);
            updateWishlistCount(wishTotal);

            // Update heart in main.js state + any swiper cards on this page
            state.wishlistedIds.delete(String(productId));
            document.querySelectorAll(`.addToWishlist[data-action="wishlist"]`).forEach(el => {
                try {
                    const p = safeParseProduct(el);
                    if (p && String(p._id) === String(productId)) {
                        el.classList.replace("fa-solid", "fa-regular");
                    }
                } catch { /* skip */ }
            });

            if (wishTotal === 0) renderWishlistEmpty();
        }, 200);

        showToast("Removed from wishlist.", "success");

    } catch (err) {
        console.error("[removeWishItem]", err);
        showToast("Something went wrong.", "danger");
    }
}

// =============================================================================
// SHOW MORE
// =============================================================================

if (showMoreBtn) {
    showMoreBtn.addEventListener("click", () => loadWishlist(false));
}

// =============================================================================
// INJECT META ROW BELOW HEADING  (if not in HTML already)
// =============================================================================

function ensureWishlistMeta() {
    const section = document.querySelector(".wishlistSection");
    if (!section || section.querySelector(".wishlistMeta")) return;

    const meta = document.createElement("div");
    meta.className = "wishlistMeta";
    meta.innerHTML = `<p class="wishlistCount"></p>`;

    const h2 = section.querySelector("h2");
    if (h2) h2.insertAdjacentElement("afterend", meta);
}

// =============================================================================
// BOOT
// Called after main.js boot() resolves via DOMContentLoaded timing.
// main.js calls boot() as an IIFE so by the time this module runs,
// loadSession() has already been awaited.  We just wait for the next tick.
// =============================================================================

async function bootWishlist() {
    ensureWishlistMeta();
    initWishDialog();

    // If guest → show empty + redirect hint
    if (!state.user || state.user.role === "guest") {
        if (wishlistContainer) {
            wishlistContainer.innerHTML = "";
            const empty = document.createElement("div");
            empty.className = "wishlistEmpty";
            empty.innerHTML = `
                <i class="fa-regular fa-heart"></i>
                <p>Sign in to view your saved items.</p>
                <a class="btn" href="./signin.html">Sign In</a>`;
            wishlistContainer.appendChild(empty);
        }
        updateWishlistCount(0);
        if (showMoreBtn) showMoreBtn.classList.add("hidden");
        return;
    }

    await loadWishlist(true);
}

// =============================================================================
// BOOT TIMING
// =============================================================================
// Problem: main.js sets state.user = null initially, then overwrites it after
// loadSession() resolves. Since null !== undefined is TRUE immediately,
// polling `state.user !== undefined` fires before the session loads — causing
// logged-in users to see the guest "Sign In" prompt.
//
// Fix: poll for state.user to change FROM null (its sentinel value), meaning
// loadSession() has completed and either set a real user object or kept null
// intentionally for a genuine guest with no session at all.
//
// We detect "session resolved" by watching for main.js to set window.__sfReady,
// which we inject as a one-liner shim below. If main.js is never updated,
// we fall back to a 2-second max-wait poll that checks for non-null.

window.addEventListener("load", () => {

    // Shim: if main.js exposes window.__sfBootDone (a Promise), await it.
    // Otherwise fall back to polling with a smarter sentinel check.
    if (window.__sfBootDone instanceof Promise) {
        window.__sfBootDone.then(bootWishlist);
        return;
    }

    // Wait until main.js loadSession() has run.
    // main.js sets state.user = null initially, then overwrites it after
    // the await resolves (to a real user object or keeps null for no-session).
    //
    // We intercept the NEXT write to state.user using defineProperty so we
    // boot at exactly the right moment — no polling, no arbitrary timeouts.

    let _booted = false;
    const _runOnce = () => { if (!_booted) { _booted = true; bootWishlist(); } };

    // If user is already set (main.js ran synchronously before this listener),
    // boot immediately.
    if (state.user !== null) {
        _runOnce();
    } else {
        // Hook: intercept the next assignment to state.user
        Object.defineProperty(state, 'user', {
            configurable: true,
            get() { return null; },
            set(v) {
                // Restore as a normal writable property with the new value
                Object.defineProperty(state, 'user', {
                    configurable: true, writable: true, enumerable: true, value: v
                });
                _runOnce();
            }
        });
        // Safety net: 3s max wait in case the hook never fires
        setTimeout(_runOnce, 3000);
    }
});
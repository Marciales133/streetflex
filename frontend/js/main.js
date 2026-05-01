
// =============================================================================
// CONSTANTS
// =============================================================================

let DEFAULT_AVATAR;
if(document.getElementById("isHomePage")){DEFAULT_AVATAR = "/assets/default_user_icon/defaultUserIcon.png";}
else{DEFAULT_AVATAR = "../assets/default_user_icon/defaultUserIcon.png";}
const DEFAULT_NAME   = "Guest";
const DEFAULT_EMAIL  = "LOGIN";

// =============================================================================
// STATE
// =============================================================================

const state = {
    user:          null,
    wishlistedIds: new Set(),
    dialog: {
        mode:      null,   // "cart" | "order" | "preorder"
        product:   null,
        variantId: null,
    },
};

// =============================================================================
// NAV BURGER
// =============================================================================

const menu       = document.getElementById("menu");
const menuOption = document.querySelector("nav");

if (menu && menuOption) {
    menu.addEventListener("click", () => {
        menuOption.classList.toggle("active");
        menu.classList.toggle("active");
    });

    document.addEventListener("click", e => {
        if (!menu.contains(e.target) && !menuOption.contains(e.target)) {
            menuOption.classList.remove("active");
            menu.classList.remove("active");
        }
    });
}

// =============================================================================
// SEARCH / SUGGESTIONS
// =============================================================================

const searchInput     = document.getElementById("search");
const suggestionsBox  = document.getElementById("suggestions");
const searchContainer = document.querySelector(".search-box");

// ── Debounced live search ─────────────────────────────────────────────────────
// Fetches from /api/auth/products/search and renders suggestion cards.
// Each suggestion links to /pages/item.html?slug=SLUG (or ./item.html?slug=
// when already inside /pages/).

let _searchTimer = null;

function buildItemUrl(slug) {
    const onRoot = !window.location.pathname.includes("/pages/");
    return onRoot
        ? `./pages/productDetail.html?slug=${slug}`
        : `./productDetail.html?slug=${slug}`;
}

async function fetchSuggestions(q) {
    try {
        const res  = await fetch(`/api/auth/products/search?q=${encodeURIComponent(q)}&limit=8`);
        const data = await res.json();
        return data.suggestions || [];
    } catch { return []; }
}

function renderSuggestions(suggestions) {
    suggestionsBox.innerHTML = "";

    if (!suggestions.length) {
        suggestionsBox.classList.remove("show");
        return;
    }

    suggestions.forEach(item => {
        const li = document.createElement("li");
        li.className = "suggestion-item";

        // Image thumbnail
        const img = document.createElement("img");
        img.src    = item.image_url || "";
        img.alt    = item.name;
        img.className = "suggestion-thumb";
        img.onerror   = () => { img.style.display = "none"; };

        // Text block
        const info = document.createElement("div");
        info.className = "suggestion-info";
        info.innerHTML = `
            <span class="suggestion-name">${item.name}</span>
            <span class="suggestion-price">${formatPrice(item.base_price)}</span>
        `;

        li.appendChild(img);
        li.appendChild(info);

        // Click → navigate to item page
        li.addEventListener("click", () => {
            suggestionsBox.classList.remove("show");
            window.location.href = buildItemUrl(item.slug);
        });

        // Also make the whole row keyboard-accessible
        li.setAttribute("tabindex", "0");
        li.addEventListener("keydown", e => {
            if (e.key === "Enter") window.location.href = buildItemUrl(item.slug);
        });

        suggestionsBox.appendChild(li);
    });

    suggestionsBox.classList.add("show");
}

if (searchInput && suggestionsBox && searchContainer) {
    searchInput.addEventListener("input", () => {
        const value = searchInput.value.trim();
        suggestionsBox.innerHTML = "";

        if (!value) { suggestionsBox.classList.remove("show"); clearTimeout(_searchTimer); return; }

        // Debounce — wait 250ms after user stops typing before hitting API
        clearTimeout(_searchTimer);
        _searchTimer = setTimeout(async () => {
            const suggestions = await fetchSuggestions(value);
            renderSuggestions(suggestions);
        }, 250);
    });

    // Re-show last results when re-focusing
    searchInput.addEventListener("focus", () => {
        if (suggestionsBox.children.length > 0) suggestionsBox.classList.add("show");
    });

    // Navigate to full search/gallery on Enter
    searchInput.addEventListener("keydown", e => {
        if (e.key === "Enter" && searchInput.value.trim()) {
            suggestionsBox.classList.remove("show");
            const onRoot = !window.location.pathname.includes("/pages/");
            window.location.href = onRoot
                ? `./pages/galery.html?q=${encodeURIComponent(searchInput.value.trim())}`
                : `./galery.html?q=${encodeURIComponent(searchInput.value.trim())}`;
        }
    });

    document.addEventListener("click", e => {
        if (!searchContainer.contains(e.target)) suggestionsBox.classList.remove("show");
    });
    document.addEventListener("keydown", e => {
        if (e.key === "Escape") suggestionsBox.classList.remove("show");
    });
}

// =============================================================================
// SIGN OUT
// FIX: redirect to "/" so it works from both root and /pages/
// =============================================================================

const signOutBtn = document.getElementById("signOutUser");
if (signOutBtn) {
    signOutBtn.addEventListener("click", async e => {
        e.preventDefault();
        try { await fetch("/api/auth/logout", { method: "POST" }); } catch (_) {}
        window.location.href = "/";
    });
}

// =============================================================================
// POLICY DIALOG
// =============================================================================

const refundPolicy   = document.getElementById("refundPolicy");
const privacyPolicy  = document.getElementById("privacyPolicy");
const termsOfService = document.getElementById("termsOfService");
const shippingPolicy = document.getElementById("shippingPolicy");
const policyDialog   = document.getElementById("policyDialog");

const policy = {
    "Refund Policies":   `Refund Policy To be eligible for a refund or return, customers are required to record a clear video during the unboxing of the item. This video must show the package before opening and the condition of the product upon arrival. Refunds or replacements will only be considered if valid proof is provided.This helps ensure fairness, since refund policies usually define conditions and proof requirements before granting returns . `,
    "Privacy Policies":  `We respect your privacy. Any personal information collected (such as name, contact details, and address) will only be used for order processing and customer service. We do not share, sell, or misuse your data. Your information is kept secure and handled responsibly, in line with standard privacy practices used by online stores . `,
    "Terms Of Service":  `Terms of Service By using our website and placing an order, you agree to follow our terms and conditions. This includes providing accurate information, respecting our policies, and understanding that all purchases are subject to our rules. These terms define the agreement between the customer and the business and may be updated at any time without prior notice . `,
    "Shipping Policies": `Shipping Policy Orders are processed within 1-2 days (weekdays only). Shipping schedules may vary depending on location and courier availability. Please note that delays may occur during weekends, holidays, or high-demand periods. `,
};

if (policyDialog) {
    if (refundPolicy)   refundPolicy.addEventListener("click",   () => openPolicy("Refund Policies"));
    if (privacyPolicy)  privacyPolicy.addEventListener("click",  () => openPolicy("Privacy Policies"));
    if (termsOfService) termsOfService.addEventListener("click", () => openPolicy("Terms Of Service"));
    if (shippingPolicy) shippingPolicy.addEventListener("click", () => openPolicy("Shipping Policies"));
}

function openPolicy(title) {
    policyDialog.innerHTML = `
        <div class="dialogContainer">
            <div class="dialogHeader">
                <h4>${title}</h4>
                <i onclick="document.getElementById('policyDialog').close()"
                   class="fa-solid fa-x" style="cursor:pointer"></i>
            </div>
            <div class="dialogContent">
                <p>${policy[title] || ""}</p>
            </div>
        </div>`;
    policyDialog.showModal();
}

// =============================================================================
// FOOTER STATICS
// =============================================================================

const firstSignDiscount = document.getElementById("firstSignDiscount");
const aboutUsLink       = document.getElementById("aboutUsLink");
const linkFb            = document.getElementById("fb");
const linkIg            = document.getElementById("ig");
const linkX             = document.getElementById("x");

if (firstSignDiscount) firstSignDiscount.textContent = "20";
if (aboutUsLink) aboutUsLink.href = "https://www.facebook.com/share/1BaUNzAmqL/";
if (linkFb)      linkFb.href      = "https://www.facebook.com/share/1BaUNzAmqL/";
if (linkIg)      linkIg.href      = "https://www.facebook.com/share/1BaUNzAmqL/";
if (linkX)       linkX.href       = "https://www.facebook.com/share/1BaUNzAmqL/";

// =============================================================================
// SWIPER TOUCH HELPER  (global — called by any script that inits a Swiper)
// =============================================================================

function applyInputMode(swiper) {
    if (!swiper) return;
    swiper.params.simulateTouch = true;
    swiper.params.grabCursor    = true;
    if (swiper.mousewheel) swiper.mousewheel.disable();
    swiper.update();
}

// =============================================================================
// SWIPER INSTANCES
// FIX: initialised here as real Swiper objects, guarded so pages that don't
//      have the element don't crash. Variables are global so page scripts
//      (e.g. home.js) can call .update() on them after injecting slides.
// =============================================================================

const PRODUCT_SWIPER_CFG = {
    direction:  "horizontal",
    loop:       true,
    autoplay:   { delay: 13000, disableOnInteraction: false },
    pagination: { el: ".swiper-pagination", clickable: true },
    navigation: false, scrollbar: false,
    slidesPerView: 2, spaceBetween: 16,
    breakpoints: {
        460:  { slidesPerView: 3  },
        600:  { slidesPerView: 4  },
        740:  { slidesPerView: 5  },
        880:  { slidesPerView: 6  },
        1020: { slidesPerView: 7  },
        1160: { slidesPerView: 8  },
        1280: { slidesPerView: 7  },
        1320: { slidesPerView: 8  },
        1520: { slidesPerView: 9  },
        1720: { slidesPerView: 10 },
        1920: { slidesPerView: 11 },
        2120: { slidesPerView: 12 },
    },
    on: { init(s) { applyInputMode(s); } },
};

const REVIEW_SWIPER_CFG = {
    direction:  "horizontal",
    loop:       true,
    autoplay:   { delay: 7000, disableOnInteraction: false },
    pagination: { el: ".swiper-pagination", clickable: true },
    navigation: false, scrollbar: false,
    slidesPerView: 1, spaceBetween: 16,
    breakpoints: {
        640:  { slidesPerView: 2 },
        1024: { slidesPerView: 3 },
        1366: { slidesPerView: 4 },
        1680: { slidesPerView: 5 },
        2000: { slidesPerView: 6 },
    },
    on: { init(s) { applyInputMode(s); } },
};

// FIX: use `var` so page scripts can reassign if needed;
//      guarded init so missing elements don't crash.
var productSwiper  = document.querySelector(".productSwiper")
                   ? new Swiper(".productSwiper",  PRODUCT_SWIPER_CFG) : null;
var popularSwiper  = document.querySelector(".popularProducts")
                   ? new Swiper(".popularProducts", PRODUCT_SWIPER_CFG) : null;
var reviewSwiper   = document.querySelector(".reviewSwiper")
                   ? new Swiper(".reviewSwiper",   REVIEW_SWIPER_CFG)  : null;
var ctaImages      = document.querySelector(".ctaImages")
                   ? new Swiper(".ctaImages", {
                         direction: "horizontal", loop: true,
                         autoplay:  { delay: 4000, disableOnInteraction: false },
                         pagination: { el: ".swiper-pagination", clickable: true },
                         navigation: false, scrollbar: false,
                         slidesPerView: 1, spaceBetween: 16,
                         on: { init(s) { applyInputMode(s); } },
                     }) : null;

window.addEventListener("resize", () => {
    if (productSwiper) applyInputMode(productSwiper);
    if (popularSwiper) applyInputMode(popularSwiper);
    if (reviewSwiper)  applyInputMode(reviewSwiper);
    if (ctaImages)     applyInputMode(ctaImages);
});

// =============================================================================
// SESSION / HEADER
// =============================================================================

const headerName   = document.getElementById("UserName");
const headerEmail  = document.getElementById("UserEmail");
const headerAvatar = document.getElementById("UserAvatar");

async function loadSession() {
    try {
        const res  = await fetch("/api/auth/session");
        const data = await res.json();
        state.user = data.user;
    } catch (err) {
        console.error("[loadSession]", err);
    }
    applyHeaderDefaults();
}

function applyHeaderDefaults() {
    const user   = state.user;
    const isReal = user && user.role !== "guest";

    const name   = isReal && user.profile?.display_name?.trim() ? user.profile.display_name : DEFAULT_NAME;
    const email  = isReal && user.email                          ? user.email                : DEFAULT_EMAIL;
    const avatar = isReal && user.profile?.avatar_url            ? user.profile.avatar_url   : DEFAULT_AVATAR;

    if (headerName)   headerName.textContent  = name;
    if (headerEmail)  headerEmail.textContent = email;
    if (headerAvatar) {
        headerAvatar.src     = avatar;
        headerAvatar.alt     = name;
        headerAvatar.onerror = () => { headerAvatar.src = DEFAULT_AVATAR; headerAvatar.onerror = null; };
    }
}

// =============================================================================
// PRODUCT RENDERING  (New Arrivals + Popular — limit 15 each)
// =============================================================================

async function loadNewArrivals() {
    const wrapper = document.querySelector(".newArival .swiper-wrapper");
    if (!wrapper) return;
    try {
        const res  = await fetch("/api/auth/products/new-arrivals?limit=15");
        const data = await res.json();
        if (!data.products?.length) return;
        renderProductSlides(wrapper, data.products);
        if (productSwiper) productSwiper.update();
    } catch (err) { console.error("[loadNewArrivals]", err); }
}

async function loadPopularProducts() {
    const wrapper = document.querySelector(".popularProducts .swiper-wrapper");
    if (!wrapper) return;
    try {
        const res  = await fetch("/api/auth/products/popular?limit=15");
        const data = await res.json();
        if (!data.products?.length) return;
        renderProductSlides(wrapper, data.products);
        if (popularSwiper) popularSwiper.update();
    } catch (err) { console.error("[loadPopularProducts]", err); }
}

function renderProductSlides(wrapper, products) {
    wrapper.innerHTML = "";
    products.forEach(product => {
        const primaryImage = product.images?.find(i => i.is_primary)?.url
                          || product.images?.[0]?.url || "";
        const price       = formatPrice(product.base_price);
        const isPreorder  = product.is_preorder;
        const productJson = htmlEncode(JSON.stringify(product));
        const actionType  = isPreorder ? "preorder" : "order";
        const actionLabel = isPreorder ? "Reserve"  : "Order";
        const hearted     = state.wishlistedIds.has(String(product._id));
        const heartClass  = hearted ? "fa-solid fa-heart" : "fa-regular fa-heart";

        const slide = document.createElement("div");
        slide.className = "swiper-slide";
        const itemUrl = buildItemUrl(product.slug);
        slide.innerHTML = `
            <div class="cardContent productCard" data-product-id="${product._id}">
                <a href="${itemUrl}" class="productCardImgLink">
                    <div class="image-container productImage">
                        <img class="img" src="${primaryImage}" alt="${product.name}" loading="lazy">
                    </div>
                </a>
                <div class="productBody">
                    <div class="nameAndPrice">
                        <a href="${itemUrl}" class="productCardNameLink">
                            <p class="productName">${product.name}</p>
                        </a>
                        <b><p class="ProductPrice">${price}</p></b>
                    </div>
                    <div class="productBtnContainer">
                        <i class="${heartClass} addToWishlist"
                        data-action="wishlist"
                        data-product='${productJson}'
                        title="Wishlist"></i>
                        <i class="fa-solid fa-cart-shopping addToCart"
                        data-action="cart"
                        data-product='${productJson}'
                        title="Add to Cart"></i>
                        <div class="btn checkout"
                            data-action="${actionType}"
                            data-product='${productJson}'>
                            <i class="fa-solid fa-bag-shopping"></i>
                            ${actionLabel}
                        </div>
                    </div>
                </div>
            </div>`;
        wrapper.appendChild(slide);
    });
}

// =============================================================================
// REVIEW RENDERING  (limit 8)
// =============================================================================

async function loadCuratedReviews() {
    const wrapper = document.querySelector(".reviewsContainer .swiper-wrapper");
    if (!wrapper) return;
    try {
        const res  = await fetch("/api/auth/reviews/curated?limit=8");
        const data = await res.json();
        if (!data.reviews?.length) return;
        renderReviewSlides(wrapper, data.reviews);
        if (reviewSwiper) reviewSwiper.update();
    } catch (err) { console.error("[loadCuratedReviews]", err); }
}
function renderReviewSlides(wrapper, reviews, userVotes = {}) {
    wrapper.innerHTML = "";
    reviews.forEach(review => {
        const userName    = review.user_id?.profile?.display_name || DEFAULT_NAME;
        const avatarUrl   = review.user_id?.profile?.avatar_url   || DEFAULT_AVATAR;
        const productName = review.product_id?.name               || "";
        const productImg  = review.product_id?.image?.url         || "";
        const stars       = buildStars(review.rating);
        const date        = formatDate(review.createdAt);

        // highlight whichever button the user already voted
        const myVote      = userVotes[review._id] || null;
        const likeActive  = myVote === "helpful"     ? "active" : "";
        const dislikeActive = myVote === "not_helpful" ? "active" : "";

        const slide = document.createElement("div");
        slide.className = "swiper-slide";
        slide.innerHTML = `
            <div class="cardContent reviewCard">
                <div class="image-content reviewImageContainer">
                    <img class="reviewImage img" src="${productImg}" alt="${productName}" loading="lazy">
                </div>
                <div class="userAddress">
                    <div class="image-container userReviewIcon">
                        <img class="img userImage" src="${avatarUrl}" alt="${userName}" loading="lazy">
                    </div>
                    <div class="nameWrapper">
                        <p class="userNameAndReviewDate">${userName} · ${date}</p>
                        <p class="productName">${productName}</p>
                        <div class="startsRating">${stars}</div>
                    </div>
                </div>
                <p class="textReview">${review.comment || ""}</p>
                <div class="likeDislikeBtnContainer">
                    <button class="voteBtn ${likeActive}" data-id="${review._id}" data-vote="helpful">
                        <i class="fa-solid fa-thumbs-up"></i>
                        <span class="helpful-count">${review.helpful_count}</span> Useful
                    </button>
                    <button class="voteBtn ${dislikeActive}" data-id="${review._id}" data-vote="not_helpful">
                        <i class="fa-solid fa-thumbs-down"></i>
                        <span class="not-helpful-count">${review.not_helpful_count}</span> Not Useful
                    </button>
                </div>
            </div>`;
        wrapper.appendChild(slide);
    });

    // attach listeners after all slides are in the DOM
    wrapper.querySelectorAll(".voteBtn").forEach(btn => {
        btn.addEventListener("click", handleVoteClick);
    });
}
async function handleVoteClick(e) {
    const btn      = e.currentTarget;
    const reviewId = btn.dataset.id;
    const vote     = btn.dataset.vote;
    const card     = btn.closest(".likeDislikeBtnContainer");

    try {
        const res  = await fetch(`/api/auth/reviews/${reviewId}/vote`, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ vote }),
        });

        if (res.status === 401) {
            alert("Please log in to vote on reviews.");
            return;
        }
        if (!res.ok) return;

        const data = await res.json();

        // update count in the DOM
        const helpfulBtn    = card.querySelector('[data-vote="helpful"]');
        const notHelpfulBtn = card.querySelector('[data-vote="not_helpful"]');
        const helpfulCount  = helpfulBtn.querySelector(".helpful-count");
        const notHelpfulCount = notHelpfulBtn.querySelector(".not-helpful-count");

        const wasHelpful    = helpfulBtn.classList.contains("active");
        const wasNotHelpful = notHelpfulBtn.classList.contains("active");

        // reset both
        helpfulBtn.classList.remove("active");
        notHelpfulBtn.classList.remove("active");

        if (data.action === "added") {
            btn.classList.add("active");
            const counter = btn.querySelector(vote === "helpful" ? ".helpful-count" : ".not-helpful-count");
            counter.textContent = parseInt(counter.textContent) + 1;

        } else if (data.action === "removed") {
            const counter = btn.querySelector(vote === "helpful" ? ".helpful-count" : ".not-helpful-count");
            counter.textContent = parseInt(counter.textContent) - 1;

        } else if (data.action === "switched") {
            btn.classList.add("active");
            if (vote === "helpful") {
                helpfulCount.textContent    = parseInt(helpfulCount.textContent) + 1;
                notHelpfulCount.textContent = parseInt(notHelpfulCount.textContent) - 1;
            } else {
                notHelpfulCount.textContent = parseInt(notHelpfulCount.textContent) + 1;
                helpfulCount.textContent    = parseInt(helpfulCount.textContent) - 1;
            }
        }

    } catch (err) {
        console.error("[handleVoteClick]", err);
    }
}
// =============================================================================
// WISHLIST HEART OVERLAY
// Fills in solid hearts on already-rendered cards after wishlist IDs load.
// =============================================================================

function applyWishlistHearts() {
    document.querySelectorAll(".addToWishlist[data-action='wishlist']").forEach(heartEl => {
        try {
            const product = safeParseProduct(heartEl);
            if (product && state.wishlistedIds.has(String(product._id))) {
                heartEl.classList.replace("fa-regular", "fa-solid");
            }
        } catch { /* skip */ }
    });
}

// =============================================================================
// PRODUCT ACTION DIALOG
// FIX: guarded — only binds if the dialog element exists on the page
// =============================================================================

let dialogEl   = document.getElementById("productActionCard");
const dialogRefs = dialogEl ? {
    images:      dialogEl.querySelector(".ctaImages .swiper-wrapper"),
    productName: dialogEl.querySelector(".ctaProductname"),
    priceName:   dialogEl.querySelector(".ctaPriceName"),
    colorWrapper:dialogEl.querySelector(".productColorWrapper"),
    sizeWrapper: dialogEl.querySelector(".productSizeWrapper"),
    itemQty:     dialogEl.querySelector(".itemQty"),
    minusBtn:    dialogEl.querySelector(".incQty"),
    plusBtn:     dialogEl.querySelector(".decQty"),
    confirmBtn:  dialogEl.querySelector(".proccedAction"),
    backBtn:     document.getElementById("dialogBackBtn"),
} : null;

// ── Delegated click — guarded so pages without .mainContent don't crash ───────
const mainContentEl = document.querySelector(".mainContent");
if (mainContentEl) {
    mainContentEl.addEventListener("click", e => {
        const actionEl = e.target.closest("[data-action]");
        if (!actionEl) return;

        const action  = actionEl.dataset.action;
        const product = safeParseProduct(actionEl);
        if (!product) return;

        if (action === "wishlist") { handleWishlistClick(product, actionEl); return; }

        if (!state.user || state.user.role === "guest") {
            // Path-aware redirect
            const onRoot = !window.location.pathname.includes("/pages/");
            window.location.href = onRoot ? "./pages/signin.html" : "./signin.html";
            return;
        }

        openDialog(action, product);
    });
}

function openDialog(mode, product) {
    if (!dialogEl || !dialogRefs) return;
    const r = dialogRefs;

    state.dialog.mode      = mode;
    state.dialog.product   = product;
    state.dialog.variantId = null;

    r.itemQty.textContent  = "1";
    populateDialogImages(product.images || []);
    r.productName.textContent = product.name;
    r.priceName.textContent   = formatPrice(product.base_price);
    populateColors(product.variants);
    populateSizes(product.variants);
    if (product.variants[0]) selectVariant(product.variants[0]._id, product.variants);
    applyDialogMode(mode);
    dialogEl.showModal();
}

function populateDialogImages(images) {
    if (!dialogRefs) return;
    dialogRefs.images.innerHTML = "";
    const toShow = images.length ? images : [{ url: "", alt_text: "No image" }];
    toShow.forEach(img => {
        const slide = document.createElement("div");
        slide.className = "swiper-slide";
        slide.innerHTML = `<div class="image-container variantProductImage">
            <img class="img" src="${img.url || ""}" alt="${img.alt_text || ""}">
        </div>`;
        dialogRefs.images.appendChild(slide);
    });
    if (ctaImages) ctaImages.update();
}

function populateColors(variants) {
    if (!dialogRefs) return;
    dialogRefs.colorWrapper.innerHTML = "";
    variants.forEach(variant => {
        const dot = document.createElement("div");
        dot.className             = "color";
        dot.title                 = variant.color;
        dot.dataset.variantId     = variant._id;
        dot.style.backgroundColor = cssColorFromString(variant.color);
        dot.addEventListener("click", () => selectVariant(variant._id, variants));
        dialogRefs.colorWrapper.appendChild(dot);
    });
}

function populateSizes(variants) {
    if (!dialogRefs) return;
    dialogRefs.sizeWrapper.innerHTML = "";
    variants.forEach(variant => {
        const span = document.createElement("span");
        span.textContent       = variant.size;
        span.dataset.variantId = variant._id;
        span.addEventListener("click", () => selectVariant(variant._id, variants));
        dialogRefs.sizeWrapper.appendChild(span);
    });
}

function selectVariant(variantId, variants) {
    if (!dialogRefs) return;
    const r = dialogRefs;
    state.dialog.variantId = variantId;
    const variant = variants.find(v => String(v._id) === String(variantId));
    if (!variant) return;

    r.colorWrapper.querySelectorAll(".color").forEach(dot =>
        dot.classList.toggle("selected", dot.dataset.variantId === String(variantId)));
    r.sizeWrapper.querySelectorAll("span").forEach(span =>
        span.classList.toggle("selected", span.dataset.variantId === String(variantId)));

    r.priceName.textContent = formatPrice(
        state.dialog.product.base_price + (variant.price_modifier || 0)
    );

    const mode      = state.dialog.mode;
    const available = mode === "preorder"
        ? (variant.preorder?.max_slots || 0) - (variant.preorder?.claimed_slots || 0)
        : variant.stock;

    setConfirmAvailability(available > 0);
    const currentQty = parseInt(r.itemQty.textContent) || 1;
    if (currentQty > available) r.itemQty.textContent = Math.max(1, available);
    console.log("base:", state.dialog.product.base_price, "modifier:", variant.price_modifier);
}

function setConfirmAvailability(isAvailable) {
    if (!dialogRefs) return;
    const btn = dialogRefs.confirmBtn;
    if (isAvailable) {
        btn.classList.remove("out-of-stock");
        applyDialogMode(state.dialog.mode);
    } else {
        btn.classList.add("out-of-stock");
        btn.textContent = "Out of Stock";
    }
}

const DIALOG_MODES = {
    cart:     { label: "Add to Cart", cls: "mode-cart"     },
    order:    { label: "Place Order", cls: "mode-order"    },
    preorder: { label: "Reserve",     cls: "mode-preorder" },
};

function applyDialogMode(mode) {
    if (!dialogRefs) return;
    const btn    = dialogRefs.confirmBtn;
    const config = DIALOG_MODES[mode] || DIALOG_MODES.cart;
    Object.values(DIALOG_MODES).forEach(m => btn.classList.remove(m.cls));
    btn.classList.add(config.cls);
    btn.classList.remove("out-of-stock");
    btn.textContent = config.label;
}

function bindDialogControls() {
    if (!dialogEl || !dialogRefs) return;
    const r = dialogRefs;

    r.plusBtn.addEventListener("click", () => {
        const variant = getSelectedVariant();
        if (!variant) return;
        const mode     = state.dialog.mode;
        const maxStock = mode === "preorder"
            ? (variant.preorder?.max_slots || 0) - (variant.preorder?.claimed_slots || 0)
            : variant.stock;
        const current = parseInt(r.itemQty.textContent) || 1;
        if (current < maxStock) r.itemQty.textContent = current + 1;
    });

    r.minusBtn.addEventListener("click", () => {
        const current = parseInt(r.itemQty.textContent) || 1;
        if (current > 1) r.itemQty.textContent = current - 1;
    });

    r.confirmBtn.addEventListener("click", handleConfirm);
    if (r.backBtn) r.backBtn.addEventListener("click", () => dialogEl.close());
    dialogEl.addEventListener("click", e => { if (e.target === dialogEl) dialogEl.close(); });
}

async function handleConfirm() {
    const { mode, product, variantId } = state.dialog;
    if (!variantId) { showToast("Please select a size and color.", "danger"); return; }

    const quantity = parseInt(dialogRefs.itemQty.textContent) || 1;
    dialogRefs.confirmBtn.classList.add("out-of-stock");
    dialogRefs.confirmBtn.textContent = "Please wait…";

    try {
        if (mode === "cart") {
            await handleAddToCart(product._id, variantId, quantity);
        } else {
            await handlePlaceOrder(product, variantId, quantity, mode === "preorder");
        }
    } finally {
        if (dialogEl.open) setConfirmAvailability(true);
    }
}

// =============================================================================
// CART HELPERS
// FIX: navCartLink checks both root and /pages/ href variants
// =============================================================================

const navCartLink = document.querySelector('a[href="./pages/cart.html"]')
                 || document.querySelector('a[href="./cart.html"]');

async function handleAddToCart(productId, variantId, quantity) {
    try {
        const res  = await fetch("/api/auth/cart", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ product_id: productId, variant_id: variantId, quantity }),
        });
        const data = await res.json();
        if (!res.ok) { showToast(data.message || "Failed to add to cart.", "danger"); return; }
        showToast("Added to cart!", "success");
        updateCartBadgeCount(data.cart_count);
        dialogEl.close();
    } catch (err) { console.error("[handleAddToCart]", err); showToast("Something went wrong.", "danger"); }
}

async function updateCartBadge() {
    try {
        const res  = await fetch("/api/auth/cart/count");
        const data = await res.json();
        updateCartBadgeCount(data.count || 0);
    } catch (_) {}
}

function updateCartBadgeCount(count) {
    if (!navCartLink) return;
    let badge = navCartLink.querySelector(".cartBadge");
    if (!badge) {
        badge = document.createElement("sup");
        badge.className = "cartBadge";
        navCartLink.querySelector("h6").appendChild(badge);
    }
    badge.textContent = count > 99 ? "99+" : String(count);
    count > 0 ? badge.removeAttribute("data-hidden") : badge.setAttribute("data-hidden", "");
}

// =============================================================================
// WISHLIST HELPERS
// =============================================================================

async function loadWishlistIds() {
    try {
        const res  = await fetch("/api/auth/wishlist/ids");
        const data = await res.json();
        state.wishlistedIds = new Set(data.product_ids || []);
    } catch (err) { console.error("[loadWishlistIds]", err); }
}

async function handleWishlistClick(product, heartEl) {
    if (!state.user || state.user.role === "guest") {
        const onRoot = !window.location.pathname.includes("/pages/");
        window.location.href = onRoot ? "./pages/signin.html" : "./signin.html";
        return;
    }
    try {
        const res  = await fetch("/api/auth/wishlist/toggle", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ product_id: product._id }),
        });
        const data = await res.json();
        if (!res.ok) { showToast(data.message || "Failed.", "danger"); return; }
        if (data.action === "added") {
            state.wishlistedIds.add(String(product._id));
            heartEl.classList.replace("fa-regular", "fa-solid");
            showToast("Added to wishlist!", "success");
        } else {
            state.wishlistedIds.delete(String(product._id));
            heartEl.classList.replace("fa-solid", "fa-regular");
            showToast("Removed from wishlist.", "success");
        }
        heartEl.dataset.action = "wishlist";
    } catch (err) { console.error("[handleWishlistClick]", err); showToast("Something went wrong.", "danger"); }
}

// =============================================================================
// ORDER HELPER
// =============================================================================

async function handlePlaceOrder(product, variantId, quantity, isPreorder) {
    const variant = getSelectedVariant();
    if (!variant) return;
    const defaultAddress = state.user?.addresses?.find(a => a.is_default && !a.deleted_at);
    if (!defaultAddress) {
        showToast("Please add a shipping address to your account first.", "danger");
        dialogEl.close(); return;
    }
    const unit_price = product.base_price + (variant.price_modifier || 0);
    const subtotal   = unit_price * quantity;
    const body = {
        items: [{ product_id: product._id, variant_id: variantId, quantity }],
        shipping_address: {
            recipient:   defaultAddress.recipient,   phone:       defaultAddress.phone,
            line1:       defaultAddress.line1,        line2:       defaultAddress.line2 || "",
            city:        defaultAddress.city,         province:    defaultAddress.province,
            postal_code: defaultAddress.postal_code,  country:     defaultAddress.country || "PH",
        },
        subtotal, total: subtotal, is_preorder: isPreorder,
    };
    try {
        const res  = await fetch("/api/auth/orders", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) { showToast(data.message || "Failed to place order.", "danger"); return; }
        showToast(isPreorder ? "Preorder reserved!" : "Order placed!", "success");
        dialogEl.close();
        const onRoot = !window.location.pathname.includes("/pages/");
        setTimeout(() => { window.location.href = onRoot ? "./pages/orders.html" : "./orders.html"; }, 1500);
    } catch (err) { console.error("[handlePlaceOrder]", err); showToast("Something went wrong.", "danger"); }
}

// =============================================================================
// BOOT  —  runs on every page
// =============================================================================

window.__sfBootDone = (async function boot() {
        await loadSession();
        await Promise.all([
            loadNewArrivals(),
            loadPopularProducts(),
            loadCuratedReviews(),
        ]);
        if (state.user && state.user.role !== "guest") {
            await Promise.all([ loadWishlistIds(), updateCartBadge() ]);
            applyWishlistHearts();
        }
        bindDialogControls();
    })();

// =============================================================================
// UTILITY
// =============================================================================

function getSelectedVariant() {
    const { product, variantId } = state.dialog;
    if (!product || !variantId) return null;
    return product.variants.find(v => String(v._id) === String(variantId)) || null;
}

function safeParseProduct(el) {
    const decode = raw => raw
        .replace(/&amp;/g, "&").replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
    try { return JSON.parse(decode(el.dataset.product)); }
    catch {
        try { return JSON.parse(decode(el.parentElement?.dataset?.product || "")); }
        catch { return null; }
    }
}

function formatPrice(amount) {
    return "₱" + Number(amount).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(iso) {
    if (!iso) return "";
    return new Date(iso).toLocaleDateString("en-PH", { month: "2-digit", day: "2-digit", year: "numeric" });
}

function buildStars(rating) {
    return Array.from({ length: 5 }, (_, i) =>
        `<i class="${i < rating ? "fa-solid" : "fa-regular"} fa-star"></i>`).join("");
}

function cssColorFromString(colorStr) {
    const name = (colorStr || "").toLowerCase().trim();
    const el   = document.createElement("div");
    el.style.color = name;
    if (el.style.color !== "") return name;
    let hash = 0;
    for (const ch of name) hash = ch.charCodeAt(0) + ((hash << 5) - hash);
    return `hsl(${Math.abs(hash) % 360}, 55%, 40%)`;
}

function htmlEncode(str) {
    return str.replace(/&/g,"&amp;").replace(/'/g,"&#39;")
              .replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

function showToast(message, type = "success") {
    const existing = document.getElementById("sfToast");
    if (existing) existing.remove();
    const toast = document.createElement("div");
    toast.id        = "sfToast";
    toast.className = type === "success" ? "toast-success" : "toast-danger";
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}
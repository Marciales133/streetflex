// =============================================================================
// productDetail.js  —  StreetFlex Product Detail Page
// Depends on: main.js (state, formatPrice, showToast, cssColorFromString,
//             htmlEncode, buildStars, updateCartBadgeCount, handlePlaceOrder)
// =============================================================================

// ── State ─────────────────────────────────────────────────────────────────────
let pdProduct    = null;   // full product object from API
let pdVariantId  = null;   // currently selected variant _id
let pdQty        = 1;
let pdIsWished   = false;

// ── DOM refs — populated after render ─────────────────────────────────────────
let pdPriceEl, pdQtyValEl, pdQtyMinusBtn, pdQtyPlusBtn,
    pdStockDotEl, pdStockTextEl, pdStockAvailEl,
    pdCartBtn, pdOrderBtn, pdWishBtn,
    pdSelectedColorNameEl, pdMainSwiper;

// =============================================================================
// BOOT
// =============================================================================

window.addEventListener("load", () => {
    if (window.__sfBootDone instanceof Promise) {
        window.__sfBootDone.then(bootProductDetail);
        return;
    }

    let _booted = false;
    const _runOnce = () => { if (!_booted) { _booted = true; bootProductDetail(); } };

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
        setTimeout(_runOnce, 1000);
    }
});

async function bootProductDetail() {
    const slug = new URLSearchParams(window.location.search).get("slug");

    if (!slug) {
        renderError("No product specified.");
        return;
    }

    await loadProduct(slug);
}

// =============================================================================
// FETCH PRODUCT
// =============================================================================

async function loadProduct(slug) {
    try {
        const res  = await fetch(`/api/auth/products/detail/${encodeURIComponent(slug)}`);
        const data = await res.json();

        if (!res.ok || !data.product) {
            renderError(data.message || "Product not found.");
            return;
        }

        pdProduct = data.product;
        document.title = `StreetFlex | ${pdProduct.name}`;

        // Check wishlist state
        pdIsWished = state.wishlistedIds.has(String(pdProduct._id));

        renderProduct(pdProduct);

    } catch (err) {
        console.error("[loadProduct]", err);
        renderError("Failed to load product.");
    }
}

// =============================================================================
// RENDER PRODUCT
// =============================================================================

function renderProduct(product) {
    const section = document.getElementById("pdSection");
    if (!section) return;

    const primaryImg  = product.images?.find(i => i.is_primary)?.url
                     || product.images?.[0]?.url || "";
    const stars       = buildStars(product.review_summary?.avg || 0);
    const reviewCount = product.review_summary?.count || 0;
    const catName     = product.category?.name || "";

    // Build thumbnails HTML
    const thumbsHTML = (product.images || []).map((img, idx) => `
        <div class="pdThumb${idx === 0 ? " active" : ""}" data-idx="${idx}">
            <img src="${img.url}" alt="${img.alt_text || product.name}" loading="lazy">
        </div>`).join("");

    // Build unique colors list
    const uniqueColors = [...new Map(
        (product.variants || []).map(v => [v.color, v])
    ).values()];

    // Build unique sizes per currently selected color (initially all sizes)
    const allSizes = [...new Set((product.variants || []).map(v => v.size))];

    section.innerHTML = `
        <a class="pdBackLink" href="./galery.html">
            <i class="fa-solid fa-chevron-left"></i> Back to Gallery
        </a>

        <div class="pdLayout">

            <!-- Image column -->
            <div class="pdImageCol">
                <div class="swiper pdMainSwiper" id="pdMainSwiper">
                    <div class="swiper-wrapper">
                        ${(product.images?.length ? product.images : [{ url: primaryImg, alt_text: product.name }])
                            .map(img => `
                            <div class="swiper-slide">
                                <img src="${img.url}" alt="${img.alt_text || product.name}" loading="lazy">
                            </div>`).join("")}
                    </div>
                    <div class="swiper-pagination"></div>
                </div>
                ${product.images?.length > 1 ? `
                <div class="pdThumbStrip" id="pdThumbStrip">
                    ${thumbsHTML}
                </div>` : ""}
            </div>

            <!-- Info column -->
            <div class="pdInfoCol">

                <!-- Meta badges -->
                <div class="pdMeta">
                    ${catName ? `<span class="pdCategory">${catName}</span>` : ""}
                    ${product.is_preorder ? `<span class="pdPreorderTag">Preorder</span>` : ""}
                </div>

                <!-- Name -->
                <h1 class="pdName">${product.name}</h1>

                <!-- Stars summary -->
                ${reviewCount > 0 ? `
                <div class="pdReviewSummary">
                    <span class="pdReviewStars">${stars}</span>
                    <span class="pdReviewCount">${product.review_summary.avg} (${reviewCount} review${reviewCount !== 1 ? "s" : ""})</span>
                </div>` : ""}

                <!-- Price -->
                <div class="pdPriceRow">
                    <p class="pdPrice" id="pdPrice">${formatPrice(product.base_price)}</p>
                    ${product.is_preorder ? `<p class="pdPriceNote">Preorder price</p>` : ""}
                </div>

                <!-- Stock indicator -->
                <div class="pdStockRow">
                    <span class="pdStockDot" id="pdStockDot"></span>
                    <span class="pdStockText" id="pdStockText"></span>
                    <span class="pdStockAvail" id="pdStockAvail"></span>
                </div>

                <hr class="pdDivider">

                <!-- Color selector -->
                <div>
                    <span class="pdSelectorLabel">
                        Color <span id="pdSelectedColorName" class="pdSelectedColorName"></span>
                    </span>
                    <div class="pdColorRow" id="pdColorRow">
                        ${uniqueColors.map(v => `
                            <div class="pdColorDot"
                                 style="background:${cssColorFromString(v.color)}"
                                 title="${v.color}"
                                 data-color="${v.color}">
                            </div>`).join("")}
                    </div>
                </div>

                <!-- Size selector -->
                <div>
                    <span class="pdSelectorLabel">Size</span>
                    <div class="pdSizeRow" id="pdSizeRow">
                        ${allSizes.map(size => `
                            <div class="pdSizeChip" data-size="${size}">${size}</div>
                        `).join("")}
                    </div>
                </div>

                <!-- Quantity -->
                <div>
                    <span class="pdSelectorLabel">Quantity</span>
                    <div class="pdQtyRow">
                        <div class="pdQtyControls">
                            <button class="pdQtyBtn" id="pdQtyMinus" disabled>
                                <i class="fa-solid fa-minus"></i>
                            </button>
                            <span class="pdQtyVal" id="pdQtyVal">1</span>
                            <button class="pdQtyBtn" id="pdQtyPlus" disabled>
                                <i class="fa-solid fa-plus"></i>
                            </button>
                        </div>
                        <span class="pdStockAvail" id="pdStockAvail2"></span>
                    </div>
                </div>

                <hr class="pdDivider">

                <!-- CTA row -->
                <div class="pdCTARow">
                    <button class="pdWishBtn${pdIsWished ? " wished" : ""}" id="pdWishBtn" title="Wishlist">
                        <i class="fa-${pdIsWished ? "solid" : "regular"} fa-heart"></i>
                    </button>
                    <div class="pdActionBtns" id="pdActionBtns">
                        <div class="btn pdCartBtn disabled" id="pdCartBtn">
                            <i class="fa-solid fa-cart-shopping"></i> Add to Cart
                        </div>
                        <div class="btn ${product.is_preorder ? "pdPreorderBtn" : "pdOrderBtn"} disabled" id="pdOrderBtn">
                            <i class="fa-solid fa-bag-shopping"></i>
                            ${product.is_preorder ? "Reserve" : "Order"}
                        </div>
                    </div>
                </div>

                <!-- Description -->
                ${product.description ? `
                <hr class="pdDivider">
                <div>
                    <span class="pdSelectorLabel">Description</span>
                    <p class="pdDescription">${product.description}</p>
                </div>` : ""}

                <!-- Tags -->
                ${product.tag_names?.length ? `
                <div class="pdTagRow">
                    ${product.tag_names.map(t => `<span class="pdTag">#${t}</span>`).join("")}
                </div>` : ""}

            </div>
        </div>`;

    // ── Bind refs ─────────────────────────────────────────────────────────────
    pdPriceEl          = document.getElementById("pdPrice");
    pdQtyValEl         = document.getElementById("pdQtyVal");
    pdQtyMinusBtn      = document.getElementById("pdQtyMinus");
    pdQtyPlusBtn       = document.getElementById("pdQtyPlus");
    pdStockDotEl       = document.getElementById("pdStockDot");
    pdStockTextEl      = document.getElementById("pdStockText");
    pdStockAvailEl     = document.getElementById("pdStockAvail");
    pdCartBtn          = document.getElementById("pdCartBtn");
    pdOrderBtn         = document.getElementById("pdOrderBtn");
    pdWishBtn          = document.getElementById("pdWishBtn");
    pdSelectedColorNameEl = document.getElementById("pdSelectedColorName");

    // ── Init swiper ───────────────────────────────────────────────────────────
    pdMainSwiper = new Swiper("#pdMainSwiper", {
        loop:       product.images?.length > 1,
        pagination: { el: ".swiper-pagination", clickable: true },
        slidesPerView: 1,
        on: {
            slideChange(swiper) {
                // Sync thumbnail active state
                document.querySelectorAll(".pdThumb").forEach((t, i) =>
                    t.classList.toggle("active", i === swiper.realIndex));
            }
        }
    });

    // Thumbnail clicks → navigate swiper
    document.querySelectorAll(".pdThumb").forEach(thumb => {
        thumb.addEventListener("click", () => {
            const idx = parseInt(thumb.dataset.idx);
            pdMainSwiper?.slideTo(idx);
        });
    });

    // ── Color selection ───────────────────────────────────────────────────────
    document.querySelectorAll(".pdColorDot").forEach(dot => {
        dot.addEventListener("click", () => selectColor(dot.dataset.color));
    });

    // ── Size selection ────────────────────────────────────────────────────────
    document.querySelectorAll(".pdSizeChip").forEach(chip => {
        chip.addEventListener("click", () => {
            if (chip.classList.contains("oos")) return;
            selectSize(chip.dataset.size);
        });
    });

    // ── Qty controls ──────────────────────────────────────────────────────────
    pdQtyMinusBtn?.addEventListener("click", () => {
        if (pdQty > 1) { pdQty--; updateQtyDisplay(); }
    });

    pdQtyPlusBtn?.addEventListener("click", () => {
        const variant = getSelectedVariant();
        if (!variant) return;
        const max = getVariantAvailable(variant);
        if (pdQty < max) { pdQty++; updateQtyDisplay(); }
    });

    // ── Wishlist ──────────────────────────────────────────────────────────────
    pdWishBtn?.addEventListener("click", handleWishlistToggle);

    // ── Cart ──────────────────────────────────────────────────────────────────
    pdCartBtn?.addEventListener("click", async () => {
        if (!pdVariantId || pdCartBtn.classList.contains("disabled")) return;
        if (!state.user || state.user.role === "guest") {
            window.location.href = "./signin.html"; return;
        }
        pdCartBtn.classList.add("disabled");
        pdCartBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Adding…`;
        try {
            const res  = await fetch("/api/auth/cart", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ product_id: pdProduct._id, variant_id: pdVariantId, quantity: pdQty }),
            });
            const data = await res.json();
            if (!res.ok) { showToast(data.message || "Failed to add to cart.", "danger"); }
            else {
                showToast("Added to cart!", "success");
                updateCartBadgeCount(data.cart_count);
            }
        } catch { showToast("Something went wrong.", "danger"); }
        finally {
            pdCartBtn.classList.remove("disabled");
            pdCartBtn.innerHTML = `<i class="fa-solid fa-cart-shopping"></i> Add to Cart`;
        }
    });

    // ── Order / Preorder ──────────────────────────────────────────────────────
    pdOrderBtn?.addEventListener("click", async () => {
        if (!pdVariantId || pdOrderBtn.classList.contains("disabled")) return;
        if (!state.user || state.user.role === "guest") {
            window.location.href = "./signin.html"; return;
        }
        const defaultAddress = state.user?.addresses?.find(a => a.is_default && !a.deleted_at);
        if (!defaultAddress) {
            showToast("Please add a default shipping address first.", "danger"); return;
        }

        pdOrderBtn.classList.add("disabled");
        pdOrderBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Placing…`;

        const variant    = getSelectedVariant();
        const unit_price = pdProduct.base_price + (variant?.price_modifier || 0);
        const subtotal   = unit_price * pdQty;

        try {
            const res = await fetch("/api/auth/orders", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    items: [{ product_id: pdProduct._id, variant_id: pdVariantId, quantity: pdQty }],
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
                    is_preorder: pdProduct.is_preorder,
                }),
            });
            const data = await res.json();
            if (!res.ok) { showToast(data.message || "Failed to place order.", "danger"); }
            else {
                showToast(pdProduct.is_preorder ? "Preorder reserved!" : "Order placed!", "success");
                setTimeout(() => { window.location.href = "./orders.html"; }, 1500);
            }
        } catch { showToast("Something went wrong.", "danger"); }
        finally {
            const isPreorder = pdProduct.is_preorder;
            pdOrderBtn.classList.remove("disabled");
            pdOrderBtn.innerHTML = `<i class="fa-solid fa-bag-shopping"></i> ${isPreorder ? "Reserve" : "Order"}`;
        }
    });

    // ── Auto-select first available variant ───────────────────────────────────
    autoSelectFirst();
}

// =============================================================================
// VARIANT SELECTION LOGIC
// =============================================================================

function selectColor(color) {
    const product = pdProduct;

    // Highlight selected color dot
    document.querySelectorAll(".pdColorDot").forEach(dot =>
        dot.classList.toggle("active", dot.dataset.color === color));

    if (pdSelectedColorNameEl) pdSelectedColorNameEl.textContent = `— ${color}`;

    // Update size chips — show only sizes available in this color
    // Mark sizes as oos if variant for that color+size has no stock
    const sizeChips = document.querySelectorAll(".pdSizeChip");
    sizeChips.forEach(chip => {
        const size    = chip.dataset.size;
        const variant = product.variants.find(v => v.color === color && v.size === size);
        const avail   = variant ? getVariantAvailable(variant) : 0;
        chip.classList.toggle("oos", avail <= 0);
    });

    // If current size is no longer available in this color, deselect
    const currentSizeChip = document.querySelector(".pdSizeChip.active");
    if (currentSizeChip) {
        const v = product.variants.find(v =>
            v.color === color && v.size === currentSizeChip.dataset.size);
        if (!v || getVariantAvailable(v) <= 0) {
            currentSizeChip.classList.remove("active");
            pdVariantId = null;
            pdQty = 1;
            updateVariantUI(null);
        } else {
            // Re-confirm the variant for this color+size
            pdVariantId = String(v._id);
            updateVariantUI(v);
        }
    } else {
        updateVariantUI(null);
    }
}

function selectSize(size) {
    // Find active color
    const activeColorDot = document.querySelector(".pdColorDot.active");
    const color = activeColorDot?.dataset.color;

    // Highlight size chip
    document.querySelectorAll(".pdSizeChip").forEach(c =>
        c.classList.toggle("active", c.dataset.size === size));

    // Find matching variant
    let variant = null;
    if (color) {
        variant = pdProduct.variants.find(v => v.color === color && v.size === size);
    } else {
        // No color selected yet — pick first variant with this size
        variant = pdProduct.variants.find(v => v.size === size);
        if (variant) {
            // Auto-select the color too
            document.querySelectorAll(".pdColorDot").forEach(dot =>
                dot.classList.toggle("active", dot.dataset.color === variant.color));
            if (pdSelectedColorNameEl) pdSelectedColorNameEl.textContent = `— ${variant.color}`;
        }
    }

    if (variant) {
        pdVariantId = String(variant._id);
        pdQty = 1;
        updateVariantUI(variant);
    } else {
        pdVariantId = null;
        updateVariantUI(null);
    }
}

function autoSelectFirst() {
    // Try to find first in-stock variant
    const first = pdProduct.variants.find(v => getVariantAvailable(v) > 0)
               || pdProduct.variants[0];

    if (!first) { updateVariantUI(null); return; }

    // Select color
    document.querySelectorAll(".pdColorDot").forEach(dot =>
        dot.classList.toggle("active", dot.dataset.color === first.color));
    if (pdSelectedColorNameEl) pdSelectedColorNameEl.textContent = `— ${first.color}`;

    // Update size chips for this color
    selectColor(first.color);

    // Select size
    document.querySelectorAll(".pdSizeChip").forEach(c =>
        c.classList.toggle("active", c.dataset.size === first.size));

    pdVariantId = String(first._id);
    pdQty = 1;
    updateVariantUI(first);
}

function getSelectedVariant() {
    if (!pdVariantId || !pdProduct) return null;
    return pdProduct.variants.find(v => String(v._id) === pdVariantId) || null;
}

function getVariantAvailable(variant) {
    if (!variant) return 0;
    if (pdProduct.is_preorder) {
        return (variant.preorder?.max_slots || 0) - (variant.preorder?.claimed_slots || 0);
    }
    return variant.stock || 0;
}

function updateVariantUI(variant) {
    const available = variant ? getVariantAvailable(variant) : 0;
    const isOos     = available <= 0;

    // Price
    if (pdPriceEl && pdProduct) {
        const modifier = variant?.price_modifier || 0;
        pdPriceEl.textContent = formatPrice(pdProduct.base_price + modifier);
    }

    // Stock indicator
    if (pdStockDotEl && pdStockTextEl) {
        if (!variant) {
            pdStockDotEl.className = "pdStockDot";
            pdStockTextEl.textContent = "Select a variant";
        } else if (pdProduct.is_preorder) {
            pdStockDotEl.className = "pdStockDot pre";
            pdStockTextEl.textContent = available > 0 ? `${available} slots left` : "No slots left";
        } else if (isOos) {
            pdStockDotEl.className = "pdStockDot out";
            pdStockTextEl.textContent = "Out of Stock";
        } else if (available <= 5) {
            pdStockDotEl.className = "pdStockDot low";
            pdStockTextEl.textContent = `Only ${available} left`;
        } else {
            pdStockDotEl.className = "pdStockDot in";
            pdStockTextEl.textContent = "In Stock";
        }
    }

    // Stock avail display in qty row
    const avail2 = document.getElementById("pdStockAvail2");
    if (avail2) avail2.textContent = variant && !isOos ? `Max: ${available}` : "";

    // Qty controls
    if (pdQtyMinusBtn) pdQtyMinusBtn.disabled = !variant || isOos || pdQty <= 1;
    if (pdQtyPlusBtn)  pdQtyPlusBtn.disabled  = !variant || isOos || pdQty >= available;
    if (pdQtyValEl)    pdQtyValEl.textContent  = pdQty;

    // CTA buttons
    const canAct = !!variant && !isOos;
    pdCartBtn?.classList.toggle("disabled", !canAct);
    pdOrderBtn?.classList.toggle("disabled", !canAct);
}

function updateQtyDisplay() {
    if (pdQtyValEl) pdQtyValEl.textContent = pdQty;
    const variant = getSelectedVariant();
    const max     = variant ? getVariantAvailable(variant) : 0;
    if (pdQtyMinusBtn) pdQtyMinusBtn.disabled = pdQty <= 1;
    if (pdQtyPlusBtn)  pdQtyPlusBtn.disabled  = pdQty >= max;
}

// =============================================================================
// WISHLIST
// =============================================================================

async function handleWishlistToggle() {
    if (!state.user || state.user.role === "guest") {
        window.location.href = "./signin.html"; return;
    }
    try {
        const res  = await fetch("/api/auth/wishlist/toggle", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ product_id: pdProduct._id }),
        });
        const data = await res.json();
        if (!res.ok) { showToast(data.message || "Failed.", "danger"); return; }

        if (data.action === "added") {
            pdIsWished = true;
            state.wishlistedIds.add(String(pdProduct._id));
            pdWishBtn.className = "pdWishBtn wished";
            pdWishBtn.innerHTML = `<i class="fa-solid fa-heart"></i>`;
            showToast("Added to wishlist!", "success");
        } else {
            pdIsWished = false;
            state.wishlistedIds.delete(String(pdProduct._id));
            pdWishBtn.className = "pdWishBtn";
            pdWishBtn.innerHTML = `<i class="fa-regular fa-heart"></i>`;
            showToast("Removed from wishlist.", "success");
        }
    } catch { showToast("Something went wrong.", "danger"); }
}

// =============================================================================
// RENDER ERROR / NOT FOUND
// =============================================================================

function renderError(msg) {
    const section = document.getElementById("pdSection");
    if (!section) return;
    section.innerHTML = `
        <div class="pdError">
            <i class="fa-solid fa-circle-exclamation"></i>
            <p>${msg}</p>
            <a class="btn" href="./galery.html">Back to Gallery</a>
        </div>`;
}
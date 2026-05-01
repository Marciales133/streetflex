// =============================================================================
// galery.js  —  StreetFlex Gallery Page
// Depends on: main.js (state, formatPrice, showToast, cssColorFromString,
//             htmlEncode, openDialog)
// =============================================================================

// ── DOM refs — populated after buildGalleryHTML() injects the section ──────────
// These CANNOT be queried at script load time because the HTML doesn't exist yet.
// They are assigned inside rebindRefs() which runs right after injection.
let galleryGrid      = null;
let galleryShowMore  = null;
let resultMeta       = null;
let filterToggleBtn  = null;
let filterCountBadge = null;
let gallerySidebar   = null;
let sidebarBackdrop  = null;
let sidebarCloseBtn  = null;
let filterClearAll   = null;
let activeFilterPillsEl = null;

// Filter DOM refs (populated after meta loads)
let categoryChipsEl, tagChipsEl, colorSwatchesEl, sizeChipsEl;
let priceMinInput, priceMaxInput, priceSlider, priceDisplay;

// Sort buttons
const sortBtns = document.querySelectorAll(".gallerySortBtn");

// ── Filter + pagination state ─────────────────────────────────────────────────
const filters = {
    q:         "",
    category:  null,   // _id string
    tags:      [],     // array of tag name strings
    colors:    [],
    sizes:     [],
    minPrice:  null,
    maxPrice:  null,
    sort:      "newest",
};

let galleryPage  = 1;
const PAGE_LIMIT = 30;
let  galleryTotal = 0;

// Cached meta
let metaCache = null;

// =============================================================================
// SIDEBAR TOGGLE  (mobile)
// =============================================================================

function openSidebar() {
    const sidebar  = document.getElementById("gallerySidebar")  || gallerySidebar;
    const backdrop = document.getElementById("sidebarBackdrop") || sidebarBackdrop;
    if (!sidebar) return;
    // Must set display:block before adding .open so the CSS transition fires
    sidebar.style.display = "block";
    backdrop?.classList.add("visible");
    document.body.style.overflow = "hidden";
    // rAF ensures the display change is painted before the transition class is added
    requestAnimationFrame(() => {
        requestAnimationFrame(() => sidebar.classList.add("open"));
    });
}

function closeSidebar() {
    const sidebar  = document.getElementById("gallerySidebar")  || gallerySidebar;
    const backdrop = document.getElementById("sidebarBackdrop") || sidebarBackdrop;
    if (!sidebar) return;
    sidebar.classList.remove("open");
    backdrop?.classList.remove("visible");
    document.body.style.overflow = "";
    // Hide after transition completes (220ms matches CSS)
    setTimeout(() => {
        // Only hide if still closed (user didn't re-open during transition)
        if (!sidebar.classList.contains("open")) sidebar.style.display = "";
    }, 240);
}

filterToggleBtn?.addEventListener("click", openSidebar);
sidebarCloseBtn?.addEventListener("click", closeSidebar);
sidebarBackdrop?.addEventListener("click", closeSidebar);

// =============================================================================
// SORT BUTTONS
// =============================================================================

sortBtns.forEach(btn => {
    btn.addEventListener("click", () => {
        sortBtns.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        filters.sort = btn.dataset.sort;
        loadGallery(true);
    });
});

// =============================================================================
// LOAD FILTER META  (once)
// =============================================================================

async function loadFilterMeta() {
    try {
        const res  = await fetch("/api/auth/products/filter-meta");
        const data = await res.json();
        metaCache  = data;
        buildSidebarFilters(data);
    } catch (err) {
        console.error("[loadFilterMeta]", err);
    }
}

function buildSidebarFilters(meta) {
    // ── Category chips ────────────────────────────────────────────────────────
    categoryChipsEl = document.getElementById("filterCategoryChips");
    if (categoryChipsEl) {
        categoryChipsEl.innerHTML = "";
        const allChip = makeChip("All", null, "category");
        allChip.classList.add("active");
        categoryChipsEl.appendChild(allChip);
        meta.categories.forEach(cat => {
            categoryChipsEl.appendChild(makeChip(cat.name, cat._id, "category"));
        });
    }

    // ── Tag chips ─────────────────────────────────────────────────────────────
    tagChipsEl = document.getElementById("filterTagChips");
    if (tagChipsEl) {
        tagChipsEl.innerHTML = "";
        meta.tags.forEach(tag => {
            tagChipsEl.appendChild(makeChip(tag.name, tag.name, "tag"));
        });
    }

    // ── Color swatches ────────────────────────────────────────────────────────
    colorSwatchesEl = document.getElementById("filterColorSwatches");
    if (colorSwatchesEl) {
        colorSwatchesEl.innerHTML = "";
        meta.colors.forEach(color => {
            const swatch = document.createElement("div");
            swatch.className = "filterColorSwatch";
            swatch.title     = color;
            swatch.style.backgroundColor = cssColorFromString(color);
            swatch.addEventListener("click", () => toggleFilter("color", color, swatch));
            colorSwatchesEl.appendChild(swatch);
        });
    }

    // ── Size chips ────────────────────────────────────────────────────────────
    sizeChipsEl = document.getElementById("filterSizeChips");
    if (sizeChipsEl) {
        sizeChipsEl.innerHTML = "";
        // Sort sizes in a sensible order
        const SIZE_ORDER = ["XS","S","M","L","XL","XXL","XXXL"];
        const sorted = [...meta.sizes].sort((a, b) => {
            const ai = SIZE_ORDER.indexOf(a.toUpperCase());
            const bi = SIZE_ORDER.indexOf(b.toUpperCase());
            if (ai === -1 && bi === -1) return a.localeCompare(b);
            if (ai === -1) return 1;
            if (bi === -1) return -1;
            return ai - bi;
        });
        sorted.forEach(size => {
            sizeChipsEl.appendChild(makeChip(size, size, "size"));
        });
    }

    // ── Price range ───────────────────────────────────────────────────────────
    priceMinInput = document.getElementById("filterPriceMin");
    priceMaxInput = document.getElementById("filterPriceMax");
    priceSlider   = document.getElementById("filterPriceSlider");
    priceDisplay  = document.getElementById("filterPriceDisplay");

    const { min, max } = meta.price_range;

    if (priceSlider) {
        priceSlider.min   = Math.floor(min);
        priceSlider.max   = Math.ceil(max);
        priceSlider.value = Math.ceil(max);
        priceSlider.addEventListener("input", () => {
            if (priceMaxInput) priceMaxInput.value = priceSlider.value;
            updatePriceDisplay();
        });
        priceSlider.addEventListener("change", () => {
            filters.maxPrice = parseFloat(priceSlider.value);
            if (filters.maxPrice >= Math.ceil(max)) filters.maxPrice = null;
            updateActiveFilters();
            loadGallery(true);
        });
    }

    if (priceMinInput) {
        priceMinInput.placeholder = `₱${Math.floor(min)}`;
        priceMinInput.addEventListener("change", () => {
            filters.minPrice = priceMinInput.value ? parseFloat(priceMinInput.value) : null;
            updateActiveFilters();
            loadGallery(true);
        });
    }

    if (priceMaxInput) {
        priceMaxInput.placeholder = `₱${Math.ceil(max)}`;
        priceMaxInput.addEventListener("change", () => {
            filters.maxPrice = priceMaxInput.value ? parseFloat(priceMaxInput.value) : null;
            if (priceSlider && filters.maxPrice) priceSlider.value = filters.maxPrice;
            updateActiveFilters();
            loadGallery(true);
        });
    }

    updatePriceDisplay();
}

function updatePriceDisplay() {
    if (!priceDisplay || !metaCache) return;
    const max = filters.maxPrice ?? metaCache.price_range.max;
    const min = filters.minPrice ?? metaCache.price_range.min;
    priceDisplay.textContent = `₱${Math.floor(min).toLocaleString()} — ₱${Math.ceil(max).toLocaleString()}`;
}

function makeChip(label, value, type) {
    const chip = document.createElement("div");
    chip.className    = "filterChip";
    chip.textContent  = label;
    chip.dataset.value = value ?? "";
    chip.dataset.type  = type;
    chip.addEventListener("click", () => toggleFilter(type, value, chip));
    return chip;
}

// =============================================================================
// FILTER TOGGLE LOGIC
// =============================================================================

function toggleFilter(type, value, el) {
    if (type === "category") {
        // Single-select
        filters.category = filters.category === value ? null : value;
        document.querySelectorAll("#filterCategoryChips .filterChip").forEach(c => {
            c.classList.toggle("active",
                c.dataset.value === (filters.category ?? "")
                || (filters.category === null && c.dataset.value === ""));
        });
    } else if (type === "tag") {
        toggleArrayFilter(filters.tags, value);
        el.classList.toggle("active", filters.tags.includes(value));
    } else if (type === "color") {
        toggleArrayFilter(filters.colors, value);
        el.classList.toggle("active", filters.colors.includes(value));
    } else if (type === "size") {
        toggleArrayFilter(filters.sizes, value);
        el.classList.toggle("active", filters.sizes.includes(value));
    }

    updateActiveFilters();
    loadGallery(true);
}

function toggleArrayFilter(arr, value) {
    const idx = arr.indexOf(value);
    if (idx === -1) arr.push(value);
    else arr.splice(idx, 1);
}

function countActiveFilters() {
    let n = 0;
    if (filters.category) n++;
    n += filters.tags.length + filters.colors.length + filters.sizes.length;
    if (filters.minPrice) n++;
    if (filters.maxPrice) n++;
    return n;
}

function updateActiveFilters() {
    const count = countActiveFilters();

    // Badge on toggle button
    if (filterCountBadge) {
        filterCountBadge.textContent = count;
        filterCountBadge.classList.toggle("visible", count > 0);
    }

    // Clear all button
    filterClearAll?.classList.toggle("visible", count > 0);

    // Active pills row above grid
    if (!activeFilterPillsEl) return;
    activeFilterPillsEl.innerHTML = "";

    const addPill = (label, removeFn) => {
        const pill = document.createElement("span");
        pill.className = "activeFilterPill";
        pill.innerHTML = `${label} <i class="fa-solid fa-xmark"></i>`;
        pill.addEventListener("click", removeFn);
        activeFilterPillsEl.appendChild(pill);
    };

    if (filters.category && metaCache) {
        const cat = metaCache.categories.find(c => c._id === filters.category);
        if (cat) addPill(cat.name, () => {
            filters.category = null;
            document.querySelectorAll("#filterCategoryChips .filterChip").forEach(c => {
                c.classList.toggle("active", c.dataset.value === "");
            });
            updateActiveFilters(); loadGallery(true);
        });
    }

    filters.tags.forEach(tag => addPill(`#${tag}`, () => {
        toggleArrayFilter(filters.tags, tag);
        document.querySelectorAll("#filterTagChips .filterChip").forEach(c => {
            if (c.dataset.value === tag) c.classList.remove("active");
        });
        updateActiveFilters(); loadGallery(true);
    }));

    filters.colors.forEach(color => {
        const pill = document.createElement("span");
        pill.className = "activeFilterPill";
        pill.innerHTML = `<span style="display:inline-block;width:.65rem;height:.65rem;border-radius:50%;background:${cssColorFromString(color)};border:1px solid rgba(255,255,255,0.2)"></span> ${color} <i class="fa-solid fa-xmark"></i>`;
        pill.addEventListener("click", () => {
            toggleArrayFilter(filters.colors, color);
            document.querySelectorAll("#filterColorSwatches .filterColorSwatch").forEach(s => {
                if (s.title === color) s.classList.remove("active");
            });
            updateActiveFilters(); loadGallery(true);
        });
        activeFilterPillsEl.appendChild(pill);
    });

    filters.sizes.forEach(size => addPill(size, () => {
        toggleArrayFilter(filters.sizes, size);
        document.querySelectorAll("#filterSizeChips .filterChip").forEach(c => {
            if (c.dataset.value === size) c.classList.remove("active");
        });
        updateActiveFilters(); loadGallery(true);
    }));

    if (filters.minPrice) addPill(`Min ₱${filters.minPrice}`, () => {
        filters.minPrice = null;
        if (priceMinInput) priceMinInput.value = "";
        updatePriceDisplay(); updateActiveFilters(); loadGallery(true);
    });
    if (filters.maxPrice) addPill(`Max ₱${filters.maxPrice}`, () => {
        filters.maxPrice = null;
        if (priceMaxInput) priceMaxInput.value = "";
        if (priceSlider && metaCache) priceSlider.value = metaCache.price_range.max;
        updatePriceDisplay(); updateActiveFilters(); loadGallery(true);
    });
}

// Clear all — also called from rebindRefs after injection
function clearAllFilters() {
    filters.category = null;
    filters.tags     = [];
    filters.colors   = [];
    filters.sizes    = [];
    filters.minPrice = null;
    filters.maxPrice = null;

    // Reset UI
    document.querySelectorAll(".filterChip").forEach(c => {
        c.classList.toggle("active", c.dataset.type === "category" && c.dataset.value === "");
    });
    document.querySelectorAll(".filterColorSwatch").forEach(s => s.classList.remove("active"));
    if (priceMinInput) priceMinInput.value = "";
    if (priceMaxInput) priceMaxInput.value = "";
    if (priceSlider && metaCache) priceSlider.value = metaCache.price_range.max;
    updatePriceDisplay();
    updateActiveFilters();
    loadGallery(true);
}

// =============================================================================
// SEARCH  (from URL ?q= param and from the main header search)
// =============================================================================

function readUrlParams() {
    const params = new URLSearchParams(window.location.search);
    if (params.get("q")) filters.q = params.get("q");
}

// =============================================================================
// LOAD GALLERY
// =============================================================================

async function loadGallery(reset = false) {
    if (!galleryGrid) return;

    if (reset) {
        galleryPage = 1;
        galleryGrid.innerHTML = "";
    }

    if (galleryPage === 1) renderSkeletons(12);

    const params = new URLSearchParams({
        page:  galleryPage,
        limit: PAGE_LIMIT,
        sort:  filters.sort,
    });
    if (filters.q)        params.set("q",        filters.q);
    if (filters.category) params.set("category", filters.category);
    if (filters.tags.length)   params.set("tags",   filters.tags.join(","));
    if (filters.colors.length) params.set("colors", filters.colors.join(","));
    if (filters.sizes.length)  params.set("sizes",  filters.sizes.join(","));
    if (filters.minPrice) params.set("minPrice", filters.minPrice);
    if (filters.maxPrice) params.set("maxPrice", filters.maxPrice);

    try {
        const res  = await fetch(`/api/auth/products/gallery?${params}`);
        const data = await res.json();

        if (galleryPage === 1) galleryGrid.innerHTML = "";

        galleryTotal = data.total || 0;
        updateResultMeta();

        if (!data.products?.length && galleryPage === 1) {
            renderEmpty();
            galleryShowMore?.classList.add("hidden");
            return;
        }

        data.products.forEach(p => galleryGrid.appendChild(buildGalleryCard(p)));

        if (galleryShowMore) {
            data.has_more
                ? galleryShowMore.classList.remove("hidden")
                : galleryShowMore.classList.add("hidden");
        }

        galleryPage++;

    } catch (err) {
        console.error("[loadGallery]", err);
        if (galleryPage === 1) galleryGrid.innerHTML = "";
        showToast("Failed to load products.", "danger");
    }
}

// =============================================================================
// BUILD GALLERY CARD
// =============================================================================

function buildGalleryCard(product) {
    const primaryImg = product.images?.find(i => i.is_primary)?.url
                    || product.images?.[0]?.url || "";
    const price      = formatPrice(product.base_price);
    const variants   = product.variants || [];
    const isOos      = product.total_stock <= 0 && !product.is_preorder;
    const productJson = htmlEncode(JSON.stringify(product));

    // Unique colors (max 6 shown)
    const uniqueColors = [...new Set(variants.map(v => v.color))];
    const colorDotsHTML = uniqueColors.slice(0, 6).map(c =>
        `<span class="galleryCardColorDot" style="background:${cssColorFromString(c)}" title="${c}"></span>`
    ).join("") + (uniqueColors.length > 6
        ? `<span class="galleryCardColorsMore">+${uniqueColors.length - 6}</span>` : "");

    // Unique sizes
    const uniqueSizes = [...new Set(variants.map(v => v.size))];
    const SIZE_ORDER  = ["XS","S","M","L","XL","XXL","XXXL"];
    uniqueSizes.sort((a, b) => {
        const ai = SIZE_ORDER.indexOf(a.toUpperCase());
        const bi = SIZE_ORDER.indexOf(b.toUpperCase());
        if (ai === -1 && bi === -1) return a.localeCompare(b);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
    const sizesHTML = uniqueSizes.slice(0, 6).map(s =>
        `<span class="galleryCardSizeChip">${s}</span>`
    ).join("") + (uniqueSizes.length > 6
        ? `<span class="galleryCardSizeChip">+${uniqueSizes.length - 6}</span>` : "");

    // Badges
    const badges = [];
    if (product.is_preorder)  badges.push(`<span class="galleryBadge badge-preorder">Preorder</span>`);
    else if (isOos)           badges.push(`<span class="galleryBadge badge-oos">Out of Stock</span>`);

    // Action buttons
    const actionType  = product.is_preorder ? "preorder" : "order";
    const actionLabel = product.is_preorder ? "Reserve"  : "Order";

    const card = document.createElement("div");
    card.className = `galleryCard${isOos ? " oos" : ""}`;

    card.innerHTML = `
        <div class="galleryCardImg">
            <a href="./productDetail.html?slug=${product.slug}" class="galleryImgLink" title="${product.name}">
                <img src="${primaryImg}" alt="${product.name}" loading="lazy">
            </a>
            <div class="galleryBadgeRow">${badges.join("")}</div>
        </div>
        <div class="galleryCardBody">
            <p class="galleryCardName" title="${product.name}">${product.name}</p>
            <p class="galleryCardPrice">${price}</p>
            <div class="galleryCardColors">${colorDotsHTML}</div>
            <div class="galleryCardSizes">${sizesHTML}</div>
            <div class="galleryCardActions">
                <div class="btn cart-btn"
                     data-action="cart"
                     data-product='${productJson}'>
                    <i class="fa-solid fa-cart-shopping"></i> Cart
                </div>
                <div class="btn ${product.is_preorder ? "pre-btn" : "order-btn"}"
                     data-action="${actionType}"
                     data-product='${productJson}'>
                    <i class="fa-solid fa-bag-shopping"></i> ${actionLabel}
                </div>
            </div>
        </div>`;

    // Click on image → item page (already an <a>, handled natively)
    // Click on card body (not buttons) → item page
    card.querySelector(".galleryCardBody").addEventListener("click", e => {
        if (e.target.closest("[data-action]")) return;
        window.location.href = `./productDetail.html?slug=${product.slug}`;
    });

    return card;
}

// =============================================================================
// RENDER HELPERS
// =============================================================================

function renderSkeletons(n = 12) {
    galleryGrid.innerHTML = "";
    for (let i = 0; i < n; i++) {
        const s = document.createElement("div");
        s.className = "gallerySkeleton";
        galleryGrid.appendChild(s);
    }
}

function renderEmpty() {
    galleryGrid.innerHTML = "";
    const el = document.createElement("div");
    el.className = "galleryEmpty";
    const hasFilters = countActiveFilters() > 0 || filters.q;
    el.innerHTML = `
        <i class="fa-solid fa-shirt"></i>
        <p>${hasFilters ? "No products match your filters." : "No products available yet."}</p>
        ${hasFilters ? `<button class="btn" id="emptyFilterClear">Clear Filters</button>` : ""}`;
    galleryGrid.appendChild(el);
    document.getElementById("emptyFilterClear")
        ?.addEventListener("click", () => filterClearAll?.click());
}

function updateResultMeta() {
    if (resultMeta) {
        resultMeta.textContent = galleryTotal === 0 ? "No products"
            : galleryTotal === 1 ? "1 product"
            : `${galleryTotal} products`;
    }
}

// =============================================================================
// SHOW MORE
// (listener is bound inside rebindRefs after HTML injection — not here)
// =============================================================================

// =============================================================================
// HTML SECTION STRUCTURE
// Injected into the existing .gallerySection stub.
// =============================================================================

function buildGalleryHTML() {
    const section = document.querySelector(".gallerySection");
    if (!section || section.querySelector(".galleryBody")) return; // already built

    section.innerHTML = `
        <!-- Header -->
        <div class="galleryHeader">
            <h2>Gallery</h2>
            <p class="galleryResultMeta" id="galleryResultMeta"></p>
            <button class="filterToggleBtn" id="filterToggleBtn">
                <i class="fa-solid fa-sliders"></i> Filters
                <span class="filterCount" id="filterCountBadge"></span>
            </button>
        </div>

        <!-- Sort bar -->
        <div class="gallerySortBar">
            <span class="gallerySortLabel">Sort:</span>
            <button class="gallerySortBtn active" data-sort="newest">Newest</button>
            <button class="gallerySortBtn" data-sort="price_asc">Price ↑</button>
            <button class="gallerySortBtn" data-sort="price_desc">Price ↓</button>
            <button class="gallerySortBtn" data-sort="popular">Popular</button>
        </div>

        <!-- Active filter pills -->
        <div class="activeFilterPills" id="activeFilterPills" style="padding:0 1rem;"></div>

        <!-- Sidebar backdrop -->
        <div class="sidebarBackdrop" id="sidebarBackdrop"></div>

        <!-- Body -->
        <div class="galleryBody">

            <!-- Sidebar -->
            <aside class="gallerySidebar" id="gallerySidebar">
                <div class="sidebarHead">
                    <h5>Filters</h5>
                    <button class="sidebarCloseBtn" id="sidebarCloseBtn">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>

                <button class="filterClearAll" id="filterClearAll">
                    <i class="fa-solid fa-rotate-left"></i> Clear All Filters
                </button>

                <div class="filterGroup">
                    <span class="filterGroupLabel">Category</span>
                    <div class="filterChips" id="filterCategoryChips"></div>
                </div>

                <div class="filterGroup">
                    <span class="filterGroupLabel">Tags</span>
                    <div class="filterChips" id="filterTagChips"></div>
                </div>

                <div class="filterGroup">
                    <span class="filterGroupLabel">Color</span>
                    <div class="filterColors" id="filterColorSwatches"></div>
                </div>

                <div class="filterGroup">
                    <span class="filterGroupLabel">Size</span>
                    <div class="filterChips" id="filterSizeChips"></div>
                </div>

                <div class="filterGroup">
                    <span class="filterGroupLabel">Price Range</span>
                    <div class="filterPriceRange">
                        <input type="range" class="filterPriceSlider" id="filterPriceSlider" min="0" max="9999" step="50">
                        <p class="filterPriceDisplay" id="filterPriceDisplay">Any price</p>
                        <div class="filterPriceInputs">
                            <input type="number" class="filterPriceInput" id="filterPriceMin" placeholder="Min ₱">
                            <input type="number" class="filterPriceInput" id="filterPriceMax" placeholder="Max ₱">
                        </div>
                    </div>
                </div>
            </aside>

            <!-- Grid -->
            <div>
                <div class="galleryGrid" id="galleryGrid"></div>
                <h6 id="galleryShowMore" class="hidden">Show More...</h6>
            </div>

        </div>`;

    // Re-bind DOM refs after injection
    rebindRefs();
}

function rebindRefs() {
    // Assign module-level lets so all functions can use them after injection
    galleryGrid      = document.getElementById("galleryGrid");
    galleryShowMore  = document.getElementById("galleryShowMore");
    resultMeta       = document.getElementById("galleryResultMeta");
    filterCountBadge = document.getElementById("filterCountBadge");
    filterClearAll   = document.getElementById("filterClearAll");
    activeFilterPillsEl = document.getElementById("activeFilterPills");

    const newFilterToggle = document.getElementById("filterToggleBtn");
    const newSidebar      = document.getElementById("gallerySidebar");
    const newBackdrop     = document.getElementById("sidebarBackdrop");
    const newCloseBtn     = document.getElementById("sidebarCloseBtn");
    const newShowMore     = document.getElementById("galleryShowMore");
    const newSortBtns     = document.querySelectorAll(".gallerySortBtn");

    // Also assign sidebar refs used by openSidebar/closeSidebar
    gallerySidebar  = newSidebar;
    sidebarBackdrop = newBackdrop;
    filterToggleBtn = newFilterToggle;
    sidebarCloseBtn = newCloseBtn;

    newFilterToggle?.addEventListener("click", openSidebar);
    newCloseBtn?.addEventListener("click",     closeSidebar);
    newBackdrop?.addEventListener("click",     closeSidebar);

    filterClearAll?.addEventListener("click", clearAllFilters);

    newShowMore?.addEventListener("click", () => loadGallery(false));

    newSortBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            newSortBtns.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            filters.sort = btn.dataset.sort;
            loadGallery(true);
        });
    });
}

// =============================================================================
// BOOT
// =============================================================================

async function bootGallery() {
    buildGalleryHTML();
    readUrlParams();
    await loadFilterMeta();
    await loadGallery(true);
}

window.addEventListener("load", () => {
    if (window.__sfBootDone instanceof Promise) {
        window.__sfBootDone.then(bootGallery);
        return;
    }

    let _booted = false;
    const _runOnce = () => { if (!_booted) { _booted = true; bootGallery(); } };

    // Gallery is public — boot as soon as state.user is set or after 1s
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
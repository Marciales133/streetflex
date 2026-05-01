// js/pages/admin/product.js

(function() {
    // =============================================================================
    // STATE
    // =============================================================================
    let currentAction    = null;
    let currentProductId = null;
    let currentPage      = 1;
    const limit          = 20;
    let searchTimeout    = null;
    let abortController  = null;
    let activeFilter     = null;   // "active"|"inactive"|"preorder"|"nostock"|"instock"
    let activeCategory   = null;   // category _id string
    let activeTag        = null;   // tag _id string
    let categories       = [];     // populated on load
    let tags             = [];     // populated on load
    let formMode         = null;   // "create" | "edit"
    let variantList      = [];     // tracks variant rows in step 3

    // =============================================================================
    // ELEMENTS
    // =============================================================================
    const addBtn                   = document.getElementById("addProduct");
    const formWrapperStep1         = document.getElementById("formWrapperStep1");
    const formWrapperStep2         = document.getElementById("formWrapperStep2");
    const formWrapperStep3         = document.getElementById("formWrapperStep3");
    const closeForm                = document.getElementById("closeForm");
    const nextToStep2              = document.getElementById("nextToStep2");
    const nextToStep3              = document.getElementById("nextToStep3");
    const backToStep1              = document.getElementById("backToStep1");
    const backToStep2              = document.getElementById("backToStep2");
    const submitProductRegistration = document.getElementById("submitProductRegistration");
    const searchInput              = document.getElementById("search");
    const searchButton             = document.getElementById("searchButton");
    const suggestions              = document.getElementById("suggestions");

    // ── Form fields step 1 ───────────────────────────────────────────────────────
    const fieldName        = document.getElementById("fieldName");
    const fieldSlug        = document.getElementById("fieldSlug");
    const fieldDescription = document.getElementById("fieldDescription");
    const fieldPrice       = document.getElementById("fieldPrice");
    const fieldWeight      = document.getElementById("fieldWeight");
    const fieldCategory    = document.getElementById("fieldCategory");
    const fieldIsActive    = document.getElementById("fieldIsActive");
    const fieldIsPreorder  = document.getElementById("fieldIsPreorder");
    const tagSelectContainer = document.getElementById("tagSelectContainer");
    const formError1       = document.getElementById("formError1");

    // ── Form fields step 2 ───────────────────────────────────────────────────────
    const imageUploadInput  = document.getElementById("imageUploadInput");
    const imagePreviewList  = document.getElementById("imagePreviewList");
    const formError2        = document.getElementById("formError2");
    let uploadedImages      = [];   // { url, alt_text, is_primary, sort_order, file? }

    // ── Form fields step 3 ───────────────────────────────────────────────────────
    const variantTableBody = document.getElementById("variantTableBody");
    const addVariantRow    = document.getElementById("addVariantRow");
    const formError3       = document.getElementById("formError3");

    // ── Dialogs ──────────────────────────────────────────────────────────────────
    const catField  = document.getElementById("catField");
    const addCatBtn = document.getElementById("addCat");
    const tagField  = document.getElementById("tagField");
    const addTagBtn = document.getElementById("addTag");

    // =============================================================================
    // ON LOAD
    // =============================================================================
    window.addEventListener("load", async () => {
        document.querySelectorAll(".dropdownValueContainer").forEach(trigger => {
            trigger.addEventListener("click", () => {
                const container = trigger.closest(".dropdownContainer");
                const dropdown  = container.querySelector(".dropdownOptionsContainer");
                const arrow     = container.querySelector(".arrowDropDown");
                const isOpen    = dropdown.style.maxHeight && dropdown.style.maxHeight !== "0px";

                document.querySelectorAll(".dropdownOptionsContainer").forEach(d => d.style.maxHeight = null);
                document.querySelectorAll(".arrowDropDown").forEach(a => a.classList.remove("clicked"));

                if (!isOpen) {
                    dropdown.style.maxHeight = dropdown.scrollHeight + "px";
                    arrow.classList.add("clicked");
                }
            });
        });
        await Promise.all([loadCategories(), loadTags()]);
        fetchProducts();

        // ── Search ───────────────────────────────────────────────────────────────
        searchInput.addEventListener("input", handleSuggestions);
        searchInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") { e.preventDefault(); hideSuggestions(); triggerSearch(searchInput.value.trim()); }
        });
        searchButton.addEventListener("click", () => { hideSuggestions(); triggerSearch(searchInput.value.trim()); });
        document.addEventListener("click", (e) => { if (!e.target.closest(".search-box")) hideSuggestions(); });

        // ── Content nav filters ──────────────────────────────────────────────────
        document.getElementById("filterActive").addEventListener("click",   (e) => { e.preventDefault(); setFilter("active");    });
        document.getElementById("filterInactive").addEventListener("click", (e) => { e.preventDefault(); setFilter("inactive");  });
        document.getElementById("filterPreorder").addEventListener("click", (e) => { e.preventDefault(); setFilter("preorder");  });
        document.getElementById("filterNoStock").addEventListener("click",  (e) => { e.preventDefault(); setFilter("nostock");   });

        // ── Slug auto-gen from name ──────────────────────────────────────────────
        fieldName.addEventListener("input", () => {
            if (!fieldSlug.dataset.manual) {
                fieldSlug.value = slugify(fieldName.value);
            }
        });
        fieldSlug.addEventListener("input", () => {
            fieldSlug.dataset.manual = "true";
            if (!fieldSlug.value.trim()) delete fieldSlug.dataset.manual;
        });

        // ── Image upload ─────────────────────────────────────────────────────────
        imageUploadInput.addEventListener("change", handleImageSelect);

        // ── Add variant row ──────────────────────────────────────────────────────
        addVariantRow.addEventListener("click", appendVariantRow);

        // ── Category dialog ──────────────────────────────────────────────────────
        addCatBtn.addEventListener("click", handleAddCategory);
        catField.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); handleAddCategory(); } });

        // ── Tag dialog ───────────────────────────────────────────────────────────
        addTagBtn.addEventListener("click", handleAddTag);
        tagField.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); handleAddTag(); } });
    });

    // =============================================================================
    // SLUG HELPER
    // =============================================================================
    function slugify(str) {
        return str.toLowerCase().trim()
            .replace(/[^a-z0-9\s-]/g, "")
            .replace(/\s+/g, "-")
            .replace(/-+/g, "-");
    }

    // =============================================================================
    // LOAD CATEGORIES & TAGS (for dropdowns + filter nav)
    // =============================================================================
    async function loadCategories() {
        try {
            const res  = await fetch("/api/admin/categories", { credentials: "include" });
            const data = await res.json();
            if (!res.ok) return;
            categories = data.categories;
            renderCategoryNav();
            renderCategoryDropdown();
            renderCategoryDialog();   // ← add this
        } catch (err) { console.error("[loadCategories]", err); }
    }
    async function loadTags() {
        try {
            const res  = await fetch("/api/admin/tags", { credentials: "include" });
            const data = await res.json();
            if (!res.ok) return;
            tags = data.tags;
            renderTagNav();
            renderTagDialog();   // ← add this
            renderTagSelect();
        } catch (err) { console.error("[loadTags]", err); }
    }

    // ── Category nav (content nav dropdown) ──────────────────────────────────────
    function renderCategoryNav() {
        const container = document.getElementById("catFilterOptions");
        container.innerHTML = "";
        const allDiv = document.createElement("div");
        allDiv.className   = "dropdownOptions";
        allDiv.textContent = "All";
        allDiv.addEventListener("click", () => { setCategoryFilter(null); document.querySelector("#catFilterValue").textContent = "Categories"; });
        container.appendChild(allDiv);

        categories.forEach(cat => {
            const div = document.createElement("div");
            div.className   = "dropdownOptions";
            div.textContent = cat.name;
            div.addEventListener("click", () => {
                setCategoryFilter(cat._id);
                document.querySelector("#catFilterValue").textContent = cat.name;
            });
            container.appendChild(div);
        });
    }

    // ── Tag nav ───────────────────────────────────────────────────────────────────
    function renderTagNav() {
        const container = document.getElementById("tagFilterOptions");
        container.innerHTML = "";
        const allDiv = document.createElement("div");
        allDiv.className   = "dropdownOptions";
        allDiv.textContent = "All";
        allDiv.addEventListener("click", () => { setTagFilter(null); document.querySelector("#tagFilterValue").textContent = "Tags"; });
        container.appendChild(allDiv);

        tags.forEach(tag => {
            const div = document.createElement("div");
            div.className   = "dropdownOptions";
            div.textContent = tag.name;
            div.addEventListener("click", () => {
                setTagFilter(tag._id);
                document.querySelector("#tagFilterValue").textContent = tag.name;
            });
            container.appendChild(div);
        });
    }

    // ── Category dropdown in form ─────────────────────────────────────────────────
    function renderCategoryDropdown() {
        fieldCategory.innerHTML = `<option value="">-- Select Category --</option>`;
        categories.forEach(cat => {
            fieldCategory.innerHTML += `<option value="${cat._id}">${cat.name}</option>`;
        });
    }

    // ── Tag multi-select in form ──────────────────────────────────────────────────
    function renderTagSelect() {
        tagSelectContainer.innerHTML = "";
        tags.forEach(tag => {
            const label = document.createElement("label");
            label.className = "tagCheckbox";
            label.innerHTML = `<input type="checkbox" value="${tag._id}" data-name="${tag.name}"> ${tag.name}`;
            tagSelectContainer.appendChild(label);
        });
    }

    // =============================================================================
    // FILTER
    // =============================================================================
    function setFilter(filter) {
        activeFilter = activeFilter === filter ? null : filter;
        updateFilterIndicators();
        const q = searchInput.value.trim();
        q ? triggerSearch(q, 1) : fetchProducts(1);
    }

    function setCategoryFilter(catId) {
        activeCategory = catId;
        const q = searchInput.value.trim();
        q ? triggerSearch(q, 1) : fetchProducts(1);
    }

    function setTagFilter(tagId) {
        activeTag = tagId;
        const q = searchInput.value.trim();
        q ? triggerSearch(q, 1) : fetchProducts(1);
    }

    function updateFilterIndicators() {
        ["filterActive", "filterInactive", "filterPreorder", "filterNoStock"].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.querySelector(".underline")?.classList.remove("active-nav");
        });
        const map = { active: "filterActive", inactive: "filterInactive", preorder: "filterPreorder", nostock: "filterNoStock" };
        if (activeFilter && map[activeFilter]) {
            document.getElementById(map[activeFilter])?.querySelector(".underline")?.classList.add("active-nav");
        }
    }

    // ── Build filter query string ─────────────────────────────────────────────────
    function buildFilterQuery() {
        let q = "";
        if (activeFilter === "active")   q += "&active=true";
        if (activeFilter === "inactive") q += "&active=false";
        if (activeFilter === "preorder") q += "&preorder=true";
        if (activeFilter === "nostock")  q += "&stock=outofstock";
        if (activeCategory)              q += `&category=${activeCategory}`;
        if (activeTag)                   q += `&tag=${activeTag}`;
        return q;
    }

    // =============================================================================
    // FETCH PRODUCTS
    // =============================================================================
    async function fetchProducts(page = 1) {
        try {
            const url  = `/api/admin/products?page=${page}&limit=${limit}${buildFilterQuery()}`;
            const res  = await fetch(url, { credentials: "include" });
            const data = await res.json();
            if (!res.ok) return console.error(data.message);
            renderProducts(data.products);
            renderShowMore(data.pagination);
            currentPage = page;
        } catch (err) { console.error("[fetchProducts]", err); }
    }

    // =============================================================================
    // SEARCH
    // =============================================================================
    async function triggerSearch(q, page = 1) {
        if (!q && !activeFilter && !activeCategory && !activeTag) return fetchProducts(page);
        try {
            let url = `/api/admin/products/search?page=${page}&limit=${limit}${buildFilterQuery()}`;
            if (q) url += `&q=${encodeURIComponent(q)}`;
            const res  = await fetch(url, { credentials: "include" });
            const data = await res.json();
            if (!res.ok) return console.error(data.message);
            renderProducts(data.products);
            renderShowMore(data.pagination);
            currentPage = page;
        } catch (err) { console.error("[triggerSearch]", err); }
    }

    function handleSuggestions(e) {
        clearTimeout(searchTimeout);
        const q = e.target.value.trim();
        if (!q) { hideSuggestions(); fetchProducts(1); return; }
        searchTimeout = setTimeout(async () => {
            try {
                const res  = await fetchWithAbort(`/api/admin/products/search?q=${encodeURIComponent(q)}&page=1&limit=5`);
                const data = await res.json();
                if (!res.ok || !data.products.length) return hideSuggestions();
                showSuggestions(data.products, q);
            } catch (err) { if (err.name === "AbortError") return; }
        }, 400);
    }

    function showSuggestions(products, q) {
        suggestions.innerHTML = "";
        products.forEach(p => {
            const li    = document.createElement("li");
            const regex = new RegExp(`(${q})`, "gi");
            li.innerHTML = p.name.replace(regex, `<strong>$1</strong>`);
            li.addEventListener("click", () => {
                searchInput.value = p.name;
                hideSuggestions();
                triggerSearch(p.name);
            });
            suggestions.appendChild(li);
        });
        suggestions.classList.add("show");
    }

    function hideSuggestions() {
        suggestions.classList.remove("show");
        suggestions.innerHTML = "";
    }

    function fetchWithAbort(url) {
        if (abortController) abortController.abort();
        abortController = new AbortController();
        return fetch(url, { credentials: "include", signal: abortController.signal });
    }

    // =============================================================================
    // RENDER PRODUCTS
    // =============================================================================
    function renderProducts(products) {
        const wrapper = document.querySelector(".mainContentWrapper");
        wrapper.innerHTML = "";

        if (!products.length) {
            wrapper.innerHTML = `<p style="text-align:center;color:#000;">No products found.</p>`;
            return;
        }

        products.forEach(product => {
            const primaryImg = product.images?.find(i => i.is_primary) || product.images?.[0];
            const imgSrc     = primaryImg?.url || "../../assets/employeeIcon.png";
            const category   = product.category_id?.name || "—";
            const price      = `₱${Number(product.base_price).toLocaleString()}`;
            const inStock    = product.total_stock > 0;

            const card = document.createElement("div");
            card.className           = "cardContainer";
            card.dataset.productid   = product._id;
            card.dataset.productname = product.name;

            card.innerHTML = `
                <div class="image-container">
                    <img src="${imgSrc}" alt="${product.name}" onerror="this.src='../../assets/employeeIcon.png'">
                </div>
                <div class="productLabel">
                    <h5 class="productName">${product.name}</h5>
                    <p><span class="priceAndCategory">${price} · ${category}</span></p>
                    <p class="productTags">
                        ${product.is_active
                            ? `<span class="badge-active">Active</span>`
                            : `<span class="badge-inactive">Inactive</span>`}
                        ${product.is_preorder ? `<span class="badge-preorder">Preorder</span>` : ""}
                        ${!inStock ? `<span class="badge-nostock">No Stock</span>` : ""}
                        ${product.tag_names?.map(t => `<span class="badge-tag">${t}</span>`).join("") || ""}
                    </p>
                </div>
                <div class="cardWrapper">
                    <button onclick="handleAction(this,'edit')"   class="btn edit">Edit</button>
                    <button onclick="handleAction(this,'toggle')" class="btn toggle">Toggle</button>
                    <button onclick="handleAction(this,'delete')" class="btn delete">Delete</button>
                </div>
            `;
            wrapper.appendChild(card);
        });
    }

    // =============================================================================
    // SHOW MORE
    // =============================================================================
    function renderShowMore(pagination) {
        const container = document.getElementById("showMoreContainer");
        if (!pagination.has_next) { container.style.display = "none"; return; }

        container.style.display = "block";
        const btn    = document.getElementById("showMore");
        const newBtn = btn.cloneNode(true);
        btn.replaceWith(newBtn);

        document.getElementById("showMore").addEventListener("click", async () => {
            const nextPage = currentPage + 1;
            const q        = searchInput.value.trim();
            try {
                let url = q || activeFilter || activeCategory || activeTag
                    ? `/api/admin/products/search?page=${nextPage}&limit=${limit}${buildFilterQuery()}`
                    : `/api/admin/products?page=${nextPage}&limit=${limit}`;
                if (q) url += `&q=${encodeURIComponent(q)}`;
                const res  = await fetch(url, { credentials: "include" });
                const data = await res.json();
                if (!res.ok) return;
                appendProducts(data.products);
                currentPage = nextPage;
                renderShowMore(data.pagination);
            } catch (err) { console.error("[showMore]", err); }
        });
    }

    function appendProducts(products) {
        const wrapper = document.querySelector(".mainContentWrapper");
        products.forEach(product => {
            const primaryImg = product.images?.find(i => i.is_primary) || product.images?.[0];
            const imgSrc     = primaryImg?.url || "../../assets/employeeIcon.png";
            const category   = product.category_id?.name || "—";
            const price      = `₱${Number(product.base_price).toLocaleString()}`;
            const inStock    = product.total_stock > 0;

            const card = document.createElement("div");
            card.className           = "cardContainer";
            card.dataset.productid   = product._id;
            card.dataset.productname = product.name;

            card.innerHTML = `
                <div class="image-container">
                    <img src="${imgSrc}" alt="${product.name}" onerror="this.src='../../assets/employeeIcon.png'">
                </div>
                <div class="productLabel">
                    <h5 class="productName">${product.name}</h5>
                    <p><span class="priceAndCategory">${price} · ${category}</span></p>
                    <p class="productTags">
                        ${product.is_active
                            ? `<span class="badge-active">Active</span>`
                            : `<span class="badge-inactive">Inactive</span>`}
                        ${product.is_preorder ? `<span class="badge-preorder">Preorder</span>` : ""}
                        ${!inStock ? `<span class="badge-nostock">No Stock</span>` : ""}
                        ${product.tag_names?.map(t => `<span class="badge-tag">${t}</span>`).join("") || ""}
                    </p>
                </div>
                <div class="cardWrapper">
                    <button onclick="handleAction(this,'edit')"   class="btn edit">Edit</button>
                    <button onclick="handleAction(this,'toggle')" class="btn toggle">Toggle</button>
                    <button onclick="handleAction(this,'delete')" class="btn delete">Delete</button>
                </div>
            `;
            wrapper.appendChild(card);
        });
    }

    // =============================================================================
    // CARD ACTIONS
    // =============================================================================
    async function handleAction(btn, action) {
        const card = btn.closest(".cardContainer");
        currentProductId = card.dataset.productid;
        currentAction    = action.toLowerCase();

        if (currentAction === "edit") {
            await openEditForm(currentProductId);
        } else if (currentAction === "toggle") {
            await handleToggle(currentProductId);
        } else if (currentAction === "delete") {
            await handleDelete(currentProductId, card);
        }
    }

    async function handleToggle(id) {
        try {
            const res  = await fetch(`/api/admin/products/${id}/toggle`, {
                method: "PUT", credentials: "include",
            });
            const data = await res.json();
            if (!res.ok) return console.error(data.message);
            fetchProducts(currentPage);
        } catch (err) { console.error("[handleToggle]", err); }
    }

    async function handleDelete(id, card) {
        if (!confirm("Delete this product? This cannot be undone.")) return;
        try {
            const res  = await fetch(`/api/admin/products/${id}`, {
                method: "DELETE", credentials: "include",
            });
            const data = await res.json();
            if (!res.ok) return console.error(data.message);
            card.remove();
        } catch (err) { console.error("[handleDelete]", err); }
    }

    // =============================================================================
    // OPEN FORM
    // =============================================================================
    addBtn.addEventListener("click", () => {
        formMode = "create";
        resetForm();
        formWrapperStep1.classList.add("show");
    });

    async function openEditForm(id) {
        try {
            const res  = await fetch(`/api/admin/products/${id}`, { credentials: "include" });
            const data = await res.json();
            if (!res.ok) return console.error(data.message);
            formMode = "edit";
            populateForm(data.product);
            formWrapperStep1.classList.add("show");
        } catch (err) { console.error("[openEditForm]", err); }
    }

    function resetForm() {
        fieldName.value        = "";
        fieldSlug.value        = "";
        fieldDescription.value = "";
        fieldPrice.value       = "";
        fieldWeight.value      = "";
        fieldCategory.value    = "";
        fieldIsActive.checked  = true;
        fieldIsPreorder.checked = false;
        delete fieldSlug.dataset.manual;
        uploadedImages         = [];
        variantList            = [];
        renderImagePreviews();
        renderVariantRows();
        clearFormErrors();
        // uncheck all tags
        tagSelectContainer.querySelectorAll("input[type=checkbox]").forEach(cb => cb.checked = false);
    }

    function populateForm(product) {
        fieldName.value         = product.name        || "";
        fieldSlug.value         = product.slug        || "";
        fieldDescription.value  = product.description || "";
        fieldPrice.value        = product.base_price  || "";
        fieldWeight.value       = product.weight_grams || "";
        fieldCategory.value     = product.category_id?._id || product.category_id || "";
        fieldIsActive.checked   = product.is_active;
        fieldIsPreorder.checked = product.is_preorder;
        fieldSlug.dataset.manual = "true";

        // tags
        const selectedTagIds = (product.tag_ids || []).map(t => t._id || t);
        tagSelectContainer.querySelectorAll("input[type=checkbox]").forEach(cb => {
            cb.checked = selectedTagIds.includes(cb.value);
        });

        // images
        uploadedImages = (product.images || []).map(img => ({
            url:        img.url,
            alt_text:   img.alt_text || "",
            is_primary: img.is_primary,
            sort_order: img.sort_order,
        }));
        renderImagePreviews();

        // variants
        variantList = (product.variants || [])
            .filter(v => !v.deleted_at)
            .map(v => ({
                _id:            v._id,
                sku:            v.sku,
                size:           v.size,
                color:          v.color,
                stock:          v.stock,
                price_modifier: v.price_modifier,
                is_active:      v.is_active,
            }));
        renderVariantRows();
        clearFormErrors();
    }

    // =============================================================================
    // FORM NAV — steps
    // =============================================================================
    closeForm.addEventListener("click", () => {
        formWrapperStep1.classList.remove("show");
        formWrapperStep2.classList.remove("show");
        formWrapperStep3.classList.remove("show");
    });

    nextToStep2.addEventListener("click", () => {
        if (!validateStep1()) return;
        formWrapperStep2.classList.add("show");
    });

    backToStep1.addEventListener("click", () => {
        formWrapperStep2.classList.remove("show");
    });

    nextToStep3.addEventListener("click", () => {
        formWrapperStep3.classList.add("show");
    });

    backToStep2.addEventListener("click", () => {
        formWrapperStep3.classList.remove("show");
    });

    submitProductRegistration.addEventListener("click", async () => {
        if (!validateStep1()) {
            formWrapperStep3.classList.remove("show");
            formWrapperStep2.classList.remove("show");
            return;
        }
        await submitForm();
    });

    // =============================================================================
    // VALIDATION
    // =============================================================================
    function validateStep1() {
        clearFormErrors();
        if (!fieldName.value.trim()) {
            showFormError(formError1, "Product name is required.");
            return false;
        }
        if (!fieldPrice.value || isNaN(fieldPrice.value) || Number(fieldPrice.value) < 0) {
            showFormError(formError1, "A valid base price is required.");
            return false;
        }
        if (!fieldCategory.value) {
            showFormError(formError1, "Please select a category.");
            return false;
        }
        return true;
    }

    // =============================================================================
    // IMAGES — step 2
    // =============================================================================
    function handleImageSelect(e) {
        const files = Array.from(e.target.files);
        files.forEach(file => {
            const reader = new FileReader();
            reader.onload = (ev) => {
                uploadedImages.push({
                    url:        ev.target.result,   // local preview — replaced by ImageKit URL on submit
                    alt_text:   "",
                    is_primary: uploadedImages.length === 0,   // first image = primary
                    sort_order: uploadedImages.length,
                    file,
                });
                renderImagePreviews();
            };
            reader.readAsDataURL(file);
        });
        e.target.value = "";   // reset so same file can be re-added
    }

    function renderImagePreviews() {
        imagePreviewList.innerHTML = "";
        uploadedImages.forEach((img, i) => {
            const item = document.createElement("div");
            item.className = "imagePreviewItem";
            item.innerHTML = `
                <img src="${img.url}" alt="preview">
                <button type="button" class="imgRemoveBtn" onclick="removeImage(${i})">✕</button>
                <button type="button" class="imgPrimaryBtn ${img.is_primary ? 'is-primary' : ''}"
                    onclick="setPrimaryImage(${i})" title="Set as primary">★</button>
            `;
            imagePreviewList.appendChild(item);
        });
    }

    // Expose image helper functions globally
    window.removeImage = function(i) {
        uploadedImages.splice(i, 1);
        uploadedImages.forEach((img, idx) => img.sort_order = idx);
        if (!uploadedImages.some(img => img.is_primary) && uploadedImages.length) {
            uploadedImages[0].is_primary = true;
        }
        renderImagePreviews();
    };

    window.setPrimaryImage = function(i) {
        uploadedImages.forEach((img, idx) => img.is_primary = idx === i);
        renderImagePreviews();
    };

    async function uploadImagesToImageKit() {
        const uploaded = [];
        for (const img of uploadedImages) {
            if (!img.file) {
                // already a URL (edit mode, existing image)
                uploaded.push({ url: img.url, alt_text: img.alt_text, is_primary: img.is_primary, sort_order: img.sort_order });
                continue;
            }
            try {
                const authRes  = await fetch("/api/auth/upload", { credentials: "include" });
                const authData = await authRes.json();

                const form = new FormData();
                form.append("file",              img.file);
                form.append("fileName",          img.file.name);
                form.append("publicKey",         authData.publicKey);
                form.append("signature",         authData.signature);
                form.append("expire",            authData.expire);
                form.append("token",             authData.token);
                form.append("folder",            "/StreetFlex/products");
                form.append("useUniqueFileName", "true");

                const uploadRes  = await fetch("https://upload.imagekit.io/api/v1/files/upload", {
                    method: "POST", headers: { Accept: "application/json" }, body: form,
                });
                const uploadData = await uploadRes.json();
                if (!uploadRes.ok) throw new Error(uploadData.message);

                uploaded.push({ url: uploadData.url, alt_text: img.alt_text, is_primary: img.is_primary, sort_order: img.sort_order });
            } catch (err) {
                console.error("[uploadImagesToImageKit]", err);
                showFormError(formError2, `Image upload failed: ${err.message}`);
                return null;
            }
        }
        return uploaded;
    }

    // =============================================================================
    // VARIANTS — step 3
    // =============================================================================
    function appendVariantRow(data = {}) {
        const row = document.createElement("tr");
        row.className = "variantRow";
        row.innerHTML = `
            <td><input type="text"   class="vSku"   value="${data.sku   || ""}" placeholder="SKU-001"></td>
            <td><input type="text"   class="vSize"  value="${data.size  || ""}" placeholder="M"></td>
            <td><input type="text"   class="vColor" value="${data.color || ""}" placeholder="Black"></td>
            <td><input type="number" class="vStock" value="${data.stock ?? 0}"  min="0"></td>
            <td><input type="number" class="vMod"   value="${data.price_modifier ?? 0}"></td>
            <td><input type="checkbox" class="vActive" ${data.is_active !== false ? "checked" : ""}></td>
            <td><button type="button" onclick="removeVariantRow(this)" class="btn delete" style="padding:2px 8px">✕</button></td>
        `;
        variantTableBody.appendChild(row);
    }

    window.removeVariantRow = function(btn) {
        btn.closest("tr").remove();
    };

    function renderVariantRows() {
        variantTableBody.innerHTML = "";
        variantList.forEach(v => appendVariantRow(v));
    }

    function collectVariants() {
        const rows     = variantTableBody.querySelectorAll(".variantRow");
        const variants = [];

        for (const [i, row] of [...rows].entries()) {
            const sku   = row.querySelector(".vSku").value.trim();
            const size  = row.querySelector(".vSize").value.trim();
            const color = row.querySelector(".vColor").value.trim();

            if (!sku || !size || !color) {
                showFormError(formError3, `Variant row ${i + 1} is missing SKU, size, or color.`);
                return null;
            }
            variants.push({
                sku, size, color,
                stock:          parseInt(row.querySelector(".vStock").value)  || 0,
                price_modifier: parseFloat(row.querySelector(".vMod").value)  || 0,
                is_active:      row.querySelector(".vActive").checked,
            });
        }
        return variants;
    }

    // =============================================================================
    // SUBMIT FORM
    // =============================================================================
    async function submitForm() {
        clearFormErrors();

        // upload images first
        const images = await uploadImagesToImageKit();
        if (images === null) return;  // upload failed, error already shown

        // collect variants
        const variants = collectVariants();
        if (variants === null) {
            showFormError(formError3, "Each variant needs SKU, size, and color.");
            return;
        }

        // collect tag_ids
        const tag_ids = Array.from(tagSelectContainer.querySelectorAll("input[type=checkbox]:checked"))
            .map(cb => cb.value);

        const body = {
            name:         fieldName.value.trim(),
            slug:         fieldSlug.value.trim() || undefined,
            description:  fieldDescription.value.trim(),
            base_price:   Number(fieldPrice.value),
            weight_grams: fieldWeight.value ? Number(fieldWeight.value) : undefined,
            category_id:  fieldCategory.value,
            is_active:    fieldIsActive.checked,
            is_preorder:  fieldIsPreorder.checked,
            tag_ids,
            images,
            variants,
        };

        try {
            const url    = formMode === "edit"
                ? `/api/admin/products/${currentProductId}`
                : `/api/admin/products`;
            const method = formMode === "edit" ? "PUT" : "POST";

            const res  = await fetch(url, {
                method,
                credentials: "include",
                headers:     { "Content-Type": "application/json" },
                body:        JSON.stringify(body),
            });
            const data = await res.json();

            if (!res.ok) {
                showFormError(formError3, data.message);
                return;
            }

            // close all form panels and refresh
            formWrapperStep1.classList.remove("show");
            formWrapperStep2.classList.remove("show");
            formWrapperStep3.classList.remove("show");
            fetchProducts(currentPage);

        } catch (err) {
            console.error("[submitForm]", err);
            showFormError(formError3, "Network error. Please try again.");
        }
    }

    // =============================================================================
    // CATEGORY DIALOG
    // =============================================================================
    async function handleAddCategory() {
        const name = catField.value.trim();
        if (!name) return;
        try {
            const res  = await fetch("/api/admin/categories", {
                method: "POST", credentials: "include",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify({ name }),
            });
            const data = await res.json();
            if (!res.ok) return alert(data.message);
            catField.value = "";
            categories.push(data.category);
            renderCategoryNav();
            renderCategoryDropdown();
            renderCategoryDialog();
        } catch (err) { console.error("[handleAddCategory]", err); }
    }

    function renderCategoryDialog() {
        const content = document.querySelector(".dialog1");
        content.innerHTML = "";
        categories.forEach(cat => {
            const label = document.createElement("label");
            label.innerHTML = `
                <input type="text" value="${cat.name}" disabled>
                <button type="button" onclick="handleCatDialogAction(this,'editCat')"    class="dialogEditBtn difHide">Edit</button>
                <button type="button" onclick="handleCatDialogAction(this,'deleteCat')"  class="dialogDeleteBtn difHide">Delete</button>
                <button type="button" onclick="handleCatDialogAction(this,'cancelEdit')" class="dialogCancelBtn editHide hide">Cancel</button>
                <button type="button" onclick="handleCatDialogAction(this,'doneEdit')"   class="dialogDoneBtn editHide hide" data-id="${cat._id}">Done</button>
            `;
            content.appendChild(label);
        });
    }

    window.handleCatDialogAction = async function(button, action) {
        const row       = button.closest("label");
        const input     = row.querySelector("input");
        const editBtns  = row.querySelectorAll(".difHide");
        const actionBtns = row.querySelectorAll(".editHide");

        if (action === "editCat") {
            input.dataset.original = input.value;   // ← store before editing
            input.disabled = false;
            input.focus();
            editBtns.forEach(b => b.classList.add("hide"));
            actionBtns.forEach(b => b.classList.remove("hide"));

        } else if (action === "cancelEdit") {
            input.value    = input.dataset.original || input.value;  // ← restore
            input.disabled = true;
            editBtns.forEach(b => b.classList.remove("hide"));
            actionBtns.forEach(b => b.classList.add("hide"));

        } else if (action === "doneEdit") {
            const id   = button.dataset.id;
            const name = input.value.trim();
            if (!name) return;
            try {
                console.log(id);
                const res  = await fetch(`/api/admin/categories/${id}`, {
                    method: "PUT", credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body:    JSON.stringify({ name }),
                });
                const data = await res.json();
                if (!res.ok) return alert(data.message);
                input.disabled = true;
                editBtns.forEach(b => b.classList.remove("hide"));
                actionBtns.forEach(b => b.classList.add("hide"));
                const cat = categories.find(c => c._id === id);
                if (cat) cat.name = name;
                renderCategoryNav();
                renderCategoryDropdown();
            } catch (err) { console.error("[doneEdit]", err); }

        } else if (action === "deleteCat") {
            const id = button.dataset.id || row.querySelector(".dialogDoneBtn")?.dataset.id;
            if (!confirm("Delete this category?")) return;
            try {
                const res  = await fetch(`/api/admin/categories/${id}`, {
                    method: "DELETE", credentials: "include",
                });
                const data = await res.json();
                if (!res.ok) return alert(data.message);
                categories = categories.filter(c => c._id !== id);
                renderCategoryDialog();
                renderCategoryNav();
                renderCategoryDropdown();
            } catch (err) { console.error("[deleteCat]", err); }
        }
    };

    // =============================================================================
    // TAG DIALOG
    // =============================================================================
    async function handleAddTag() {
        const name = tagField.value.trim();
        if (!name) return;
        try {
            const res  = await fetch("/api/admin/tags", {
                method: "POST", credentials: "include",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify({ name }),
            });
            const data = await res.json();
            if (!res.ok) return alert(data.message);
            tagField.value = "";
            tags.push(data.tag);
            renderTagNav();
            renderTagDialog();
            renderTagSelect();
        } catch (err) { console.error("[handleAddTag]", err); }
    }

    function renderTagDialog() {
        const content = document.querySelector(".dialog2");
        content.innerHTML = "";
        tags.forEach(tag => {
            const span = document.createElement("span");
            span.className = "spanTags";
            span.innerHTML = `${tag.name} <i class="fa-solid fa-x" onclick="handleDeleteTag('${tag._id}', '${tag.name}', this)"></i>`;
            content.appendChild(span);
        });
    }

    window.handleDeleteTag = async function(id, name, iconEl) {
        if (!confirm(`Delete tag "${name}"? It will be removed from all products.`)) return;
        try {
            const res  = await fetch(`/api/admin/tags/${id}`, {
                method: "DELETE", credentials: "include",
            });
            const data = await res.json();
            if (!res.ok) return alert(data.message);
            tags = tags.filter(t => t._id !== id);
            renderTagDialog();
            renderTagNav();
            renderTagSelect();
        } catch (err) { console.error("[handleDeleteTag]", err); }
    };

    // =============================================================================
    // ERROR HELPERS
    // =============================================================================
    function showFormError(el, msg) {
        el.textContent   = msg;
        el.style.display = "block";
    }
    function clearFormErrors() {
        [formError1, formError2, formError3].forEach(el => {
            el.textContent   = "";
            el.style.display = "none";
        });
    }

    // Expose the main card action function globally
    window.handleAction = handleAction;
})();
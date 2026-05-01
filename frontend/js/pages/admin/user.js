// js/pages/admin/user.js

// =============================================================================
// STATE
// =============================================================================
let currentAction  = null;
let currentUserId  = null;
let currentPage    = 1;
const limit        = 20;
let searchTimeout  = null;
let abortController = null;
let activeFilter   = null;   // "admin" | "customer" | "banned" | null

// =============================================================================
// ON LOAD
// =============================================================================
window.addEventListener("load", () => {
    fetchUsers();

    // ── Search input — suggestions on type ──────────────────────────────────
    document.getElementById("search").addEventListener("input", handleSuggestions);

    // ── Enter key — full search ──────────────────────────────────────────────
    document.getElementById("search").addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            hideSuggestions();
            triggerSearch(document.getElementById("search").value.trim());
        }
    });

    // ── Search icon click — full search ─────────────────────────────────────
    document.getElementById("searchButton").addEventListener("click", () => {
        hideSuggestions();
        triggerSearch(document.getElementById("search").value.trim());
    });

    // ── Filter buttons ───────────────────────────────────────────────────────
    document.getElementById("adminBtn").addEventListener("click",      (e) => { e.preventDefault(); setFilter("admin");    });
    document.getElementById("customerBtn").addEventListener("click",   (e) => { e.preventDefault(); setFilter("customer"); });
    document.getElementById("bannedUserBtn").addEventListener("click", (e) => { e.preventDefault(); setFilter("banned");   });

    // ── Click outside suggestions — close ───────────────────────────────────
    document.addEventListener("click", (e) => {
        if (!e.target.closest(".search-box")) hideSuggestions();
    });
});

// =============================================================================
// FETCH USERS (paginated)
// =============================================================================
async function fetchUsers(page = 1) {
    try {
        let url = `/api/admin/users?page=${page}&limit=${limit}`;
        if (activeFilter === "banned")        url += `&banned=true`;
        else if (activeFilter === "admin")    url += `&role=admin`;
        else if (activeFilter === "customer") url += `&role=customer`;

        const res  = await fetch(url, { credentials: "include" });
        const data = await res.json();
        if (!res.ok) return showGlobalError(data.message);
        renderUsers(data.users);
        renderShowMore(data.pagination);   // ← changed
        currentPage = page;
    } catch (err) {
        console.error("[fetchUsers]", err);
        showGlobalError("Network error. Could not load users.");
    }
}

async function triggerSearch(q, page = 1) {
    if (!q && !activeFilter) return fetchUsers(page);
    try {
        let url = `/api/admin/users/search?page=${page}&limit=${limit}`;
        if (q)                                url += `&q=${encodeURIComponent(q)}`;
        if (activeFilter === "banned")        url += `&banned=true`;
        else if (activeFilter === "admin")    url += `&role=admin`;
        else if (activeFilter === "customer") url += `&role=customer`;

        const res  = await fetch(url, { credentials: "include" });
        const data = await res.json();
        if (!res.ok) return showGlobalError(data.message);
        renderUsers(data.users);
        renderShowMore(data.pagination);   // ← changed
        currentPage = page;
    } catch (err) {
        console.error("[triggerSearch]", err);
    }
}

// =============================================================================
// FILTER
// =============================================================================
function setFilter(filter) {
    activeFilter = activeFilter === filter ? null : filter;
    updateFilterIndicators();
    const q = document.getElementById("search").value.trim();
    // use fetchUsers for no-query filter, triggerSearch only when query exists
    if (!q) {
        fetchUsers(1);
    } else {
        triggerSearch(q, 1);
    }
}

function updateFilterIndicators() {
    // remove active-nav from all filter buttons first
    document.getElementById("adminBtn").querySelector(".underline").classList.remove("active-nav");
    document.getElementById("customerBtn").querySelector(".underline").classList.remove("active-nav");
    document.getElementById("bannedUserBtn").querySelector(".underline").classList.remove("active-nav");

    // apply to whichever is currently active
    if (activeFilter === "admin")    document.getElementById("adminBtn").querySelector(".underline").classList.add("active-nav");
    if (activeFilter === "customer") document.getElementById("customerBtn").querySelector(".underline").classList.add("active-nav");
    if (activeFilter === "banned")   document.getElementById("bannedUserBtn").querySelector(".underline").classList.add("active-nav");
}


// =============================================================================
// SUGGESTIONS  (lightweight — only fires on input, returns names only)
// =============================================================================
function handleSuggestions(e) {
    clearTimeout(searchTimeout);
    const q = e.target.value.trim();

    if (!q) {
        hideSuggestions();
        activeFilter ? fetchUsers(1) : fetchUsers(1);  // fetchUsers already checks activeFilter
        return;
    }

    searchTimeout = setTimeout(async () => {
        try {
            // fetchWithAbort ONLY here — suggestions are the rapid-fire case
            const res  = await fetchWithAbort(`/api/admin/users/search?q=${encodeURIComponent(q)}&page=1&limit=5`);
            const data = await res.json();
            if (!res.ok || !data.users.length) return hideSuggestions();
            showSuggestions(data.users, q);
        } catch (err) {
            if (err.name === "AbortError") return;
            console.error("[handleSuggestions]", err);
        }
    }, 400);
}

function showSuggestions(users, q) {
    const list = document.getElementById("suggestions");
    list.innerHTML = "";

    users.forEach(user => {
        const name = user.profile?.display_name || user.email || "—";
        const li   = document.createElement("li");

        // highlight matching part
        const regex     = new RegExp(`(${q})`, "gi");
        li.innerHTML    = name.replace(regex, `<strong>$1</strong>`);
        li.addEventListener("click", () => {
            document.getElementById("search").value = name;
            hideSuggestions();
            triggerSearch(name);
        });
        list.appendChild(li);
    });

    list.classList.add("show");
}

function hideSuggestions() {
    const list = document.getElementById("suggestions");
    list.classList.remove("show");
    list.innerHTML = "";
}

// =============================================================================
// ABORT CONTROLLER
// =============================================================================
function fetchWithAbort(url) {
    if (abortController) abortController.abort();
    abortController = new AbortController();
    return fetch(url, {
        credentials: "include",
        signal:      abortController.signal,
    });
}

// =============================================================================
// RENDER USERS
// =============================================================================
function renderUsers(users) {
    const wrapper = document.querySelector(".mainContentWrapper");
    wrapper.innerHTML = "";

    if (!users.length) {
        wrapper.innerHTML = `<p style="color:#000;text-align:center;">No users found.</p>`;
        return;
    }

    users.forEach(user => {
        const displayName = user.profile?.display_name || "—";
        const avatarSrc   = user.profile?.avatar_url   || "../../assets/employeeIcon.png";
        const isBanned    = user.is_banned;
        const role        = user.role;

        const card = document.createElement("div");
        card.className        = "cardContainer";
        card.dataset.userid   = user._id;
        card.dataset.username = displayName;
        card.dataset.role     = role;
        card.dataset.banned   = isBanned;

        card.innerHTML = `
            <div class="image-container">
                <img src="${avatarSrc}" alt="${displayName}"
                    onerror="this.src='../../assets/employeeIcon.png'">
            </div>
            <div>
                <h5 class="userName">${displayName}</h5>
                <p>ID: <span class="userId">${user._id}</span></p>
                <h6 class="userRole">${role}</h6>
                ${isBanned ? `<small style="color:salmon;">⛔ Banned</small>` : ""}
            </div>
            <div class="cardWrapper">
                <button onclick="handleAction(this,'Promote')" class="btn" ${role === "admin"    ? "disabled" : ""}>Promote</button>
                <button onclick="handleAction(this,'Demote')"  class="btn" ${role === "customer" ? "disabled" : ""}>Demote</button>
                <button onclick="handleAction(this,'Ban')"     class="btn" ${isBanned            ? "disabled" : ""}>Ban</button>
                <button onclick="handleAction(this,'Unban')"   class="btn" ${!isBanned           ? "disabled" : ""}>Unban</button>
            </div>
        `;
        wrapper.appendChild(card);
    });
}

// =============================================================================
// PAGINATION
// =============================================================================
// =============================================================================
// SHOW MORE
// =============================================================================
function renderShowMore(pagination) {
    const container = document.getElementById("showMoreContainer");

    // show only if there are more pages
    if (pagination.has_next) {
        container.style.display = "block";
        // replace old listener with fresh one
        const btn     = document.getElementById("showMore");
        const newBtn  = btn.cloneNode(true);   // cloneNode removes old listeners
        btn.replaceWith(newBtn);

        document.getElementById("showMore").addEventListener("click", async () => {
            const nextPage = currentPage + 1;
            const q        = document.getElementById("search").value.trim();

            try {
                let url = q || activeFilter
                    ? `/api/admin/users/search?page=${nextPage}&limit=${limit}`
                    : `/api/admin/users?page=${nextPage}&limit=${limit}`;

                if (q)                                url += `&q=${encodeURIComponent(q)}`;
                if (activeFilter === "banned")        url += `&banned=true`;
                else if (activeFilter === "admin")    url += `&role=admin`;
                else if (activeFilter === "customer") url += `&role=customer`;

                const res  = await fetch(url, { credentials: "include" });
                const data = await res.json();
                if (!res.ok) return showGlobalError(data.message);

                // APPEND instead of replace
                appendUsers(data.users);
                currentPage = nextPage;
                renderShowMore(data.pagination);   // re-evaluate if more pages exist
            } catch (err) {
                console.error("[showMore]", err);
            }
        });
    } else {
        container.style.display = "none";
    }
}

function appendUsers(users) {
    const wrapper = document.querySelector(".mainContentWrapper");
    users.forEach(user => {
        const displayName = user.profile?.display_name || "—";
        const avatarSrc   = user.profile?.avatar_url   || "../../assets/employeeIcon.png";
        const isBanned    = user.is_banned;
        const role        = user.role;

        const card = document.createElement("div");
        card.className        = "cardContainer";
        card.dataset.userid   = user._id;
        card.dataset.username = displayName;
        card.dataset.role     = role;
        card.dataset.banned   = isBanned;

        card.innerHTML = `
            <div class="image-container">
                <img src="${avatarSrc}" alt="${displayName}"
                    onerror="this.src='../../assets/employeeIcon.png'">
            </div>
            <div>
                <h5 class="userName">${displayName}</h5>
                <p>ID: <span class="userId">${user._id}</span></p>
                <h6 class="userRole">${role}</h6>
                ${isBanned ? `<small style="color:salmon;">⛔ Banned</small>` : ""}
            </div>
            <div class="cardWrapper">
                <button onclick="handleAction(this,'Promote')" class="btn" ${role === "admin"    ? "disabled" : ""}>Promote</button>
                <button onclick="handleAction(this,'Demote')"  class="btn" ${role === "customer" ? "disabled" : ""}>Demote</button>
                <button onclick="handleAction(this,'Ban')"     class="btn" ${isBanned            ? "disabled" : ""}>Ban</button>
                <button onclick="handleAction(this,'Unban')"   class="btn" ${!isBanned           ? "disabled" : ""}>Unban</button>
            </div>
        `;
        wrapper.appendChild(card);
    });
}
// =============================================================================
// DIALOG
// =============================================================================
function handleAction(btn, action) {
    const card    = btn.closest(".cardContainer");
    currentUserId = card.dataset.userid;
    currentAction = action.toLowerCase();

    document.getElementById("action").textContent     = action;
    document.getElementById("targetUser").textContent = card.dataset.username;
    document.getElementById("reason").value           = "";
    document.getElementById("adminEmail").value       = "";
    document.getElementById("adminPassword").value    = "";
    clearDialogError();

    formDialog.showModal();
}

async function handleSubmit() {
    clearDialogError();
    console.log("SUBMIT IS CLICKED");

    const reason   = document.getElementById("reason").value.trim();
    const email    = document.getElementById("adminEmail").value.trim();
    const password = document.getElementById("adminPassword").value;

    if (!reason)   return showDialogError("Reason is required.");
    if (!email)    return showDialogError("Your email is required.");
    if (!password) return showDialogError("Your password is required.");

    let url  = "";
    let body = { email, password, reason };

    if (currentAction === "promote" || currentAction === "demote") {
        url           = `/api/admin/users/${currentUserId}/role`;
        body.new_role = currentAction === "promote" ? "admin" : "customer";
    } else if (currentAction === "ban") {
        url = `/api/admin/users/${currentUserId}/ban`;
    } else if (currentAction === "unban") {
        url = `/api/admin/users/${currentUserId}/unban`;
    }

    try {
        const res  = await fetch(url, {
            method:      "PUT",
            credentials: "include",
            headers:     { "Content-Type": "application/json" },
            body:        JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) return showDialogError(data.message);

        formDialog.close();
        fetchUsers(currentPage);
    } catch (err) {
        console.error("[submit]", err);
        showDialogError("Network error. Please try again.");
    }
}

// =============================================================================
// ERROR HELPERS
// =============================================================================
function showDialogError(msg) {
    let el = document.getElementById("dialog-error");
    if (!el) {
        el               = document.createElement("small");
        el.id            = "dialog-error";
        el.style.cssText = "color:salmon;display:block;text-align:center;";
        document.querySelector(".btnDialogContainer").before(el);
    }
    el.textContent = msg;
}
function clearDialogError() {
    const el = document.getElementById("dialog-error");
    if (el) el.textContent = "";
}
function showGlobalError(msg) {
    console.error(msg);
}
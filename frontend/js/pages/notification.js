// =============================================================================
// notification.js  —  Notification page
// =============================================================================
// Depends on: main.js (state.user, showToast, applyHeaderDefaults)
// Owns: fetch notifications, render cards, mark one/all read, load more, poll
// =============================================================================

// =============================================================================
// CONSTANTS
// =============================================================================

const POLL_INTERVAL_MS = 30_000;   // poll every 30 seconds

// Icon per notification type
const TYPE_ICONS = {
    order_update:   "fa-box",
    refund_update:  "fa-rotate-left",
    faq_answered:   "fa-circle-question",
    restock:        "fa-arrow-up",
    preorder_ready: "fa-clock",
    promo:          "fa-tag",
};

// Label per type
const TYPE_LABELS = {
    order_update:   "Order",
    refund_update:  "Refund",
    faq_answered:   "FAQ",
    restock:        "Restock",
    preorder_ready: "Pre-order",
    promo:          "Promo",
};

// Where clicking a notification navigates (based on ref_type)
const REF_NAV = {
    orders:       "./orders.html",
    refunds:      "./orders.html",
    faqquestions: "./FAQs.html",
    products:     null,   // needs slug lookup — handled separately
};

// =============================================================================
// STATE
// =============================================================================

let notifPage        = 1;
let notifHasMore     = false;
let notifUnread      = 0;
let notifLoading     = false;
let notifPollTimer   = null;

// =============================================================================
// DOM REFS
// =============================================================================

const container       = document.getElementById("notificationContainer");
const unreadCountEl   = document.getElementById("notifUnreadCount");
const markAllBtn      = document.getElementById("notifMarkAllBtn");

// =============================================================================
// BOOT
// =============================================================================

(async function notifBoot() {
    await waitForSession();

    if (!state.user || state.user.role === "guest") {
        window.location.href = "./signin.html";
        return;
    }

    bindEvents();
    showSkeletons();
    await fetchAndRender(1, true);
    startPolling();
})();

function waitForSession(attempts = 20) {
    return new Promise(resolve => {
        const check = (n) => {
            if (state.user !== null || n <= 0) { resolve(); return; }
            setTimeout(() => check(n - 1), 100);
        };
        check(attempts);
    });
}

// =============================================================================
// EVENTS
// =============================================================================

function bindEvents() {
    markAllBtn.addEventListener("click", handleMarkAll);
}

// =============================================================================
// FETCH + RENDER
// =============================================================================

async function fetchAndRender(page, replace = false) {
    if (notifLoading) return;
    notifLoading = true;

    try {
        const res  = await fetch(`/api/auth/notifications?page=${page}&limit=20`);
        const data = await res.json();

        if (!res.ok) {
            showEmpty("Could not load notifications.");
            return;
        }

        notifPage    = page;
        notifHasMore = data.pagination.has_next;
        notifUnread  = data.unread_count;

        updateUnreadUI(notifUnread);

        if (replace) {
            container.innerHTML = "";
        } else {
            // Remove load-more button before appending new items
            container.querySelector(".notif-load-more")?.remove();
        }

        if (!data.notifications.length && page === 1) {
            showEmpty("You have no notifications yet.");
            return;
        }

        data.notifications.forEach(notif => {
            container.appendChild(buildCard(notif));
        });

        if (notifHasMore) {
            container.appendChild(buildLoadMoreBtn());
        }

    } catch (err) {
        console.error("[fetchAndRender]", err);
        if (page === 1) showEmpty("Failed to load notifications.");
    } finally {
        notifLoading = false;
    }
}

// =============================================================================
// BUILD CARD
// =============================================================================

function buildCard(notif) {
    const card = document.createElement("div");
    card.className  = `notif-card${notif.is_read ? "" : " unread"}`;
    card.dataset.id = notif._id;

    const icon    = TYPE_ICONS[notif.type]  || "fa-bell";
    const label   = TYPE_LABELS[notif.type] || notif.type;
    const timeAgo = formatTimeAgo(notif.createdAt);

    card.innerHTML = `
        <div class="notif-icon ${notif.type}">
            <i class="fa-solid ${icon}"></i>
        </div>
        <div class="notif-body">
            <span class="notif-badge ${notif.type}">${label}</span>
            <p class="notif-message">${notif.message}</p>
            <p class="notif-time">${timeAgo}</p>
        </div>
    `;

    card.addEventListener("click", () => handleCardClick(notif, card));
    return card;
}

// =============================================================================
// CARD CLICK — mark read + navigate
// =============================================================================

async function handleCardClick(notif, cardEl) {
    if (!notif.ref_type) return;

    const base = REF_NAV[notif.ref_type];
    if (base) { window.location.href = base; return; }

    if (notif.ref_type === "products" && notif.ref_id) {
        try {
            const res  = await fetch(`/api/auth/products/slug-by-id/${notif.ref_id}`);
            const data = await res.json();
            if (res.ok && data.slug) window.location.href = `./productDetail.html?slug=${product.slug}`;
        } catch (_) {}
    }
}

// =============================================================================
// MARK ALL READ
// =============================================================================

async function handleMarkAll() {
    if (!notifUnread) return;
    markAllBtn.disabled = true;

    try {
        const res = await fetch("/api/auth/notifications/read-all", { method: "PATCH" });
        if (!res.ok) throw new Error();

        // Update all cards visually
        container.querySelectorAll(".notif-card.unread").forEach(card => {
            card.classList.remove("unread");
        });

        notifUnread = 0;
        updateUnreadUI(0);
        showToast("All notifications marked as read.", "success");

    } catch (err) {
        showToast("Failed to mark all as read.", "danger");
    } finally {
        markAllBtn.disabled = false;
    }
}

// =============================================================================
// LOAD MORE
// =============================================================================

function buildLoadMoreBtn() {
    const btn = document.createElement("button");
    btn.className   = "notif-load-more";
    btn.textContent = "Load more";
    btn.addEventListener("click", async () => {
        btn.disabled    = true;
        btn.textContent = "Loading…";
        await fetchAndRender(notifPage + 1, false);
    });
    return btn;
}

// =============================================================================
// POLLING  — checks unread count every 30s, re-renders if count changed
// =============================================================================

function startPolling() {
    stopPolling();
    notifPollTimer = setInterval(async () => {
        try {
            const res  = await fetch("/api/auth/notifications?page=1&limit=1");
            const data = await res.json();
            if (!res.ok) return;

            if (data.unread_count !== notifUnread) {
                // New notifications arrived — reload first page
                await fetchAndRender(1, true);
            }
        } catch (_) { /* silent */ }
    }, POLL_INTERVAL_MS);
}

function stopPolling() {
    if (notifPollTimer) {
        clearInterval(notifPollTimer);
        notifPollTimer = null;
    }
}

// Stop polling when tab loses focus, resume when it regains it
document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
        stopPolling();
    } else {
        startPolling();
        // Immediate check on tab refocus
        fetchAndRender(1, true);
    }
});

// =============================================================================
// NAV BADGE UPDATE  (also updates main.js newNotifCount badge in nav)
// =============================================================================

function updateUnreadUI(count) {
    // Page toolbar
    if (unreadCountEl) unreadCountEl.textContent = count;

    // Nav bell badge — reuse the same element main.js uses
    const navBadge = document.getElementById("newNotifCount");
    if (navBadge) {
        navBadge.textContent   = count > 0 ? (count > 99 ? "99+" : String(count)) : "";
        navBadge.style.display = count > 0 ? "inline" : "none";
    }

    // Mark all button — disable if nothing to mark
    if (markAllBtn) markAllBtn.disabled = count === 0;
}

// =============================================================================
// EMPTY STATE
// =============================================================================

function showEmpty(message) {
    container.innerHTML = `
        <div class="notif-empty">
            <i class="fa-solid fa-bell-slash"></i>
            <p>${message}</p>
        </div>
    `;
}

// =============================================================================
// LOADING SKELETONS
// =============================================================================

function showSkeletons(count = 5) {
    container.innerHTML = `
        <div class="notif-skeleton-wrap">
            ${Array.from({ length: count }, () => `
                <div class="notif-skeleton-card">
                    <div class="notif-skel notif-skel-icon"></div>
                    <div>
                        <div class="notif-skel notif-skel-line1"></div>
                        <div class="notif-skel notif-skel-line2"></div>
                        <div class="notif-skel notif-skel-line3"></div>
                    </div>
                </div>
            `).join("")}
        </div>
    `;
}

// =============================================================================
// UTILITY
// =============================================================================

function formatTimeAgo(iso) {
    if (!iso) return "";
    const diff = Date.now() - new Date(iso).getTime();
    const mins  = Math.floor(diff / 60_000);
    const hrs   = Math.floor(diff / 3_600_000);
    const days  = Math.floor(diff / 86_400_000);

    if (mins < 1)   return "Just now";
    if (mins < 60)  return `${mins}m ago`;
    if (hrs  < 24)  return `${hrs}h ago`;
    if (days < 7)   return `${days}d ago`;
    return new Date(iso).toLocaleDateString("en-PH", {
        month: "short", day: "numeric", year: "numeric",
    });
}
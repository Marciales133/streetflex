// =============================================================================
// review.js  —  StreetFlex Reviews Page
// Depends on: main.js (state, formatDate, buildStars, DEFAULT_AVATAR,
//             DEFAULT_NAME, formatPrice)
// =============================================================================

// ── DOM refs ──────────────────────────────────────────────────────────────────
const reviewContainer = document.querySelector(".reviewContainer");
const showMoreBtn     = document.getElementById("showMore");
const starFilterLabels = document.querySelectorAll(".starFilters label");

// ── Pagination + filter state ──────────────────────────────────────────────────
let reviewPage     = 1;
const REVIEW_LIMIT = 25;
let   reviewTotal  = 0;
let   activeRating = null;  // null = all, 1-5 = specific star

// =============================================================================
// STAR FILTER SETUP
// =============================================================================
// The HTML already has 6 labels: All, 5★, 4★, 3★, 2★, 1★
// We wire them up here and add an "active" class for the selected one.

function initStarFilters() {
    starFilterLabels.forEach((label, idx) => {
        // idx 0 = "All", idx 1 = 5★, idx 2 = 4★ … idx 5 = 1★
        label.addEventListener("click", () => {
            starFilterLabels.forEach(l => l.classList.remove("active"));
            label.classList.add("active");

            activeRating = idx === 0 ? null : (6 - idx); // 5,4,3,2,1
            loadReviews(true);
        });
    });

    // Default: "All" is active
    if (starFilterLabels[0]) starFilterLabels[0].classList.add("active");
}

// =============================================================================
// LOAD REVIEWS
// =============================================================================

async function loadReviews(reset = false) {
    if (!reviewContainer) return;

    if (reset) {
        reviewPage = 1;
        reviewContainer.innerHTML = "";
    }

    if (reviewPage === 1) renderReviewSkeletons(8);

    const params = new URLSearchParams({ page: reviewPage, limit: REVIEW_LIMIT });
    if (activeRating) params.set("rating", activeRating);

    try {
        const res  = await fetch(`/api/auth/reviews?${params}`);
        const data = await res.json();

        if (reviewPage === 1) reviewContainer.innerHTML = "";

        reviewTotal = data.total || 0;

        if (!data.reviews?.length && reviewPage === 1) {
            renderReviewsEmpty();
            if (showMoreBtn) showMoreBtn.classList.add("hidden");
            return;
        }

        data.reviews.forEach(review => {
            reviewContainer.appendChild(buildReviewCard(review));
        });

        if (showMoreBtn) {
            data.has_more
                ? showMoreBtn.classList.remove("hidden")
                : showMoreBtn.classList.add("hidden");
        }

        reviewPage++;

    } catch (err) {
        console.error("[loadReviews]", err);
        if (reviewPage === 1) reviewContainer.innerHTML = "";
        showToast("Failed to load reviews.", "danger");
    }
}

// =============================================================================
// BUILD REVIEW CARD
// Mirrors the structure of renderReviewSlides in main.js so styles stay shared.
// The swiper version wraps each card in a .swiper-slide; here we drop that
// wrapper and render directly into the grid container.
// =============================================================================

function buildReviewCard(review) {
    const userName    = review.user_id?.profile?.display_name || DEFAULT_NAME;
    const avatarUrl   = review.user_id?.profile?.avatar_url   || DEFAULT_AVATAR;
    const productName = review.product_id?.name               || "";
    const productImg  = review.product_id?.image?.url         || "";
    const stars       = buildStars(review.rating);
    const date        = formatDate(review.createdAt);

    // Review images (if any) — shown as a small horizontal strip below comment
    const reviewImgsHTML = review.images?.length
        ? `<div class="reviewImgStrip">
            ${review.images.slice(0, 4).map(img =>
                `<div class="reviewImgThumb">
                    <img src="${productImg}" alt="review photo" loading="lazy">
                </div>`
            ).join("")}
           </div>`
        : "";

    const card = document.createElement("div");
    // Reuse .cardContent.reviewCard from main.css so the shared styles apply
    card.className = "cardContent reviewCard";

    card.innerHTML = `
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
        ${reviewImgsHTML}
        <div class="likeDislikeBtnContainer">
            <span class="reviewHelpfulBtn" data-review-id="${review._id}" data-action="helpful">
                <i class="fa-solid fa-thumbs-up"></i> ${review.helpful_count} Useful
            </span>
            <span class="reviewHelpfulBtn" data-review-id="${review._id}" data-action="not_helpful">
                <i class="fa-solid fa-thumbs-down"></i> ${review.not_helpful_count} Not Useful
            </span>
        </div>`;

    // ── Helpful / Not Helpful votes ───────────────────────────────────────────
    card.querySelectorAll(".reviewHelpfulBtn").forEach(btn => {
        btn.addEventListener("click", () => handleHelpfulVote(btn, review));
    });

    return card;
}

// =============================================================================
// HELPFUL VOTE
// =============================================================================

// Track which reviews this session has already voted on (prevents spam)
const votedReviews = new Set();

async function handleHelpfulVote(btnEl, review) {
    if (!state.user || state.user.role === "guest") {
        showToast("Sign in to vote on reviews.", "danger");
        return;
    }

    const reviewId = btnEl.dataset.reviewId;
    const action   = btnEl.dataset.action; // "helpful" | "not_helpful"

    if (votedReviews.has(`${reviewId}-${action}`)) {
        showToast("You already voted on this review.", "danger");
        return;
    }

    try {
        const res = await fetch(`/api/auth/reviews/${reviewId}/helpful`, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body:    JSON.stringify({ action }),
        });
        const data = await res.json();

        if (!res.ok) {
            showToast(data.message || "Failed to vote.", "danger");
            return;
        }

        votedReviews.add(`${reviewId}-${action}`);

        // Update count in the button text
        const countKey = action === "helpful" ? "helpful_count" : "not_helpful_count";
        review[countKey] = (review[countKey] || 0) + 1;

        const icon = action === "helpful"
            ? '<i class="fa-solid fa-thumbs-up"></i>'
            : '<i class="fa-solid fa-thumbs-down"></i>';
        const label = action === "helpful" ? "Useful" : "Not Useful";
        btnEl.innerHTML = `${icon} ${review[countKey]} ${label}`;
        btnEl.style.opacity = "0.5";  // dim to signal already voted

    } catch (err) {
        console.error("[handleHelpfulVote]", err);
        showToast("Something went wrong.", "danger");
    }
}

// =============================================================================
// RENDER HELPERS
// =============================================================================

function renderReviewSkeletons(n = 8) {
    reviewContainer.innerHTML = "";
    for (let i = 0; i < n; i++) {
        const s = document.createElement("div");
        s.className = "reviewSkeleton";
        reviewContainer.appendChild(s);
    }
}

function renderReviewsEmpty() {
    reviewContainer.innerHTML = "";
    const el = document.createElement("div");
    el.className = "reviewsEmpty";
    el.innerHTML = `
        <i class="fa-regular fa-star"></i>
        <p>${activeRating ? `No ${activeRating}★ reviews yet.` : "No reviews yet."}</p>`;
    reviewContainer.appendChild(el);
}

// =============================================================================
// SHOW MORE
// =============================================================================

if (showMoreBtn) {
    showMoreBtn.addEventListener("click", () => loadReviews(false));
}

// =============================================================================
// BOOT  (no auth required — reviews are public)
// Still uses the same defineProperty pattern to wait for state to settle
// before checking if helpful votes should be available.
// =============================================================================

async function bootReviews() {
    initStarFilters();
    await loadReviews(true);
}

window.addEventListener("load", () => {
    if (window.__sfBootDone instanceof Promise) {
        window.__sfBootDone.then(bootReviews);
        return;
    }

    let _booted = false;
    const _runOnce = () => { if (!_booted) { _booted = true; bootReviews(); } };

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
        // Reviews are public — don't wait more than 1s for session
        setTimeout(_runOnce, 1000);
    }
});
(function () {

// =============================================================================
// STATE
// =============================================================================
let reviews     = [];
let activeFilter = "pending";

// =============================================================================
// ELEMENTS
// =============================================================================
const mainWrapper      = document.querySelector(".mainContentWrapper");
const pendingBtn       = document.getElementById("pendingReviews");
const approvedBtn      = document.getElementById("approvedReviews");
const deletedBtn       = document.getElementById("deletedReviews");

// =============================================================================
// ON LOAD
// =============================================================================
window.addEventListener("load", () => {
    fetchReviews();

    pendingBtn.addEventListener("click", (e) => {
        e.preventDefault();
        activeFilter = "pending";
        setActiveNav(pendingBtn, approvedBtn, deletedBtn);
        renderFiltered();
    });
    approvedBtn.addEventListener("click", (e) => {
        e.preventDefault();
        activeFilter = "approved";
        setActiveNav(approvedBtn, pendingBtn, deletedBtn);
        renderFiltered();
    });
    deletedBtn.addEventListener("click", (e) => {
        e.preventDefault();
        activeFilter = "deleted";
        setActiveNav(deletedBtn, pendingBtn, approvedBtn);
        renderFiltered();
    });
});

// =============================================================================
// NAV
// =============================================================================
function setActiveNav(active, ...rest) {
    active.querySelector("span").classList.add("active-nav");
    rest.forEach(b => b.querySelector("span").classList.remove("active-nav"));
}

// =============================================================================
// FETCH
// =============================================================================
async function fetchReviews() {
    try {
        const res  = await fetch("/api/admin/reviews", { credentials: "include" });
        const data = await res.json();
        if (!res.ok) return console.error(data.message);
        reviews = data.reviews;
        renderFiltered();
    } catch (err) {
        console.error("[fetchReviews]", err);
    }
}

// =============================================================================
// FILTER + RENDER
// =============================================================================
function renderFiltered() {
    let list;

    if (activeFilter === "pending") {
        list = reviews.filter(r => !r.is_approved && !r.deleted_at);
    } else if (activeFilter === "approved") {
        list = reviews.filter(r => r.is_approved && !r.deleted_at);
    } else {
        list = reviews.filter(r => r.deleted_at);
    }

    // priority sort — same pattern as orders/faqs
    // pending: oldest first (needs action soonest)
    // approved/deleted: newest first
    if (activeFilter === "pending") {
        list = [...list].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    } else {
        list = [...list].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    const h3 = mainWrapper.querySelector("h3");
    mainWrapper.innerHTML = "";
    if (h3) mainWrapper.appendChild(h3);

    if (!list.length) {
        const p = document.createElement("p");
        p.style.cssText = "text-align:center;opacity:.6;margin-top:1rem;";
        p.textContent   = `No ${activeFilter} reviews.`;
        mainWrapper.appendChild(p);
        return;
    }

    list.forEach(r => mainWrapper.appendChild(buildCard(r)));
}

// =============================================================================
// BUILD CARD
// =============================================================================
function buildCard(review) {
    const name      = review.user_id?.profile?.display_name || "Customer";
    const email     = review.user_id?.email || "—";
    const avatar    = review.user_id?.profile?.avatar_url || "";
    const date      = new Date(review.createdAt).toLocaleDateString("en-PH", {
        month: "short", day: "numeric", year: "numeric",
    });

    // product name + variant from order items matched by product_id
    const productName = review.product_id?.name || "—";
    const orderItems  = review.order_id?.items || [];
    const matchedItem = orderItems.find(i =>
        String(i.product_id) === String(review.product_id?._id)
    );
    const variant  = matchedItem ? `${matchedItem.color} / ${matchedItem.size}` : "—";
    const shortOrderId = review.order_id?._id
        ? String(review.order_id._id).slice(-8)
        : "—";

    const stars        = review.rating || 0;
    const comment      = review.comment || "";
    const images       = review.images  || [];
    const helpful      = review.helpful_count     || 0;
    const notHelpful   = review.not_helpful_count || 0;

    const isDeleted  = !!review.deleted_at;
    const isApproved = review.is_approved;

    const statusLabel = isDeleted  ? "Deleted"  :
                        isApproved ? "Approved"  :
                                    "Pending";

    const card = document.createElement("div");
    card.className        = "cardContainer";
    card.dataset.reviewid = review._id;

    card.innerHTML = `
        <div class="cardHeader">
            <div class="cardUserRelatedInfo">
                <div class="image-container userIcon">
                    <img src="${avatar}" alt="${name}"
                        style="width:100%;border-radius:100%;aspect-ratio:1/1;object-fit:cover;">
                </div>
                <div class="userNameAndDate">
                    <span class="userName">${name}</span>
                    <span>${email} • ${date}</span>
                </div>
            </div>
            <div class="cardReviewRelatedInfo">
                <div class="ratingContainer">
                    <div class="productName">
                        <span>PRODUCT:</span>
                        <span>${productName} — ${variant}</span>
                    </div>
                    <div class="orderId">
                        <span>ORDER:</span>
                        <span>#${shortOrderId}</span>
                    </div>
                    <div>
                        <span>RATING:</span>
                        <div class="starsContainer">
                            ${buildStars(stars)}
                        </div>
                        <span style="opacity:.7;font-size:.85rem;">${stars} / 5</span>
                    </div>
                </div>
            </div>
        </div>

        <div class="cardBody">
            <div class="commentContainer">${comment || "<span style='opacity:.5;'>No comment.</span>"}</div>
            ${images.length ? `
            <div class="imagesContainer">
                ${images.map(img => `
                    <a href="${img.file_url}" target="_blank">
                        <div class="image-container" style="width:60px!important;border-radius:.5rem;overflow:hidden;">
                            <img src="${img.file_url}" alt="${img.alt_text || "review image"}"
                                style="width:100%;height:60px;object-fit:cover;display:block;">
                        </div>
                    </a>
                `).join("")}
            </div>` : ""}
        </div>

        <div class="cardActionContainer">
            <span class="status">${statusLabel}</span>
            <div class="spacer"></div>
            <div>
                ${!isDeleted && !isApproved ? `
                    <button class="btn approveReviewBtn">Approve</button>
                ` : ""}
                ${!isDeleted ? `
                    <button class="btn hideReviewBtn">Delete</button>
                ` : ""}
                ${isDeleted ? `
                    <span style="opacity:.5;font-size:.85rem;">No further actions.</span>
                ` : ""}
            </div>
        </div>
    `;

    // ── wire buttons ──────────────────────────────────────────────────────────
    const approveBtn = card.querySelector(".approveReviewBtn");
    const deleteBtn  = card.querySelector(".hideReviewBtn");

    if (approveBtn) approveBtn.addEventListener("click", () => handleApprove(review._id, card));
    if (deleteBtn)  deleteBtn.addEventListener("click",  () => handleDelete(review._id, card));

    return card;
}

// =============================================================================
// STARS
// =============================================================================
function buildStars(rating) {
    return Array.from({ length: 5 }, (_, i) =>
        `<i class="fa-${i < rating ? "solid" : "regular"} fa-star"
            style="color:${i < rating ? "gold" : "rgba(0,0,0,0.2)"}"></i>`
    ).join("");
}

// =============================================================================
// APPROVE
// =============================================================================
async function handleApprove(reviewId, card) {
    if (!confirm("Approve this review? The user will be notified.")) return;

    try {
        const res  = await fetch(`/api/admin/reviews/${reviewId}/approve`, {
            method:      "PATCH",
            credentials: "include",
            headers:     { "Content-Type": "application/json" },
        });
        const data = await res.json();
        if (!res.ok) return alert(data.message);

        // update state and re-render
        const review = reviews.find(r => r._id === reviewId);
        if (review) review.is_approved = true;
        renderFiltered();
    } catch (err) {
        console.error("[handleApprove]", err);
        alert("Network error. Please try again.");
    }
}

// =============================================================================
// DELETE
// =============================================================================
async function handleDelete(reviewId, card) {
    if (!confirm("Delete this review? The user will not be notified.")) return;

    try {
        const res  = await fetch(`/api/admin/reviews/${reviewId}`, {
            method:      "DELETE",
            credentials: "include",
        });
        const data = await res.json();
        if (!res.ok) return alert(data.message);

        // update state and re-render
        const review = reviews.find(r => r._id === reviewId);
        if (review) {
            review.deleted_at  = new Date().toISOString();
            review.is_approved = false;
        }
        renderFiltered();
    } catch (err) {
        console.error("[handleDelete]", err);
        alert("Network error. Please try again.");
    }
}

})();
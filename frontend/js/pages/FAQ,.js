// =============================================================================
// FAQ.js  —  StreetFlex FAQs Page
// Depends on: main.js (state, showToast, formatDate)
// Sections: Ask Away, FAQs (dynamic), Refund Form
// =============================================================================

// ── ImageKit upload proxy (same as orders.js) ─────────────────────────────────
const IK_UPLOAD_URL = "/api/auth/upload-image";

// =============================================================================
// DROPDOWN BEHAVIOR  (existing FAQ.css handles animation)
// Shared by both static and dynamically built dropdowns.
// =============================================================================

function initDropdowns(root = document) {
    root.querySelectorAll(".dropdownContainer:not([data-bound])").forEach(dropdown => {
        dropdown.dataset.bound = "1";
        dropdown.querySelector(".dropdownQuestion")
            ?.addEventListener("click", () => dropdown.classList.toggle("active"));
    });
}

// Run on static dropdowns immediately
initDropdowns();

// =============================================================================
// SECTION 1 — ASK AWAY
// =============================================================================

const askTextarea  = document.querySelector(".askQuestionWrapper textarea");
const askSubmitBtn = document.querySelector(".askQuestionWrapper .btn");

if (askSubmitBtn) {
    askSubmitBtn.addEventListener("click", submitQuestion);
}

async function submitQuestion() {
    const text = askTextarea?.value.trim();
    if (!text) { showToast("Please type a question first.", "danger"); return; }

    if (!state.user || state.user.role === "guest") {
        showToast("Please sign in to submit a question.", "danger");
        setTimeout(() => { window.location.href = "./signin.html"; }, 1200);
        return;
    }

    askSubmitBtn.disabled   = true;
    askSubmitBtn.textContent = "Submitting…";

    try {
        const res  = await fetch("/api/auth/faqs", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body:    JSON.stringify({ question: text }),
        });
        const data = await res.json();

        if (!res.ok) {
            showToast(data.message || "Failed to submit.", "danger");
            return;
        }

        showToast("Question submitted! We'll answer it soon.", "success");
        if (askTextarea) askTextarea.value = "";

    } catch (err) {
        console.error("[submitQuestion]", err);
        showToast("Something went wrong.", "danger");
    } finally {
        askSubmitBtn.disabled    = false;
        askSubmitBtn.textContent = "Submit Question";
    }
}


const answerContainer = document.querySelector(".answerSection .answerContainer");
 
async function loadMyQuestions() {
    if (!answerContainer) return;
 
    // Guest — show sign-in prompt
    if (!state.user || state.user.role === "guest") {
        answerContainer.innerHTML = `
            <div class="myQEmpty">
                <i class="fa-regular fa-circle-question"></i>
                <p>Sign in to see your submitted questions and answers.</p>
                <a class="btn" href="./signin.html">Sign In</a>
            </div>`;
        return;
    }
 
    // Loading state
    answerContainer.innerHTML = `<div class="myQLoading">
        <div class="loading"></div>
    </div>`;
 
    try {
        const res  = await fetch("/api/auth/faqs/my-questions", { credentials: "include" });
        const data = await res.json();
 
        answerContainer.innerHTML = "";
 
        if (!data.questions?.length) {
            answerContainer.innerHTML = `
                <div class="myQEmpty">
                    <i class="fa-regular fa-circle-question"></i>
                    <p>You haven't asked any questions yet.</p>
                </div>`;
            return;
        }
 
        data.questions.forEach(q => {
            answerContainer.appendChild(buildAnswerCard(q));
        });
 
    } catch (err) {
        console.error("[loadMyQuestions]", err);
        answerContainer.innerHTML = `
            <div class="myQEmpty">
                <p>Failed to load your questions.</p>
            </div>`;
    }
}
 
function buildAnswerCard(q) {
    const date      = formatDate(q.createdAt);
    const hasAnswer = !!q.answer;
    const answered  = hasAnswer ? q.answer.updated_at : null;
 
    const card = document.createElement("div");
    card.className = "cardContainer answerCard";
 
    card.innerHTML = `
        <div class="questionContainer">
            <div class="myQMeta">
                <h4>Your Question</h4>
                <span class="myQDate">${date}</span>
            </div>
            <p>${q.question}</p>
            ${q.tags?.length
                ? `<div class="myQTags">${q.tags.map(t => `<span class="myQTag">#${t}</span>`).join("")}</div>`
                : ""}
        </div>
        <div class="answerContainer myQAnswer ${hasAnswer ? "answered" : "pending"}">
            <div class="myQAnswerHead">
                <h4>Admin Response</h4>
                ${hasAnswer
                    ? `<span class="myQAnsweredBadge"><i class="fa-solid fa-check"></i> Answered</span>`
                    : `<span class="myQPendingBadge"><i class="fa-solid fa-clock"></i> Pending</span>`}
            </div>
            <p>${hasAnswer ? q.answer.text : "Our team will respond to your question soon."}</p>
        </div>`;
 
    return card;
}



// =============================================================================
// SECTION 2 — DYNAMIC FAQs
// Fetches all visible, answered questions and groups them by tag.
// Questions with no tags go into a fallback "General" group.
// Unanswered questions are skipped (only show answered ones publicly).
// =============================================================================

const faqDynamicTarget = document.querySelector(".genQuestionWrapper")
    ?.closest(".FaqWrapper");   // the grid wrapper that holds the groups

async function loadFaqs() {
    if (!faqDynamicTarget) return;

    try {
        const res  = await fetch("/api/auth/faqs");
        const data = await res.json();

        // Only show visible, answered, non-deleted questions
        const visible = (data.questions || []).filter(q =>
            q.is_visible && q.answer && !q.answer.is_deleted
        );

        if (!visible.length) return; // keep static fallback HTML if no live data

        // Group by first tag (or "General" if no tags)
        const groups = new Map();
        visible.forEach(q => {
            const tag = q.tags?.[0] || "general";
            if (!groups.has(tag)) groups.set(tag, []);
            groups.get(tag).push(q);
        });

        // Remove existing static .genQuestionWrapper blocks
        faqDynamicTarget.querySelectorAll(".genQuestionWrapper").forEach(el => el.remove());

        // Rebuild dynamically
        groups.forEach((questions, tag) => {
            const groupEl = document.createElement("div");
            groupEl.className = "genQuestionWrapper";

            const label = tag.charAt(0).toUpperCase() + tag.slice(1).replace(/-/g, " ");
            groupEl.innerHTML = `<h6>${label}</h6>`;

            questions.forEach(q => {
                const dropdown = document.createElement("div");
                dropdown.className = "dropdownContainer";
                dropdown.innerHTML = `
                    <div class="dropdownQuestion">
                        <p>${q.question}</p>
                        <i class="fa-solid fa-chevron-down dropdownIcon"></i>
                    </div>
                    <div class="dropdownAnswer">
                        <div class="dropdownWrapper">
                            <p>${q.answer.text}</p>
                        </div>
                    </div>`;
                groupEl.appendChild(dropdown);
            });

            faqDynamicTarget.appendChild(groupEl);
        });

        // Wire up click behavior for new dropdowns
        initDropdowns(faqDynamicTarget);

    } catch (err) {
        console.error("[loadFaqs]", err);
        // Silently keep static HTML on error
    }
}

// =============================================================================
// SECTION 3 — REFUND FORM
// Wires up the existing refund form HTML to POST /api/auth/refunds.
// Pre-fills email from session. Accepts image upload via ImageKit proxy.
// order_id is looked up from the order number field via GET /api/auth/orders.
// =============================================================================

const refundEmailInput  = document.querySelector(".refundForm input[type='text']:first-of-type");
const refundOrderInput  = document.querySelectorAll(".refundForm input[type='text']")[1];
const refundProofInput  = document.getElementById("uploadRefundProof");
const refundReasonInput = document.getElementById("refundReason");
const refundSubmitBtn   = document.querySelector(".refundForm .btn");

// We need to track the uploaded proof URL
let refundProofUrl  = null;
let refundProofFile = null;

// Show selected filename next to upload label
if (refundProofInput) {
    refundProofInput.addEventListener("change", () => {
        const file = refundProofInput.files?.[0];
        if (!file) return;
        if (!file.type.startsWith("image/")) {
            showToast("Only image files allowed.", "danger");
            refundProofInput.value = "";
            return;
        }
        refundProofFile = file;
        // Show filename in the label
        const label = refundProofInput.closest("label");
        if (label) {
            label.childNodes[0].textContent = `📎 ${file.name} `;
        }
        refundProofUrl = null; // reset — will upload on submit
    });
}

if (refundSubmitBtn) {
    refundSubmitBtn.addEventListener("click", submitRefund);
}

async function submitRefund() {
    const email       = refundEmailInput?.value.trim();
    const orderNumber = refundOrderInput?.value.trim();
    const reason      = refundReasonInput?.value.trim();

    if (!email || !orderNumber || !reason) {
        showToast("Please fill in all fields.", "danger"); return;
    }
    if (!refundProofFile) {
        showToast("Please upload a proof image.", "danger"); return;
    }
    if (!state.user || state.user.role === "guest") {
        showToast("Please sign in to submit a refund request.", "danger"); return;
    }

    refundSubmitBtn.disabled    = true;
    refundSubmitBtn.textContent = "Uploading proof…";

    try {
        // Step 1: upload proof image
        if (!refundProofUrl) {
            const formData = new FormData();
            formData.append("file",   refundProofFile);
            formData.append("folder", "refunds");

            const uploadRes  = await fetch(IK_UPLOAD_URL, {
                method: "POST",
                credentials: "include",
                body:   formData,
            });
            const uploadData = await uploadRes.json();
            if (!uploadRes.ok) throw new Error(uploadData.message || "Upload failed.");
            refundProofUrl = uploadData.url;
        }

        refundSubmitBtn.textContent = "Submitting…";

        // Step 2: find the order_id from the order number
        // The order number shown to users is the last 8 chars of _id (uppercase)
        // We search across user's orders to find the matching one
        const ordersRes  = await fetch("/api/auth/orders?limit=50", { credentials: "include" });
        const ordersData = await ordersRes.json();

        const matchedOrder = (ordersData.orders || []).find(o =>
            String(o._id).slice(-8).toUpperCase() === orderNumber.toUpperCase().replace("#", "")
        );

        if (!matchedOrder) {
            showToast("Order not found. Check the order number.", "danger");
            return;
        }

        // Step 3: submit refund
        const res = await fetch("/api/auth/refunds", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
                order_id: matchedOrder._id,
                reason,
                proofs: [{ file_url: refundProofUrl, media_type: "image" }],
            }),
        });
        const data = await res.json();

        if (!res.ok) {
            showToast(data.message || "Failed to submit refund.", "danger");
            return;
        }

        showToast("Refund request submitted! We'll review it soon.", "success");

        // Clear form
        if (refundOrderInput)  refundOrderInput.value  = "";
        if (refundReasonInput) refundReasonInput.value = "";
        if (refundProofInput)  refundProofInput.value  = "";
        refundProofFile = null;
        refundProofUrl  = null;
        const label = refundProofInput?.closest("label");
        if (label) label.childNodes[0].textContent = "Upload proof for refund ";

    } catch (err) {
        console.error("[submitRefund]", err);
        showToast("Something went wrong.", "danger");
    } finally {
        refundSubmitBtn.disabled    = false;
        refundSubmitBtn.textContent = "Send Refund Request";
    }
}

// =============================================================================
// HASH ROUTING — auto-scroll to #refund if routed from orders page
// =============================================================================

function handleHashScroll() {
    if (window.location.hash === "#refund") {
        const refundSection = document.querySelector(".refundSection");
        if (refundSection) {
            setTimeout(() => {
                refundSection.scrollIntoView({ behavior: "smooth", block: "start" });
            }, 400); // slight delay so page has painted
        }
    }
}

// =============================================================================
// BOOT  —  session-aware for pre-fill + question submit guard
// =============================================================================

async function bootFaq() {
    // Pre-fill email in refund form from session
    if (state.user && state.user.role !== "guest" && refundEmailInput) {
        refundEmailInput.value = state.user.email || "";
    }

    await loadMyQuestions();   
    handleHashScroll();
}

window.addEventListener("load", () => {
    if (window.__sfBootDone instanceof Promise) {
        window.__sfBootDone.then(bootFaq);
        return;
    }

    let _booted = false;
    const _runOnce = () => { if (!_booted) { _booted = true; bootFaq(); } };

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
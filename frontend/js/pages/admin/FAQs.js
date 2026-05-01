(function () {

// =============================================================================
// STATE
// =============================================================================
let questions = [];

// =============================================================================
// ELEMENTS
// =============================================================================
const mainWrapper    = document.querySelector(".mainContentWrapper");
const answeredWindow = document.getElementById("answeredWindow");
const hiddenWindow   = document.getElementById("hiddenWindow");

const pendingFilter  = document.getElementById("pendingFilter");
const answeredFilter = document.getElementById("answeredFilter");
const hiddenFilter   = document.getElementById("hiddenFilter");

// =============================================================================
// ON LOAD
// =============================================================================
window.addEventListener("load", () => {
    fetchQuestions();
    window.toggleHideBtnMenu = function(btn) {
        const container = btn.closest(".hideBtnContainer");
        container.querySelector(".hideBtn").classList.toggle("show");
    };
    pendingFilter.addEventListener("click", (e) => {
        e.preventDefault();
        answeredWindow.classList.remove("show");
        hiddenWindow.classList.remove("show");
        setActiveNav(pendingFilter, answeredFilter, hiddenFilter);
    });
    answeredFilter.addEventListener("click", (e) => {
        e.preventDefault();
        answeredWindow.classList.add("show");
        hiddenWindow.classList.remove("show");
        setActiveNav(answeredFilter, pendingFilter, hiddenFilter);
    });
    hiddenFilter.addEventListener("click", (e) => {
        e.preventDefault();
        hiddenWindow.classList.add("show");
        answeredWindow.classList.remove("show");
        setActiveNav(hiddenFilter, pendingFilter, answeredFilter);
    });
});

// =============================================================================
// NAV INDICATOR
// =============================================================================
function setActiveNav(active, ...rest) {
    active.querySelector("span").classList.add("active-nav");
    rest.forEach(b => b.querySelector("span").classList.remove("active-nav"));
}

// =============================================================================
// FETCH
// =============================================================================
async function fetchQuestions() {
    try {
        const res  = await fetch("/api/admin/faqs", { credentials: "include" });
        const data = await res.json();
        if (!res.ok) return console.error(data.message);
        questions = data.questions;
        renderAll(questions);
    } catch (err) {
        console.error("[fetchQuestions]", err);
    }
}

// =============================================================================
// RENDER — split into 3 buckets
// =============================================================================
function renderAll(list) {
    // pending  = visible, no answer
    // answered = has answer (regardless of visibility)
    // hidden   = not visible, no answer
    const answered = list.filter(q => q.answer && !q.answer.is_deleted);
    const hidden   = list.filter(q => !q.is_visible && (!q.answer || q.answer.is_deleted));
    const pending  = list.filter(q => q.is_visible  && (!q.answer || q.answer.is_deleted));

    renderBucket(pending,  mainWrapper,                                             false);
    renderBucket(answered, answeredWindow.querySelector(".windowContent"),          true);
    renderBucket(hidden,   hiddenWindow.querySelector(".windowContent"),            false, true);
}

function renderBucket(list, container, isAnswered, isHidden = false) {
    const h3 = container.querySelector("h3");
    container.innerHTML = "";
    if (h3) container.appendChild(h3);

    if (!list.length) {
        const p = document.createElement("p");
        p.style.cssText = "text-align:center;opacity:.6;margin-top:1rem;";
        p.textContent   = isAnswered ? "No answered questions." :
                        isHidden   ? "No hidden questions."   :
                                    "No pending questions.";
        container.appendChild(p);
        return;
    }

    list.forEach(q => container.appendChild(buildCard(q, isAnswered, isHidden)));
}

// =============================================================================
// BUILD CARD
// =============================================================================
function buildCard(question, isAnswered = false, isHidden = false) {
    const name    = question.user_id?.profile?.display_name || "Customer";
    const avatar  = question.user_id?.profile?.avatar_url   || "";
    const date    = new Date(question.createdAt).toLocaleDateString("en-PH", {
        month: "short", day: "numeric", year: "numeric",
    });
    const tags        = question.tags || [];
    const answerText  = question.answer?.text || "";

    const card = document.createElement("div");
    card.className          = "cardContainer";
    card.dataset.questionid = question._id;
    card.dataset.visible    = question.is_visible;
    card.dataset.answered   = !!question.answer;

    card.innerHTML = `
        <div class="cardContentWrapper">
            <div class="image-container">
                <img src="${avatar}" alt="${name}" style="width:100%;border-radius:100%;aspect-ratio:1/1;object-fit:cover;">
            </div>
            <div class="cardAddressAndQuestion">
                <div class="addressContainer">
                    <span class="userName">${name}</span>
                    <span>•</span>
                    <span class="questionDate">${date}</span>
                </div>
                <p class="questionContainer">${question.question}</p>
                <div class="tagContainers">
                    ${tags.map(t => `<span class="spantags">${t}</span>`).join("")}
                    <span class="btn editTagsBtn" style="font-size:.833rem;border: 1px solid black;padding: .05rem .2rem;border-radius:.4rem;background:darkslategray;color:white;cursor:pointer;">
                        <i class="fa-solid fa-tag"></i> Tags
                    </span>
                </div>
            </div>
            <div class="hideBtnContainer">
                <button class="showHideBtn" onclick="toggleHideBtnMenu(this)">
                    <i class="fa-solid fa-ellipsis"></i>
                </button>
                <div class="hideBtn">
                    <span class="visibilityToggle">${isHidden ? "Show" : "Hide"}</span>
                    <span class="deleteQuestion" style="color:salmon;display:block;cursor:pointer;margin-top:.3rem;">Delete</span>
                </div>
            </div>
        </div>
        <div class="submitAnswerContainer">
            <input
                type="text"
                class="answerToQuestion"
                placeholder="${isAnswered ? "Edit the answer..." : "Write an answer..."}"
                value="${answerText}"
            >
            <button class="${isAnswered ? "editBtn" : "submitBtn"} btn">
                ${isAnswered ? "Edit Answer" : "Submit Answer"}
            </button>
        </div>
    `;

    // ── wire up tag editor ────────────────────────────────────────────────────
    card.querySelector(".editTagsBtn").addEventListener("click", () => {
        openTagDialog(question._id, tags, card);
    });

    // ── wire up visibility toggle ─────────────────────────────────────────────
    card.querySelector(".visibilityToggle").addEventListener("click", () => {
        handleToggleVisibility(question._id, card);
    });

    // ── wire up delete ────────────────────────────────────────────────────────
    card.querySelector(".deleteQuestion").addEventListener("click", () => {
        handleDelete(question._id, card);
    });

    // ── wire up answer / edit button ──────────────────────────────────────────
    const actionBtn = card.querySelector(".submitBtn, .editBtn");
    if (actionBtn) {
        actionBtn.addEventListener("click", () => {
            if (actionBtn.classList.contains("submitBtn")) {
                handleSubmitAnswer(question._id, card);
            } else {
                handleEditAnswer(question._id, card);
            }
        });
    }

    return card;
}


// =============================================================================
// SUBMIT ANSWER
// =============================================================================
async function handleSubmitAnswer(questionId, card) {
    const input = card.querySelector(".answerToQuestion");
    const text  = input.value.trim();
    if (!text) return alert("Please write an answer before submitting.");

    try {
        const res  = await fetch(`/api/admin/faqs/${questionId}/answer`, {
            method:      "POST",
            credentials: "include",
            headers:     { "Content-Type": "application/json" },
            body:        JSON.stringify({ text }),
        });
        const data = await res.json();
        if (!res.ok) return alert(data.message);

        // re-fetch and re-render so the card moves to the answered bucket
        await fetchQuestions();
    } catch (err) {
        console.error("[handleSubmitAnswer]", err);
        alert("Network error. Please try again.");
    }
}

// =============================================================================
// EDIT ANSWER
// =============================================================================
async function handleEditAnswer(questionId, card) {
    const input = card.querySelector(".answerToQuestion");
    const text  = input.value.trim();
    if (!text) return alert("Answer cannot be empty.");

    try {
        const res  = await fetch(`/api/admin/faqs/${questionId}/answer`, {
            method:      "PATCH",
            credentials: "include",
            headers:     { "Content-Type": "application/json" },
            body:        JSON.stringify({ text }),
        });
        const data = await res.json();
        if (!res.ok) return alert(data.message);

        // update the input value in place — no need to re-render
        input.value = text;
        alert("Answer updated. User has been notified.");
    } catch (err) {
        console.error("[handleEditAnswer]", err);
        alert("Network error. Please try again.");
    }
}

// =============================================================================
// TOGGLE VISIBILITY
// =============================================================================
async function handleToggleVisibility(questionId, card) {
    try {
        const res  = await fetch(`/api/admin/faqs/${questionId}/visibility`, {
            method:      "PATCH",
            credentials: "include",
            headers:     { "Content-Type": "application/json" },
        });
        const data = await res.json();
        if (!res.ok) return alert(data.message);

        // re-fetch and re-render so card moves between pending ↔ hidden bucket
        await fetchQuestions();
    } catch (err) {
        console.error("[handleToggleVisibility]", err);
        alert("Network error. Please try again.");
    }
}

// =============================================================================
// DELETE
// =============================================================================
async function handleDelete(questionId, card) {
    if (!confirm("Delete this question? This cannot be undone.")) return;

    try {
        const res  = await fetch(`/api/admin/faqs/${questionId}`, {
            method:      "DELETE",
            credentials: "include",
        });
        const data = await res.json();
        if (!res.ok) return alert(data.message);

        card.remove();
    } catch (err) {
        console.error("[handleDelete]", err);
        alert("Network error. Please try again.");
    }
}

// =============================================================================
// TAG DIALOG
// =============================================================================
function openTagDialog(questionId, currentTags, card) {
    // remove any existing one
    const old = document.getElementById("tagDialogOverlay");
    if (old) old.remove();

    const overlay = document.createElement("div");
    overlay.id = "tagDialogOverlay";
    overlay.style.cssText = `
        position:fixed;inset:0;z-index:200;
        background:rgba(0,0,0,0.6);
        display:flex;align-items:center;justify-content:center;
    `;

    overlay.innerHTML = `
        <div style="background:white;color:black;border-radius:1rem;padding:1.5rem;
                    width:90%;max-width:420px;display:flex;flex-direction:column;gap:1rem;max-height:80vh;">
            <h5 style="margin:0;text-align:center;">Manage Tags</h5>
            <div id="tagChipContainer" style="display:flex;flex-wrap:wrap;gap:.5rem;min-height:40px;
                                            overflow-y:auto;align-content:flex-start;">
                ${currentTags.map(t => `
                    <span style="display:flex;align-items:center;gap:.4rem;padding:.2rem .6rem;
                                background:darkslateblue;color:lightblue;border-radius:.8rem;font-size:.85rem;">
                        <span>${t}</span>
                        <i class="fa-solid fa-x deleteTag" style="cursor:pointer;font-size:.7rem;"></i>
                    </span>
                `).join("")}
            </div>
            <div style="display:flex;gap:.5rem;">
                <input id="tagDialogInput" type="text" placeholder="New tag..."
                    style="flex:1;padding:.4rem .6rem;border:solid 1px #ccc;border-radius:.5rem;">
                <button id="tagDialogAddBtn" class="btn"
                    style="background:darkslategray;color:lightcyan;padding:.4rem .8rem;border-radius:.5rem;">
                    Add
                </button>
            </div>
            <div style="display:flex;justify-content:space-evenly;gap:1rem;">
                <button id="tagDialogCancelBtn" class="btn"
                    style="background:lightgrey;color:#333;width:110px;">Cancel</button>
                <button id="tagDialogSaveBtn" class="btn"
                    style="background:darkslategray;color:lightcyan;width:110px;">Save</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    // ── wire chip delete buttons ──────────────────────────────────────────────
    function wireChipDeletes() {
        overlay.querySelectorAll(".deleteTag").forEach(btn => {
            btn.onclick = () => btn.closest("span[style]").remove();
        });
    }
    wireChipDeletes();

    // ── add tag ───────────────────────────────────────────────────────────────
    const input   = overlay.querySelector("#tagDialogInput");
    const addBtn  = overlay.querySelector("#tagDialogAddBtn");

    function addChip() {
        const val = input.value.trim();
        if (!val) return;
        const chip = document.createElement("span");
        chip.style.cssText = "display:flex;align-items:center;gap:.4rem;padding:.2rem .6rem;background:darkslateblue;color:lightblue;border-radius:.8rem;font-size:.85rem;";
        chip.innerHTML = `<span>${val}</span><i class="fa-solid fa-x deleteTag" style="cursor:pointer;font-size:.7rem;"></i>`;
        overlay.querySelector("#tagChipContainer").appendChild(chip);
        input.value = "";
        wireChipDeletes();
    }

    addBtn.addEventListener("click", (e) => { e.preventDefault(); addChip(); });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addChip(); } });

    // ── cancel ────────────────────────────────────────────────────────────────
    overlay.querySelector("#tagDialogCancelBtn").addEventListener("click", () => overlay.remove());

    // ── save ──────────────────────────────────────────────────────────────────
    overlay.querySelector("#tagDialogSaveBtn").addEventListener("click", async () => {
        const tags = [...overlay.querySelectorAll("#tagChipContainer span[style] span:first-child")]
            .map(s => s.textContent.trim())
            .filter(Boolean);
        overlay.remove();
        await saveTags(questionId, tags, card);
    });
}

async function saveTags(questionId, tags, card) {
    try {
        const res  = await fetch(`/api/admin/faqs/${questionId}/tags`, {
            method:      "PATCH",
            credentials: "include",
            headers:     { "Content-Type": "application/json" },
            body:        JSON.stringify({ tags }),
        });
        const data = await res.json();
        if (!res.ok) return alert(data.message);

        // update tag display on the card in place
        const tagContainer = card.querySelector(".tagContainers");
        const editBtn      = tagContainer.querySelector(".editTagsBtn");
        tagContainer.innerHTML = "";
        tags.forEach(t => {
            const span = document.createElement("span");
            span.className   = "spantags";
            span.textContent = t;
            tagContainer.appendChild(span);
        });
        tagContainer.appendChild(editBtn);
    } catch (err) {
        console.error("[saveTags]", err);
        alert("Network error. Please try again.");
    }
}

})();
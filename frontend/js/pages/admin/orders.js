// js/pages/admin/orders.js
(function () {

// =============================================================================
// STATE
// =============================================================================
let orders   = [];
let refunds  = [];
let preorders = [];

// =============================================================================
// ELEMENTS
// =============================================================================
const showOrdersBtn    = document.getElementById("showOrders");
const showPreOrdersBtn = document.getElementById("showPreOrders");
const showRefundsBtn   = document.getElementById("showRefunds");
const preOrderWindow   = document.getElementById("preOrderWindow");
const refundWindow     = document.getElementById("refundWindow");
const mainWrapper      = document.querySelector(".mainContentWrapper");

// =============================================================================
// ON LOAD
// =============================================================================
window.addEventListener("load", () => {
    fetchOrders();
    fetchRefunds();
    fetchPreorders();

    showOrdersBtn.addEventListener("click", (e) => {
        e.preventDefault();
        preOrderWindow.classList.remove("show");
        refundWindow.classList.remove("show");
        setActiveNav(showOrdersBtn, showPreOrdersBtn, showRefundsBtn);
    });
    showPreOrdersBtn.addEventListener("click", (e) => {
        e.preventDefault();
        preOrderWindow.classList.add("show");
        refundWindow.classList.remove("show");
        setActiveNav(showPreOrdersBtn, showOrdersBtn, showRefundsBtn);
    });
    showRefundsBtn.addEventListener("click", (e) => {
        e.preventDefault();
        refundWindow.classList.add("show");
        preOrderWindow.classList.remove("show");
        setActiveNav(showRefundsBtn, showOrdersBtn, showPreOrdersBtn);
    });
});

// =============================================================================
// NAV INDICATOR
// =============================================================================
function setActiveNav(active, ...rest) {
    active.querySelector(".underline").classList.add("active-nav");
    rest.forEach(b => b.querySelector(".underline").classList.remove("active-nav"));
}

// =============================================================================
// FETCH
// =============================================================================
async function fetchOrders() {
    try {
        const res  = await fetch("/api/admin/orders?is_preorder=false", { credentials: "include" });
        const data = await res.json();
        if (!res.ok) return console.error(data.message);
        orders = data.orders;
        renderOrders(orders, mainWrapper);
    } catch (err) { console.error("[fetchOrders]", err); }
}

async function fetchPreorders() {
    try {
        const res  = await fetch("/api/admin/orders?is_preorder=true", { credentials: "include" });
        const data = await res.json();
        if (!res.ok) return console.error(data.message);
        preorders = data.orders;
        renderOrders(preorders, document.querySelector("#preOrderWindow .windowContent"), true);
    } catch (err) { console.error("[fetchPreorders]", err); }
}

async function fetchRefunds() {
    try {
        const res  = await fetch("/api/admin/refunds", { credentials: "include" });
        const data = await res.json();
        if (!res.ok) return console.error(data.message);
        refunds = data.refunds;
        renderRefunds(refunds);
    } catch (err) { console.error("[fetchRefunds]", err); }
}

// =============================================================================
// RENDER ORDERS
// =============================================================================
function renderOrders(list, container, isPreorder = false) {
    const h3 = container.querySelector("h3");
    container.innerHTML = "";
    if (h3) container.appendChild(h3);

    if (!list.length) {
        const p = document.createElement("p");
        p.style.cssText = "text-align:center;opacity:.6;";
        p.textContent   = isPreorder ? "No preorders found." : "No orders found.";
        container.appendChild(p);
        return;
    }

    // ── Priority sort ─────────────────────────────────────────────────────────
    const PRIORITY = {
        pending:          0,
        confirmed:        1,
        processing:       2,
        to_be_delivered:  3,
        refund_requested: 4,
        delivered:        5,
        refunded:         6,
        cancelled:        7,
    };

    const sorted = [...list].sort((a, b) => {
        const pa = PRIORITY[a.status] ?? 99;
        const pb = PRIORITY[b.status] ?? 99;
        if (pa !== pb) return pa - pb;
        // within the same priority bucket, keep oldest first (server order)
        return new Date(a.createdAt) - new Date(b.createdAt);
    });

    sorted.forEach(order => container.appendChild(buildOrderCard(order, isPreorder)));
}

function buildOrderCard(order, isPreorder = false) {
    const date        = new Date(order.createdAt).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
    const email       = order.user_id?.email || "—";
    const name        = order.user_id?.profile?.display_name || "Customer";
    const shortId     = String(order._id).slice(-8);
    const total       = `₱${Number(order.total).toLocaleString()}`;
    const subtotal    = `₱${Number(order.subtotal).toLocaleString()}`;
    const address     = order.shipping_address;
    const shipTo      = address ? `${address.line1}, ${address.city}` : "—";

    const card = document.createElement("div");
    card.className       = "cardContainer";
    card.dataset.orderid = order._id;
    card.dataset.status  = order.status;

    // ── Header ────────────────────────────────────────────────────────────────
    card.innerHTML = `
        <div class="cardheader">
            <div class="cardAddress">
                <h6>${isPreorder ? "Pre-Order" : "Order"}
                    <span class="orderID">#${shortId}</span>
                </h6>
                <div class="UEmail-OrderDate">
                    <span class="userEmail">${email}</span>
                    •
                    <span class="orderDate">${date}</span>
                </div>
            </div>
            <div class="cardHeaderIndicators">
                <span class="orderStatus">${order.status}</span>
                <span class="orderPrice">${total}</span>
                <button onclick="expandCard(this)" class="btn expandBtn">
                    <i class="fa-solid fa-chevron-down"></i>
                    <span>expand</span>
                </button>
                <button onclick="collapseCard(this)" class="btn collapseBtn hide">
                    <i class="fa-solid fa-chevron-up"></i>
                    <span>collapse</span>
                </button>
            </div>
        </div>

        <div class="cardContent">
            <div class="cardContentAddress">
                <div class="cardContentAddressfields">
                    <span class="itemLable">Customer</span>
                    <span class="userName">${name}</span>
                </div>
                <div class="cardContentAddressfields">
                    <span class="itemLable">Ship to</span>
                    <span class="userAddress">${shipTo}</span>
                </div>
                <div class="cardContentAddressfields">
                    <span class="itemLable">Phone</span>
                    <span>${order.shipping_address?.phone || "—"}</span>
                </div>
                <div class="cardContentAddressfields">
                    <span class="itemLable">Subtotal</span>
                    <span>${subtotal}</span>
                </div>
                ${order.discount_code ? `
                <div class="cardContentAddressfields">
                    <span class="itemLable">Discount</span>
                    <span>${order.discount_code} · -₱${Number(order.discount_amount).toLocaleString()}</span>
                </div>` : ""}
            </div>

            <div class="cardContentItems">
                <span class="itemLable">Items</span>
                ${order.items.map(item => `
                    <div class="cardContentItem">
                        <span class="itemName">${item.name}</span>
                        <span>-</span>
                        <span class="itemColor">${item.color}</span>
                        <span>/</span>
                        <span class="itemSize">${item.size}</span>
                        <span class="spacer"></span>
                        <span class="quantity">x${item.quantity}</span>
                        <span>•</span>
                        <span class="itemTotal">₱${Number(item.subtotal).toLocaleString()}</span>
                    </div>
                `).join("")}
            </div>

            <div class="cardContentStatusHistory">
                <span class="itemLable">Status History</span>
                ${order.status_history.map(h => `
                    <div class="cardContentStatus">
                        <span class="status">
                            ${h.old_status || "—"}
                            <i class="fa-solid fa-arrow-right"></i>
                            ${h.new_status}
                        </span>
                        <span>•</span>
                        <span class="statusDate">${new Date(h.changed_at).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}</span>
                    </div>
                `).join("") || '<span style="opacity:.6;font-size:.85rem;">No history yet.</span>'}
            </div>

            <div class="cardBtns">
                ${buildOrderButtons(order.status)}
            </div>
        </div>
    `;

    // wire up action buttons
    card.querySelectorAll(".cardBtns .btn").forEach(btn => {
        btn.addEventListener("click", () => handleOrderAction(btn, card));
    });

    return card;
}

// =============================================================================
// ORDER ACTION BUTTONS — only valid next steps
// =============================================================================
const NEXT_STATUS = {
    pending:         [{ label: "Confirm",         status: "confirmed",       cls: "confirm"    }, { label: "Cancel", status: "cancelled", cls: "cancel" }],
    confirmed:       [{ label: "Mark Processing", status: "processing",      cls: "processing" }, { label: "Cancel", status: "cancelled", cls: "cancel" }],
    processing:      [{ label: "Mark for Delivery", status: "to_be_delivered", cls: "forDelivery" }, { label: "Cancel", status: "cancelled", cls: "cancel" }],
    to_be_delivered: [{ label: "Mark Delivered",  status: "delivered",       cls: "delivered"  }],
    delivered:       [],
    cancelled:       [],
    refund_requested:[{ label: "Approve Refund",  status: "refunded",        cls: "delivered"  }, { label: "Reject", status: "delivered", cls: "cancel" }],
    refunded:        [],
};

function buildOrderButtons(status) {
    const btns = NEXT_STATUS[status] || [];
    if (!btns.length) return `<span style="opacity:.6;font-size:.85rem;">No further actions.</span>`;
    return btns.map(b =>
        `<button class="btn ${b.cls}" data-next-status="${b.status}">${b.label}</button>`
    ).join("");
}

async function handleOrderAction(btn, card) {
    const orderId   = card.dataset.orderid;
    const newStatus = btn.dataset.nextStatus;
    if (!newStatus) return;

    if (!confirm(`Change order status to "${newStatus}"?`)) return;

    try {
        const res  = await fetch(`/api/admin/orders/${orderId}/status`, {
            method:      "PATCH",
            credentials: "include",
            headers:     { "Content-Type": "application/json" },
            body:        JSON.stringify({ new_status: newStatus }),
        });
        const data = await res.json();
        if (!res.ok) return alert(data.message);

        // ── Update card in place ──────────────────────────────────────────────
        card.dataset.status = newStatus;
        card.querySelector(".orderStatus").textContent = newStatus;
        card.querySelector(".cardBtns").innerHTML = buildOrderButtons(newStatus);
        card.querySelectorAll(".cardBtns .btn").forEach(b => {
            b.addEventListener("click", () => handleOrderAction(b, card));
        });

        // append new history entry
        const historyContainer = card.querySelector(".cardContentStatusHistory");
        const entry = document.createElement("div");
        entry.className = "cardContentStatus";
        entry.innerHTML = `
            <span class="status">
                ${card.dataset.prevStatus || "—"}
                <i class="fa-solid fa-arrow-right"></i>
                ${newStatus}
            </span>
            <span>•</span>
            <span class="statusDate">${new Date().toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}</span>
        `;
        historyContainer.appendChild(entry);
        card.dataset.prevStatus = newStatus;

    } catch (err) {
        console.error("[handleOrderAction]", err);
        alert("Network error. Please try again.");
    }
}

// =============================================================================
// RENDER REFUNDS
// =============================================================================
function renderRefunds(list) {
    const container = document.querySelector("#refundWindow .windowContent");
    const h3        = container.querySelector("h3");
    container.innerHTML = "";
    if (h3) container.appendChild(h3);

    if (!list.length) {
        const p = document.createElement("p");
        p.style.cssText = "text-align:center;opacity:.6;";
        p.textContent   = "No refunds found.";
        container.appendChild(p);
        return;
    }

    list.forEach(refund => container.appendChild(buildRefundCard(refund)));
}

function buildRefundCard(refund) {
    const shortId  = String(refund.order_id?._id || refund.order_id).slice(-8);
    const email    = refund.user_id?.email || "—";
    const reason   = refund.reason || "—";
    const total    = refund.order_id?.total ? `₱${Number(refund.order_id.total).toLocaleString()}` : "—";
    const items    = refund.order_id?.items || [];
    const history  = refund.status_history || [];
    const proofs   = refund.proofs || [];

    const card = document.createElement("div");
    card.className        = "cardContainer";
    card.dataset.refundid = refund._id;
    card.dataset.status   = refund.status;

    card.innerHTML = `
        <div class="cardheader">
            <div class="cardAddress">
                <h6>Refund · Order <span class="orderID">#${shortId}</span></h6>
                <div class="UEmail-OrderDate">
                    <span class="userEmail">${email}</span>
                    •
                    <span class="overViewReason">"${reason.substring(0, 60)}${reason.length > 60 ? "..." : ""}"</span>
                </div>
            </div>
            <div class="cardHeaderIndicators">
                <span class="orderStatus">${refund.status}</span>
                <button onclick="expandCard(this)" class="btn expandBtn">
                    <i class="fa-solid fa-chevron-down"></i>
                    <span>expand</span>
                </button>
                <button onclick="collapseCard(this)" class="btn collapseBtn hide">
                    <i class="fa-solid fa-chevron-up"></i>
                    <span>collapse</span>
                </button>
            </div>
        </div>

        <div class="cardContent">
            <div class="cardContentAddress">
                <div class="cardContentAddressfields">
                    <span class="itemLable">Order total</span>
                    <span>${total}</span>
                </div>
                <div class="cardContentAddressfields">
                    <span class="itemLable">Refund status</span>
                    <span>${refund.status}</span>
                </div>
            </div>

            <div class="cardContentItems">
                <span class="itemLable">Order Items</span>
                ${items.map(item => `
                    <div class="cardContentItem">
                        <span class="itemName">${item.name}</span>
                        <span>-</span>
                        <span class="itemColor">${item.color}</span>
                        <span>/</span>
                        <span class="itemSize">${item.size}</span>
                        <span class="spacer"></span>
                        <span class="quantity">x${item.quantity}</span>
                        <span>•</span>
                        <span class="itemTotal">₱${Number(item.subtotal).toLocaleString()}</span>
                    </div>
                `).join("") || '<span style="opacity:.6;font-size:.85rem;">No items.</span>'}
            </div>

            <div class="cardContentStatusHistory">
                <span class="itemLable">Reason</span>
                <p style="margin:.25rem 0 0;font-size:.9rem;">${reason}</p>
            </div>

            ${proofs.length ? `
            <div class="refundProofs">
                <span class="itemLable">Proof files</span>
                <div class="proofGrid">
                    ${proofs.map(p => `
                        <a href="${p.file_url}" target="_blank">
                            ${p.media_type === "image"
                                ? `<img src="${p.file_url}" alt="proof" class="proofThumb">`
                                : `<div class="proofThumb proofVideo"><i class="fa-solid fa-play"></i></div>`}
                        </a>
                    `).join("")}
                </div>
            </div>` : ""}

            <div class="cardContentStatusHistory">
                <span class="itemLable">Status History</span>
                ${history.map(h => `
                    <div class="cardContentStatus">
                        <span class="status">
                            ${h.old_status || "—"}
                            <i class="fa-solid fa-arrow-right"></i>
                            ${h.new_status}
                        </span>
                        <span>•</span>
                        <span class="statusDate">${new Date(h.changed_at).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}</span>
                        ${h.note ? `<span style="opacity:.6;font-size:.8rem;">· ${h.note}</span>` : ""}
                    </div>
                `).join("") || '<span style="opacity:.6;font-size:.85rem;">No history yet.</span>'}
            </div>

            ${refund.admin_note ? `
            <div class="cardContentStatusHistory">
                <span class="itemLable">Admin note</span>
                <p style="margin:.25rem 0 0;font-size:.9rem;">${refund.admin_note}</p>
            </div>` : ""}

            ${refund.status === "pending" ? `
            <div class="cardBtns">
                <button class="btn delivered refundApproveBtn">Approve</button>
                <button class="btn cancel refundRejectBtn">Reject</button>
            </div>` : `<span style="opacity:.6;font-size:.85rem;">Refund ${refund.status}. No further actions.</span>`}
        </div>
    `;

    // wire up refund buttons
    const approveBtn = card.querySelector(".refundApproveBtn");
    const rejectBtn  = card.querySelector(".refundRejectBtn");
    if (approveBtn) approveBtn.addEventListener("click", () => openRefundConfirmDialog(refund._id, card));
    if (rejectBtn)  rejectBtn.addEventListener("click",  () => handleRefundAction(refund._id, "rejected", "", card));

    return card;
}

// =============================================================================
// REFUND CONFIRM DIALOG — re-auth + double verification
// =============================================================================
function openRefundConfirmDialog(refundId, card) {
    // remove old dialog if exists
    const old = document.getElementById("refundConfirmDialog");
    if (old) old.remove();

    const overlay = document.createElement("div");
    overlay.id = "refundConfirmDialog";
    overlay.style.cssText = `
        position:fixed;inset:0;z-index:100;
        background:rgba(0,0,0,0.6);
        display:flex;align-items:center;justify-content:center;
    `;

    overlay.innerHTML = `
        <div style="background:white;color:black;border-radius:1rem;padding:1.5rem;width:90%;max-width:420px;display:flex;flex-direction:column;gap:1rem;">
            <h5 style="margin:0;text-align:center;">Confirm Refund Approval</h5>
            <p style="margin:0;font-size:.85rem;opacity:.7;text-align:center;">
                This action is irreversible. Please verify your identity and confirm.
            </p>

            <label style="display:flex;flex-direction:column;gap:.3rem;font-size:.9rem;">
                Your Email
                <input type="text" id="refundAuthEmail" placeholder="admin@email.com"
                    style="padding:.4rem .6rem;border:solid 1px #ccc;border-radius:.5rem;">
            </label>
            <label style="display:flex;flex-direction:column;gap:.3rem;font-size:.9rem;">
                Your Password
                <input type="password" id="refundAuthPassword" placeholder="Password"
                    style="padding:.4rem .6rem;border:solid 1px #ccc;border-radius:.5rem;">
            </label>
            <label style="display:flex;flex-direction:column;gap:.3rem;font-size:.9rem;">
                Admin Note (optional)
                <textarea id="refundAdminNote" rows="2" placeholder="Reason for approval..."
                    style="padding:.4rem .6rem;border:solid 1px #ccc;border-radius:.5rem;resize:none;"></textarea>
            </label>

            <label style="display:flex;align-items:center;gap:.5rem;font-size:.9rem;">
                <input type="checkbox" id="refundDoubleConfirm">
                I confirm I want to approve this refund
            </label>

            <small id="refundDialogError" style="color:red;display:none;"></small>

            <div style="display:flex;justify-content:space-evenly;gap:1rem;">
                <button id="refundCancelDialogBtn" class="btn" style="background:lightgrey;color:#333;width:120px;">Cancel</button>
                <button id="refundSubmitDialogBtn" class="btn" style="background:lightgreen;color:#1a4a1a;width:120px;">Approve</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    document.getElementById("refundCancelDialogBtn").addEventListener("click", () => overlay.remove());

    document.getElementById("refundSubmitDialogBtn").addEventListener("click", async () => {
        const email     = document.getElementById("refundAuthEmail").value.trim();
        const password  = document.getElementById("refundAuthPassword").value;
        const note      = document.getElementById("refundAdminNote").value.trim();
        const confirmed = document.getElementById("refundDoubleConfirm").checked;
        const errEl     = document.getElementById("refundDialogError");

        errEl.style.display = "none";

        if (!email || !password) {
            errEl.textContent   = "Email and password are required.";
            errEl.style.display = "block";
            return;
        }
        if (!confirmed) {
            errEl.textContent   = "Please check the confirmation box.";
            errEl.style.display = "block";
            return;
        }

        // ── Re-auth verify via login endpoint ─────────────────────────────────
        try {
            const authRes = await fetch("/api/admin/login", {
                method:      "POST",
                credentials: "include",
                headers:     { "Content-Type": "application/json" },
                body:        JSON.stringify({ email, password }),
            });
            if (!authRes.ok) {
                errEl.textContent   = "Invalid credentials. Action denied.";
                errEl.style.display = "block";
                return;
            }

            overlay.remove();
            await handleRefundAction(refundId, "approved", note, card);

        } catch (err) {
            console.error("[refundAuth]", err);
            errEl.textContent   = "Network error. Please try again.";
            errEl.style.display = "block";
        }
    });
}

async function handleRefundAction(refundId, newStatus, adminNote, card) {
    if (newStatus === "rejected" && !confirm("Reject this refund request? The user will be notified.")) return;

    try {
        const res  = await fetch(`/api/admin/refunds/${refundId}/status`, {
            method:      "PATCH",
            credentials: "include",
            headers:     { "Content-Type": "application/json" },
            body:        JSON.stringify({ new_status: newStatus, admin_note: adminNote }),
        });
        const data = await res.json();
        if (!res.ok) return alert(data.message);

        // ── Update card in place ──────────────────────────────────────────────
        card.querySelector(".orderStatus").textContent = newStatus;
        card.dataset.status = newStatus;

        const btnsArea = card.querySelector(".cardBtns");
        if (btnsArea) btnsArea.innerHTML = `<span style="opacity:.6;font-size:.85rem;">Refund ${newStatus}. No further actions.</span>`;

        const historyContainer = card.querySelector(".cardContentStatusHistory:last-of-type");
        if (historyContainer) {
            const entry = document.createElement("div");
            entry.className = "cardContentStatus";
            entry.innerHTML = `
                <span class="status">
                    pending
                    <i class="fa-solid fa-arrow-right"></i>
                    ${newStatus}
                </span>
                <span>•</span>
                <span class="statusDate">${new Date().toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}</span>
            `;
            historyContainer.appendChild(entry);
        }

    } catch (err) {
        console.error("[handleRefundAction]", err);
        alert("Network error. Please try again.");
    }
}

// =============================================================================
// EXPAND / COLLAPSE
// =============================================================================
// REPLACE the two window functions at the bottom:
window.expandCard = function(button) {
    const card    = button.closest(".cardContainer");
    const content = card.querySelector(".cardContent").cloneNode(true);

    // Remove old dialog if exists
    const old = document.getElementById("orderDetailDialog");
    if (old) old.remove();

    const dialog = document.createElement("dialog");
    dialog.id = "orderDetailDialog";

    const orderId   = card.dataset.orderid;
    const shortId   = card.querySelector(".orderID")?.textContent || "";
    const isRefund  = !!card.dataset.refundid;
    const title     = isRefund
        ? `Refund · Order ${shortId}`
        : `Order ${shortId}`;

    dialog.innerHTML = `
        <div class="dialogInner">
            <div class="dialogInnerHead">
                <h5>${title}</h5>
                <button id="orderDialogClose">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
            <div class="dialogInnerBody"></div>
        </div>`;

    // Make content visible inside dialog
    content.style.cssText = "";
    content.classList.add("expandCard");
    dialog.querySelector(".dialogInnerBody").appendChild(content);

    // Re-wire action buttons inside the dialog content
    content.querySelectorAll(".cardBtns .btn").forEach(btn => {
        btn.addEventListener("click", () => {
            handleOrderAction(btn, card);
            // Update status pill on the original card
            const newStatus = btn.dataset.nextStatus;
            if (newStatus) {
                card.querySelector(".orderStatus").textContent = newStatus;
                card.dataset.status = newStatus;
                // Refresh buttons on original card's hidden content too
                card.querySelector(".cardBtns").innerHTML = buildOrderButtons(newStatus);
            }
            dialog.close();
            dialog.remove();
        });
    });

    // Refund buttons
    const approveBtn = content.querySelector(".refundApproveBtn");
    const rejectBtn  = content.querySelector(".refundRejectBtn");
    if (approveBtn) {
        const refundId = card.dataset.refundid;
        approveBtn.onclick = () => { dialog.close(); openRefundConfirmDialog(refundId, card); };
    }
    if (rejectBtn) {
        const refundId = card.dataset.refundid;
        rejectBtn.onclick = () => { dialog.close(); handleRefundAction(refundId, "rejected", "", card); };
    }

    document.body.appendChild(dialog);
    dialog.showModal();

    document.getElementById("orderDialogClose")
        .addEventListener("click", () => { dialog.close(); dialog.remove(); });

    dialog.addEventListener("click", e => {
        if (e.target === dialog) { dialog.close(); dialog.remove(); }
    });
};

// collapseCard no longer needed but keep stub so existing HTML onclick doesn't crash
window.collapseCard = function(button) {};
})();
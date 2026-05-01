// =============================================================================
// userPortfolio.js  —  My Profile page
// =============================================================================
// Depends on: main.js (session already loaded into state.user)
// Owns: display profile info, inline edit name/avatar, address CRUD via dialog
// =============================================================================

// =============================================================================
// PROVINCES LIST
// =============================================================================

const PROVINCES = [
    "Region / Province",
    "metro-manila", "cavite", "laguna", "batangas", "rizal", "quezon",
    "bulacan", "pampanga", "tarlac", "nueva-ecija", "zambales", "bataan",
    "aurora", "ilocos-norte", "ilocos-sur", "la-union", "pangasinan",
    "benguet", "baguio", "cagayan", "isabela", "nueva-vizcaya", "quirino",
    "albay", "camarines-sur", "camarines-norte", "sorsogon", "catanduanes",
    "masbate",
];

// =============================================================================
// DOM REFS
// =============================================================================

// Profile view
const pfAvatarImg    = document.getElementById("pfAvatarImg");
const pfDisplayName  = document.getElementById("pfDisplayName");
const pfEmail        = document.getElementById("pfEmail");
const pfRole         = document.getElementById("pfRole");
const pfProfileView  = document.getElementById("pfProfileView");

// Profile edit
const pfEditToggle   = document.getElementById("pfEditToggle");
const pfProfileEdit  = document.getElementById("pfProfileEdit");
const pfAvatarEditImg= document.getElementById("pfAvatarEditImg");
const pfAvatarInput  = document.getElementById("pfAvatarInput");
const pfNameInput    = document.getElementById("pfNameInput");
const pfProfileError = document.getElementById("pfProfileError");
const pfEditCancel   = document.getElementById("pfEditCancel");
const pfEditSave     = document.getElementById("pfEditSave");

// Addresses
const pfAddAddressBtn  = document.getElementById("pfAddAddressBtn");
const pfAddressList    = document.getElementById("pfAddressList");
const pfAddressEmpty   = document.getElementById("pfAddressEmpty");

// Address dialog
const pfAddressDialog      = document.getElementById("pfAddressDialog");
const pfAddressDialogTitle = document.getElementById("pfAddressDialogTitle");
const pfAddressDialogClose = document.getElementById("pfAddressDialogClose");
const pfAddrLabel      = document.getElementById("pfAddrLabel");
const pfAddrRecipient  = document.getElementById("pfAddrRecipient");
const pfAddrPhone      = document.getElementById("pfAddrPhone");
const pfAddrLine1      = document.getElementById("pfAddrLine1");
const pfAddrLine2      = document.getElementById("pfAddrLine2");
const pfAddrCity       = document.getElementById("pfAddrCity");
const pfAddrPostal     = document.getElementById("pfAddrPostal");
const pfAddrProvince   = document.getElementById("pfAddrProvince");
const pfAddrIsDefault  = document.getElementById("pfAddrIsDefault");
const pfAddrError      = document.getElementById("pfAddrError");
const pfAddrCancel     = document.getElementById("pfAddrCancel");
const pfAddrSave       = document.getElementById("pfAddrSave");

// =============================================================================
// STATE
// =============================================================================

let pfUser          = null;   // current user object (from session)
let pfEditingAddrId = null;   // address _id being edited, null = new
let pfNewAvatarFile = null;   // staged file before save

// =============================================================================
// BOOT
// =============================================================================

(async function pfBoot() {
    // Wait for main.js boot to finish populating state.user
    // main.js runs boot() which is async — we poll briefly then proceed
    await waitForSession();

    pfUser = state.user;

    // Guest → redirect to signin
    if (!pfUser || pfUser.role === "guest") {
        window.location.href = "./signin.html";
        return;
    }

    populateProvinces();
    renderProfileView();
    renderAddresses();
    bindProfileEvents();
    bindAddressEvents();
})();

// Waits up to 2s for main.js to resolve state.user
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
// PROVINCES
// =============================================================================

function populateProvinces() {
    pfAddrProvince.innerHTML = "";
    PROVINCES.forEach(p => {
        const opt = document.createElement("option");
        opt.value       = p === "Region / Province" ? "" : p;
        opt.textContent = p;
        pfAddrProvince.appendChild(opt);
    });
}

// =============================================================================
// PROFILE — VIEW
// =============================================================================

function renderProfileView() {
    const DEFAULT_AVATAR = "/assets/default_user_icon/defaultUserIcon.png";
    const avatar = pfUser.profile?.avatar_url || DEFAULT_AVATAR;
    const name   = pfUser.profile?.display_name?.trim() || "—";
    const email  = pfUser.email  || "—";
    const role   = pfUser.role   || "—";

    pfAvatarImg.src      = avatar;
    pfAvatarImg.onerror  = () => { pfAvatarImg.src = DEFAULT_AVATAR; };
    pfDisplayName.textContent = name;
    pfEmail.textContent       = email;
    pfRole.textContent        = role.replace(/_/g, " ");

    // Sync edit fields
    pfAvatarEditImg.src  = avatar;
    pfNameInput.value    = pfUser.profile?.display_name?.trim() || "";
}

// =============================================================================
// PROFILE — EDIT TOGGLE
// =============================================================================

function bindProfileEvents() {
    pfEditToggle.addEventListener("click", enterEditMode);
    pfEditCancel.addEventListener("click", exitEditMode);
    pfEditSave.addEventListener("click",   saveProfile);

    // Avatar file pick — preview immediately
    pfAvatarInput.addEventListener("change", () => {
        const file = pfAvatarInput.files[0];
        if (!file) return;
        pfNewAvatarFile = file;
        const reader = new FileReader();
        reader.onload = e => { pfAvatarEditImg.src = e.target.result; };
        reader.readAsDataURL(file);
    });
}

function enterEditMode() {
    pfProfileView.classList.add("pf-hidden");
    pfProfileEdit.classList.remove("pf-hidden");
    pfEditToggle.innerHTML = '<i class="fa-solid fa-x"></i>';
    pfEditToggle.title     = "Cancel edit";
    pfEditToggle.removeEventListener("click", enterEditMode);
    pfEditToggle.addEventListener("click", exitEditMode);
    pfProfileError.textContent = "";
    pfNewAvatarFile = null;
}

function exitEditMode() {
    pfProfileEdit.classList.add("pf-hidden");
    pfProfileView.classList.remove("pf-hidden");
    pfEditToggle.innerHTML = '<i class="fa-solid fa-pen"></i>';
    pfEditToggle.title     = "Edit profile";
    pfEditToggle.removeEventListener("click", exitEditMode);
    pfEditToggle.addEventListener("click", enterEditMode);
    pfProfileError.textContent = "";
    pfNewAvatarFile = null;
    // Reset preview back to saved avatar
    pfAvatarEditImg.src = pfUser.profile?.avatar_url
        || "/assets/default_user_icon/defaultUserIcon.png";
    pfNameInput.value   = pfUser.profile?.display_name?.trim() || "";
}

async function saveProfile() {
    pfProfileError.textContent = "";
    const newName = pfNameInput.value.trim();
    let   avatar_url = pfUser.profile?.avatar_url || null;

    pfEditSave.disabled      = true;
    pfEditSave.textContent   = "Saving…";

    try {
        // Upload new avatar if one was picked
        if (pfNewAvatarFile) {
            try {
                avatar_url = await uploadImage(pfNewAvatarFile);
            } catch (err) {
                pfProfileError.textContent = err.message || "Image upload failed.";
                return;
            }
        }

        // Nothing changed — just exit
        if (newName === (pfUser.profile?.display_name?.trim() || "") &&
            avatar_url === (pfUser.profile?.avatar_url || null)) {
            exitEditMode();
            return;
        }

        const body = {};
        if (newName !== (pfUser.profile?.display_name?.trim() || "")) {
            body.display_name = newName || " "; // space triggers update even if empty
        }
        if (avatar_url !== (pfUser.profile?.avatar_url || null)) {
            body.avatar_url = avatar_url;
        }

        const res  = await fetch("/api/auth/users/me/profile", {
            method:  "PUT",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify(body),
        });
        const data = await res.json();

        if (!res.ok) {
            pfProfileError.textContent = data.message || "Failed to save.";
            return;
        }

        // Update local user object
        pfUser.profile = data.profile;
        state.user     = pfUser;

        // Re-render view
        renderProfileView();

        // Also update header avatar/name via main.js helper
        if (typeof applyHeaderDefaults === "function") applyHeaderDefaults();

        exitEditMode();
        showToast("Profile updated!", "success");

    } finally {
        pfEditSave.disabled    = false;
        pfEditSave.innerHTML   = '<i class="fa-solid fa-floppy-disk"></i> Save';
    }
}

// =============================================================================
// ADDRESSES — RENDER
// =============================================================================

function renderAddresses() {
    const addresses = (pfUser.addresses || []).filter(a => !a.deleted_at);

    // Clear except the empty notice
    pfAddressList.querySelectorAll(".pf-addr-item").forEach(el => el.remove());

    if (!addresses.length) {
        pfAddressEmpty.style.display = "block";
        return;
    }

    pfAddressEmpty.style.display = "none";

    addresses.forEach(addr => {
        const item = document.createElement("div");
        item.className = `pf-addr-item${addr.is_default ? " is-default" : ""}`;
        item.dataset.id = addr._id;

        const fullAddress = [
            addr.line1,
            addr.line2,
            addr.city,
            addr.province,
            addr.postal_code,
            addr.country || "PH",
        ].filter(Boolean).join(", ");

        item.innerHTML = `
            <div>
                <p class="pf-addr-label">
                    ${addr.label || "Address"}
                    ${addr.is_default ? '<span class="pf-addr-badge">Default</span>' : ""}
                </p>
                <p class="pf-addr-text">
                    <strong>${addr.recipient}</strong> · ${addr.phone}<br>
                    ${fullAddress}
                </p>
            </div>
            <div class="pf-addr-actions">
                <button class="pf-btn pf-btn-ghost pf-addr-edit-btn"
                        data-id="${addr._id}">
                    <i class="fa-solid fa-pen"></i>
                </button>
                <button class="pf-btn pf-btn-danger pf-addr-delete-btn"
                        data-id="${addr._id}">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        `;

        pfAddressList.appendChild(item);
    });
}

// =============================================================================
// ADDRESSES — EVENTS
// =============================================================================

function bindAddressEvents() {
    // Open dialog for new address
    pfAddAddressBtn.addEventListener("click", () => openAddressDialog(null));

    // Close dialog
    pfAddressDialogClose.addEventListener("click", closeAddressDialog);
    pfAddrCancel.addEventListener("click",          closeAddressDialog);
    pfAddressDialog.addEventListener("click", e => {
        if (e.target === pfAddressDialog) closeAddressDialog();
    });

    // Save address
    pfAddrSave.addEventListener("click", saveAddress);

    // Edit / delete via event delegation on the list
    pfAddressList.addEventListener("click", e => {
        const editBtn   = e.target.closest(".pf-addr-edit-btn");
        const deleteBtn = e.target.closest(".pf-addr-delete-btn");

        if (editBtn)   openAddressDialog(editBtn.dataset.id);
        if (deleteBtn) deleteAddress(deleteBtn.dataset.id);
    });
}

// =============================================================================
// ADDRESSES — DIALOG OPEN / CLOSE
// =============================================================================

function openAddressDialog(addressId) {
    pfEditingAddrId = addressId;
    pfAddrError.textContent = "";

    if (addressId) {
        // Edit — prefill fields
        const addr = pfUser.addresses.find(a => String(a._id) === String(addressId));
        if (!addr) return;

        pfAddressDialogTitle.textContent = "Edit Address";
        pfAddrLabel.value     = addr.label      || "";
        pfAddrRecipient.value = addr.recipient  || "";
        pfAddrPhone.value     = addr.phone       || "";
        pfAddrLine1.value     = addr.line1       || "";
        pfAddrLine2.value     = addr.line2       || "";
        pfAddrCity.value      = addr.city        || "";
        pfAddrPostal.value    = addr.postal_code || "";
        pfAddrProvince.value  = addr.province    || "";
        pfAddrIsDefault.checked = addr.is_default || false;
    } else {
        // New — clear fields
        pfAddressDialogTitle.textContent = "Add Address";
        pfAddrLabel.value       = "";
        pfAddrRecipient.value   = "";
        pfAddrPhone.value       = "";
        pfAddrLine1.value       = "";
        pfAddrLine2.value       = "";
        pfAddrCity.value        = "";
        pfAddrPostal.value      = "";
        pfAddrProvince.value    = "";
        pfAddrIsDefault.checked = pfUser.addresses.length === 0; // default if first
    }

    pfAddressDialog.showModal();
}

function closeAddressDialog() {
    pfAddressDialog.close();
    pfAddrError.textContent = "";
    pfEditingAddrId = null;
}

// =============================================================================
// ADDRESSES — SAVE (add or edit)
// =============================================================================

async function saveAddress() {
    pfAddrError.textContent = "";

    const recipient  = pfAddrRecipient.value.trim();
    const phone      = pfAddrPhone.value.trim();
    const line1      = pfAddrLine1.value.trim();
    const city       = pfAddrCity.value.trim();
    const postal     = pfAddrPostal.value.trim();
    const province   = pfAddrProvince.value;

    if (!recipient || !phone || !line1 || !city || !postal || !province) {
        pfAddrError.textContent = "Please fill in all required fields (marked *).";
        return;
    }

    const body = {
        label:       pfAddrLabel.value.trim() || "Home",
        recipient,
        phone,
        line1,
        line2:       pfAddrLine2.value.trim(),
        city,
        province,
        postal_code: postal,
        country:     "PH",
        is_default:  pfAddrIsDefault.checked,
    };

    pfAddrSave.disabled    = true;
    pfAddrSave.textContent = "Saving…";

    try {
        let res, data;

        if (pfEditingAddrId) {
            // Edit existing
            res  = await fetch(`/api/auth/users/me/addresses/${pfEditingAddrId}`, {
                method:  "PUT",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify(body),
            });
        } else {
            // Add new
            res  = await fetch("/api/auth/users/me/addresses", {
                method:  "POST",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify(body),
            });
        }

        data = await res.json();

        if (!res.ok) {
            pfAddrError.textContent = data.message || "Failed to save address.";
            return;
        }

        // Update local user addresses from response
        pfUser.addresses = data.addresses;
        state.user       = pfUser;

        renderAddresses();
        closeAddressDialog();
        showToast(pfEditingAddrId ? "Address updated!" : "Address added!", "success");

    } catch (err) {
        console.error("[saveAddress]", err);
        pfAddrError.textContent = "Something went wrong. Please try again.";
    } finally {
        pfAddrSave.disabled    = false;
        pfAddrSave.innerHTML   = '<i class="fa-solid fa-floppy-disk"></i> Save';
    }
}

// =============================================================================
// ADDRESSES — DELETE
// =============================================================================

async function deleteAddress(addressId) {
    if (!confirm("Remove this address?")) return;

    try {
        const res  = await fetch(`/api/auth/users/me/addresses/${addressId}`, {
            method: "DELETE",
        });
        const data = await res.json();

        if (!res.ok) {
            showToast(data.message || "Failed to remove address.", "danger");
            return;
        }

        pfUser.addresses = data.addresses;
        state.user       = pfUser;

        renderAddresses();
        showToast("Address removed.", "success");

    } catch (err) {
        console.error("[deleteAddress]", err);
        showToast("Something went wrong.", "danger");
    }
}

// =============================================================================
// IMAGE UPLOAD  (reuses same ImageKit flow as register.js)
// =============================================================================

async function uploadImage(file) {
    const authRes  = await fetch("/api/auth/upload", { credentials: "include" });
    const authData = await authRes.json();

    const form = new FormData();
    form.append("file",              file);
    form.append("fileName",          file.name);
    form.append("publicKey",         authData.publicKey);
    form.append("signature",         authData.signature);
    form.append("expire",            authData.expire);
    form.append("token",             authData.token);
    form.append("folder",            "/StreetFlex/avatars");
    form.append("useUniqueFileName", "true");

    const uploadRes  = await fetch("https://upload.imagekit.io/api/v1/files/upload", {
        method:  "POST",
        headers: { Accept: "application/json" },
        body:    form,
    });
    const uploadData = await uploadRes.json();

    if (!uploadRes.ok) throw new Error(uploadData.message || "Image upload failed.");
    return uploadData.url;
}
// ===== ANIMATIONS FOR CARDS ===== \\
const card1 = document.getElementById('card1');
const card2 = document.getElementById('card2');
const card3 = document.getElementById('card3');
const successMsg = document.getElementById('success-msg');
const loginMsg = document.getElementById('login-msg');
const card1Actions = document.getElementById('card1-actions');
const loginErrorMsg = document.getElementById("login-error-msg");
const registerErrorMsg1 = document.getElementById("register-error-msg1");
const registerErrorMsg2 = document.getElementById("register-error-msg2");
// ===== ANIMATIONS FOR CARDS ===== END ===== \\

// ===== FIELDS ===== \\
const userEmail = document.getElementById("userEmail");
const userPassword = document.getElementById("userPassword");
const registerUserEmail = document.getElementById("registerUserEmail");
const registerUserPassword = document.getElementById("registerUserPassword");
const confirmRegisterUserPassword = document.getElementById("confirmRegisterUserPassword");
const userName = document.getElementById("userName");
const userIcon = document.getElementById("uploadImage");
const recipient = document.getElementById("recipient");
const phone = document.getElementById("phone");
const line1 = document.getElementById("line1");
const line2 = document.getElementById("line2");
const city = document.getElementById("city");
const postal = document.getElementById("postal");
const region = document.getElementById("region");
let address;

const card4 = document.getElementById("card4");
const policyErrorMsg = document.getElementById("policy-error-msg");


let pendingRegistration = null;
// ===== FIELDS ===== END ===== \\

function removeAnimClasses(el) {
    el.classList.remove(
        'enter-from-left','exit-to-right',
        'enter-from-right','exit-to-left',
        'enter-from-back','exit-to-back'
    );
}
function animEnd(el, cb) {
    el.addEventListener('animationend', cb, { once: true });
}
  // On load: Card 1 slides in from left
window.addEventListener('load', () => {
    card1.classList.add('enter-from-left');
    animEnd(card1, () => {
        card1.style.opacity = '1';
        card1.style.pointerEvents = 'all';
    });
});
  // LOGIN: show success msg inside card 1
async function handleLogin() {
    clearError(loginErrorMsg);
    const result = await loginUser(userEmail.value, userPassword.value);

    if (result.ok) {
        card1Actions.style.display = 'none';
        loginMsg.classList.add('show');

        setTimeout(()=>{
            if(result.path != ""){
                window.location.href = result.path;
            }
        },3000)
        return;
    }
    showError(loginErrorMsg, result.message);
}


  // REGISTER: card1 exits right, card2 pops in from back
function handleRegister() {
    card1.style.pointerEvents = 'none';
    removeAnimClasses(card1);
    card1.classList.add('exit-to-right');

    animEnd(card1, () => {
        card1.style.opacity = '0';
        showCard2();
    });
}
function showCard2() {
    removeAnimClasses(card2);
    card2.classList.add('enter-from-back');
    animEnd(card2, () => {
        card2.style.opacity = '1';
        card2.style.pointerEvents = 'all';
    });
}
  // CARD 2 BACK: card2 goes to back, card1 slides in from right
function card2Back() {
    card2.style.pointerEvents = 'none';
    removeAnimClasses(card2);
    card2.classList.add('exit-to-back');
    animEnd(card2, () => {
        card2.style.opacity = '0';
        // Reset card1 state
        loginMsg.classList.remove('show');
        card1Actions.style.display = '';
        showCard1FromRight();
    });
}
function showCard1FromRight() {
    removeAnimClasses(card1);
    card1.classList.add('enter-from-right');
    animEnd(card1, () => {
        card1.style.opacity = '1';
        card1.style.pointerEvents = 'all';
    });
}
  // CARD 2 NEXT/SKIP: card2 fades to back, card3 pops in
function card2Next() {
    clearError(registerErrorMsg1);
    if(registerUserPassword.value.trim() !== confirmRegisterUserPassword.value.trim()){
        showError(registerErrorMsg1, "Passwords does not match.");
        return;
    }
    if(registerUserEmail.value.trim().length < 8 || registerUserPassword.value.trim().length < 8 || confirmRegisterUserPassword.value.trim().length < 8){
        showError(registerErrorMsg1, "Both email and password must be 8 or more characters.");
        return;
    }
    if(!registerUserEmail.value.trim() || !registerUserPassword.value.trim() || !confirmRegisterUserPassword.value.trim()){
        showError(registerErrorMsg1, "Please Fill The required Fields.");
        return;
    }
    card2.style.pointerEvents = 'none';
    removeAnimClasses(card2);
    card2.classList.add('exit-to-back');
    animEnd(card2, () => {
        card2.style.opacity = '0';
        showCard3();
    });
    clearError(registerErrorMsg1);
}
function showCard3() {
    removeAnimClasses(card3);
    card3.classList.add('enter-from-back');
    animEnd(card3, () => {
        card3.style.opacity = '1';
        card3.style.pointerEvents = 'all';
    });
}
  // CARD 3 BACK: card3 goes to back, card2 pops in
function card3Back() {
    card3.style.pointerEvents = 'none';
    removeAnimClasses(card3);
    card3.classList.add('exit-to-back');
    animEnd(card3, () => {
        card3.style.opacity = '0';
        showCard2();
    });
}
  // CARD 3 SKIP/SUBMIT: card3 vanishes, success message appears
async function card3Finish() {
    clearError(registerErrorMsg2);
    const addressFields = [recipient.value.trim(), phone.value.trim(), line1.value.trim(), city.value.trim(), postal.value.trim(), region.value];
    const anyFilled     = addressFields.some(f => f !== "" && f !== areasForDelivery[0]);

    let address = null;
    if (anyFilled) {
        if (!recipient.value.trim() || !phone.value.trim() || !line1.value.trim() || 
            !city.value.trim() || !postal.value.trim() || !region) {
            showError(registerErrorMsg2, "Please fill in all required address fields or leave all empty to skip.");
            return;
        }
        address = {
            recipient:   recipient.value.trim(),
            phone:       phone.value.trim(),
            line1:       line1.value.trim(),
            line2:       line2.value.trim(),
            city:        city.value.trim(),
            province:    region.value,
            postal_code: postal.value.trim(),
        };
    }
    // ── Image upload (optional) ─────────────────────────────────────────────
    let avatar_url = null;
    const imageFile = userIcon.files[0];
    if (imageFile) {
        try {
            showError(registerErrorMsg2, "Uploading image...");  // temp status
            avatar_url = await uploadImage(imageFile);
            clearError(registerErrorMsg2);
        } catch (err) {
            showError(registerErrorMsg2, err.message);
            return;
        }
    }
    pendingRegistration = {
        email:      registerUserEmail.value.trim(),
        password:   registerUserPassword.value,
        username:   userName.value.trim() || null,
        avatar_url,
        address,
    };
    card3.style.pointerEvents = 'none';
    removeAnimClasses(card3);
    card3.classList.add('exit-to-back');
    animEnd(card3, () => { card3.style.opacity = '0'; showCard4(); });
    }

function showSuccess() {
    successMsg.style.pointerEvents = 'all';
    successMsg.classList.add('show');
}
function showError(ref, mes) {
    ref.style.display = "block";
    ref.textContent = `${mes}`;
}
function clearError(ref) {
    ref.style.display = "none";
    ref.textContent = "";
}
  // RESET
function resetAll() {
    [card1, card2, card3].forEach(c => {
        removeAnimClasses(c);
        c.style.opacity = '0';
        c.style.pointerEvents = 'none';
    });
    successMsg.classList.remove('show');
    successMsg.style.pointerEvents = 'none';
    loginMsg.classList.remove('show');
    card1Actions.style.display = '';

    setTimeout(() => {
        removeAnimClasses(card1);
        card1.classList.add('enter-from-left');
        animEnd(card1, () => {
            card1.style.opacity = '1';
            card1.style.pointerEvents = 'all';
        });
    }, 100);
}
const areasForDelivery = [
        "Region / Province",
        "metro-manila",
        "cavite",
        "laguna",
        "batangas",
        "rizal",
        "quezon",
        "bulacan",
        "pampanga",
        "tarlac",
        "nueva-ecija",
        "zambales",
        "bataan",
        "aurora",
        "ilocos-norte",
        "ilocos-sur",
        "la-union",
        "pangasinan",
        "benguet",
        "baguio",
        "cagayan",
        "isabela",
        "nueva-vizcaya",
        "quirino",
        "albay",
        "camarines-sur",
        "camarines-norte",
        "sorsogon",
        "catanduanes",
        "masbate"
];
areasForDelivery.forEach(city =>{
        region.innerHTML += `<option value="${city}">${city}</option>`;
})




async function loginUser(email, password) {
    try {
        const res = await fetch("/api/auth/login", {
            method:      "POST",
            credentials: "include",           // required for httpOnly cookie
            headers:     { "Content-Type": "application/json" },
            body:        JSON.stringify({ email: email.trim().toLowerCase(), password }),
        });

        const data = await res.json();

        if (res.ok)         return { ok: true,  user: data.user, message: data.message, path: data.path };
        if (res.status === 429) return { ok: false, message: "Too many attempts. Please wait and try again." };
        if (res.status === 403) return { ok: false, message: data.message, ban_reason: data.ban_reason ?? null, banned: true };

        // 400 | 401 | 500
        return { ok: false, message: data.message ?? "Something went wrong." };

    } catch (err) {
        console.error("[loginUser]", err);
        return { ok: false, message: "Network error. Please check your connection." };
    }
}
// ===== LOGOUT ===== //
async function logoutUser() {
    try {
        const res  = await fetch("/api/auth/logout", {
            method:      "POST",
            credentials: "include",   // sends the auth_token cookie
        });
        const data = await res.json();

        if (res.ok) return { ok: true, message: data.message };
        return { ok: false, message: data.message ?? "Logout failed." };

    } catch (err) {
        console.error("[logoutUser]", err);
        return { ok: false, message: "Network error. Please check your connection." };
    }
}


// ===== IMAGEKIT UPLOAD ===== //
async function uploadImage(file) {
    // Step 1 — get signature from your backend
    const authRes  = await fetch("/api/auth/upload", { credentials: "include" });
    const authData = await authRes.json();

    // Step 2 — upload to ImageKit
    const form = new FormData();
    form.append("file",            file);
    form.append("fileName",        file.name);
    form.append("publicKey",       authData.publicKey);
    form.append("signature",       authData.signature);
    form.append("expire",          authData.expire);
    form.append("token",           authData.token);
    form.append("folder",          "/StreetFlex/avatars");
    form.append("useUniqueFileName", "true");

    const uploadRes  = await fetch("https://upload.imagekit.io/api/v1/files/upload", {
        method:  "POST",
        headers: { Accept: "application/json" },
        body:    form,
    });
    const uploadData = await uploadRes.json();

    if (!uploadRes.ok) throw new Error(uploadData.message ?? "Image upload failed.");

    return uploadData.url; // e.g. https://ik.imagekit.io/StreetFlex/avatars/filename.jpg
}


// ===== REGISTER API ===== //
async function registerUser({ email, password, username, avatar_url, address }) {
    try {
        const res  = await fetch("/api/auth/register", {
            method:      "POST",
            credentials: "include",
            headers:     { "Content-Type": "application/json" },
            body:        JSON.stringify({ email, password, username, avatar_url, address }),
        });
        const data = await res.json();
        if (res.ok)             return { ok: true,  user: data.user };
        if (res.status === 409) return { ok: false, message: data.message };
        if (res.status === 429) return { ok: false, message: "Too many attempts. Please wait." };
        return { ok: false, message: data.message ?? "Something went wrong." };
    } catch (err) {
        console.error("[registerUser]", err);
        return { ok: false, message: "Network error. Please check your connection." };
    }
}

(function syncStageToTallestCard() {
    const stage   = document.querySelector('.stage');
    const cards   = [card1, card2, card3];

    // Temporarily make all cards visible but off-screen to measure real height
    cards.forEach(c => {
        c.style.visibility = 'hidden';
        c.style.opacity    = '1';
        c.style.position   = 'relative';
    });

    const tallest = Math.max(...cards.map(c => c.scrollHeight));

    // Restore cards to their animation-ready state
    cards.forEach(c => {
        c.style.visibility = '';
        c.style.opacity    = '0';
        c.style.position   = '';
    });

    stage.style.height = (tallest + 32) + 'px'; // 32px buffer
})();


// Center each card vertically within the stage
(function centerCardsInStage() {
    const stage = document.querySelector('.stage');
    const cards = [card1, card2, card3];

    // Temporarily make all cards visible to measure
    cards.forEach(c => {
        c.style.visibility = 'hidden';
        c.style.opacity    = '1';
        c.style.position   = 'relative';
    });

    const stageHeight = stage.offsetHeight;

    cards.forEach(c => {
        const cardHeight = c.scrollHeight;
        const topOffset  = Math.max(0, (stageHeight - cardHeight) / 2);
        c.style.top      = topOffset + 'px';

        // Restore
        c.style.visibility = '';
        c.style.opacity    = '0';
        c.style.position   = '';
    });
})();


// =============================================================================
// POLICY CARD (Card 4)
// =============================================================================
// Add these blocks to register.js.
// Changes to existing code:
//   - card3Finish() no longer calls registerUser() directly.
//     It now calls showCard4() instead.
//   - syncStageToTallestCard and centerCardsInStage must include card4.
//     Update both IIFEs: const cards = [card1, card2, card3, card4];
// =============================================================================

// ── Policy content ────────────────────────────────────────────────────────────
// Edit these objects to update policy text site-wide.
// version: bump this string when you update the text — triggers re-acceptance
//          from all users on next login via User.policy_version_accepted check.

const POLICIES = {
    privacy_policy: {
        version: "1.0",
        title:   "Privacy Policy",
        content: `
            <p><strong>Effective date: January 1, 2025</strong></p>
            <p>StreetFlex ("we", "us", or "our") is committed to protecting your personal
            information. This policy explains what data we collect, how we use it, and
            your rights regarding that data.</p>
            <p><strong>What we collect:</strong> When you register, we collect your email
            address, display name, and optional profile photo. When you place an order,
            we collect your shipping address and phone number. We do not store payment
            card details.</p>
            <p><strong>How we use it:</strong> We use your information to process orders,
            send order status updates, respond to support inquiries, and improve our
            services. We never sell your personal data to third parties.</p>
            <p><strong>Data retention:</strong> We retain your account data for as long
            as your account is active. You may request deletion at any time by contacting
            support.</p>
            <p><strong>Your rights:</strong> You have the right to access, correct, or
            delete your personal data. Contact us at privacy@streetflex.ph.</p>
        `,
    },

    terms_of_service: {
        version: "1.0",
        title:   "Terms of Service",
        content: `
            <p><strong>Effective date: January 1, 2025</strong></p>
            <p>By creating an account and using StreetFlex, you agree to the following
            terms. Please read them carefully.</p>
            <p><strong>Eligibility:</strong> You must be at least 13 years old to create
            an account. By registering, you confirm that you meet this requirement.</p>
            <p><strong>Account responsibility:</strong> You are responsible for maintaining
            the security of your account credentials. Do not share your password. Notify
            us immediately if you suspect unauthorized access.</p>
            <p><strong>Orders and payments:</strong> All orders are subject to product
            availability. We reserve the right to cancel orders at our discretion. Cash
            on delivery (COD) is currently our only accepted payment method.</p>
            <p><strong>Returns and refunds:</strong> Refund requests must be submitted
            within 7 days of delivery. Items must be in their original condition.
            Approved refunds will be processed within 5–10 business days.</p>
            <p><strong>Prohibited conduct:</strong> You agree not to use StreetFlex for
            any unlawful purpose, to attempt to gain unauthorized access, or to engage
            in any activity that disrupts our services.</p>
            <p><strong>Changes to terms:</strong> We may update these terms at any time.
            Continued use of StreetFlex after changes constitutes acceptance.</p>
        `,
    },

    cookie_policy: {
        version: "1.0",
        title:   "Cookie Policy",
        content: `
            <p><strong>Effective date: January 1, 2025</strong></p>
            <p>StreetFlex uses cookies and similar technologies to operate our platform
            and improve your experience.</p>
            <p><strong>What are cookies:</strong> Cookies are small text files stored
            on your device. They help us remember your session, preferences, and
            shopping cart between visits.</p>
            <p><strong>Cookies we use:</strong></p>
            <p><em>auth_token</em> — A secure, HttpOnly session cookie set on login.
            Required to keep you signed in. Expires after 30 days.</p>
            <p><em>guest_token</em> — Set before login to preserve your cart as a
            guest. Cleared when you register or sign in.</p>
            <p><strong>Third-party cookies:</strong> We use ImageKit for image hosting.
            Their services may set their own cookies subject to their privacy policy.</p>
            <p><strong>Your choices:</strong> You can disable cookies in your browser
            settings, but doing so will prevent you from staying signed in or using
            the cart and checkout features.</p>
        `,
    },
};

// ── DOM refs for card 4 ───────────────────────────────────────────────────────

// ── Populate policy content on script load ────────────────────────────────────
(function populatePolicyContent() {
    Object.entries(POLICIES).forEach(([key, policy]) => {
        const el = document.getElementById(`content-${key}`);
        if (el) el.innerHTML = policy.content;
    });
})();

// ── Accordion toggle ──────────────────────────────────────────────────────────
function togglePolicy(key) {
    const content = document.getElementById(`content-${key}`);
    const chevron = document.getElementById(`chevron-${key}`);
    if (!content || !chevron) return;

    const isOpen = content.classList.contains("open");
    content.classList.toggle("open", !isOpen);
    chevron.classList.toggle("open", !isOpen);
}


function showCard4() {
    // Reset checkboxes each time card 4 is shown
    document.querySelectorAll(".policy-check").forEach(cb => { cb.checked = false; });
    if (policyErrorMsg) { policyErrorMsg.style.display = "none"; policyErrorMsg.textContent = ""; }

    removeAnimClasses(card4);
    card4.classList.add("enter-from-back");
    animEnd(card4, () => {
        card4.style.opacity    = "1";
        card4.style.pointerEvents = "all";
    });
}

// ── Card 4 back → Card 3 ──────────────────────────────────────────────────────
function card4Back() {
    card4.style.pointerEvents = "none";
    removeAnimClasses(card4);
    card4.classList.add("exit-to-back");
    animEnd(card4, () => {
        card4.style.opacity = "0";
        showCard3();
    });
}

// ── Card 4 confirm — validate checkboxes → register → accept policies ─────────
async function card4Confirm() {
    if (policyErrorMsg) { policyErrorMsg.style.display = "none"; }

    // All three must be checked
    const allChecked = Object.keys(POLICIES).every(key => {
        const cb = document.getElementById(`check-${key}`);
        return cb && cb.checked;
    });

    if (!allChecked) {
        if (policyErrorMsg) {
            policyErrorMsg.textContent = "Please read and accept all three policies to continue.";
            policyErrorMsg.style.display = "block";
        }
        return;
    }

    if (!pendingRegistration) {
        if (policyErrorMsg) {
            policyErrorMsg.textContent = "Registration data lost. Please go back and try again.";
            policyErrorMsg.style.display = "block";
        }
        return;
    }

    // Disable button during request
    const confirmBtn = card4.querySelector(".btn-accent2");
    if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = "Creating account…"; }

    try {
        // ── Step 1: Register the user ─────────────────────────────────────────
        const result = await registerUser(pendingRegistration);

        if (!result.ok) {
            if (policyErrorMsg) {
                policyErrorMsg.textContent = result.message || "Registration failed.";
                policyErrorMsg.style.display = "block";
            }
            return;
        }

        // ── Step 2: Record policy acceptances (fire and forget — non-blocking) ─
        const policyTypes = Object.keys(POLICIES);
        await Promise.allSettled(
            policyTypes.map(policy_type =>
                fetch("/api/auth/accept-policy", {
                    method:  "POST",
                    headers: { "Content-Type": "application/json" },
                    body:    JSON.stringify({
                        policy_type,
                        policy_version: POLICIES[policy_type].version,
                    }),
                })
            )
        );

        // ── Step 3: Clear pending data and show success ───────────────────────
        pendingRegistration = null;
        card4.style.pointerEvents = "none";
        removeAnimClasses(card4);
        card4.classList.add("exit-to-back");
        animEnd(card4, () => {
            card4.style.opacity = "0";
            showSuccess();
        });

    } catch (err) {
        console.error("[card4Confirm]", err);
        if (policyErrorMsg) {
            policyErrorMsg.textContent = "Network error. Please check your connection.";
            policyErrorMsg.style.display = "block";
        }
    } finally {
        if (confirmBtn) {
            confirmBtn.disabled    = false;
            confirmBtn.textContent = "Accept & Create Account";
        }
    }
}

// =============================================================================
// INSTRUCTIONS — changes needed in the existing register.js
// =============================================================================
//
// 1. In card3Finish(), find the final section that calls registerUser():
//
//      const result = await registerUser({ email, password, username, avatar_url, address });
//      if (result.ok) {
//          card3.style.pointerEvents = 'none';
//          removeAnimClasses(card3);
//          card3.classList.add('exit-to-back');
//          animEnd(card3, () => { card3.style.opacity = '0'; showSuccess(); });
//          return;
//      }
//      showError(registerErrorMsg2, result.message);
//
//    REPLACE the entire block above with:
//
//      pendingRegistration = {
//          email:      registerUserEmail.value.trim(),
//          password:   registerUserPassword.value,
//          username:   userName.value.trim() || null,
//          avatar_url,
//          address,
//      };
//      card3.style.pointerEvents = 'none';
//      removeAnimClasses(card3);
//      card3.classList.add('exit-to-back');
//      animEnd(card3, () => { card3.style.opacity = '0'; showCard4(); });
//
// 2. In syncStageToTallestCard IIFE, change:
//      const cards = [card1, card2, card3];
//    to:
//      const cards = [card1, card2, card3, card4];
//
// 3. In centerCardsInStage IIFE, make the same change:
//      const cards = [card1, card2, card3, card4];
//
// 4. In resetAll(), add card4 to the reset loop:
//      [card1, card2, card3, card4].forEach(c => { ... });
//
// =============================================================================
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import {MAX_SESSIONS} from "../config/constants.js";
import RoleChangeLog from "../models/RoleChangeLog.js";

import { BCRYPT_ROUNDS, generateToken, sessionExpiry, sanitizeUser } from "../utils/controllerUtils.js";
import { User, Session, PolicyAgreement } from "../models/modelCenter.js";

// =============================================================================
// REGISTER
// =============================================================================

/**
 * POST /auth/register
 *
 * Upgrades an existing guest User doc to a full customer account in-place.
 * Because guests are real User documents, the _id never changes — the cart
 * and any other guest data are automatically retained with no migration needed.
 *
 * Body:
 *   required — email, password
 *   optional — username (display_name), avatar_url
 *   optional — address { recipient, phone, line1, line2,
 *                         city, province, postal_code, country }
 */
async function register(req, res) {
  const { email, password, username, avatar_url, address } = req.body;

  // ── Validation ────────────────────────────────────────────────────────────
  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required." });
  }
  if (password.length < 8) {
    return res.status(400).json({ message: "Password must be at least 8 characters." });
  }
  if (address) {
    const { recipient, phone, line1, city, province, postal_code } = address;
    if (!recipient || !phone || !line1 || !city || !province || !postal_code) {
      return res.status(400).json({
        message: "Address is missing required fields: recipient, phone, line1, city, province, postal_code.",
      });
    }
  }

  const dbSession = await mongoose.startSession();
  dbSession.startTransaction();

  try {
    // ── Duplicate email check ─────────────────────────────────────────────────
    const existing = await User.findOne({ email: email.toLowerCase().trim() }).session(dbSession);
    if (existing) {
      await dbSession.abortTransaction();
      dbSession.endSession();
      return res.status(409).json({ message: "An account with that email already exists." });
    }

    const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const builtAddress = address
      ? [{
          label:       "Home",
          recipient:   address.recipient,
          phone:       address.phone,
          line1:       address.line1,
          line2:       address.line2 || "",
          city:        address.city,
          province:    address.province,
          postal_code: address.postal_code,
          country:     address.country || "PH",
          is_default:  true,
        }]
      : [];

    // ── Resolve guest session ─────────────────────────────────────────────────
    // If a guest_token cookie exists, upgrade that guest User doc in-place.
    // The _id stays the same so the cart is already theirs — nothing to migrate.
    const guestToken   = req.cookies?.guest_token || req.headers["x-guest-token"];
    const guestSession = guestToken
      ? await Session.findOne({ guest_token: guestToken, is_guest: true }).session(dbSession)
      : null;

    let newUser;

    if (guestSession) {
      // ── Upgrade the existing guest User doc ───────────────────────────────
      newUser = await User.findOneAndUpdate(
        { _id: guestSession.user_id, role: "guest" },
        {
          $set: {
            email,
            password_hash,
            role:                   "customer",
            "profile.display_name": username   || "",
            "profile.avatar_url":   avatar_url || null,
            ...(builtAddress.length && { addresses: builtAddress }),
          },
        },
        { new: true, session: dbSession }
      );

      // Drop the guest session — a proper auth session replaces it below
      await Session.deleteOne({ _id: guestSession._id }).session(dbSession);

    } else {
      // ── No guest session found — create a fresh User doc ──────────────────
      const [created] = await User.create(
        [{
          email,
          password_hash,
          role:    "customer",
          profile: {
            display_name: username   || "",
            avatar_url:   avatar_url || null,
          },
          addresses: builtAddress,
        }],
        { session: dbSession }
      );
      newUser = created;
    }

    // ── Create auth session ───────────────────────────────────────────────────
    const token = generateToken();
    await Session.create(
      [{
        user_id:    newUser._id,
        token,
        is_guest:   false,
        ip_address: req.ip || null,
        user_agent: req.headers["user-agent"] || null,
        expires_at: sessionExpiry(),
      }],
      { session: dbSession }
    );

    await dbSession.commitTransaction();
    dbSession.endSession();

    res.cookie("auth_token", token, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === "production",
      sameSite: "Lax",
      maxAge:   30 * 24 * 60 * 60 * 1000,
    });
    res.clearCookie("guest_token");

    return res.status(201).json({
      message: "Account created successfully.",
      user:    sanitizeUser(newUser),
    });

  } catch (err) {
    await dbSession.abortTransaction();
    dbSession.endSession();
    console.error("[register]", err);
    return res.status(500).json({ message: `Something went wrong. Please try again. ${err}` });
  }
}

// =============================================================================
// LOGIN
// =============================================================================

/**
 * POST /auth/login
 *
 * Body: email, password
 */
async function login(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required." });
  }

  try {
    const user = await User.findOne({ email: email.toLowerCase().trim() });

    // Always run bcrypt even when user not found to prevent timing attacks
    const dummyHash     = "$2b$12$invalidhashfortimingprotection000000000000000000000000";
    const hashToCheck   = user?.password_hash ?? dummyHash;
    const passwordMatch = await bcrypt.compare(password, hashToCheck);

    // Reject guests, soft-deleted accounts, wrong credentials
    if (!user || !passwordMatch || user.role === "guest" || user.deleted_at) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    if (user.is_banned) {
      return res.status(403).json({
        message:    "Your account has been suspended.",
        ban_reason: user.ban_reason || null,
      });
    }

    // Find all active sessions for this user, oldest first
    const sessions = await Session.find({ user_id: user._id, is_guest: false })
    .sort({ createdAt: 1 });

    // If the user already has max sessions, remove the oldest
    if (sessions.length >= MAX_SESSIONS) {
      await Session.deleteOne({ _id: sessions[0]._id });
      console.log("session greater than 3");
    }

    const token = generateToken();
    await Session.create({
      user_id:    user._id,
      token,
      is_guest:   false,
      ip_address: req.ip || null,
      user_agent: req.headers["user-agent"] || null,
      expires_at: sessionExpiry(),
    });

    await User.updateOne({ _id: user._id }, { $set: { last_login_at: new Date() } });

    res.cookie("auth_token", token, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === "production",
      sameSite: "Lax",
      maxAge:   30 * 24 * 60 * 60 * 1000,
    });

    let addPath = "";
    if(user.role === "admin" || user.role === "super_admin"){
      addPath = `${process.env.ADMIN_PATH}`;
    }

    return res.status(200).json({
      message: "Logged in successfully.",
      user:    sanitizeUser(user),
      path: addPath
    });

  } catch (err) {
    console.error("[login]", err);
    return res.status(500).json({ message: "Something went wrong. Please try again." });
  }
}

// =============================================================================
// LOGOUT
// =============================================================================

/**
 * POST /auth/logout
 *
 * Requires auth middleware.
 */
async function logout(req, res) {
  try {
    let successMes = "Already Logged out.";
    const token = req.cookies?.auth_token;
    if (token) {
      await Session.deleteOne({ token });
      successMes = "Logged out successfully."
    }

    res.clearCookie("auth_token", {
      httpOnly: true,
      secure:   process.env.NODE_ENV === "production",
      sameSite: "Lax",
    });

    return res.status(200).json({ message: successMes });

  } catch (err) {
    console.error("[logout]", err);
    return res.status(500).json({ message: `Something went wrong. Please try again.${err}` });
  }
}

// =============================================================================
// ACCEPT POLICY
// =============================================================================

/**
 * POST /auth/accept-policy
 *
 * Called when the user clicks "Accept" on the privacy policy modal.
 * Works for both guests and registered users.
 *
 * Body:
 *   policy_type    — "privacy_policy" | "terms_of_service" | "cookie_policy"
 *   policy_version — e.g. "1.0"
 *
 * Requires auth middleware.
 */
async function acceptPolicy(req, res) {
  const { policy_type, policy_version } = req.body;

  const validTypes = ["privacy_policy", "terms_of_service", "cookie_policy"];

  if (!policy_type || !policy_version) {
    return res.status(400).json({ message: "policy_type and policy_version are required." });
  }
  if (!validTypes.includes(policy_type)) {
    return res.status(400).json({
      message: `policy_type must be one of: ${validTypes.join(", ")}.`,
    });
  }

  try {
    // Permanent legal audit record — never deleted
    await PolicyAgreement.create({
      user_id:        req.user._id,
      policy_type,
      policy_version,
      accepted_at:    new Date(),
      ip_address:     req.ip || null,
      user_agent:     req.headers["user-agent"] || null,
    });

    // Fast-lookup field on User — only privacy_policy gates the modal re-appearing.
    // Bump CURRENT_POLICY_VERSION in your config to force all users to re-accept.
    if (policy_type === "privacy_policy") {
      await User.updateOne(
        { _id: req.user._id },
        { $set: { policy_version_accepted: policy_version } }
      );
    }

    return res.status(200).json({ message: "Policy accepted." });

  } catch (err) {
    console.error("[acceptPolicy]", err);
    return res.status(500).json({ message: "Something went wrong. Please try again." });
  }
}

// =============================================================================
// EDIT PROFILE
// =============================================================================

/**
 * PUT /users/me/profile
 *
 * Updates the user's display name and/or avatar.
 * All fields are optional — only send what you want to change.
 *
 * Body (all optional):
 *   display_name — new display name
 *   avatar_url   — new avatar URL
 *
 * Requires auth middleware.
 */
async function editProfile(req, res) {
  const { display_name, avatar_url } = req.body;

  // At least one field must be provided
  if (display_name === undefined && avatar_url === undefined) {
    return res.status(400).json({ message: "Provide at least one field to update: display_name, avatar_url." });
  }

  // Build only the fields that were actually sent
  const updates = {};
  if (display_name !== undefined) {
    if (typeof display_name !== "string" || display_name.trim().length === 0) {
      return res.status(400).json({ message: "display_name must be a non-empty string." });
    }
    updates["profile.display_name"] = display_name.trim();
  }
  if (avatar_url !== undefined) {
    // Allow null to clear the avatar
    updates["profile.avatar_url"] = avatar_url || null;
  }

  try {
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    return res.status(200).json({
      message: "Profile updated.",
      profile: user.profile,
    });

  } catch (err) {
    console.error("[editProfile]", err);
    return res.status(500).json({ message: "Something went wrong. Please try again." });
  }
}

// =============================================================================
// ADD ADDRESS
// =============================================================================

/**
 * POST /users/me/addresses
 *
 * Adds a new address to the user's addresses array.
 * If is_default is true, all other addresses are set to is_default: false first.
 *
 * Body:
 *   required — recipient, phone, line1, city, province, postal_code
 *   optional — label, line2, country, is_default
 *
 * Requires auth middleware.
 */
async function addAddress(req, res) {
  const { label, recipient, phone, line1, line2, city, province, postal_code, country, is_default } = req.body;

  if (!recipient || !phone || !line1 || !city || !province || !postal_code) {
    return res.status(400).json({
      message: "Missing required fields: recipient, phone, line1, city, province, postal_code.",
    });
  }

  try {
    const user = await User.findById(req.user._id);

    const newAddress = {
      label:       label       || "Home",
      recipient,
      phone,
      line1,
      line2:       line2       || "",
      city,
      province,
      postal_code,
      country:     country     || "PH",
      is_default:  is_default  ?? false,
    };

    // If the new address is default, unset all others first
    if (newAddress.is_default) {
      user.addresses.forEach((addr) => { addr.is_default = false; });
    }

    // If this is the very first address, make it default automatically
    if (user.addresses.length === 0) {
      newAddress.is_default = true;
    }

    user.addresses.push(newAddress);
    await user.save();

    return res.status(201).json({
      message:   "Address added.",
      addresses: user.addresses,
    });

  } catch (err) {
    console.error("[addAddress]", err);
    return res.status(500).json({ message: "Something went wrong. Please try again." });
  }
}

// =============================================================================
// EDIT ADDRESS
// =============================================================================

/**
 * PUT /users/me/addresses/:addressId
 *
 * Updates an existing address. All fields are optional — only send what changes.
 * If is_default is set to true, all other addresses are unset first.
 *
 * Params: addressId — the _id of the address subdocument
 *
 * Body (all optional):
 *   label, recipient, phone, line1, line2, city, province, postal_code,
 *   country, is_default
 *
 * Requires auth middleware.
 */
async function editAddress(req, res) {
  const { addressId } = req.params;

  const ALLOWED = ["label", "recipient", "phone", "line1", "line2", "city", "province", "postal_code", "country", "is_default"];
  const updates = {};
  for (const key of ALLOWED) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ message: "Provide at least one field to update." });
  }

  try {
    const user = await User.findById(req.user._id);
    const address = user.addresses.id(addressId);

    if (!address || address.deleted_at) {
      return res.status(404).json({ message: "Address not found." });
    }

    // If setting this address as default, unset all others first
    if (updates.is_default === true) {
      user.addresses.forEach((addr) => { addr.is_default = false; });
    }

    // Apply updates onto the subdocument
    Object.assign(address, updates);
    await user.save();

    return res.status(200).json({
      message:   "Address updated.",
      addresses: user.addresses.filter((a) => !a.deleted_at),
    });

  } catch (err) {
    console.error("[editAddress]", err);
    return res.status(500).json({ message: "Something went wrong. Please try again." });
  }
}

// =============================================================================
// DELETE ADDRESS
// =============================================================================

/**
 * DELETE /users/me/addresses/:addressId
 *
 * Soft-deletes an address by setting deleted_at.
 * If the deleted address was the default, the next remaining address
 * is automatically promoted to default.
 *
 * Params: addressId — the _id of the address subdocument
 *
 * Requires auth middleware.
 */
async function deleteAddress(req, res) {
  const { addressId } = req.params;

  try {
    const user = await User.findById(req.user._id);
    const address = user.addresses.id(addressId);

    if (!address || address.deleted_at) {
      return res.status(404).json({ message: "Address not found." });
    }

    const wasDefault = address.is_default;
    address.is_default = false;
    address.deleted_at = new Date();

    // If the deleted address was the default, promote the next active one
    if (wasDefault) {
      const next = user.addresses.find((a) => !a.deleted_at && String(a._id) !== addressId);
      if (next) next.is_default = true;
    }

    await user.save();

    return res.status(200).json({
      message:   "Address removed.",
      addresses: user.addresses.filter((a) => !a.deleted_at),
    });

  } catch (err) {
    console.error("[deleteAddress]", err);
    return res.status(500).json({ message: "Something went wrong. Please try again." });
  }
}


// =============================================================================
// CHANGE USER ROLE  (super_admin only)
// =============================================================================
/**
 * PUT /api/admin/users/:userId/role
 *
 * Body:
 *   email    — actor's email (re-auth)
 *   password — actor's password (re-auth)
 *   new_role — "admin" | "customer"
 *   reason   — required
 *
 * Requires requireAuth + requireRole("super_admin")
 */
async function changeUserRole(req, res) {
  const { userId }                     = req.params;
  const { email, password, new_role, reason } = req.body;
  const ALLOWED_ROLES                  = ["admin", "customer"];

  // ── Input validation ──────────────────────────────────────────────────────
  if (!email || !password) {
    return res.status(400).json({ message: "Your email and password are required for this action." });
  }
  if (!reason || !reason.trim()) {
    return res.status(400).json({ message: "A reason is required for role changes." });
  }
  if (!new_role || !ALLOWED_ROLES.includes(new_role)) {
    return res.status(400).json({ message: `new_role must be one of: ${ALLOWED_ROLES.join(", ")}.` });
  }
  if (String(req.user._id) === String(userId)) {
    return res.status(403).json({ message: "You cannot change your own role." });
  }

  try {
    // ── Re-auth: verify actor's credentials ───────────────────────────────
    const actor         = await User.findById(req.user._id);
    const passwordMatch = await bcrypt.compare(password, actor.password_hash);
    if (!passwordMatch || actor.email !== email.toLowerCase().trim()) {
      return res.status(401).json({ message: "Invalid credentials. Action denied." });
    }

    // ── Target validation ─────────────────────────────────────────────────
    const target = await User.findById(userId);
    if (!target || target.deleted_at) {
      return res.status(404).json({ message: "User not found." });
    }
    if (target.role === "super_admin") {
      return res.status(403).json({ message: "super_admin role cannot be changed." });
    }
    if (target.role === new_role) {
      return res.status(400).json({ message: `User is already a ${new_role}.` });
    }

    const old_role = target.role;

    await User.updateOne({ _id: userId }, { $set: { role: new_role } });

    await RoleChangeLog.create({
      user_id:    userId,
      changed_by: req.user._id,
      old_role,
      new_role,
      reason:     reason.trim(),
    });

    return res.status(200).json({
      message:  `User role changed from ${old_role} to ${new_role}.`,
      user_id:  userId,
      old_role,
      new_role,
    });

  } catch (err) {
    console.error("[changeUserRole]", err);
    return res.status(500).json({ message: "Something went wrong. Please try again." });
  }
}

// =============================================================================
// BAN USER  (admin/super_admin only)
// =============================================================================
/**
 * PUT /api/admin/users/:userId/ban
 *
 * Body:
 *   email    — actor's email (re-auth)
 *   password — actor's password (re-auth)
 *   reason   — required, shown to the banned user on login
 *
 * Requires requireAuth + requireRole("admin", "super_admin")
 */
async function banUser(req, res) {
  const { userId }               = req.params;
  const { email, password, reason } = req.body;

  // ── Input validation ──────────────────────────────────────────────────────
  if (!email || !password) {
    return res.status(400).json({ message: "Your email and password are required for this action." });
  }
  if (!reason || !reason.trim()) {
    return res.status(400).json({ message: "A reason is required for banning a user." });
  }
  if (String(req.user._id) === String(userId)) {
    return res.status(403).json({ message: "You cannot ban yourself." });
  }

  try {
    // ── Re-auth: verify actor's credentials ───────────────────────────────
    const actor         = await User.findById(req.user._id);
    const passwordMatch = await bcrypt.compare(password, actor.password_hash);
    if (!passwordMatch || actor.email !== email.toLowerCase().trim()) {
      return res.status(401).json({ message: "Invalid credentials. Action denied." });
    }

    // ── Target validation ─────────────────────────────────────────────────
    const target = await User.findById(userId);
    if (!target || target.deleted_at) {
      return res.status(404).json({ message: "User not found." });
    }
    if (target.role === "super_admin") {
      return res.status(403).json({ message: "super_admin cannot be banned." });
    }
    // admin cannot ban another admin — only super_admin can
    if (target.role === "admin" && req.user.role !== "super_admin") {
      return res.status(403).json({ message: "Only super_admin can ban an admin." });
    }
    if (target.is_banned) {
      return res.status(400).json({ message: "User is already banned." });
    }

    await User.updateOne(
      { _id: userId },
      { $set: { is_banned: true, ban_reason: reason.trim() } }
    );

    // Invalidate all active sessions for the banned user immediately
    await Session.deleteMany({ user_id: userId, is_guest: false });

    return res.status(200).json({
      message:    "User has been banned.",
      user_id:    userId,
      ban_reason: reason.trim(),
    });

  } catch (err) {
    console.error("[banUser]", err);
    return res.status(500).json({ message: "Something went wrong. Please try again." });
  }
}

// =============================================================================
// UNBAN USER  (admin/super_admin only)
// =============================================================================
/**
 * PUT /api/admin/users/:userId/unban
 *
 * Body:
 *   email    — actor's email (re-auth)
 *   password — actor's password (re-auth)
 *   reason   — required, reason for lifting the ban
 *
 * Requires requireAuth + requireRole("admin", "super_admin")
 */
async function unbanUser(req, res) {
  const { userId }               = req.params;
  const { email, password, reason } = req.body;

  // ── Input validation ──────────────────────────────────────────────────────
  if (!email || !password) {
    return res.status(400).json({ message: "Your email and password are required for this action." });
  }
  if (!reason || !reason.trim()) {
    return res.status(400).json({ message: "A reason is required for unbanning a user." });
  }
  if (String(req.user._id) === String(userId)) {
    return res.status(403).json({ message: "You cannot unban yourself." });
  }

  try {
    // ── Re-auth: verify actor's credentials ───────────────────────────────
    const actor         = await User.findById(req.user._id);
    const passwordMatch = await bcrypt.compare(password, actor.password_hash);
    if (!passwordMatch || actor.email !== email.toLowerCase().trim()) {
      return res.status(401).json({ message: "Invalid credentials. Action denied." });
    }

    // ── Target validation ─────────────────────────────────────────────────
    const target = await User.findById(userId);
    if (!target || target.deleted_at) {
      return res.status(404).json({ message: "User not found." });
    }
    if (!target.is_banned) {
      return res.status(400).json({ message: "User is not banned." });
    }

    await User.updateOne(
      { _id: userId },
      { $set: { is_banned: false, ban_reason: null } }
    );

    return res.status(200).json({
      message: "User has been unbanned.",
      user_id: userId,
    });

  } catch (err) {
    console.error("[unbanUser]", err);
    return res.status(500).json({ message: "Something went wrong. Please try again." });
  }
}

// =============================================================================
// GET USERS — paginated (admin/super_admin only)
// =============================================================================

/**
 * GET /api/admin/users
 *
 * Returns a paginated list of users for the admin panel.
 * Excludes the requesting admin and all super_admins from results.
 *
 * Query params:
 *   page     — page number, default 1
 *   limit    — results per page, default 20, max 50
 *
 * Requires requireAuth + requireRole("admin", "super_admin")
 */
async function getUsers(req, res) {
  const page  = Math.max(1, parseInt(req.query.page)  || 1);
  const limit = Math.min(50, parseInt(req.query.limit) || 20);
  const skip  = (page - 1) * limit;

  try {
    // ── Build filter ──────────────────────────────────────────────────────
    const filter = {
      role:       { $in: ["customer", "admin"] },
      deleted_at: null,
    };

    // Role filter
    if (req.query.role && ["admin", "customer"].includes(req.query.role)) {
      filter.role = req.query.role;
    }

    // Ban filter
    if (req.query.banned === "true")       filter.is_banned = true;
    else if (req.query.banned === "false") filter.is_banned = false;

    const [users, total] = await Promise.all([
      User.find(filter)
        .select("_id email role is_banned profile.display_name profile.avatar_url createdAt last_login_at")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      User.countDocuments(filter),
    ]);

    return res.status(200).json({
      users,
      pagination: {
        total,
        page,
        limit,
        total_pages: Math.ceil(total / limit),
        has_next:    page < Math.ceil(total / limit),
        has_prev:    page > 1,
      },
    });
  } catch (err) {
    console.error("[getUsers]", err);
    return res.status(500).json({ message: "Something went wrong. Please try again." });
  }
}
// =============================================================================
// SEARCH & FILTER USERS (admin/super_admin only)
// =============================================================================

/**
 * GET /api/admin/users/search
 *
 * Search users by display_name or email, with optional role and ban filters.
 * Excludes super_admins from results always.
 *
 * Query params:
 *   q        — search term (matches display_name or email), optional
 *   role     — "admin" | "customer", optional
 *   banned   — "true" | "false", optional
 *   page     — default 1
 *   limit    — default 20, max 50
 *
 * Requires requireAuth + requireRole("admin", "super_admin")
 */
async function searchUsers(req, res) {
  const { q, role, banned }  = req.query;
  const page  = Math.max(1, parseInt(req.query.page)  || 1);
  const limit = Math.min(50, parseInt(req.query.limit) || 20);
  const skip  = (page - 1) * limit;

  try {
    // ── Build filter ────────────────────────────────────────────────────────
    const filter = {
      role:       { $in: ["customer", "admin"] },  // never expose super_admin
      deleted_at: null,
    };

    // Role filter
    if (role && ["admin", "customer"].includes(role)) {
      filter.role = role;
    }

    // Ban filter
    if (banned === "true")       filter.is_banned = true;
    else if (banned === "false") filter.is_banned = false;

    // Search term — matches display_name or email
    if (q && q.trim()) {
      filter.$text = { $search: q.trim() };
  }

    const [users, total] = await Promise.all([
      User.find(filter)
        .select("_id email role is_banned profile.display_name profile.avatar_url createdAt last_login_at")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      User.countDocuments(filter),
    ]);

    return res.status(200).json({
      users,
      pagination: {
        total,
        page,
        limit,
        total_pages: Math.ceil(total / limit),
        has_next:    page < Math.ceil(total / limit),
        has_prev:    page > 1,
      },
    });

  } catch (err) {
    console.error("[searchUsers]", err);
    return res.status(500).json({ message: "Something went wrong. Please try again." });
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export { 
  register, login, logout, 
  acceptPolicy, editProfile, addAddress, 
  editAddress, deleteAddress,getUsers, 
  searchUsers, changeUserRole, banUser, unbanUser
};
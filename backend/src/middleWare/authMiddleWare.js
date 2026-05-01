import { User, Session } from "../models/modelCenter.js";

// =============================================================================
// AUTH MIDDLEWARE
// =============================================================================

/**
 * Reads the auth_token cookie, validates the session, and attaches the
 * full User document to req.user.
 *
 * On failure: responds 401 and stops the chain.
 * On success: calls next() with req.user set.
 *
 * Usage in routes:
 *   router.put("/users/me/profile", requireAuth, editProfile);
 */
async function requireAuth(req, res, next) {
  const token = req.cookies?.auth_token;

  if (!token) {
    return res.status(401).json({ message: "Authentication required." });
  }

  try {
    const session = await Session.findOne({
      token,
      is_guest:   false,
      expires_at: { $gt: new Date() },
    });

    if (!session) {
      // Token not found or already expired — clear the stale cookie
      res.clearCookie("auth_token", {
        httpOnly: true,
        secure:   process.env.NODE_ENV === "production",
        sameSite: "Lax",
      });
      return res.status(401).json({ message: "Session expired. Please log in again." });
    }

    const user = await User.findById(session.user_id);

    if (!user || user.deleted_at) {
      return res.status(401).json({ message: "Account not found." });
    }

    if (user.is_banned) {
      return res.status(403).json({
        message:    "Your account has been suspended.",
        ban_reason: user.ban_reason || null,
      });
    }

    // Attach the full user doc so downstream handlers can read it
    req.user    = user;
    req.session = session;

    next();

  } catch (err) {
    console.error("[requireAuth]", err);
    return res.status(500).json({ message: "Something went wrong. Please try again." });
  }
}

// =============================================================================
// ROLE GUARD FACTORY
// =============================================================================

/**
 * Returns a middleware that only allows users with one of the given roles.
 * Must be placed AFTER requireAuth in the chain.
 *
 * Usage:
 *   router.delete("/admin/products/:id", requireAuth, requireRole("admin", "super_admin"), deleteProduct);
 *
 * @param {...string} roles — one or more of: "guest", "customer", "admin", "super_admin"
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      // Defensive: requireRole should never run without requireAuth before it
      return res.status(401).json({ message: "Authentication required." });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: "You do not have permission to perform this action." });
    }

    next();
  };
}

export { requireAuth, requireRole };
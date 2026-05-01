import mongoose from "mongoose";
import bcrypt from "bcrypt";
import crypto from "node:crypto";// built-in, no npm install needed


const BCRYPT_ROUNDS = 12;

/**
 * Generate a secure random session token.
 */
function generateToken() {
  return crypto.randomBytes(48).toString("hex");
}

/**
 * Session TTL — 30 days for logged-in users.
 */
function sessionExpiry() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d;
}

/**
 * Strip sensitive fields before sending a user object to the client.
 */
export function sanitizeUser(user) {
  const obj = user.toObject?.() ?? { ...user };
 
  delete obj.password_hash;
  delete obj.__v;
  delete obj.deleted_at;
  delete obj.is_banned;
  delete obj.ban_reason;
 
  return obj;
}
export {BCRYPT_ROUNDS, generateToken, sessionExpiry};
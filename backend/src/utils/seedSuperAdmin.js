// scripts/seedSuperAdmin.js
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import dotenv from "dotenv";
import User from "../models/User.js";

dotenv.config();

const SUPER_ADMIN_EMAIL    = process.env.SUPER_ADMIN_EMAIL;
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD;
const BCRYPT_ROUNDS        = 12;

async function seedSuperAdmin() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("MongoDB connected.");

    // ── Check if a super_admin already exists ──────────────────────────────
    const existing = await User.findOne({ role: "super_admin" });
    if (existing) {
        console.log("❌ Super admin already exists. Seeder is one-time use only.");
        await mongoose.disconnect();
        process.exit(0);
    }

    // ── Create super_admin ─────────────────────────────────────────────────
    const password_hash = await bcrypt.hash(SUPER_ADMIN_PASSWORD, BCRYPT_ROUNDS);
    await User.create({
        email:         SUPER_ADMIN_EMAIL,
        password_hash,
        role:          "super_admin",
        is_banned:     false,
        profile: {
        display_name: "Owner",
        },
    });

    console.log(`✅ Super admin created: ${SUPER_ADMIN_EMAIL}`);
    await mongoose.disconnect();
    process.exit(0);
}

seedSuperAdmin().catch((err) => {
    console.error("Seeder failed:", err);
    process.exit(1);
});
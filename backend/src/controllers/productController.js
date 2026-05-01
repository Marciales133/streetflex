import mongoose from "mongoose";
import bcrypt from "bcrypt";
import {MAX_SESSIONS} from "../config/constants.js";
import RoleChangeLog from "../models/RoleChangeLog.js";

import { BCRYPT_ROUNDS, generateToken, sessionExpiry, sanitizeUser } from "../utils/controllerUtils.js";
import { User, Session, PolicyAgreement } from "../models/modelCenter.js";
import slugify from "slugify";
import { Product, Category, Tag } from "../models/modelCenter.js";

// =============================================================================
// HELPERS
// =============================================================================
function buildSlug(name) {
    return slugify(name, { lower: true, strict: true });
}

// =============================================================================
// GET PRODUCTS  (admin)
// =============================================================================
/**
 * GET /api/admin/products
 * Query: page, limit, category, tag, active, preorder
 */
async function getProducts(req, res) {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const skip  = (page - 1) * limit;

    try {
        const filter = { deleted_at: null };
        if (req.query.category) filter.category_id = new mongoose.Types.ObjectId(req.query.category);
        if (req.query.tag) filter.tag_ids = new mongoose.Types.ObjectId(req.query.tag);
        if (req.query.active === "true")  filter.is_active   = true;
        if (req.query.active === "false") filter.is_active   = false;
        if (req.query.preorder === "true")  filter.is_preorder = true;
        if (req.query.preorder === "false") filter.is_preorder = false;
        // Stock filter
        if (req.query.stock === "instock")  filter.total_stock = { $gt: 0 };
        if (req.query.stock === "outofstock") filter.total_stock = 0;

        const [products, total] = await Promise.all([
            Product.find(filter)
                .select("_id name slug base_price total_stock category_id tag_names images is_active is_preorder createdAt")
                .populate("category_id", "name slug")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            Product.countDocuments(filter),
        ]);

        return res.status(200).json({
            products,
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
        console.error("[getProducts]", err);
        return res.status(500).json({ message: "Something went wrong. Please try again." });
    }
}

// =============================================================================
// SEARCH PRODUCTS  (admin)
// =============================================================================
/**
 * GET /api/admin/products/search
 * Query: q, category, tag, active, preorder, page, limit
 */
async function searchProducts(req, res) {
    const { q, category, tag, active, preorder } = req.query;
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const skip  = (page - 1) * limit;

    try {
        const filter = { deleted_at: null };

        if (req.query.category) filter.category_id = req.query.category;
        if (req.query.tag) filter.tag_ids = req.query.tag;
        if (active === "true")  filter.is_active      = true;
        if (active === "false") filter.is_active      = false;
        if (preorder === "true")  filter.is_preorder  = true;
        if (preorder === "false") filter.is_preorder  = false;
        if (req.query.stock === "instock")  filter.total_stock = { $gt: 0 };
        if (req.query.stock === "outofstock") filter.total_stock = 0;

        if (q && q.trim()) {
            filter.$text = { $search: q.trim() };
        }

        const [products, total] = await Promise.all([
            Product.find(filter)
                .select("_id name slug base_price total_stock category_id tag_names images is_active is_preorder createdAt")
                .populate("category_id", "name slug")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            Product.countDocuments(filter),
        ]);

        return res.status(200).json({
            products,
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
        console.error("[searchProducts]", err);
        return res.status(500).json({ message: "Something went wrong. Please try again." });
    }
}

// =============================================================================
// GET SINGLE PRODUCT  (admin — full detail for edit form)
// =============================================================================
/**
 * GET /api/admin/products/:id
 */
async function getProduct(req, res) {
    try {
        const product = await Product.findOne({ _id: req.params.id, deleted_at: null })
            .populate("category_id", "name slug")
            .populate("tag_ids",     "name slug");

        if (!product) return res.status(404).json({ message: "Product not found." });

        return res.status(200).json({ product });
    } catch (err) {
        console.error("[getProduct]", err);
        return res.status(500).json({ message: "Something went wrong. Please try again." });
    }
}

// =============================================================================
// CREATE PRODUCT
// =============================================================================
/**
 * POST /api/admin/products
 *
 * Body:
 *   required  name, base_price, category_id
 *   optional  slug, description, weight_grams, is_active, is_preorder
 *   optional  tag_ids[], images[], variants[]
 */
async function createProduct(req, res) {
    const {
        name, description, base_price, weight_grams,
        category_id, is_active, is_preorder,
        tag_ids, images, variants,
    } = req.body;

    let { slug } = req.body;

    if (!name || base_price === undefined || !category_id) {
        return res.status(400).json({ message: "name, base_price, and category_id are required." });
    }

    try {
        // ── Slug ──────────────────────────────────────────────────────────────
        slug = slug ? slugify(slug, { lower: true, strict: true }) : buildSlug(name);

        const slugExists = await Product.findOne({ slug });
        if (slugExists) {
            return res.status(409).json({ message: `Slug "${slug}" is already taken. Please use a different name or edit the slug.` });
        }

        // ── Resolve tag_names from tag_ids ────────────────────────────────────
        let tag_names = [];
        if (tag_ids && tag_ids.length) {
            const tags = await Tag.find({ _id: { $in: tag_ids } }).select("name");
            tag_names  = tags.map(t => t.name);
        }

        const product = await Product.create({
            name,
            slug,
            description:  description  || "",
            base_price,
            weight_grams: weight_grams || null,
            category_id,
            created_by:   req.user._id,
            is_active:    is_active  ?? true,
            is_preorder:  is_preorder ?? false,
            tag_ids:   tag_ids   || [],
            tag_names,
            images:    images    || [],
            variants:  variants  || [],
        });

        return res.status(201).json({ message: "Product created.", product });

    } catch (err) {
        console.error("[createProduct]", err);
        return res.status(500).json({ message: "Something went wrong. Please try again." });
    }
}

// =============================================================================
// EDIT PRODUCT
// =============================================================================
/**
 * PUT /api/admin/products/:id
 *
 * All fields optional — only send what changed.
 */
async function editProduct(req, res) {
    const ALLOWED = [
        "name", "slug", "description", "base_price", "weight_grams",
        "category_id", "is_active", "is_preorder", "tag_ids", "images", "variants",
    ];

    const updates = {};
    for (const key of ALLOWED) {
        if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    if (Object.keys(updates).length === 0) {
        return res.status(400).json({ message: "Provide at least one field to update." });
    }

    try {
        // ── Slug uniqueness check if slug is being changed ────────────────────
        if (updates.slug) {
            updates.slug       = slugify(updates.slug, { lower: true, strict: true });
            const slugConflict = await Product.findOne({ slug: updates.slug, _id: { $ne: req.params.id } });
            if (slugConflict) {
                return res.status(409).json({ message: `Slug "${updates.slug}" is already taken.` });
            }
        }

        // ── Re-resolve tag_names if tag_ids changed ───────────────────────────
        if (updates.tag_ids) {
            const tags        = await Tag.find({ _id: { $in: updates.tag_ids } }).select("name");
            updates.tag_names = tags.map(t => t.name);
        }

        const product = await Product.findOneAndUpdate(
            { _id: req.params.id, deleted_at: null },
            { $set: updates },
            { returnDocument: "after", runValidators: true }
        ).populate("category_id", "name slug")
        .populate("tag_ids",     "name slug");

        if (!product) return res.status(404).json({ message: "Product not found." });

        // sync total_stock since pre-save hook doesn't run on findOneAndUpdate
        await Product.syncTotalStock(req.params.id);
        const updated = await Product.findById(req.params.id)
            .populate("category_id", "name slug")
            .populate("tag_ids", "name slug");

        return res.status(200).json({ message: "Product updated.", product: updated });

    } catch (err) {
        console.error("[editProduct]", err);
        return res.status(500).json({ message: "Something went wrong. Please try again." });
    }
}

// =============================================================================
// TOGGLE ACTIVE
// =============================================================================
/**
 * PUT /api/admin/products/:id/toggle
 */
async function toggleProduct(req, res) {
    try {
        const product = await Product.findOne({ _id: req.params.id, deleted_at: null });
        if (!product) return res.status(404).json({ message: "Product not found." });

        const newState = !product.is_active;

        await Product.updateOne(
            { _id: req.params.id },
            { $set: { is_active: newState } }
        );

        return res.status(200).json({
            message:   `Product ${newState ? "activated" : "deactivated"}.`,
            is_active: newState,
        });
    } catch (err) {
        console.error("[toggleProduct]", err);
        return res.status(500).json({ message: "Something went wrong. Please try again." });
    }
}

// =============================================================================
// DELETE PRODUCT  (soft)
// =============================================================================
/**
 * DELETE /api/admin/products/:id
 */
async function deleteProduct(req, res) {
    try {
        const product = await Product.findOne({ _id: req.params.id, deleted_at: null });
        if (!product) return res.status(404).json({ message: "Product not found." });

        await Product.updateOne({ _id: req.params.id }, { $set: { deleted_at: new Date() } });

        return res.status(200).json({ message: "Product deleted." });
    } catch (err) {
        console.error("[deleteProduct]", err);
        return res.status(500).json({ message: "Something went wrong. Please try again." });
    }
}

export { getProducts, searchProducts, getProduct, createProduct, editProduct, toggleProduct, deleteProduct };
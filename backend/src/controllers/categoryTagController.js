import slugify from "slugify";
import { Category, Tag, Product } from "../models/modelCenter.js";

// =============================================================================
// CATEGORIES
// =============================================================================

async function getCategories(req, res) {
    try {
        const categories = await Category.find().sort({ name: 1 });
        return res.status(200).json({ categories });
    } catch (err) {
        console.error("[getCategories]", err);
        return res.status(500).json({ message: "Something went wrong. Please try again." });
    }
}

async function createCategory(req, res) {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ message: "name is required." });

    try {
        const slug = slugify(name, { lower: true, strict: true });

        const existing = await Category.findOne({ slug, deleted_at: null });
        if (existing) return res.status(409).json({ message: `Category "${name}" already exists.` });

        const category = await Category.create({ name: name.trim(), slug, description: description || "" });
        return res.status(201).json({ message: "Category created.", category });
    } catch (err) {
        console.error("[createCategory]", err);
        return res.status(500).json({ message: "Something went wrong. Please try again." });
    }
}

async function editCategory(req, res) {
    const { name, description } = req.body;
    if (!name && description === undefined) {
        return res.status(400).json({ message: "Provide at least one field to update." });
    }

    try {
        const updates = {};
        if (name) {
            updates.name = name.trim();
            updates.slug = slugify(name, { lower: true, strict: true });

            const conflict = await Category.findOne({ slug: updates.slug, _id: { $ne: req.params.id }, deleted_at: null });
            if (conflict) return res.status(409).json({ message: `Category "${name}" already exists.` });
        }
        if (description !== undefined) updates.description = description;

        const category = await Category.findOneAndUpdate(
            { _id: req.params.id, deleted_at: null },
            { $set: updates },
            { returnDocument: "after" }
        );
        if (!category) return res.status(404).json({ message: "Category not found." });

        return res.status(200).json({ message: "Category updated.", category });
    } catch (err) {
        console.error("[editCategory]", err);
        return res.status(500).json({ message: "Something went wrong. Please try again." });
    }
}

async function deleteCategory(req, res) {
    try {
        const inUse = await Product.exists({ category_id: req.params.id, deleted_at: null });
        if (inUse) {
            return res.status(409).json({ message: "Cannot delete — products are assigned to this category. Reassign them first." });
        }

        // ✅ hard delete
        const category = await Category.findByIdAndDelete(req.params.id);
        if (!category) return res.status(404).json({ message: "Category not found." });

        return res.status(200).json({ message: "Category deleted." });
    } catch (err) {
        console.error("[deleteCategory]", err);
        return res.status(500).json({ message: "Something went wrong. Please try again." });
    }
}

// =============================================================================
// TAGS
// =============================================================================

async function getTags(req, res) {
    try {
        const tags = await Tag.find().sort({ name: 1 });
        return res.status(200).json({ tags });
    } catch (err) {
        console.error("[getTags]", err);
        return res.status(500).json({ message: "Something went wrong. Please try again." });
    }
}

async function createTag(req, res) {
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: "name is required." });

    try {
        const slug = slugify(name, { lower: true, strict: true });

        const existing = await Tag.findOne({ slug });
        if (existing) return res.status(409).json({ message: `Tag "${name}" already exists.` });

        const tag = await Tag.create({ name: name.trim(), slug });
        return res.status(201).json({ message: "Tag created.", tag });
    } catch (err) {
        console.error("[createTag]", err);
        return res.status(500).json({ message: "Something went wrong. Please try again." });
    }
}

async function editTag(req, res) {
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: "name is required." });

    try {
        const slug     = slugify(name, { lower: true, strict: true });
        const conflict = await Tag.findOne({ slug, _id: { $ne: req.params.id } });
        if (conflict) return res.status(409).json({ message: `Tag "${name}" already exists.` });

        const tag = await Tag.findByIdAndUpdate(
            req.params.id,
            { $set: { name: name.trim(), slug } },
            { returnDocument: "after", runValidators: true }
        );
        if (!tag) return res.status(404).json({ message: "Tag not found." });

        // ── Sync tag_names on all products that use this tag ──────────────────
        await Product.updateMany(
            { tag_ids: req.params.id },
            { $set: { "tag_names.$[el]": name.trim() } },
            { arrayFilters: [{ "el": { $exists: true } }] }
        );

        return res.status(200).json({ message: "Tag updated.", tag });
    } catch (err) {
        console.error("[editTag]", err);
        return res.status(500).json({ message: "Something went wrong. Please try again." });
    }
}

async function deleteTag(req, res) {
    try {
        const tag = await Tag.findByIdAndDelete(req.params.id);
        if (!tag) return res.status(404).json({ message: "Tag not found." });

        // ── Remove tag from all products that reference it ────────────────────
        await Product.updateMany(
            { tag_ids: req.params.id },
            { $pull: { tag_ids: tag._id, tag_names: tag.name } }
        );

        return res.status(200).json({ message: "Tag deleted." });
    } catch (err) {
        console.error("[deleteTag]", err);
        return res.status(500).json({ message: "Something went wrong. Please try again." });
    }
}

export { getCategories, createCategory, editCategory, deleteCategory, getTags, createTag, editTag, deleteTag };
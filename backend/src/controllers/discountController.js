import { Discount } from "../models/modelCenter.js";

// GET /api/admin/discounts
async function getDiscounts(req, res) {
    try {
        const discounts = await Discount.find().sort({ createdAt: -1 });
        return res.status(200).json({ discounts });
    } catch (err) {
        console.error("[getDiscounts]", err);
        return res.status(500).json({ message: "Something went wrong." });
    }
}

// GET /api/admin/discounts/:id
async function getDiscount(req, res) {
    try {
        const discount = await Discount.findById(req.params.id);
        if (!discount) return res.status(404).json({ message: "Discount not found." });
        return res.status(200).json({ discount });
    } catch (err) {
        console.error("[getDiscount]", err);
        return res.status(500).json({ message: "Something went wrong." });
    }
}

// POST /api/admin/discounts
async function createDiscount(req, res) {
    const { code, type, value, min_order_amount, max_uses, expires_at, is_active } = req.body;

    if (!code || !type || value === undefined) {
        return res.status(400).json({ message: "code, type, and value are required." });
    }

    try {
        const existing = await Discount.findOne({ code: code.toUpperCase() });
        if (existing) return res.status(409).json({ message: `Code "${code}" already exists.` });

        const discount = await Discount.create({
            code, type, value,
            min_order_amount: min_order_amount ?? 0,
            max_uses:         max_uses   ?? null,
            expires_at:       expires_at ?? null,
            is_active:        is_active  ?? true,
        });

        return res.status(201).json({ message: "Discount created.", discount });
    } catch (err) {
        console.error("[createDiscount]", err);
        return res.status(500).json({ message: "Something went wrong." });
    }
}

// PUT /api/admin/discounts/:id
async function editDiscount(req, res) {
    const ALLOWED = ["code", "type", "value", "min_order_amount", "max_uses", "expires_at", "is_active"];
    const updates = {};
    for (const key of ALLOWED) {
        if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    if (!Object.keys(updates).length) {
        return res.status(400).json({ message: "Provide at least one field to update." });
    }

    try {
        if (updates.code) {
            updates.code = updates.code.toUpperCase();
            const conflict = await Discount.findOne({ code: updates.code, _id: { $ne: req.params.id } });
            if (conflict) return res.status(409).json({ message: `Code "${updates.code}" already exists.` });
        }

        const discount = await Discount.findByIdAndUpdate(
            req.params.id,
            { $set: updates },
            { new: true, runValidators: true }
        );

        if (!discount) return res.status(404).json({ message: "Discount not found." });
        return res.status(200).json({ message: "Discount updated.", discount });
    } catch (err) {
        console.error("[editDiscount]", err);
        return res.status(500).json({ message: "Something went wrong." });
    }
}

// DELETE /api/admin/discounts/:id
async function deleteDiscount(req, res) {
    try {
        const discount = await Discount.findByIdAndDelete(req.params.id);
        if (!discount) return res.status(404).json({ message: "Discount not found." });
        await Product.updateMany(
            { discount_code: discount.code },
            { $set: { discount_code: null } }
        );
        return res.status(200).json({ message: "Discount deleted." });
    } catch (err) {
        console.error("[deleteDiscount]", err);
        return res.status(500).json({ message: "Something went wrong." });
    }
}
async function getDiscountByCode(req, res) {
    try {
        const discount = await Discount.findOne({ code: req.params.code.toUpperCase() });
        if (!discount) return res.status(404).json({ message: "Discount not found." });
        return res.status(200).json({ discount });
    } catch (err) {
        console.error("[getDiscountByCode]", err);
        return res.status(500).json({ message: "Something went wrong." });
    }
}

export { getDiscounts, getDiscount, createDiscount, editDiscount, deleteDiscount, getDiscountByCode };
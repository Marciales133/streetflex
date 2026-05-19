import { Discount } from "../models/modelCenter.js";

export async function enrichWithDiscounts(products) {
    const codes = [...new Set(products.map(p => p.discount_code).filter(Boolean))];
    if (!codes.length) return products;

    const discounts = await Discount.find({ code: { $in: codes }, is_active: true }).lean();
    const discountMap = new Map(discounts.map(d => [d.code, d]));

    return products.map(p => {
        if (!p.discount_code) return p;
        const discount = discountMap.get(p.discount_code);
        if (!discount) return p;

        const discounted_price = discount.type === "percent"
            ? Math.round(p.base_price * (1 - discount.value / 100))
            : Math.max(0, p.base_price - discount.value);

        return { ...p, discount, discounted_price };
    });
}
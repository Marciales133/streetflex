(function () {

window.addEventListener("load", () => {
    fetchOverview();

    document.getElementById("LogOutBtn").addEventListener("click", async (e) => {
        e.preventDefault();
        try {
            const res = await fetch("/api/auth/logout", {
                method:      "POST",
                credentials: "include",
            });
            if (res.ok) {
                window.location.href = "../index.html";
            }
        } catch (err) {
            console.error("[logout]", err);
        }
    });
});

async function fetchOverview() {
    try {
        const res  = await fetch("/api/admin/overview", { credentials: "include" });
        const data = await res.json();
        if (!res.ok) return console.error(data.message);

        document.getElementById("total_current").textContent         = data.orders.total_current;
        document.getElementById("this_month_sales").textContent      = `₱${Number(data.orders.this_month_sales).toLocaleString()}`;
        document.getElementById("total_pending_refunds").textContent = data.refunds.total_pending;

        document.getElementById("total_admins").textContent    = data.users.total_admins;
        document.getElementById("total_customers").textContent = data.users.total_customers;
        document.getElementById("total_banned").textContent    = data.users.total_banned;

        document.getElementById("total_active").textContent   = data.products.total_active;
        document.getElementById("total_inactive").textContent = data.products.total_inactive;

        document.getElementById("total_pending_FAQs").textContent    = data.faqs.total_pending;
        document.getElementById("total_pending_reviews").textContent = data.reviews.total_pending;
    } catch (err) {
        console.error("[fetchOverview]", err);
    }
}

})();
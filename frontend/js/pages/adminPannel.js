const menu = document.getElementById("menu");
const menuOption = document.querySelector("nav");

if (menu && menuOption) {
    menu.addEventListener("click", () => {
        menuOption.classList.toggle("active");
        menu.classList.toggle("active");
    });

    document.addEventListener("click", e => {
        if (!menu.contains(e.target) && !menuOption.contains(e.target)) {
            menuOption.classList.remove("active");
            menu.classList.remove("active");
        }
    });
}
const adminHome = document.getElementById("adminHome");
const brandLogo = document.querySelector(".businessLogo img");
if(adminHome){
    brandLogo.src = "../assets/hero_section_images/streetFlexImg1.png";
}else{
    brandLogo.src = "../../assets/hero_section_images/streetFlexImg1.png";
}


const searchInput = document.getElementById("search");
const suggestionsBox = document.getElementById("suggestions");
const searchContainer = document.querySelector(".search-box");

const data = [
    "NONE",
    "Orders",
    "Users",
    "Settings",
    "Reports",
    "Analytics"
];

// Show suggestions while typing
if(searchInput){
    searchInput.addEventListener("input", () => {
        const value = searchInput.value.toLowerCase();
        suggestionsBox.innerHTML = "";

        if (!value) {
            suggestionsBox.classList.remove("show");
            return;
        }

        const filtered = data
            .filter(item => item.toLowerCase().includes(value))
            .slice(0, 8); // ⭐ limit to 8

        filtered.forEach(item => {
            const li = document.createElement("li");
            li.textContent = item;

            li.addEventListener("click", () => {
                searchInput.value = item;
                suggestionsBox.classList.remove("show");
            });

            suggestionsBox.appendChild(li);
        });

        suggestionsBox.classList.toggle("show", filtered.length > 0);
    });
    searchInput.addEventListener("focus", () => {
        if (suggestionsBox.children.length > 0) {
            suggestionsBox.classList.add("show");
        }
    });
    document.addEventListener("click", (e) => {
        if (!searchContainer.contains(e.target)) {
            suggestionsBox.classList.remove("show");
        }
    });
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            suggestionsBox.classList.remove("show");
        }
    });
}




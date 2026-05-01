(function(){

const heroSwiper = new Swiper('.heroSwiper', {
    direction: 'horizontal',
    loop: true,
    autoplay: {
        delay: 5000,
        disableOnInteraction: false,
    },
    pagination: {
        el: '.swiper-pagination',
        clickable: true,
    },
    navigation: false,
    scrollbar: false,
    slidesPerView: 1,
    spaceBetween: 16,
    on: {
        init(swiper) {
            applyInputMode(swiper);
        }
    }
});


window.addEventListener('resize', () => {
    applyInputMode(heroSwiper);
});









})();



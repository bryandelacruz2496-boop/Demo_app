// ============================================
// API URL & DYNAMIC CONTENT LOADING
// ============================================
const API_URL = window.location.hostname === 'localhost' ? 'http://localhost:5000/api' : '/api';

// Load dynamic news from CMS (carousel format, max 3)
async function loadDynamicNews() {
    const newsContainer = document.querySelector('.news-cards');
    if (!newsContainer) return;

    // Fetch from API
    try {
        const res = await fetch(`${API_URL}/website/news`);
        if (res.ok) {
            const news = await res.json();
            if (news.length > 0) {
                const display = news.slice(0, 3);
                newsContainer.innerHTML = display.map((item, i) => `
                    <div class="news-card" onclick="openDynamicNewsModal(${i})">
                        <div class="news-card-image">
                            <img src="${item.imageUrl}" alt="${item.title}" class="news-card-img">
                        </div>
                        <div class="news-card-overlay">
                            ${item.badge ? `<span class="news-badge-carousel">${item.badge}</span>` : ''}
                            <h3>${item.title}</h3>
                            <p>${item.description.substring(0, 100)}${item.description.length > 100 ? '...' : ''}</p>
                            <span class="news-learn-more">LEARN MORE ▶</span>
                        </div>
                    </div>
                `).join('');
                window._dynamicNews = display;
                newsSlideIndex = 0;
                newsContainer.style.transform = 'translateX(0)';
                setTimeout(() => {
                    const firstCard = newsContainer.querySelector('.news-card');
                    if (firstCard) firstCard.classList.add('active');
                }, 50);
            }
        }
    } catch (e) { }
}

function openDynamicNewsModal(index) {
    const news = window._dynamicNews;
    if (!news || !news[index]) return;
    const item = news[index];
    document.getElementById('newsModalImg').src = item.imageUrl;
    document.getElementById('newsModalTitle').textContent = item.title;
    document.getElementById('newsModalDate').textContent = item.date;
    document.getElementById('newsModalDesc').textContent = item.description;
    document.getElementById('newsModalOverlay').classList.add('active');
    document.body.style.overflow = 'hidden';
}

// Load dynamic gallery from CMS (replaces static content)
async function loadDynamicGallery() {
    const galleryGrid = document.querySelector('.gallery-grid');
    if (!galleryGrid) return;

    // Fetch from API
    try {
        const res = await fetch(`${API_URL}/website/gallery`);
        if (res.ok) {
            const categories = await res.json();
            if (categories.length > 0) {
                galleryGrid.innerHTML = categories.map((cat, i) => `
                    <div class="gallery-item" onclick="openDynamicGalleryModal(${i})">
                        <img src="${cat.coverImage || cat.photos[0] || ''}" alt="${cat.name}">
                        <div class="gallery-overlay">
                            <span class="gallery-label">${cat.icon} ${cat.name}</span>
                        </div>
                    </div>
                `).join('');
                window._dynamicGallery = categories;
            }
        }
    } catch (e) { }
}

function openDynamicGalleryModal(index) {
    const categories = window._dynamicGallery;
    if (!categories || !categories[index]) return;
    const cat = categories[index];
    document.getElementById('galleryModalTitle').textContent = `${cat.icon} ${cat.name}`;
    document.getElementById('galleryModalGrid').innerHTML = cat.photos.map(img => `
        <div class="gallery-modal-item" onclick="openFullImage('${img}')">
            <img src="${img}" alt="${cat.name}" loading="lazy">
        </div>
    `).join('');
    document.getElementById('galleryModalOverlay').classList.add('active');
    document.body.style.overflow = 'hidden';
}

// Load dynamic content on page load
document.addEventListener('DOMContentLoaded', () => {
    loadDynamicNews();
    loadDynamicGallery();
});

// News Carousel - 3 visible with center focus
let newsSlideIndex = 0;

function slideNews(direction) {
    const cards = document.querySelectorAll('.news-cards .news-card');
    if (cards.length === 0) return;
    newsSlideIndex += direction;
    if (newsSlideIndex < 0) newsSlideIndex = cards.length - 1;
    if (newsSlideIndex >= cards.length) newsSlideIndex = 0;
    updateNewsCarousel();
}

function updateNewsCarousel() {
    const cards = document.querySelectorAll('.news-cards .news-card');
    const track = document.querySelector('.news-cards');
    if (!track || cards.length === 0) return;

    // Remove active from all, add to current
    cards.forEach(c => c.classList.remove('active'));
    cards[newsSlideIndex].classList.add('active');

    // Calculate offset to center the active card
    const offset = newsSlideIndex * 61; // 60% width + 1% margins
    track.style.transform = `translateX(-${offset}%)`;
}

// Set first card as active on load
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        const firstCard = document.querySelector('.news-cards .news-card');
        if (firstCard) firstCard.classList.add('active');
    }, 100);
});

// Auto-slide news every 5 seconds
setInterval(() => slideNews(1), 5000);

// ============================================
// MOBILE MENU
// ============================================
function toggleMenu() {
    document.querySelector('nav ul').classList.toggle('active');
}

// Close menu when clicking a link
document.querySelectorAll('nav ul li a').forEach(link => {
    link.addEventListener('click', () => {
        document.querySelector('nav ul').classList.remove('active');
    });
});

// ============================================
// HEADER SCROLL EFFECT
// ============================================
const header = document.getElementById('mainHeader');
window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
        header.classList.add('scrolled');
    } else {
        header.classList.remove('scrolled');
    }
});

// ============================================
// HERO SLIDER
// ============================================
let currentSlide = 0;
const slides = document.querySelectorAll('.slide');
const sliderDots = document.querySelectorAll('.slider-dot');

function goToSlide(index) {
    slides[currentSlide].classList.remove('active');
    sliderDots[currentSlide].classList.remove('active');
    currentSlide = index;
    slides[currentSlide].classList.add('active');
    sliderDots[currentSlide].classList.add('active');
}

function nextSlide() {
    goToSlide((currentSlide + 1) % slides.length);
}

function prevSlide() {
    goToSlide((currentSlide - 1 + slides.length) % slides.length);
}

// Auto-advance slider every 4 seconds
setInterval(nextSlide, 4000);

// ============================================
// COUNTER ANIMATION
// ============================================
function animateCounters() {
    const stats = document.querySelectorAll('.stat');
    stats.forEach(stat => {
        const target = parseInt(stat.dataset.target);
        const numberEl = stat.querySelector('.stat-number');
        if (!numberEl) return;
        let current = 0;
        const increment = target / 60;
        const timer = setInterval(() => {
            current += increment;
            if (current >= target) {
                current = target;
                clearInterval(timer);
            }
            numberEl.textContent = Math.floor(current);
        }, 25);
    });
}

// Observe stats section
const aboutSection = document.querySelector('.about');
if (aboutSection) {
    const counterObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                animateCounters();
                counterObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.3 });
    counterObserver.observe(aboutSection);
}

// ============================================
// SCROLL REVEAL ANIMATIONS
// ============================================
const revealElements = document.querySelectorAll(
    '.news-card, .program-card, .gallery-item, .contact-card, .value-item, .stat'
);

const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry, index) => {
        if (entry.isIntersecting) {
            setTimeout(() => {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }, index * 100);
            revealObserver.unobserve(entry.target);
        }
    });
}, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

revealElements.forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
    revealObserver.observe(el);
});

// ============================================
// BACK TO TOP
// ============================================
const backToTop = document.getElementById('backToTop');
window.addEventListener('scroll', () => {
    if (window.scrollY > 500) {
        backToTop.classList.add('visible');
    } else {
        backToTop.classList.remove('visible');
    }
});

function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ============================================
// SMOOTH SCROLL FOR NAV LINKS
// ============================================
document.querySelectorAll('nav a[href^="#"]').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const target = document.querySelector(link.getAttribute('href'));
        if (target) {
            const headerOffset = 80;
            const elementPosition = target.getBoundingClientRect().top;
            const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
            window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
        }
    });
});

// ============================================
// INQUIRY FORM
// ============================================
function handleInquiry(event) {
    event.preventDefault();
    const API_URL = window.location.hostname === 'localhost' ? 'http://localhost:5000/api' : '/api';

    const data = {
        childName: document.getElementById('inqName').value,
        email: document.getElementById('inqEmail').value,
        contact: document.getElementById('inqContact').value,
        gradeLevel: document.getElementById('inqGrade').value,
        message: document.getElementById('inqMessage').value
    };

    fetch(`${API_URL}/inquiries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    }).catch(() => { });

    document.getElementById('formSuccess').style.display = 'block';
    event.target.reset();
    setTimeout(() => {
        document.getElementById('formSuccess').style.display = 'none';
    }, 6000);
}

// ============================================
// NEWS MODAL
// ============================================
const newsData = {
    news1: {
        img: 'news1.jpg',
        title: 'ENROLL NOW! Beata Sai Integrated School 2026-2027',
        date: 'May 2026',
        desc: `Beata Sai Integrated School 2026-2027 Admissions are still open!\n\nOur curriculum is Waldorf-inspired.\n• Air-conditioned Classrooms\n• School Service\n\nWe offer kindergarten to elementary.\n\nJust bring the following:\n• PSA\n• Form 138 (if transferee)\n• Report card (if transferee)\n\nFeel free to message us directly here on our page.\n\nContact us: 09272445030\nVisit us: Narra St. Brgy. Magsaysay Lopez Quezon\n\n#BeataSaiIntegratedSchool #WaldorfInspired #HolisticEducation #NowEnrolling #FutureReady`
    },
    news2: {
        img: 'news2.jpg',
        title: 'CONGRATULATIONS! John David R. Argente',
        date: 'March 2026',
        desc: `TOP 8 – LEPT MARCH 2026\n\nBeata Sai Integrated School proudly celebrates your outstanding achievement and success!\n\nYour excellence brings pride and honor to our institution.\n\nWe are proud of you!`
    },
    news3: {
        img: 'news3.jpg',
        title: 'CONGRATULATIONS! Mae Angelie P. Villapando',
        date: 'March 2026',
        desc: `LEPT MARCH 2026\n\nBeata Sai Integrated School proudly celebrates your outstanding achievement and success!\n\nYour excellence brings pride and honor to our institution.\n\nWe are proud of you!`
    }
};

function openNewsModal(newsId) {
    const news = newsData[newsId];
    if (!news) return;
    document.getElementById('newsModalImg').src = news.img;
    document.getElementById('newsModalTitle').textContent = news.title;
    document.getElementById('newsModalDate').textContent = news.date;
    document.getElementById('newsModalDesc').textContent = news.desc;
    document.getElementById('newsModalOverlay').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeNewsModal() {
    document.getElementById('newsModalOverlay').classList.remove('active');
    document.body.style.overflow = '';
}

// ============================================
// WELCOME POPUP
// ============================================
function closeWelcomePopup() {
    const popup = document.getElementById('welcomePopup');
    popup.style.animation = 'popupFadeOut 0.3s ease forwards';
    setTimeout(() => {
        popup.classList.add('hidden');
    }, 300);
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeWelcomePopup();
        closeNewsModal();
        closeGalleryModal();
    }
});

document.getElementById('welcomePopup')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeWelcomePopup();
});

// ============================================
// GALLERY MODAL
// ============================================
const galleryData = {
    daily: {
        title: '📖 Daily',
        images: ['daily1.jpg', 'daily2.jpg', 'daily3.jpeg', 'daily4.jpg', 'daily5.jpg']
    },
    events: {
        title: '🎉 Events',
        images: ['event1.jpg', 'event2.jpeg', 'event3.jpg', 'event4.jpg', 'event5.jpg']
    },
    crossingover: {
        title: '🎓 Crossing Over',
        images: ['crossingover1.png', 'crossingover2.jpg', 'crossingover3.png']
    },
    riteofpassage: {
        title: '🕯️ Rite of Passage',
        images: ['riteofpassage1.JPEG', 'riteofpassage2.JPEG']
    },
    camping: {
        title: '⛺ Camping',
        images: ['camping1.png', 'camping2.jpg', 'camping3.jpg', 'camping4.JPEG', 'camping5.png']
    },
    fieldlearning: {
        title: '🌿 Field Learning',
        images: ['fieldlearning1.jpeg', 'fieldlearning2.jpeg', 'fieldlearning3.jpg', 'fieldlearning4.jpeg', 'fieldlearning5.jpg']
    }
};

function openGalleryModal(category) {
    const data = galleryData[category];
    if (!data) return;
    document.getElementById('galleryModalTitle').textContent = data.title;
    document.getElementById('galleryModalGrid').innerHTML = data.images.map(img => `
        <div class="gallery-modal-item" onclick="openFullImage('${img}')">
            <img src="${img}" alt="${data.title}" loading="lazy">
        </div>
    `).join('');
    document.getElementById('galleryModalOverlay').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeGalleryModal() {
    document.getElementById('galleryModalOverlay').classList.remove('active');
    document.body.style.overflow = '';
}

function openFullImage(src) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.95);display:flex;justify-content:center;align-items:center;z-index:100000;cursor:pointer;padding:1rem;';
    overlay.innerHTML = `<img src="${src}" style="max-width:95%;max-height:95%;border-radius:16px;object-fit:contain;box-shadow:0 20px 60px rgba(0,0,0,0.5);"><span style="position:absolute;top:20px;right:30px;color:#fff;font-size:1.5rem;cursor:pointer;width:42px;height:42px;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.1);border-radius:50%;backdrop-filter:blur(4px);">✕</span>`;
    overlay.onclick = () => overlay.remove();
    document.body.appendChild(overlay);
}

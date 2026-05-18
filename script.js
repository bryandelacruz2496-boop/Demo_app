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
    if (window.scrollY > 80) {
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

// Auto-advance slider
setInterval(nextSlide, 5000);

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
        const duration = 2000;
        const increment = target / (duration / 16);
        const timer = setInterval(() => {
            current += increment;
            if (current >= target) {
                current = target;
                clearInterval(timer);
            }
            numberEl.textContent = Math.floor(current);
        }, 16);
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
// SCROLL REVEAL
// ============================================
const revealElements = document.querySelectorAll(
    '.news-card, .program-card, .gallery-item, .contact-card, .value-card, .stat, .requirements-card, .inquiry-form'
);

const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry, index) => {
        if (entry.isIntersecting) {
            setTimeout(() => {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }, index * 80);
            revealObserver.unobserve(entry.target);
        }
    });
}, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

revealElements.forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(25px)';
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
        title: 'Daily',
        images: ['daily1.jpg', 'daily2.jpg', 'daily3.jpeg', 'daily4.jpg', 'daily5.jpg']
    },
    events: {
        title: 'Events',
        images: ['event1.jpg', 'event2.jpeg', 'event3.jpg', 'event4.jpg', 'event5.jpg']
    },
    crossingover: {
        title: 'Crossing Over',
        images: ['crossingover1.png', 'crossingover2.jpg', 'crossingover3.png']
    },
    riteofpassage: {
        title: 'Rite of Passage',
        images: ['riteofpassage1.JPEG', 'riteofpassage2.JPEG']
    },
    camping: {
        title: 'Camping',
        images: ['camping1.png', 'camping2.jpg', 'camping3.jpg', 'camping4.JPEG', 'camping5.png']
    },
    fieldlearning: {
        title: 'Field Learning',
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
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.95);display:flex;justify-content:center;align-items:center;z-index:100000;cursor:pointer;padding:1rem;animation:fadeIn 0.3s ease;';
    overlay.innerHTML = `<img src="${src}" style="max-width:95%;max-height:95%;border-radius:12px;object-fit:contain;box-shadow:0 20px 60px rgba(0,0,0,0.5);"><span style="position:absolute;top:20px;right:30px;color:#fff;font-size:2rem;cursor:pointer;width:40px;height:40px;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.1);border-radius:50%;">✕</span>`;
    overlay.onclick = () => overlay.remove();
    document.body.appendChild(overlay);
}

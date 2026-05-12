// Mobile menu toggle
function toggleMenu() {
    document.querySelector('nav ul').classList.toggle('active');
}

// Tab switching for programs
function switchTab(event, tabId) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    event.target.classList.add('active');
}

// Gallery lightbox
function openLightbox(element) {
    const img = element.querySelector('img');
    const lightbox = document.getElementById('lightbox');
    const lightboxImg = document.getElementById('lightbox-img');
    lightboxImg.src = img.src.replace('w=400&h=300', 'w=1200&h=800');
    lightbox.classList.add('active');
}

function closeLightbox() {
    document.getElementById('lightbox').classList.remove('active');
}

// News ticker auto-rotate
let currentNews = 0;
const newsItems = document.querySelectorAll('.news-item');
const dots = document.querySelectorAll('.dot');

function showNews(index) {
    newsItems.forEach(item => item.classList.remove('active'));
    dots.forEach(dot => dot.classList.remove('active'));
    newsItems[index].classList.add('active');
    dots[index].classList.add('active');
    currentNews = index;
}

setInterval(() => {
    currentNews = (currentNews + 1) % newsItems.length;
    showNews(currentNews);
}, 5000);

// Counter animation
function animateCounters() {
    const stats = document.querySelectorAll('.stat');
    stats.forEach(stat => {
        const target = parseInt(stat.dataset.target);
        const numberEl = stat.querySelector('.stat-number');
        let current = 0;
        const increment = target / 50;
        const timer = setInterval(() => {
            current += increment;
            if (current >= target) {
                current = target;
                clearInterval(timer);
            }
            numberEl.textContent = Math.floor(current);
        }, 30);
    });
}

// Intersection Observer for counter animation
const aboutSection = document.querySelector('.about');
const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            animateCounters();
            observer.unobserve(entry.target);
        }
    });
}, { threshold: 0.5 });

observer.observe(aboutSection);

// Back to top button
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

// Inquiry form
function handleInquiry(event) {
    event.preventDefault();
    document.getElementById('formSuccess').style.display = 'block';
    event.target.reset();
    setTimeout(() => {
        document.getElementById('formSuccess').style.display = 'none';
    }, 3000);
}

// Smooth scroll for nav links
document.querySelectorAll('nav a[href^="#"]').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const target = document.querySelector(link.getAttribute('href'));
        if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            document.querySelector('nav ul').classList.remove('active');
        }
    });
});

// Header scroll effect
window.addEventListener('scroll', () => {
    const header = document.querySelector('header');
    if (window.scrollY > 50) {
        header.style.background = 'rgba(183, 28, 28, 0.95)';
    } else {
        header.style.background = '#b71c1c';
    }
});

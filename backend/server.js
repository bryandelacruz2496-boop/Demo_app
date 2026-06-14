const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
if (!process.env.MONGO_URI) {
  require('dotenv').config();
}

const authRoutes = require('./routes/auth');
const studentRoutes = require('./routes/student');
const adminStudentRoutes = require('./routes/admin-students');
const announcementRoutes = require('./routes/announcements');
const inquiryRoutes = require('./routes/inquiries');
const eventRoutes = require('./routes/events');
const projectRoutes = require('./routes/projects');
const exportRoutes = require('./routes/exports');
const auditRoutes = require('./routes/audit');
const websiteRoutes = require('./routes/website');
const { serveEncryptedFile } = require('./middleware/fileEncryption');

const app = express();

// Trust first proxy (Render, Heroku, etc.) so rate-limiter gets real client IP
app.set('trust proxy', 1);

// ============================================
// SECURITY: Helmet (HTTP security headers)
// ============================================
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allow images to load cross-origin in dev
  contentSecurityPolicy: false // Disable CSP for now (frontend uses inline scripts)
}));

// ============================================
// SECURITY: HTTPS enforcement in production
// ============================================
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    // Redirect .onrender.com to custom domain
    if (req.headers.host && req.headers.host.includes('.onrender.com')) {
      return res.redirect(301, `https://beatasai.com${req.url}`);
    }
    if (req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }
    next();
  });
}

// ============================================
// SECURITY: CORS restriction
// ============================================
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:8080', 'http://localhost:3000', 'http://localhost:5000', 'https://beatasaiintegratedschool.onrender.com', 'https://beatasai.com', 'https://www.beatasai.com'];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true // Required for httpOnly cookies
}));

// ============================================
// SECURITY: Input sanitization
// ============================================
app.use(express.json());
app.use(cookieParser());

// Preserve password fields and rich HTML body before mongo sanitization
app.use((req, res, next) => {
  if (req.body) {
    req._rawPasswords = {};
    ['password', 'newPassword', 'adminPassword', 'newPw', 'confirmPw'].forEach(field => {
      if (req.body[field] !== undefined) {
        req._rawPasswords[field] = req.body[field];
      }
    });
    // Preserve HTML body for announcements
    if (req.body.body !== undefined) {
      req._rawBody = req.body.body;
    }
  }
  next();
});

app.use(mongoSanitize()); // Prevents NoSQL injection ($gt, $ne, etc.)

// Restore password fields and HTML body after mongo sanitization
app.use((req, res, next) => {
  if (req._rawPasswords) {
    Object.keys(req._rawPasswords).forEach(field => {
      req.body[field] = req._rawPasswords[field];
    });
    delete req._rawPasswords;
  }
  if (req._rawBody !== undefined) {
    req.body.body = req._rawBody;
    delete req._rawBody;
  }
  next();
});

// XSS sanitization middleware
app.use((req, res, next) => {
  if (req.body) {
    sanitizeObject(req.body, req.path);
  }
  if (req.query) {
    sanitizeObject(req.query, req.path);
  }
  next();
});

function sanitizeObject(obj, path) {
  // Skip password fields - they need to be compared exactly as entered
  const skipFields = ['password', 'newPassword', 'adminPassword', 'newPw', 'confirmPw'];
  for (const key in obj) {
    if (skipFields.includes(key)) continue;
    if (typeof obj[key] === 'string') {
      obj[key] = obj[key]
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/javascript:/gi, '')
        .replace(/on\w+\s*=/gi, '');
    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
      sanitizeObject(obj[key], path);
    }
  }
}

// ============================================
// SECURITY: Rate limiting
// ============================================
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // max 10 attempts per window
  message: { message: 'Too many login attempts. Please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false
});

app.use('/api/auth/login', loginLimiter);
app.use('/api/student/login', loginLimiter);

// General API rate limiter
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 500, // 500 requests per minute
  message: { message: 'Too many requests. Please slow down.' }
});
app.use('/api/', apiLimiter);

// ============================================
// File uploads (encrypted)
// ============================================
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Serve uploaded files (supports encrypted files)
app.get('/uploads/*', serveEncryptedFile);

// ============================================
// Database connection
// ============================================
const mongoOptions = {};

mongoose.connect(process.env.MONGO_URI, mongoOptions)
  .then(async () => {
    console.log('MongoDB connected');
    // Auto-fix pending payments on startup (redistribute evenly)
    try {
      const Student = require('./models/Student');
      const students = await Student.find({ status: { $ne: 'archived' } });
      let fixed = 0;
      for (const student of students) {
        const paidTotal = student.payments
          .filter(p => p.status === 'paid' && p.amount > 0 && !p.description.startsWith('[Expense]'))
          .reduce((sum, p) => sum + p.amount, 0);
        const remainingBalance = (student.totalTuition || 0) - paidTotal;
        const pendingPayments = student.payments.filter(p => p.status === 'pending' && !p.description.startsWith('[Expense]'));
        if (pendingPayments.length === 0) continue;

        // Check if current pending totals match remaining balance
        const currentTotal = pendingPayments.reduce((s, p) => s + p.amount, 0);
        if (Math.abs(currentTotal - remainingBalance) < 1) continue;

        if (remainingBalance <= 0) {
          pendingPayments.forEach(p => { p.amount = 0; p.status = 'paid'; p.paidDate = p.paidDate || new Date().toISOString().split('T')[0]; });
        } else {
          const perPayment = Math.floor(remainingBalance / pendingPayments.length);
          let distributed = 0;
          for (let i = 0; i < pendingPayments.length; i++) {
            if (i === pendingPayments.length - 1) {
              pendingPayments[i].amount = remainingBalance - distributed;
            } else {
              pendingPayments[i].amount = perPayment;
              distributed += perPayment;
            }
          }
        }
        await student.save();
        fixed++;
      }
      if (fixed > 0) console.log(`Auto-fixed pending payments for ${fixed} students`);
    } catch (e) {
      console.error('Auto-recalculate error:', e.message);
    }

    // One-time migration: Set enrolleeType and recalculate tuition for students missing it
    try {
      const Student = require('./models/Student');
      const { TUITION_TABLE, MONTHLY_SCHEDULES } = require('./config/tuition');
      const studentsNoType = await Student.find({ enrolleeType: { $exists: false } });
      const studentsNullType = await Student.find({ enrolleeType: null });
      const toFix = [...studentsNoType, ...studentsNullType.filter(s => !studentsNoType.find(n => n._id.equals(s._id)))];

      if (toFix.length > 0) {
        let migrated = 0;
        for (const student of toFix) {
          const grade = student.grade;
          if (!grade) continue;

          const oldData = TUITION_TABLE['old'] && TUITION_TABLE['old'][grade];
          const newData = TUITION_TABLE['new'] && TUITION_TABLE['new'][grade];
          if (!oldData && !newData) continue;

          // Infer enrolleeType from monthly payment amounts
          let enrolleeType = 'old';
          const monthlyPayments = student.payments.filter(p => p.description && p.description.startsWith('Monthly Payment'));
          if (monthlyPayments.length > 0 && newData) {
            const nonJune = monthlyPayments.find(p => (p.originalAmount || p.amount) !== 3000 && p.description && !p.description.includes('June'));
            if (nonJune) {
              const amt = nonJune.originalAmount || nonJune.amount;
              const newSchedule = MONTHLY_SCHEDULES['new'] && MONTHLY_SCHEDULES['new'][grade];
              if (newSchedule && Math.abs(amt - newSchedule[1]) < 10) {
                enrolleeType = 'new';
              }
            }
          }

          student.enrolleeType = enrolleeType;

          // Recalculate totalTuition
          const gradeData = TUITION_TABLE[enrolleeType][grade];
          if (!gradeData) continue;

          const baseTuition = gradeData.tuition;
          const misc = gradeData.miscTotal;
          const paymentOption = student.paymentOption || 'monthly';

          // Calculate discounts
          let discountPct = 0, flatDiscounts = 0;
          student.payments.forEach(p => {
            if (p.amount < 0 && p.description) {
              if (p.description.includes('10%') || p.description.toLowerCase().includes('siblings') || p.description.toLowerCase().includes('friends')) discountPct += 10;
              else if (p.description.includes('5%') || p.description.toLowerCase().includes('early bird')) discountPct += 5;
              else if (p.description.includes('30%') || p.description.toLowerCase().includes('employee')) discountPct += 30;
              else flatDiscounts += Math.abs(p.amount);
            }
          });
          const totalDiscounts = Math.round(baseTuition * (discountPct / 100)) + flatDiscounts;

          let correctTotal;
          if (paymentOption === 'full') {
            correctTotal = baseTuition - Math.round(baseTuition * 0.03) + misc - totalDiscounts;
          } else if (paymentOption === 'two_payments') {
            correctTotal = baseTuition + Math.round(baseTuition * 0.05) + misc - totalDiscounts;
          } else {
            correctTotal = baseTuition + Math.round(baseTuition * 0.07) + misc - totalDiscounts;
          }

          const paidTotal = student.payments
            .filter(p => p.status === 'paid' && p.amount > 0 && !p.description.startsWith('[Expense]'))
            .reduce((sum, p) => sum + p.amount, 0);

          student.totalTuition = correctTotal;

          // Remove pending non-expense payments
          student.payments = student.payments.filter(p => p.status === 'paid' || (p.description && p.description.startsWith('[Expense]')));

          const remainingBalance = correctTotal - paidTotal;
          if (remainingBalance > 0) {
            if (paymentOption === 'full') {
              student.payments.push({ date: '2026-06-01', description: 'Full Payment (3% discount)', amount: remainingBalance, originalAmount: remainingBalance, status: 'pending' });
            } else if (paymentOption === 'two_payments') {
              const half = Math.round(remainingBalance / 2);
              student.payments.push({ date: '2026-06-01', description: 'First Payment (Upon Enrollment)', amount: half, originalAmount: half, status: 'pending' });
              student.payments.push({ date: '2026-12-01', description: 'Second Payment (December 2026)', amount: remainingBalance - half, originalAmount: remainingBalance - half, status: 'pending' });
            } else {
              const months = ['06', '07', '08', '09', '10', '11', '12'];
              const monthNames = ['June 2026', 'July 2026', 'August 2026', 'September 2026', 'October 2026', 'November 2026', 'December 2026'];
              const schedules = MONTHLY_SCHEDULES[enrolleeType];
              const schedule = schedules && schedules[grade];
              if (schedule) {
                // Determine start month based on paid amount
                let startMonth = 0, covered = 0;
                for (let i = 0; i < 7; i++) {
                  if (covered + schedule[i] <= paidTotal + 1) { covered += schedule[i]; startMonth = i + 1; } else break;
                }
                if (startMonth >= 7) startMonth = 6;
                for (let i = startMonth; i < 7; i++) {
                  student.payments.push({ date: `2026-${months[i]}-01`, description: `Monthly Payment - ${monthNames[i]}`, amount: schedule[i], originalAmount: schedule[i], status: 'pending' });
                }
                // Adjust if total doesn't match
                const pending = student.payments.filter(p => p.status === 'pending' && !p.description.startsWith('[Expense]'));
                const pTotal = pending.reduce((s, p) => s + p.amount, 0);
                if (Math.abs(pTotal - remainingBalance) > 1 && pending.length > 0) {
                  const per = Math.floor(remainingBalance / pending.length);
                  let dist = 0;
                  pending.forEach((p, i) => { if (i === pending.length - 1) p.amount = remainingBalance - dist; else { p.amount = per; dist += per; } });
                }
              } else {
                const per = Math.floor(remainingBalance / 7);
                let dist = 0;
                for (let i = 0; i < 7; i++) {
                  const amt = i === 6 ? remainingBalance - dist : per;
                  student.payments.push({ date: `2026-${months[i]}-01`, description: `Monthly Payment - ${monthNames[i]}`, amount: amt, originalAmount: amt, status: 'pending' });
                  dist += amt;
                }
              }
            }
          }

          await student.save();
          migrated++;
        }
        if (migrated > 0) console.log(`Migrated enrolleeType for ${migrated} students`);
      }
    } catch (e) {
      console.error('EnrolleeType migration error:', e.message);
    }

    // Ensure at least one superadmin exists (upgrade first admin if none)
    try {
      const Admin = require('./models/Admin');
      const superadminExists = await Admin.findOne({ role: 'superadmin' });
      if (!superadminExists) {
        const firstAdmin = await Admin.findOne().sort({ createdAt: 1 });
        if (firstAdmin) {
          firstAdmin.role = 'superadmin';
          if (!firstAdmin.status) firstAdmin.status = 'active';
          await firstAdmin.save();
          console.log(`Upgraded ${firstAdmin.username} to superadmin`);
        }
      }
      // Ensure all admins have a status field
      await Admin.updateMany({ status: { $exists: false } }, { $set: { status: 'active' } });
    } catch (e) {
      console.error('Admin role setup error:', e.message);
    }

    // Seed default news if none exist
    try {
      const WebsiteNews = require('./models/WebsiteNews');
      const newsCount = await WebsiteNews.countDocuments();
      if (newsCount === 0) {
        await WebsiteNews.insertMany([
          {
            title: 'ENROLL NOW! Admissions 2026-2027',
            date: 'May 2026',
            description: 'Beata Sai Integrated School 2026-2027 Admissions are still open!\n\nOur curriculum is Waldorf-inspired.\n• Air-conditioned Classrooms\n• School Service\n\nWe offer kindergarten to elementary.\n\nJust bring the following:\n• PSA\n• Form 138 (if transferee)\n• Report card (if transferee)\n\nFeel free to message us directly here on our page.\n\nContact us: 09272445030\nVisit us: Narra St. Brgy. Magsaysay Lopez Quezon',
            imageUrl: '/news1.jpg',
            badge: '🆕 New',
            published: true
          },
          {
            title: 'CONGRATULATIONS! John David R. Argente',
            date: 'March 2026',
            description: 'TOP 8 – LEPT MARCH 2026\n\nBeata Sai Integrated School proudly celebrates your outstanding achievement and success!\n\nYour excellence brings pride and honor to our institution.\n\nWe are proud of you!',
            imageUrl: '/news2.jpg',
            badge: '📢 Announcement',
            published: true
          },
          {
            title: 'CONGRATULATIONS! Mae Angelie P. Villapando',
            date: 'March 2026',
            description: 'LEPT MARCH 2026\n\nBeata Sai Integrated School proudly celebrates your outstanding achievement and success!\n\nYour excellence brings pride and honor to our institution.\n\nWe are proud of you!',
            imageUrl: '/news3.jpg',
            badge: '📢 Announcement',
            published: true
          }
        ]);
        console.log('Seeded 3 default news items');
      }
    } catch (e) {
      console.error('News seed error:', e.message);
    }

    // Seed default gallery categories if none exist
    try {
      const GalleryCategory = require('./models/GalleryCategory');
      const galCount = await GalleryCategory.countDocuments();
      if (galCount === 0) {
        await GalleryCategory.insertMany([
          { name: 'Daily', icon: '📖', coverImage: '/daily1.jpg', photos: ['/daily1.jpg', '/daily2.jpg', '/daily3.jpeg', '/daily4.jpg', '/daily5.jpg'], order: 1 },
          { name: 'Events', icon: '🎉', coverImage: '/event1.jpg', photos: ['/event1.jpg', '/event2.jpeg', '/event3.jpg', '/event4.jpg', '/event5.jpg'], order: 2 },
          { name: 'Crossing Over', icon: '🎓', coverImage: '/crossingover1.png', photos: ['/crossingover1.png', '/crossingover2.jpg', '/crossingover3.png'], order: 3 },
          { name: 'Rite of Passage', icon: '🕯️', coverImage: '/riteofpassage1.JPEG', photos: ['/riteofpassage1.JPEG', '/riteofpassage2.JPEG'], order: 4 },
          { name: 'Camping', icon: '⛺', coverImage: '/camping1.png', photos: ['/camping1.png', '/camping2.jpg', '/camping3.jpg', '/camping4.JPEG', '/camping5.png'], order: 5 },
          { name: 'Field Learning', icon: '🌿', coverImage: '/fieldlearning1.jpeg', photos: ['/fieldlearning1.jpeg', '/fieldlearning2.jpeg', '/fieldlearning3.jpg', '/fieldlearning4.jpeg', '/fieldlearning5.jpg'], order: 6 }
        ]);
        console.log('Seeded 6 default gallery categories');
      }
    } catch (e) {
      console.error('Gallery seed error:', e.message);
    }
  })
  .catch(err => console.error('MongoDB connection error:', err));

// ============================================
// Routes
// ============================================
app.use('/api/auth', authRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/admin', adminStudentRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/inquiries', inquiryRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/exports', exportRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/website', websiteRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// ============================================
// Serve frontend static files (production)
// ============================================
const frontendPath = path.join(__dirname, 'public');
if (fs.existsSync(frontendPath)) {
  app.use(express.static(frontendPath));
  // Fallback: serve index.html only for routes that don't match a file
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
      return next();
    }
    // If the request has a file extension, it's a missing static file - 404
    if (path.extname(req.path)) {
      return res.status(404).send('Not Found');
    }
    // Otherwise serve index.html (SPA fallback for clean URLs)
    res.sendFile(path.join(frontendPath, 'index.html'));
  });
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);

  // Self-ping to prevent sleep
  setInterval(() => {
    fetch('https://beatasai.com/api/health')
      .catch(() => { });
  }, 10 * 60 * 1000); // every 10 minutes
});

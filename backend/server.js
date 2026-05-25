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
  : ['http://localhost:8080', 'http://localhost:3000', 'http://localhost:5000', 'https://beatasaiintegratedschool.onrender.com'];

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

// Preserve password fields before mongo sanitization
app.use((req, res, next) => {
  if (req.body) {
    req._rawPasswords = {};
    ['password', 'newPassword', 'adminPassword', 'newPw', 'confirmPw'].forEach(field => {
      if (req.body[field] !== undefined) {
        req._rawPasswords[field] = req.body[field];
      }
    });
  }
  next();
});

app.use(mongoSanitize()); // Prevents NoSQL injection ($gt, $ne, etc.)

// Restore password fields after mongo sanitization
app.use((req, res, next) => {
  if (req._rawPasswords) {
    Object.keys(req._rawPasswords).forEach(field => {
      req.body[field] = req._rawPasswords[field];
    });
    delete req._rawPasswords;
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
    // Auto-recalculate pending payments on startup
    try {
      const Student = require('./models/Student');
      const students = await Student.find({ status: { $ne: 'archived' } });
      let fixed = 0;
      for (const student of students) {
        const paidTotal = student.payments
          .filter(p => p.status === 'paid' && p.amount > 0)
          .reduce((sum, p) => sum + p.amount, 0);
        const remainingBalance = (student.totalTuition || 0) - paidTotal;
        const pendingPayments = student.payments.filter(p => p.status === 'pending' && p.amount > 0);
        if (pendingPayments.length === 0) continue;
        const currentTotal = pendingPayments.reduce((s, p) => s + p.amount, 0);
        if (Math.abs(currentTotal - remainingBalance) < 1) continue; // already correct
        if (remainingBalance > 0) {
          const perPayment = Math.round(remainingBalance / pendingPayments.length);
          const lastIndex = pendingPayments.length - 1;
          let distributed = 0;
          pendingPayments.forEach((p, i) => {
            if (i === lastIndex) {
              p.amount = remainingBalance - distributed;
            } else {
              p.amount = perPayment;
              distributed += perPayment;
            }
          });
        } else {
          pendingPayments.forEach(p => { p.amount = 0; });
        }
        await student.save();
        fixed++;
      }
      if (fixed > 0) console.log(`Auto-fixed pending payments for ${fixed} students`);
    } catch (e) {
      console.error('Auto-recalculate error:', e.message);
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

  // Self-ping to prevent Render free tier sleep
  setInterval(() => {
    fetch('https://beatasaiintegratedschool.onrender.com/api/health')
      .catch(() => { });
  }, 10 * 60 * 1000); // every 10 minutes
});

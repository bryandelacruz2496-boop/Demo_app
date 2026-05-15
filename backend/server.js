const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const studentRoutes = require('./routes/student');
const adminStudentRoutes = require('./routes/admin-students');
const announcementRoutes = require('./routes/announcements');
const inquiryRoutes = require('./routes/inquiries');
const eventRoutes = require('./routes/events');
const projectRoutes = require('./routes/projects');
const exportRoutes = require('./routes/exports');
const auditRoutes = require('./routes/audit');
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
  : ['http://localhost:8080', 'http://localhost:3000', 'http://localhost:5000'];

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
app.use(mongoSanitize()); // Prevents NoSQL injection ($gt, $ne, etc.)

// XSS sanitization middleware
app.use((req, res, next) => {
  if (req.body) {
    sanitizeObject(req.body);
  }
  if (req.query) {
    sanitizeObject(req.query);
  }
  next();
});

function sanitizeObject(obj) {
  for (const key in obj) {
    if (typeof obj[key] === 'string') {
      obj[key] = obj[key]
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/javascript:/gi, '')
        .replace(/on\w+\s*=/gi, '');
    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
      sanitizeObject(obj[key]);
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
  max: 100, // 100 requests per minute
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
// Database connection (with TLS in production)
// ============================================
const mongoOptions = {};
if (process.env.NODE_ENV === 'production') {
  mongoOptions.tls = true;
  mongoOptions.tlsAllowInvalidCertificates = false;
}

mongoose.connect(process.env.MONGO_URI, mongoOptions)
  .then(() => console.log('MongoDB connected'))
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

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

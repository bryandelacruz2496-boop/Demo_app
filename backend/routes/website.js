const express = require('express');
const WebsiteNews = require('../models/WebsiteNews');
const GalleryCategory = require('../models/GalleryCategory');
const authMiddleware = require('../middleware/auth');
const { upload, uploadToCloudinary } = require('../config/cloudinary');
const { logAction } = require('../middleware/auditLogger');

const router = express.Router();

// ============================================
// PUBLIC ROUTES (no auth needed - for homepage)
// ============================================

// GET /api/website/news - Get published news for homepage (max 3)
router.get('/news', async (req, res) => {
    try {
        const news = await WebsiteNews.find({ published: true }).sort({ createdAt: -1 }).limit(3);
        res.json(news);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// GET /api/website/gallery - Get gallery categories for homepage
router.get('/gallery', async (req, res) => {
    try {
        const categories = await GalleryCategory.find().sort({ order: 1 });
        res.json(categories);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// ============================================
// ADMIN ROUTES (superadmin only)
// ============================================

// GET /api/website/admin/news - Get all news (including unpublished)
router.get('/admin/news', authMiddleware, async (req, res) => {
    try {
        if (req.admin.role !== 'superadmin') return res.status(403).json({ message: 'Access denied' });
        const news = await WebsiteNews.find().sort({ createdAt: -1 });
        res.json(news);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// POST /api/website/admin/news - Create news
router.post('/admin/news', authMiddleware, upload.single('image'), async (req, res) => {
    try {
        if (req.admin.role !== 'superadmin') return res.status(403).json({ message: 'Access denied' });

        const { title, date, description, badge } = req.body;
        if (!title || !date || !description) {
            return res.status(400).json({ message: 'Title, date, and description are required' });
        }

        let imageUrl = null;
        if (req.file) {
            const result = await uploadToCloudinary(req.file.buffer, 'beatasai/news');
            imageUrl = result.secure_url;
        }

        const news = new WebsiteNews({ title, date, description, imageUrl, badge: badge || null });
        await news.save();

        logAction('CREATE_NEWS', req.admin.username, `Created news: ${title}`, null, req.ip);
        res.status(201).json({ message: 'News created', news });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// PUT /api/website/admin/news/:id - Update news
router.put('/admin/news/:id', authMiddleware, upload.single('image'), async (req, res) => {
    try {
        if (req.admin.role !== 'superadmin') return res.status(403).json({ message: 'Access denied' });

        const news = await WebsiteNews.findById(req.params.id);
        if (!news) return res.status(404).json({ message: 'News not found' });

        const { title, date, description, badge, published } = req.body;
        if (title) news.title = title;
        if (date) news.date = date;
        if (description) news.description = description;
        if (badge !== undefined) news.badge = badge || null;
        if (published !== undefined) news.published = published === 'true' || published === true;

        if (req.file) {
            const result = await uploadToCloudinary(req.file.buffer, 'beatasai/news');
            news.imageUrl = result.secure_url;
        }

        await news.save();
        logAction('UPDATE_NEWS', req.admin.username, `Updated news: ${news.title}`, null, req.ip);
        res.json({ message: 'News updated', news });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// DELETE /api/website/admin/news/:id - Delete news
router.delete('/admin/news/:id', authMiddleware, async (req, res) => {
    try {
        if (req.admin.role !== 'superadmin') return res.status(403).json({ message: 'Access denied' });

        const news = await WebsiteNews.findById(req.params.id);
        if (!news) return res.status(404).json({ message: 'News not found' });

        await WebsiteNews.findByIdAndDelete(req.params.id);
        logAction('DELETE_NEWS', req.admin.username, `Deleted news: ${news.title}`, null, req.ip);
        res.json({ message: 'News deleted' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// ============================================
// GALLERY ADMIN ROUTES
// ============================================

// GET /api/website/admin/gallery - Get all categories
router.get('/admin/gallery', authMiddleware, async (req, res) => {
    try {
        if (req.admin.role !== 'superadmin') return res.status(403).json({ message: 'Access denied' });
        const categories = await GalleryCategory.find().sort({ order: 1 });
        res.json(categories);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// POST /api/website/admin/gallery - Create category
router.post('/admin/gallery', authMiddleware, upload.single('coverImage'), async (req, res) => {
    try {
        if (req.admin.role !== 'superadmin') return res.status(403).json({ message: 'Access denied' });

        const { name, icon } = req.body;
        if (!name) return res.status(400).json({ message: 'Category name is required' });

        let coverImage = null;
        if (req.file) {
            const result = await uploadToCloudinary(req.file.buffer, 'beatasai/gallery');
            coverImage = result.secure_url;
        }

        const category = new GalleryCategory({ name, icon: icon || '📸', coverImage, photos: [] });
        await category.save();

        logAction('CREATE_GALLERY', req.admin.username, `Created gallery: ${name}`, null, req.ip);
        res.status(201).json({ message: 'Category created', category });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// POST /api/website/admin/gallery/:id/photos - Upload photos to category
router.post('/admin/gallery/:id/photos', authMiddleware, upload.array('photos', 10), async (req, res) => {
    try {
        if (req.admin.role !== 'superadmin') return res.status(403).json({ message: 'Access denied' });

        const category = await GalleryCategory.findById(req.params.id);
        if (!category) return res.status(404).json({ message: 'Category not found' });

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ message: 'No photos uploaded' });
        }

        for (const file of req.files) {
            const result = await uploadToCloudinary(file.buffer, `beatasai/gallery/${category.name}`);
            category.photos.push(result.secure_url);
        }

        if (!category.coverImage && category.photos.length > 0) {
            category.coverImage = category.photos[0];
        }

        await category.save();
        res.json({ message: `${req.files.length} photos uploaded`, category });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// DELETE /api/website/admin/gallery/:id - Delete category
router.delete('/admin/gallery/:id', authMiddleware, async (req, res) => {
    try {
        if (req.admin.role !== 'superadmin') return res.status(403).json({ message: 'Access denied' });

        const category = await GalleryCategory.findById(req.params.id);
        if (!category) return res.status(404).json({ message: 'Category not found' });

        await GalleryCategory.findByIdAndDelete(req.params.id);
        logAction('DELETE_GALLERY', req.admin.username, `Deleted gallery: ${category.name}`, null, req.ip);
        res.json({ message: 'Category deleted' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// DELETE /api/website/admin/gallery/:id/photos/:index - Delete a photo from category
router.delete('/admin/gallery/:id/photos/:index', authMiddleware, async (req, res) => {
    try {
        if (req.admin.role !== 'superadmin') return res.status(403).json({ message: 'Access denied' });

        const category = await GalleryCategory.findById(req.params.id);
        if (!category) return res.status(404).json({ message: 'Category not found' });

        const index = parseInt(req.params.index);
        if (index < 0 || index >= category.photos.length) {
            return res.status(400).json({ message: 'Invalid photo index' });
        }

        category.photos.splice(index, 1);
        await category.save();
        res.json({ message: 'Photo deleted', category });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;

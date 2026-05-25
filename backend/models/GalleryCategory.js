const mongoose = require('mongoose');

const galleryCategorySchema = new mongoose.Schema({
    name: { type: String, required: true },
    icon: { type: String, default: '📸' },
    coverImage: { type: String, default: null },
    photos: [{ type: String }],
    order: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('GalleryCategory', galleryCategorySchema);

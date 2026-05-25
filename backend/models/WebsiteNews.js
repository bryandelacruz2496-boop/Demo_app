const mongoose = require('mongoose');

const websiteNewsSchema = new mongoose.Schema({
    title: { type: String, required: true },
    date: { type: String, required: true },
    description: { type: String, required: true },
    imageUrl: { type: String, required: true },
    badge: { type: String, default: null },
    published: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('WebsiteNews', websiteNewsSchema);

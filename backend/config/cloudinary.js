const cloudinary = require('cloudinary').v2;
const multer = require('multer');

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Use memory storage - files are buffered in memory then uploaded to Cloudinary
const storage = multer.memoryStorage();

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (req, file, cb) => {
        const allowed = /jpeg|jpg|png|gif|webp/;
        const ext = allowed.test(file.originalname.split('.').pop().toLowerCase());
        const mime = allowed.test(file.mimetype);
        if (ext && mime) cb(null, true);
        else cb(new Error('Only image files are allowed'));
    }
});

// Upload buffer to Cloudinary
function uploadToCloudinary(fileBuffer, folder = 'beatasai') {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                folder,
                transformation: [{ width: 500, height: 500, crop: 'limit', quality: 'auto' }]
            },
            (error, result) => {
                if (error) reject(error);
                else resolve(result);
            }
        );
        stream.end(fileBuffer);
    });
}

module.exports = { cloudinary, upload, uploadToCloudinary };

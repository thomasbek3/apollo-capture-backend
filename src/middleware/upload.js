const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const STORAGE_PATH = process.env.STORAGE_PATH || '/data';
const TEMP_DIR = path.join(STORAGE_PATH, 'temp');

// Ensure temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Create a unique temp directory for this upload
        const uploadDir = path.join(TEMP_DIR, req.uploadId || 'unknown');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname) || '';
        if (file.fieldname === 'video') {
            cb(null, `video${ext}`);
        } else if (file.fieldname === 'photos') {
            cb(null, `photo-${uuidv4()}${ext}`);
        } else {
            cb(null, `${file.fieldname}-${uuidv4()}${ext}`);
        }
    },
});

const fileFilter = (req, file, cb) => {
    if (file.fieldname === 'video') {
        const allowedVideo = ['video/webm', 'video/mp4', 'video/quicktime', 'video/x-matroska'];
        if (allowedVideo.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(`Invalid video type: ${file.mimetype}. Allowed: webm, mp4, mov, mkv`), false);
        }
    } else if (file.fieldname === 'photos') {
        const allowedImage = ['image/jpeg', 'image/png', 'image/webp'];
        if (allowedImage.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(`Invalid image type: ${file.mimetype}. Allowed: jpeg, png, webp`), false);
        }
    } else {
        cb(null, true);
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 500 * 1024 * 1024, // 500MB max per file (video can be large)
        files: 60, // max 60 files total (1 video + up to 59 photos)
    },
});

/**
 * Middleware to assign an upload ID before multer runs.
 */
function assignUploadId(req, res, next) {
    req.uploadId = uuidv4();
    next();
}

/**
 * Combined upload middleware: accepts 1 video + up to 50 photos.
 */
const uploadFields = upload.fields([
    { name: 'video', maxCount: 1 },
    { name: 'photos', maxCount: 50 },
]);

module.exports = {
    assignUploadId,
    uploadFields,
};

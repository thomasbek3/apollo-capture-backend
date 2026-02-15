const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const STORAGE_PATH = process.env.STORAGE_PATH || '/data';
const CAPTURES_DIR = path.join(STORAGE_PATH, 'captures');
const RESULTS_DIR = path.join(STORAGE_PATH, 'results');

/**
 * Initialize storage directories on startup.
 */
function initStorage() {
    const dirs = [CAPTURES_DIR, RESULTS_DIR];
    for (const dir of dirs) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            logger.info(`Created storage directory: ${dir}`);
        }
    }
}

/**
 * Ensure a capture-specific directory exists and return its path.
 */
function ensureCaptureDir(captureId) {
    const dir = path.join(CAPTURES_DIR, captureId);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
}

/**
 * Ensure a subdirectory inside a capture dir (e.g. 'photos', 'clips').
 */
function ensureCaptureSubDir(captureId, subDir) {
    const dir = path.join(CAPTURES_DIR, captureId, subDir);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
}

/**
 * Save a buffer to a file inside a capture directory.
 */
function saveCaptureFile(captureId, filename, buffer) {
    const dir = ensureCaptureDir(captureId);
    const filePath = path.join(dir, filename);
    fs.writeFileSync(filePath, buffer);
    logger.info(`Saved file: ${filePath} (${buffer.length} bytes)`);
    return filePath;
}

/**
 * Get the absolute file path for a capture's file.
 */
function getCaptureFilePath(captureId, filename) {
    return path.join(CAPTURES_DIR, captureId, filename);
}

/**
 * Save the final processing result as JSON.
 */
function saveResult(captureId, result) {
    const filePath = path.join(RESULTS_DIR, `${captureId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(result, null, 2));
    logger.info(`Saved result: ${filePath}`);
    return filePath;
}

/**
 * Load the final processing result.
 */
function getResult(captureId) {
    const filePath = path.join(RESULTS_DIR, `${captureId}.json`);
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

/**
 * Generate an API-accessible URL path for a stored file.
 * The Express server will serve /api/files/* from the storage path.
 */
function getFileUrl(captureId, filename) {
    return `/api/files/captures/${captureId}/${filename}`;
}

/**
 * Save JSON data (like transcript) to a capture directory.
 */
function saveCaptureJson(captureId, filename, data) {
    const dir = ensureCaptureDir(captureId);
    const filePath = path.join(dir, filename);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    logger.info(`Saved JSON: ${filePath}`);
    return filePath;
}

/**
 * List all captures with summary data for the dashboard.
 */
function listCaptures() {
    const captures = [];
    // Scan results directory for completed captures
    if (fs.existsSync(RESULTS_DIR)) {
        const files = fs.readdirSync(RESULTS_DIR).filter(f => f.endsWith('.json'));
        for (const file of files) {
            try {
                const captureId = path.basename(file, '.json');
                const result = JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, file), 'utf-8'));
                const meta = result.metadata || {};
                const rooms = result.rooms || [];
                const photos = result.photos || [];
                const totalItems = rooms.reduce((sum, r) => sum + (r.inventory || []).length, 0);
                const firstPhoto = photos.length > 0
                    ? (typeof photos[0] === 'string' ? photos[0] : (photos[0].filename || photos[0].path || ''))
                    : null;
                const stat = fs.statSync(path.join(RESULTS_DIR, file));
                captures.push({
                    id: captureId,
                    propertyName: meta.propertyName || captureId,
                    propertyAddress: meta.propertyAddress || '',
                    status: 'complete',
                    date: meta.date || stat.mtime.toISOString(),
                    roomCount: rooms.length,
                    itemCount: totalItems,
                    photoCount: photos.length,
                    firstPhoto,
                });
            } catch (err) {
                logger.warn(`Failed to parse result ${file}: ${err.message}`);
            }
        }
    }
    // Sort by date descending
    captures.sort((a, b) => new Date(b.date) - new Date(a.date));
    return captures;
}

/**
 * Delete all data associated with a capture.
 */
/**
 * Delete all data associated with a capture.
 * Retries up to 3 times to handle Windows file locking issues.
 */
function deleteCapture(captureId) {
    const captureDir = path.join(CAPTURES_DIR, captureId);
    const resultFile = path.join(RESULTS_DIR, `${captureId}.json`);
    const tempDir = path.join(STORAGE_PATH, 'temp', captureId);

    const maxRetries = 3;
    let attempts = 0;
    let lastError = null;

    while (attempts < maxRetries) {
        attempts++;
        try {
            if (fs.existsSync(captureDir)) {
                fs.rmSync(captureDir, { recursive: true, force: true });
                logger.info(`Deleted capture directory: ${captureDir}`);
            }
            if (fs.existsSync(resultFile)) {
                fs.rmSync(resultFile, { force: true });
                logger.info(`Deleted result file: ${resultFile}`);
            }
            if (fs.existsSync(tempDir)) {
                fs.rmSync(tempDir, { recursive: true, force: true });
            }
            return { success: true };
        } catch (err) {
            lastError = err;
            logger.warn(`Attempt ${attempts} failed to delete capture ${captureId}: ${err.message}`);
            // Wait 500ms before retry
            const end = Date.now() + 500;
            while (Date.now() < end) { }
        }
    }

    logger.error(`Failed to delete capture ${captureId} after ${maxRetries} attempts: ${lastError.message}`);
    return { success: false, error: lastError.message };
}

module.exports = {
    initStorage,
    ensureCaptureDir,
    ensureCaptureSubDir,
    saveCaptureFile,
    getCaptureFilePath,
    saveResult,
    getResult,
    getFileUrl,
    saveCaptureJson,
    listCaptures,
    deleteCapture,
    STORAGE_PATH,
    CAPTURES_DIR,
    RESULTS_DIR,
};

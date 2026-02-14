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
    STORAGE_PATH,
    CAPTURES_DIR,
    RESULTS_DIR,
};

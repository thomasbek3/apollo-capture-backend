const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const { assignUploadId, uploadFields } = require('../middleware/upload');
const storage = require('../services/storage');
const processor = require('../services/processor');

const router = express.Router();

/**
 * POST /api/capture/upload
 *
 * Receives capture data from the mobile app as multipart/form-data.
 *
 * Fields:
 * - video: video file (webm or mp4)
 * - photos: array of JPEG/PNG files
 * - transcript: JSON string — array of { text, timestampSeconds }
 * - photoMetadata: JSON string — array of { timestampSeconds, associatedRoom }
 * - roomBoundaries: JSON string — array of { roomName, timestampSeconds }
 * - propertyName: string
 * - propertyAddress: string
 */
router.post('/upload', assignUploadId, (req, res, next) => {
    uploadFields(req, res, (err) => {
        if (err) {
            logger.error('Upload error', err);
            return res.status(400).json({
                error: 'Upload failed',
                message: err.message,
            });
        }
        next();
    });
}, async (req, res) => {
    try {
        const captureId = req.uploadId;

        // Parse JSON string fields
        let transcript = [];
        let photoMetadata = [];
        let roomBoundaries = [];

        try {
            if (req.body.transcript) {
                transcript = JSON.parse(req.body.transcript);
            }
        } catch (e) {
            logger.warn(`Failed to parse transcript JSON: ${e.message}`);
        }

        try {
            if (req.body.photoMetadata) {
                photoMetadata = JSON.parse(req.body.photoMetadata);
            }
        } catch (e) {
            logger.warn(`Failed to parse photoMetadata JSON: ${e.message}`);
        }

        try {
            if (req.body.roomBoundaries) {
                roomBoundaries = JSON.parse(req.body.roomBoundaries);
            }
        } catch (e) {
            logger.warn(`Failed to parse roomBoundaries JSON: ${e.message}`);
        }

        const propertyName = req.body.propertyName || 'Unnamed Property';
        const propertyAddress = req.body.propertyAddress || '';

        // Get uploaded files
        const videoFiles = req.files?.video || [];
        const photoFiles = req.files?.photos || [];

        logger.info(`Upload received — captureId: ${captureId}`);
        logger.info(`  Video: ${videoFiles.length} files`);
        logger.info(`  Photos: ${photoFiles.length} files`);
        logger.info(`  Transcript items: ${transcript.length}`);
        logger.info(`  Room boundaries: ${roomBoundaries.length}`);
        logger.info(`  Property: "${propertyName}" at "${propertyAddress}"`);

        // Move files from temp to permanent capture directory
        const captureDir = storage.ensureCaptureDir(captureId);
        const photosDir = storage.ensureCaptureSubDir(captureId, 'photos');

        let videoPath = null;
        if (videoFiles.length > 0) {
            const video = videoFiles[0];
            const videoFilename = `video${path.extname(video.originalname) || '.webm'}`;
            const dest = path.join(captureDir, videoFilename);
            fs.renameSync(video.path, dest);
            videoPath = dest;
            logger.info(`  Video saved: ${dest}`);
        }

        const movedPhotoFiles = [];
        for (const photo of photoFiles) {
            const dest = path.join(photosDir, photo.filename);
            fs.renameSync(photo.path, dest);
            movedPhotoFiles.push({
                filename: photo.filename,
                originalPath: dest,
                path: dest,
            });
        }

        // Save transcript and metadata as JSON
        storage.saveCaptureJson(captureId, 'raw-transcript.json', transcript);
        storage.saveCaptureJson(captureId, 'photo-metadata.json', photoMetadata);
        storage.saveCaptureJson(captureId, 'room-boundaries.json', roomBoundaries);

        // Clean up temp directory
        const tempDir = path.join(storage.STORAGE_PATH, 'temp', captureId);
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }

        // Initialize processing status
        processor.initStatus(captureId);

        // Kick off async processing (fire-and-forget)
        processor.processCaptureAsync(captureId, {
            transcript,
            roomBoundaries,
            photoMetadata,
            photoFiles: movedPhotoFiles,
            videoPath,
            propertyName,
            propertyAddress,
        }).catch(err => {
            logger.error(`Async processing error for ${captureId}`, err);
        });

        // Respond immediately
        res.status(202).json({
            captureId,
            status: 'processing',
            message: 'Upload received, processing started',
        });

    } catch (err) {
        logger.error('Upload handler error', err);
        res.status(500).json({
            error: 'Internal server error',
            message: err.message,
        });
    }
});

/**
 * GET /api/capture/:captureId/status
 *
 * Check the processing status of a capture.
 */
router.get('/:captureId/status', (req, res) => {
    const { captureId } = req.params;
    const status = processor.getStatus(captureId);

    if (!status) {
        // Check if a result exists on disk (server may have restarted)
        const result = storage.getResult(captureId);
        if (result) {
            return res.json({
                captureId,
                status: 'complete',
                progress: {
                    transcription: 'complete',
                    roomSegmentation: 'complete',
                    inventoryExtraction: 'complete',
                    photoAssociation: 'complete',
                    notionSync: 'skipped',
                },
                result,
            });
        }

        return res.status(404).json({
            error: 'Not found',
            message: `No capture found with id: ${captureId}`,
        });
    }

    res.json({
        captureId: status.captureId,
        status: status.status,
        progress: status.progress,
        result: status.status === 'complete' ? status.result : null,
        error: status.status === 'failed' ? status.error : null,
    });
});

/**
 * GET /api/capture/:captureId/result
 *
 * Get the final processed result for a capture.
 */
router.get('/:captureId/result', (req, res) => {
    const { captureId } = req.params;

    // Check in-memory first
    const status = processor.getStatus(captureId);

    if (status) {
        if (status.status === 'processing') {
            return res.status(202).json({
                message: 'Processing is still in progress',
                progress: status.progress,
            });
        }

        if (status.status === 'failed') {
            return res.status(500).json({
                error: 'Processing failed',
                message: status.error,
            });
        }

        if (status.status === 'complete' && status.result) {
            return res.json(status.result);
        }
    }

    // Check disk storage
    const result = storage.getResult(captureId);
    if (result) {
        return res.json(result);
    }

    return res.status(404).json({
        error: 'Not found',
        message: `No result found for capture: ${captureId}`,
    });
});

module.exports = router;

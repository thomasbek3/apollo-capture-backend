const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const storage = require('./storage');
const transcriptService = require('./transcript');
const claudeService = require('./claude');
const photosService = require('./photos');
const ffmpegService = require('./ffmpeg');
const notionService = require('./notion');

/**
 * In-memory status tracking for capture processing.
 * Key: captureId, Value: status object.
 *
 * In production, you'd want Redis or a database for this.
 */
const statusMap = new Map();

/**
 * Initialize a new capture status entry.
 */
function initStatus(captureId, metadata = {}) {
    const status = {
        captureId,
        status: 'processing',
        propertyName: metadata.propertyName,
        propertyAddress: metadata.propertyAddress,
        startedAt: new Date().toISOString(),
        progress: {
            transcription: 'pending',
            roomSegmentation: 'pending',
            inventoryExtraction: 'pending',
            photoAssociation: 'pending',
            notionSync: 'pending',
        },
        result: null,
        error: null,
    };
    statusMap.set(captureId, status);
    return status;
}

/**
 * Get the current status for a capture.
 */
function getStatus(captureId) {
    return statusMap.get(captureId) || null;
}

/**
 * Update a specific progress step.
 */
function updateProgress(captureId, step, value) {
    const status = statusMap.get(captureId);
    if (status) {
        status.progress[step] = value;
    }
}

/**
 * Run the full processing pipeline asynchronously.
 *
 * @param {string} captureId
 * @param {object} captureData - Parsed upload data
 * @param {object} captureData.transcript - Array of transcript items
 * @param {object} captureData.roomBoundaries - Array of room boundaries
 * @param {object} captureData.photoMetadata - Array of photo metadata
 * @param {Array} captureData.photoFiles - Uploaded photo file objects
 * @param {string} captureData.videoPath - Path to uploaded video file
 * @param {string} captureData.propertyName
 * @param {string} captureData.propertyAddress
 */
async function processCaptureAsync(captureId, captureData) {
    const status = statusMap.get(captureId);
    if (!status) {
        logger.error(`No status entry for captureId: ${captureId}`);
        return;
    }

    try {
        logger.info(`=== Starting processing pipeline for capture ${captureId} ===`);

        // ─── STEP 1: TRANSCRIPT ENHANCEMENT ───
        logger.info('Step 1: Transcript Enhancement');
        updateProgress(captureId, 'transcription', 'processing');

        const { items: enhancedTranscript, fullText } = transcriptService.enhance(
            captureData.transcript,
            captureData.roomBoundaries
        );

        // Save the enhanced transcript
        storage.saveCaptureJson(captureId, 'transcript.json', enhancedTranscript);

        updateProgress(captureId, 'transcription', 'complete');
        logger.info('Step 1 complete: Transcript enhanced');

        // ─── STEP 2: ROOM SEGMENTATION (Claude) ───
        logger.info('Step 2: Room Segmentation via Claude');
        updateProgress(captureId, 'roomSegmentation', 'processing');

        let claudeResult;
        try {
            claudeResult = await claudeService.segmentRooms(enhancedTranscript, captureData.roomBoundaries);
        } catch (claudeErr) {
            logger.error('Claude segmentation failed', claudeErr);
            updateProgress(captureId, 'roomSegmentation', 'failed');
            throw claudeErr;
        }

        // Save Claude result
        storage.saveCaptureJson(captureId, 'claude-result.json', claudeResult);

        updateProgress(captureId, 'roomSegmentation', 'complete');
        updateProgress(captureId, 'inventoryExtraction', 'complete'); // inventory is part of room segmentation
        logger.info('Step 2 complete: Room segmentation done');

        // ─── STEP 3: PHOTO ASSOCIATION ───
        logger.info('Step 3: Photo Association');
        updateProgress(captureId, 'photoAssociation', 'processing');

        const rooms = claudeResult.rooms || [];
        const photoResults = await photosService.associatePhotos(
            captureData.photoFiles,
            captureData.photoMetadata,
            rooms,
            captureId
        );

        updateProgress(captureId, 'photoAssociation', 'complete');
        logger.info('Step 3 complete: Photos associated');

        // ─── STEP 4: VIDEO PROCESSING (optional) ───
        let videoDuration = parseInt(captureData.durationSeconds) || 0;
        let roomClips = [];

        if (captureData.videoPath && fs.existsSync(captureData.videoPath)) {
            try {
                videoDuration = await ffmpegService.getVideoDuration(captureData.videoPath);
                logger.info(`Video duration: ${videoDuration}s`);
            } catch (err) {
                logger.warn(`Could not get video duration: ${err.message}`);
            }

            // Room clips — optional for v1, attempt but don't fail on error
            try {
                roomClips = await ffmpegService.generateRoomClips(captureData.videoPath, rooms, captureId);
            } catch (err) {
                logger.warn(`Room clip generation failed (non-fatal): ${err.message}`);
            }
        }

        // ─── STEP 5: COMPILE FINAL RESULT ───
        logger.info('Step 5: Compiling final result');

        // Build room entries with photos and clips
        const roomsWithMedia = rooms.map(room => {
            const roomPhotos = photoResults.filter(
                p => p.roomId === room.roomId || p.roomName.toLowerCase() === room.roomName.toLowerCase()
            );
            const clip = roomClips.find(c => c.roomId === room.roomId);

            return {
                ...room,
                photos: roomPhotos.map(p => ({
                    photoUrl: p.photoUrl,
                    thumbnailUrl: p.thumbnailUrl,
                    timestamp: p.timestamp,
                })),
                videoClipUrl: clip ? clip.clipUrl : null,
            };
        });

        // Gather unassigned photos
        const assignedRoomIds = rooms.map(r => r.roomId);
        const unassignedPhotos = photoResults.filter(
            p => !p.roomId || !assignedRoomIds.includes(p.roomId)
        );

        const finalResult = {
            captureId,
            propertyName: captureData.propertyName,
            propertyAddress: captureData.propertyAddress,
            captureDate: new Date().toISOString(),
            recordingDuration: videoDuration,
            propertyOverview: claudeResult.propertyOverview || {},
            rooms: roomsWithMedia,
            unassignedPhotos: unassignedPhotos.map(p => ({
                photoUrl: p.photoUrl,
                thumbnailUrl: p.thumbnailUrl,
                timestamp: p.timestamp,
            })),
            propertyAccess: claudeResult.propertyAccess || {},
            systemsAndUtilities: claudeResult.systemsAndUtilities || {},
            fullTranscript: fullText,
            rawData: {
                videoUrl: captureData.videoPath
                    ? storage.getFileUrl(captureId, path.basename(captureData.videoPath))
                    : null,
                transcriptUrl: storage.getFileUrl(captureId, 'transcript.json'),
            },
        };

        // Persist to disk
        storage.saveResult(captureId, finalResult);

        // ─── STEP 6: NOTION SYNC ───
        if (notionService.isConfigured()) {
            logger.info('Step 6: Notion Sync');
            updateProgress(captureId, 'notionSync', 'processing');

            try {
                const backendBaseUrl = process.env.BACKEND_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
                const notionResult = await notionService.syncToNotion(finalResult, backendBaseUrl);

                if (notionResult) {
                    finalResult.notionPageUrl = notionResult.pageUrl;
                    finalResult.notionPageId = notionResult.pageId;
                    // Re-save with Notion URL
                    storage.saveResult(captureId, finalResult);
                    updateProgress(captureId, 'notionSync', 'complete');
                    logger.info(`Step 6 complete: Notion page created at ${notionResult.pageUrl}`);
                } else {
                    updateProgress(captureId, 'notionSync', 'skipped');
                    logger.info('Step 6 skipped: Notion not fully configured');
                }
            } catch (notionErr) {
                logger.error('Notion sync failed (non-fatal)', notionErr);
                updateProgress(captureId, 'notionSync', 'failed');
                // Non-fatal — don't fail the whole pipeline
            }
        } else {
            updateProgress(captureId, 'notionSync', 'skipped');
            logger.info('Notion sync skipped — not configured');
        }

        // Update status
        status.status = 'complete';
        status.result = finalResult;

        logger.info(`=== Processing complete for capture ${captureId} ===`);
    } catch (err) {
        logger.error(`Processing failed for capture ${captureId}`, err);
        status.status = 'failed';
        status.error = err.message;
    }
}

/**
 * Get all current statuses.
 */
function getAllStatuses() {
    return Array.from(statusMap.values());
}

/**
 * Remove a status entry (e.g. on delete).
 */
function deleteStatus(captureId) {
    return statusMap.delete(captureId);
}

module.exports = {
    initStatus,
    getStatus,
    getAllStatuses,
    deleteStatus,
    processCaptureAsync,
};

const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');
const storage = require('./storage');

/**
 * Associate photos with rooms based on timestamps and user overrides.
 *
 * Priority:
 * 1. If the user manually assigned a room via the ReviewScreen (associatedRoom is set), use that.
 * 2. Otherwise, match by timestamp: find the room whose [startTimestamp, endTimestamp] contains the photo's timestamp.
 * 3. If no match, assign to "unassigned".
 *
 * @param {Array<{filename: string, originalPath: string}>} photoFiles - Uploaded photo files
 * @param {Array<{timestampSeconds: number, associatedRoom: string|null}>} photoMetadata - Metadata from frontend
 * @param {Array<{roomId: string, roomName: string, startTimestamp: number, endTimestamp: number}>} rooms - Room segments from Claude
 * @param {string} captureId
 * @returns {Promise<Array<{photoUrl: string, thumbnailUrl: string, timestamp: number, roomId: string, roomName: string}>>}
 */
async function associatePhotos(photoFiles, photoMetadata, rooms, captureId) {
    if (!photoFiles || photoFiles.length === 0) {
        logger.info('No photos to associate');
        return [];
    }

    logger.info(`Associating ${photoFiles.length} photos with ${rooms.length} rooms`);

    const results = [];

    for (let i = 0; i < photoFiles.length; i++) {
        const file = photoFiles[i];
        const metadata = photoMetadata[i] || {};
        const timestamp = metadata.timestampSeconds || 0;

        try {
            // Determine room assignment
            let roomId = null;
            let roomName = 'unassigned';

            // Priority 1: User manual override from ReviewScreen
            if (metadata.associatedRoom) {
                roomName = metadata.associatedRoom;
                const matchedRoom = rooms.find(
                    r => r.roomName.toLowerCase() === metadata.associatedRoom.toLowerCase()
                );
                roomId = matchedRoom ? matchedRoom.roomId : null;
                logger.debug(`Photo ${i}: user-assigned to "${roomName}"`);
            } else {
                // Priority 2: Timestamp matching
                const matchedRoom = rooms.find(
                    r => timestamp >= r.startTimestamp && timestamp <= r.endTimestamp
                );
                if (matchedRoom) {
                    roomId = matchedRoom.roomId;
                    roomName = matchedRoom.roomName;
                    logger.debug(`Photo ${i}: timestamp-matched to "${roomName}" (${timestamp}s)`);
                } else {
                    logger.debug(`Photo ${i}: no room match at ${timestamp}s — unassigned`);
                }
            }

            // Generate thumbnail
            let thumbnailUrl = null;
            try {
                const sharp = require('sharp');
                const thumbFilename = `thumb-${path.basename(file.filename)}`;
                const thumbDir = storage.ensureCaptureSubDir(captureId, 'thumbnails');
                const thumbPath = path.join(thumbDir, thumbFilename);

                await sharp(file.path || file.originalPath)
                    .resize(400, null, { withoutEnlargement: true })
                    .jpeg({ quality: 80 })
                    .toFile(thumbPath);

                thumbnailUrl = storage.getFileUrl(captureId, `thumbnails/${thumbFilename}`);
            } catch (thumbErr) {
                logger.warn(`Failed to generate thumbnail for photo ${i}: ${thumbErr.message}`);
                // Continue without thumbnail
            }

            const photoUrl = storage.getFileUrl(captureId, `photos/${file.filename}`);

            results.push({
                photoUrl,
                thumbnailUrl: thumbnailUrl || photoUrl,
                timestamp,
                roomId,
                roomName,
            });
        } catch (err) {
            logger.error(`Failed to process photo ${i}: ${err.message}`);
            // Skip this photo but continue with others
        }
    }

    logger.info(`Photo association complete: ${results.length}/${photoFiles.length} photos processed`);
    return results;
}

module.exports = { associatePhotos };

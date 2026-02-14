const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');
const storage = require('./storage');

const VIDEO_TIMEOUT = 300000; // 5 minutes

/**
 * Get the duration of a video file in seconds.
 *
 * @param {string} videoPath - Absolute path to the video file
 * @returns {Promise<number>} Duration in seconds
 */
function getVideoDuration(videoPath) {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(videoPath, (err, metadata) => {
            if (err) {
                logger.error(`FFprobe error: ${err.message}`);
                reject(err);
                return;
            }
            const duration = metadata.format.duration || 0;
            resolve(Math.round(duration));
        });
    });
}

/**
 * Generate video clips for each room based on timestamps.
 * This is optional for v1 — will be skipped if it fails.
 *
 * @param {string} videoPath - Absolute path to the full video
 * @param {Array<{roomId: string, roomName: string, startTimestamp: number, endTimestamp: number}>} rooms
 * @param {string} captureId
 * @returns {Promise<Array<{roomId: string, clipUrl: string}>>}
 */
async function generateRoomClips(videoPath, rooms, captureId) {
    if (!videoPath || !fs.existsSync(videoPath)) {
        logger.warn('Video file not found, skipping clip generation');
        return [];
    }

    const clipsDir = storage.ensureCaptureSubDir(captureId, 'clips');
    const results = [];

    for (const room of rooms) {
        try {
            const clipFilename = `${room.roomId}.mp4`;
            const clipPath = path.join(clipsDir, clipFilename);
            const duration = room.endTimestamp - room.startTimestamp;

            if (duration <= 0) {
                logger.warn(`Skipping clip for ${room.roomName}: invalid duration (${duration}s)`);
                continue;
            }

            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error(`Clip generation timed out for ${room.roomName}`));
                }, VIDEO_TIMEOUT);

                ffmpeg(videoPath)
                    .setStartTime(room.startTimestamp)
                    .setDuration(duration)
                    .output(clipPath)
                    .outputOptions(['-c', 'copy'])
                    .on('end', () => {
                        clearTimeout(timeout);
                        logger.info(`Generated clip for ${room.roomName}: ${clipFilename}`);
                        resolve();
                    })
                    .on('error', (err) => {
                        clearTimeout(timeout);
                        reject(err);
                    })
                    .run();
            });

            results.push({
                roomId: room.roomId,
                clipUrl: storage.getFileUrl(captureId, `clips/${clipFilename}`),
            });
        } catch (err) {
            logger.warn(`Failed to generate clip for ${room.roomName}: ${err.message}`);
            // Continue with other rooms
        }
    }

    logger.info(`Generated ${results.length}/${rooms.length} room clips`);
    return results;
}

module.exports = { getVideoDuration, generateRoomClips };

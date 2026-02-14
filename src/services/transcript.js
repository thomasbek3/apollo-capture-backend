const logger = require('../utils/logger');

/**
 * Enhance and clean up a raw transcript from Web Speech API.
 *
 * @param {Array<{text: string, timestampSeconds: number}>} transcriptItems
 * @param {Array<{roomName: string, timestampSeconds: number}>} roomBoundaries
 * @returns {{ items: Array<{text: string, timestampSeconds: number}>, fullText: string }}
 */
function enhance(transcriptItems, roomBoundaries) {
    if (!transcriptItems || transcriptItems.length === 0) {
        logger.warn('Empty transcript received — nothing to enhance');
        return { items: [], fullText: '' };
    }

    logger.info(`Enhancing transcript: ${transcriptItems.length} items`);

    // Build a set of normalized room names for reference
    const roomNames = roomBoundaries.map(r => r.roomName.toLowerCase().trim());

    // Step 1: Merge consecutive duplicate items
    const merged = [];
    for (const item of transcriptItems) {
        const text = item.text.trim();
        if (!text) continue;

        const last = merged[merged.length - 1];
        if (last && last.text.toLowerCase() === text.toLowerCase()) {
            // Skip duplicate
            continue;
        }
        merged.push({ text, timestampSeconds: item.timestampSeconds });
    }

    // Step 2: Clean up common speech-to-text errors
    const cleaned = merged.map(item => {
        let text = item.text;

        // Normalize common property-related terms
        text = text.replace(/\bmaster bedroom\b/gi, 'Primary Bedroom');
        text = text.replace(/\bmaster bath(room)?\b/gi, 'Primary Bathroom');
        text = text.replace(/\bhalf bath\b/gi, 'Half Bathroom');
        text = text.replace(/\bpowder room\b/gi, 'Half Bathroom');
        text = text.replace(/\bliving room\b/gi, 'Living Room');
        text = text.replace(/\bdining room\b/gi, 'Dining Room');
        text = text.replace(/\blaundry room\b/gi, 'Laundry Room');
        text = text.replace(/\bfamily room\b/gi, 'Family Room');

        // Fix common speech-to-text artifacts
        text = text.replace(/\bum\b/gi, '');
        text = text.replace(/\buh\b/gi, '');
        text = text.replace(/\byeah so\b/gi, '');
        text = text.replace(/\bso basically\b/gi, '');
        text = text.replace(/\s{2,}/g, ' ').trim();

        // Capitalize first letter of sentences
        text = text.replace(/(^|\.\s+)([a-z])/g, (match, p1, p2) => p1 + p2.toUpperCase());

        return { text, timestampSeconds: item.timestampSeconds };
    }).filter(item => item.text.length > 0);

    // Step 3: Build full text string
    const fullText = cleaned.map(item => item.text).join(' ');

    logger.info(`Transcript enhanced: ${transcriptItems.length} → ${cleaned.length} items, ${fullText.length} chars`);

    return { items: cleaned, fullText };
}

module.exports = { enhance };

const Anthropic = require('@anthropic-ai/sdk');
const logger = require('../utils/logger');

const CLAUDE_MODEL = 'claude-sonnet-4-20250514';
const CLAUDE_TIMEOUT = 120000; // 120 seconds

const ROOM_SEGMENTATION_SYSTEM_PROMPT = `You are an AI assistant that processes property walkthrough transcripts. The user has recorded a video tour of a short-term rental property, narrating as they go through each room.

Your job is to segment this transcript into rooms.

INPUT: A timestamped transcript of a property walkthrough, optionally with room boundary markers that the user placed during recording.

OUTPUT: A JSON object with the following structure:
{
  "propertyOverview": {
    "totalRooms": number,
    "propertyType": "house" | "apartment" | "condo" | "townhouse" | "other",
    "estimatedBedrooms": number,
    "estimatedBathrooms": number,
    "hasOutdoorSpace": boolean,
    "generalNotes": "string — any general property notes mentioned"
  },
  "rooms": [
    {
      "roomId": "room-1",
      "roomName": "Primary Bedroom",
      "roomType": "bedroom" | "bathroom" | "kitchen" | "living_room" | "dining_room" | "garage" | "laundry" | "outdoor" | "office" | "hallway" | "closet" | "other",
      "startTimestamp": number (seconds),
      "endTimestamp": number (seconds),
      "transcriptExcerpt": "the raw transcript text for just this room segment",
      "inventory": [
        {
          "item": "Queen bed",
          "quantity": 1,
          "notes": "with white duvet cover",
          "condition": "good" | "fair" | "needs_attention" | "not_mentioned"
        }
      ],
      "features": ["ceiling fan", "en-suite bathroom", "walk-in closet"],
      "quirksAndNotes": ["Light switch is behind the door", "Window sticks a little"],
      "accessInfo": ["Key code for bedroom door: 1234"],
      "cleaningNotes": ["Carpet needs deep clean between guests"]
    }
  ],
  "propertyAccess": {
    "wifiName": "string or null",
    "wifiPassword": "string or null",
    "lockboxCode": "string or null",
    "parkingInstructions": "string or null",
    "gateCode": "string or null",
    "otherAccess": ["any other access info mentioned"]
  },
  "systemsAndUtilities": {
    "hvac": "notes about heating/cooling",
    "waterHeater": "location and notes",
    "breakerBox": "location",
    "waterShutoff": "location",
    "trashDay": "if mentioned",
    "otherSystems": ["any other system notes"]
  }
}

RULES:
1. Be thorough — extract EVERY item mentioned, even small things like "there's an ironing board in the closet"
2. If the speaker mentions quantities, use exact numbers. If they don't specify, use 1.
3. Room names should be normalized (e.g., "master bedroom" → "Primary Bedroom", "the kitchen area" → "Kitchen")
4. If the speaker goes back to a room they already covered, merge that content into the existing room entry
5. Capture ALL access information (WiFi, codes, keys) even if mentioned casually
6. If something is unclear in the transcript, include it with a note like "unclear — verify"
7. For timestamps, use the closest timestamp from the input transcript
8. Extract condition notes only if the speaker explicitly mentions condition

IMPORTANT: Return ONLY the JSON object, no markdown fencing, no explanation text.`;

const SIMPLIFIED_SYSTEM_PROMPT = `You are an AI assistant that processes property walkthrough transcripts. Segment the transcript into rooms.

Return ONLY a valid JSON object with this structure:
{
  "propertyOverview": { "totalRooms": number, "propertyType": string, "estimatedBedrooms": number, "estimatedBathrooms": number, "hasOutdoorSpace": boolean, "generalNotes": string },
  "rooms": [{ "roomId": string, "roomName": string, "roomType": string, "startTimestamp": number, "endTimestamp": number, "transcriptExcerpt": string, "inventory": [{ "item": string, "quantity": number, "notes": string, "condition": string }], "features": [], "quirksAndNotes": [], "accessInfo": [], "cleaningNotes": [] }],
  "propertyAccess": { "wifiName": null, "wifiPassword": null, "lockboxCode": null, "parkingInstructions": null, "gateCode": null, "otherAccess": [] },
  "systemsAndUtilities": { "hvac": null, "waterHeater": null, "breakerBox": null, "waterShutoff": null, "trashDay": null, "otherSystems": [] }
}

Extract every item mentioned. Normalize room names. Return ONLY the JSON.`;

/**
 * Segment a property walkthrough transcript into rooms using Claude.
 *
 * @param {Array<{text: string, timestampSeconds: number}>} transcriptItems
 * @param {Array<{roomName: string, timestampSeconds: number}>} roomBoundaries
 * @returns {Promise<object>} Structured room segmentation result
 */
async function segmentRooms(transcriptItems, roomBoundaries) {
    if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    }

    const client = new Anthropic();

    // Build the user message with transcript data
    let userMessage = 'Here is the timestamped transcript of a property walkthrough:\n\n';

    for (const item of transcriptItems) {
        const mins = Math.floor(item.timestampSeconds / 60);
        const secs = Math.floor(item.timestampSeconds % 60).toString().padStart(2, '0');
        userMessage += `[${mins}:${secs}] ${item.text}\n`;
    }

    if (roomBoundaries && roomBoundaries.length > 0) {
        userMessage += '\n\nThe user also placed these room boundary markers during recording:\n';
        for (const boundary of roomBoundaries) {
            const mins = Math.floor(boundary.timestampSeconds / 60);
            const secs = Math.floor(boundary.timestampSeconds % 60).toString().padStart(2, '0');
            userMessage += `[${mins}:${secs}] --- Entered: ${boundary.roomName} ---\n`;
        }
    }

    userMessage += '\n\nPlease segment this transcript into rooms and extract all details.';

    logger.info(`Sending transcript to Claude (${transcriptItems.length} items, ${roomBoundaries.length} boundaries)`);

    try {
        return await callClaude(client, ROOM_SEGMENTATION_SYSTEM_PROMPT, userMessage);
    } catch (err) {
        logger.warn(`First Claude call failed: ${err.message}. Retrying with simplified prompt...`);

        try {
            return await callClaude(client, SIMPLIFIED_SYSTEM_PROMPT, userMessage);
        } catch (retryErr) {
            logger.error('Claude retry also failed', retryErr);
            throw new Error(`Claude processing failed after retry: ${retryErr.message}`);
        }
    }
}

/**
 * Internal: Make a Claude API call and parse the JSON response.
 */
async function callClaude(client, systemPrompt, userMessage) {
    const response = await client.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 8192,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
    });

    const content = response.content[0];
    if (!content || content.type !== 'text') {
        throw new Error('Unexpected Claude response format — no text content');
    }

    let jsonText = content.text.trim();

    // Strip markdown code fencing if present
    if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }

    try {
        const result = JSON.parse(jsonText);
        logger.info(`Claude returned ${result.rooms?.length || 0} rooms`);
        return result;
    } catch (parseErr) {
        logger.error('Failed to parse Claude JSON response', { response: jsonText.substring(0, 500) });
        throw new Error(`Failed to parse Claude response as JSON: ${parseErr.message}`);
    }
}

module.exports = { segmentRooms };

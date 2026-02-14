const { Client } = require('@notionhq/client');
const logger = require('../utils/logger');

// ─── CONFIG ───
const NOTION_API_KEY = process.env.NOTION_API_KEY;
let NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID;

let notion = null;

/**
 * Initialize the Notion client. Returns false if not configured.
 */
function initNotion() {
    if (!NOTION_API_KEY) {
        logger.warn('NOTION_API_KEY not set — Notion sync will be skipped');
        return false;
    }
    notion = new Client({ auth: NOTION_API_KEY });
    logger.info('Notion client initialized');
    return true;
}

/**
 * Check if Notion integration is configured and ready.
 */
function isConfigured() {
    return !!(NOTION_API_KEY && NOTION_DATABASE_ID);
}

// ─── RATE LIMITING ───
// Notion API: 3 requests/second
let lastRequestTime = 0;
async function rateLimitedRequest(fn) {
    const now = Date.now();
    const elapsed = now - lastRequestTime;
    if (elapsed < 350) { // ~3 req/sec with margin
        await new Promise(r => setTimeout(r, 350 - elapsed));
    }
    lastRequestTime = Date.now();
    return fn();
}

// ─── DATABASE SETUP ───

/**
 * Database property schema for "Apollo Properties".
 */
const DB_PROPERTIES = {
    'Property Name': { title: {} },
    'Address': { rich_text: {} },
    'Status': {
        select: {
            options: [
                { name: 'Onboarding', color: 'yellow' },
                { name: 'Active', color: 'green' },
                { name: 'Inactive', color: 'gray' },
            ],
        },
    },
    'Total Rooms': { number: {} },
    'Bedrooms': { number: {} },
    'Bathrooms': { number: {} },
    'Property Type': {
        select: {
            options: [
                { name: 'House', color: 'blue' },
                { name: 'Apartment', color: 'purple' },
                { name: 'Condo', color: 'orange' },
                { name: 'Townhouse', color: 'pink' },
                { name: 'Other', color: 'gray' },
            ],
        },
    },
    'Has Outdoor Space': { checkbox: {} },
    'Onboarding Date': { date: {} },
    'Capture Video': { url: {} },
    'General Notes': { rich_text: {} },
};

/**
 * Create the Apollo Properties database under a parent page.
 * Returns the new database ID.
 */
async function createDatabase(parentPageId) {
    const response = await rateLimitedRequest(() =>
        notion.databases.create({
            parent: { type: 'page_id', page_id: parentPageId },
            title: [{ type: 'text', text: { content: 'Apollo Properties' } }],
            properties: DB_PROPERTIES,
        })
    );
    logger.info(`Created Notion database: ${response.id}`);
    return response.id;
}

/**
 * Ensure the database exists. If NOTION_DATABASE_ID is set, verify it.
 * If not set, we cannot auto-create (need a parent page).
 */
async function ensureDatabase() {
    if (!NOTION_DATABASE_ID) {
        logger.warn('NOTION_DATABASE_ID not set — cannot sync to Notion');
        return false;
    }

    try {
        await rateLimitedRequest(() =>
            notion.databases.retrieve({ database_id: NOTION_DATABASE_ID })
        );
        logger.info(`Notion database verified: ${NOTION_DATABASE_ID}`);
        return true;
    } catch (err) {
        logger.error(`Cannot access Notion database ${NOTION_DATABASE_ID}: ${err.message}`);
        return false;
    }
}

// ─── PAGE CREATION ───

/**
 * Build the database page properties from capture result.
 */
function buildPageProperties(result) {
    const overview = result.propertyOverview || {};

    const properties = {
        'Property Name': {
            title: [{ text: { content: result.propertyName || 'Unnamed' } }],
        },
        'Address': {
            rich_text: [{ text: { content: result.propertyAddress || '' } }],
        },
        'Status': {
            select: { name: 'Onboarding' },
        },
        'Total Rooms': {
            number: overview.totalRooms || (result.rooms ? result.rooms.length : 0),
        },
        'Onboarding Date': {
            date: { start: result.captureDate || new Date().toISOString() },
        },
    };

    if (overview.estimatedBedrooms) {
        properties['Bedrooms'] = { number: overview.estimatedBedrooms };
    }
    if (overview.estimatedBathrooms) {
        properties['Bathrooms'] = { number: overview.estimatedBathrooms };
    }
    if (overview.propertyType) {
        const typeMap = {
            house: 'House', apartment: 'Apartment', condo: 'Condo',
            townhouse: 'Townhouse',
        };
        const typeName = typeMap[overview.propertyType.toLowerCase()] || 'Other';
        properties['Property Type'] = { select: { name: typeName } };
    }
    if (overview.hasOutdoorSpace !== undefined) {
        properties['Has Outdoor Space'] = { checkbox: overview.hasOutdoorSpace };
    }
    if (overview.generalNotes) {
        properties['General Notes'] = {
            rich_text: [{ text: { content: truncateText(overview.generalNotes, 2000) } }],
        };
    }
    if (result.rawData?.videoUrl) {
        properties['Capture Video'] = { url: result.rawData.videoUrl };
    }

    return properties;
}

// ─── BLOCK BUILDERS ───

/**
 * Helper to create a rich text object.
 */
function richText(content, opts = {}) {
    const text = { content: truncateText(content, 2000) };
    if (opts.link) text.link = { url: opts.link };
    const annotations = {};
    if (opts.bold) annotations.bold = true;
    if (opts.italic) annotations.italic = true;
    if (opts.code) annotations.code = true;
    return { type: 'text', text, annotations: Object.keys(annotations).length ? annotations : undefined };
}

/**
 * Create a heading block.
 */
function heading2(text) {
    return {
        object: 'block',
        type: 'heading_2',
        heading_2: { rich_text: [richText(text)] },
    };
}

function heading3(text) {
    return {
        object: 'block',
        type: 'heading_3',
        heading_3: { rich_text: [richText(text)] },
    };
}

/**
 * Create a callout block.
 */
function callout(text, emoji = '📋') {
    return {
        object: 'block',
        type: 'callout',
        callout: {
            rich_text: [richText(text)],
            icon: { type: 'emoji', emoji },
        },
    };
}

/**
 * Create a bulleted list item.
 */
function bullet(text) {
    return {
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: { rich_text: [richText(text)] },
    };
}

/**
 * Create a toggle block (collapsible) with children.
 */
function toggle(title, children = []) {
    return {
        object: 'block',
        type: 'toggle',
        toggle: {
            rich_text: [richText(title)],
            children: children.slice(0, 100), // Notion limit per block
        },
    };
}

/**
 * Create a divider block.
 */
function divider() {
    return { object: 'block', type: 'divider', divider: {} };
}

/**
 * Create an image block from external URL.
 */
function imageBlock(url, caption = '') {
    return {
        object: 'block',
        type: 'image',
        image: {
            type: 'external',
            external: { url },
            caption: caption ? [richText(caption)] : [],
        },
    };
}

/**
 * Create a paragraph block.
 */
function paragraph(text) {
    return {
        object: 'block',
        type: 'paragraph',
        paragraph: { rich_text: text ? [richText(text)] : [] },
    };
}

// ─── CONTENT ASSEMBLY ───

/**
 * Build all the page content blocks from the capture result.
 */
function buildContentBlocks(result, backendBaseUrl) {
    const blocks = [];

    // ─── HEADER ───
    const dateStr = result.captureDate
        ? new Date(result.captureDate).toLocaleDateString('en-US', {
            year: 'numeric', month: 'long', day: 'numeric',
        })
        : 'Unknown date';
    blocks.push(callout(`Onboarded on ${dateStr} via Apollo Capture`, '📋'));
    blocks.push(paragraph(''));

    // ─── ACCESS INFORMATION ───
    const access = result.propertyAccess || {};
    const hasAccess = access.wifiName || access.wifiPassword || access.lockboxCode ||
        access.parkingInstructions || access.gateCode ||
        (access.otherAccess && access.otherAccess.length > 0);

    if (hasAccess) {
        blocks.push(heading2('🔑 Access Information'));
        const accessLines = [];
        if (access.wifiName) accessLines.push(`📶 WiFi: ${access.wifiName} / ${access.wifiPassword || '(no password)'}`);
        if (access.lockboxCode) accessLines.push(`🔐 Lockbox Code: ${access.lockboxCode}`);
        if (access.gateCode) accessLines.push(`🚪 Gate Code: ${access.gateCode}`);
        if (access.parkingInstructions) accessLines.push(`🅿️ Parking: ${access.parkingInstructions}`);
        if (access.otherAccess) {
            access.otherAccess.forEach(note => accessLines.push(`📌 ${note}`));
        }
        blocks.push(callout(accessLines.join('\n'), '🔑'));
        blocks.push(paragraph(''));
    }

    // ─── ROOMS ───
    const rooms = result.rooms || [];
    if (rooms.length > 0) {
        for (const room of rooms) {
            // Room heading
            blocks.push(heading2(`🚪 ${room.roomName || 'Unknown Room'}`));

            // Inventory toggle
            const inventory = room.inventory || [];
            if (inventory.length > 0) {
                const inventoryItems = inventory.map(item => {
                    let line = `${item.quantity || 1}x ${item.item}`;
                    if (item.notes) line += ` — ${item.notes}`;
                    if (item.condition && item.condition !== 'good') line += ` (${item.condition})`;
                    return bullet(line);
                });
                blocks.push(toggle(`📦 Inventory (${inventory.length} items)`, inventoryItems));
            }

            // Features toggle
            const features = room.features || [];
            if (features.length > 0) {
                blocks.push(toggle('✨ Room Features', features.map(f => bullet(f))));
            }

            // Notes & quirks toggle
            const quirks = room.quirksAndNotes || [];
            const cleaning = room.cleaningNotes || [];
            const allNotes = [...quirks, ...cleaning];
            if (allNotes.length > 0) {
                blocks.push(toggle('📝 Notes & Quirks', allNotes.map(n => bullet(n))));
            }

            // Photos
            const photos = room.photos || [];
            if (photos.length > 0) {
                for (const photo of photos) {
                    const photoUrl = resolvePhotoUrl(photo.photoUrl, backendBaseUrl);
                    if (photoUrl) {
                        const caption = `${room.roomName} — ${formatTimestamp(photo.timestamp)}`;
                        blocks.push(imageBlock(photoUrl, caption));
                    }
                }
            }

            blocks.push(paragraph(''));
        }
    }

    // ─── SYSTEMS & UTILITIES ───
    const systems = result.systemsAndUtilities || {};
    const hasSystemData = systems.hvac || systems.waterHeater || systems.breakerBox ||
        systems.waterShutoff || systems.trashDay ||
        (systems.otherSystems && systems.otherSystems.length > 0);

    if (hasSystemData) {
        blocks.push(heading2('⚙️ Systems & Utilities'));
        if (systems.hvac) blocks.push(bullet(`HVAC: ${systems.hvac}`));
        if (systems.waterHeater) blocks.push(bullet(`Water Heater: ${systems.waterHeater}`));
        if (systems.breakerBox) blocks.push(bullet(`Breaker Box: ${systems.breakerBox}`));
        if (systems.waterShutoff) blocks.push(bullet(`Water Shutoff: ${systems.waterShutoff}`));
        if (systems.trashDay) blocks.push(bullet(`Trash Day: ${systems.trashDay}`));
        if (systems.otherSystems) {
            systems.otherSystems.forEach(s => blocks.push(bullet(s)));
        }
        blocks.push(paragraph(''));
    }

    // ─── FULL TRANSCRIPT ───
    if (result.fullTranscript) {
        blocks.push(heading2('📝 Full Walkthrough Transcript'));
        // Split transcript into chunks for toggle children (each block max ~2000 chars)
        const chunks = chunkText(result.fullTranscript, 1800);
        const transcriptBlocks = chunks.map(chunk => paragraph(chunk));
        blocks.push(toggle('Click to expand full transcript', transcriptBlocks));
    }

    return blocks;
}

// ─── MAIN SYNC FUNCTION ───

/**
 * Sync a capture result to Notion.
 *
 * @param {object} captureResult - The final processed capture result
 * @param {string} [backendBaseUrl] - Base URL for the backend (for resolving photo URLs)
 * @returns {{ pageUrl: string, pageId: string }} or null if not configured
 */
async function syncToNotion(captureResult, backendBaseUrl) {
    if (!initNotion()) {
        return null;
    }

    if (!(await ensureDatabase())) {
        return null;
    }

    logger.info(`Syncing capture ${captureResult.captureId} to Notion...`);

    try {
        // Check if property already exists
        const existingPage = await findExistingProperty(
            captureResult.propertyName,
            captureResult.propertyAddress
        );

        let pageId;

        if (existingPage) {
            // Update existing page properties
            logger.info(`Updating existing Notion page: ${existingPage.id}`);
            await rateLimitedRequest(() =>
                notion.pages.update({
                    page_id: existingPage.id,
                    properties: buildPageProperties(captureResult),
                })
            );
            pageId = existingPage.id;

            // Clear existing content before adding new blocks
            await clearPageContent(pageId);
        } else {
            // Create new page
            logger.info('Creating new Notion property page...');
            const response = await rateLimitedRequest(() =>
                notion.pages.create({
                    parent: { database_id: NOTION_DATABASE_ID },
                    properties: buildPageProperties(captureResult),
                    icon: { type: 'emoji', emoji: '🏠' },
                })
            );
            pageId = response.id;
            logger.info(`Created Notion page: ${pageId}`);
        }

        // Build and append content blocks
        const blocks = buildContentBlocks(captureResult, backendBaseUrl);
        await appendBlocksInBatches(pageId, blocks);

        // Build the page URL
        const pageUrl = `https://notion.so/${pageId.replace(/-/g, '')}`;
        logger.info(`Notion sync complete: ${pageUrl}`);

        return { pageUrl, pageId };
    } catch (err) {
        logger.error(`Notion sync failed: ${err.message}`, err);
        throw err;
    }
}

// ─── HELPERS ───

/**
 * Find an existing property page by name and address.
 */
async function findExistingProperty(name, address) {
    try {
        const response = await rateLimitedRequest(() =>
            notion.databases.query({
                database_id: NOTION_DATABASE_ID,
                filter: {
                    property: 'Property Name',
                    title: { equals: name || '' },
                },
                page_size: 1,
            })
        );

        if (response.results.length > 0) {
            return response.results[0];
        }
    } catch (err) {
        logger.warn(`Could not search for existing property: ${err.message}`);
    }
    return null;
}

/**
 * Clear all blocks from a page (for updating).
 */
async function clearPageContent(pageId) {
    try {
        const response = await rateLimitedRequest(() =>
            notion.blocks.children.list({ block_id: pageId, page_size: 100 })
        );
        for (const block of response.results) {
            await rateLimitedRequest(() =>
                notion.blocks.delete({ block_id: block.id })
            );
        }
    } catch (err) {
        logger.warn(`Could not clear page content: ${err.message}`);
    }
}

/**
 * Append blocks to a page in batches of 100 (Notion API limit).
 */
async function appendBlocksInBatches(pageId, blocks) {
    const BATCH_SIZE = 100;
    for (let i = 0; i < blocks.length; i += BATCH_SIZE) {
        const batch = blocks.slice(i, i + BATCH_SIZE);
        await rateLimitedRequest(() =>
            notion.blocks.children.append({
                block_id: pageId,
                children: batch,
            })
        );
        logger.info(`Appended blocks ${i + 1}–${Math.min(i + BATCH_SIZE, blocks.length)} of ${blocks.length}`);
    }
}

/**
 * Resolve a photo URL to a full absolute URL.
 */
function resolvePhotoUrl(photoUrl, backendBaseUrl) {
    if (!photoUrl) return null;
    if (photoUrl.startsWith('http')) return photoUrl;
    if (backendBaseUrl) {
        return `${backendBaseUrl.replace(/\/$/, '')}${photoUrl}`;
    }
    return null; // Can't resolve relative URL without base
}

/**
 * Format seconds into MM:SS.
 */
function formatTimestamp(seconds) {
    if (!seconds && seconds !== 0) return '';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Truncate text to a max length.
 */
function truncateText(text, maxLen) {
    if (!text) return '';
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen - 3) + '...';
}

/**
 * Split text into chunks no longer than maxLen.
 */
function chunkText(text, maxLen) {
    if (!text) return [];
    const chunks = [];
    let remaining = text;
    while (remaining.length > 0) {
        if (remaining.length <= maxLen) {
            chunks.push(remaining);
            break;
        }
        // Try to break at a newline or space
        let breakPoint = remaining.lastIndexOf('\n', maxLen);
        if (breakPoint < maxLen / 2) breakPoint = remaining.lastIndexOf(' ', maxLen);
        if (breakPoint < maxLen / 2) breakPoint = maxLen;
        chunks.push(remaining.slice(0, breakPoint));
        remaining = remaining.slice(breakPoint).trimStart();
    }
    return chunks;
}

module.exports = {
    initNotion,
    isConfigured,
    syncToNotion,
    ensureDatabase,
    createDatabase,
};

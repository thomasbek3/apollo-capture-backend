/**
 * Test Notion API page creation (v5.x compatible)
 * Usage: node test-notion.js
 * Requires .env with NOTION_API_KEY and NOTION_DATABASE_ID
 */
require('dotenv').config();
const { Client } = require('@notionhq/client');

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const dbId = process.env.NOTION_DATABASE_ID;

async function main() {
    if (!process.env.NOTION_API_KEY || !dbId) {
        console.error('Missing NOTION_API_KEY or NOTION_DATABASE_ID in .env');
        process.exit(1);
    }

    console.log('Creating page with title only + block content...');
    try {
        const page = await notion.pages.create({
            parent: { database_id: dbId },
            properties: {
                'title': {
                    title: [{ text: { content: 'Test Property' } }],
                },
            },
            icon: { type: 'emoji', emoji: '🏠' },
        });
        console.log('✅ Page created:', page.id, page.url);

        console.log('\nAppending content blocks...');
        await notion.blocks.children.append({
            block_id: page.id,
            children: [
                {
                    object: 'block',
                    type: 'callout',
                    callout: {
                        rich_text: [{ type: 'text', text: { content: 'Onboarded on February 14, 2026 via Apollo Capture' } }],
                        icon: { type: 'emoji', emoji: '📋' },
                    },
                },
                {
                    object: 'block',
                    type: 'heading_2',
                    heading_2: { rich_text: [{ type: 'text', text: { content: '📍 Property Details' } }] },
                },
                {
                    object: 'block',
                    type: 'bulleted_list_item',
                    bulleted_list_item: { rich_text: [{ type: 'text', text: { content: 'Address: 123 Main Street, Austin TX' } }] },
                },
            ],
        });
        console.log('✅ Blocks appended!');
        console.log(`\n🎉 SUCCESS: ${page.url}`);
    } catch (err) {
        console.error('❌ Error:', err.message);
        if (err.body) console.error('Body:', JSON.stringify(err.body, null, 2));
    }
}

main().catch(err => console.error('Fatal:', err.message));

/**
 * Setup script: Creates the "Apollo Properties" database in Notion.
 * 
 * Usage:
 *   node setup-notion.js <NOTION_API_KEY> [PARENT_PAGE_ID]
 *
 * If no PARENT_PAGE_ID is given, the script will list available pages
 * and let you pick one.
 */

const { Client } = require('@notionhq/client');

const NOTION_API_KEY = process.argv[2] || process.env.NOTION_API_KEY;
const PARENT_PAGE_ID = process.argv[3] || process.env.NOTION_PARENT_PAGE_ID;

if (!NOTION_API_KEY) {
    console.error('Usage: node setup-notion.js <NOTION_API_KEY> [PARENT_PAGE_ID]');
    process.exit(1);
}

const notion = new Client({ auth: NOTION_API_KEY });

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

async function main() {
    console.log('🔌 Connecting to Notion...');
    const me = await notion.users.me();
    console.log(`✅ Connected as: ${me.name || me.id}`);

    let parentPageId = PARENT_PAGE_ID;

    if (!parentPageId) {
        // Search for pages we have access to
        console.log('\n📄 Pages shared with this integration:');
        const search = await notion.search({
            filter: { property: 'object', value: 'page' },
            page_size: 20,
        });

        if (search.results.length === 0) {
            console.error('\n❌ No pages found! You need to share a page with your integration first.');
            console.error('   Go to Notion → open a page → ••• menu → Connections → add your integration');
            process.exit(1);
        }

        for (let i = 0; i < search.results.length; i++) {
            const page = search.results[i];
            const title = page.properties?.title?.title?.[0]?.plain_text
                || page.properties?.Name?.title?.[0]?.plain_text
                || '(Untitled)';
            console.log(`  ${i + 1}. ${title} (${page.id})`);
        }

        // Use the first page
        parentPageId = search.results[0].id;
        const firstTitle = search.results[0].properties?.title?.title?.[0]?.plain_text
            || search.results[0].properties?.Name?.title?.[0]?.plain_text
            || '(Untitled)';
        console.log(`\n📌 Using first page: "${firstTitle}"`);
    }

    // Create the database
    console.log('\n🏗️ Creating "Apollo Properties" database...');
    const db = await notion.databases.create({
        parent: { type: 'page_id', page_id: parentPageId },
        title: [{ type: 'text', text: { content: 'Apollo Properties' } }],
        properties: DB_PROPERTIES,
        icon: { type: 'emoji', emoji: '🏠' },
    });

    console.log(`\n✅ Database created!`);
    console.log(`   Database ID: ${db.id}`);
    console.log(`   URL: ${db.url}`);
    console.log(`\n📋 Add these to your Railway environment variables:`);
    console.log(`   NOTION_API_KEY=${NOTION_API_KEY}`);
    console.log(`   NOTION_DATABASE_ID=${db.id}`);
}

main().catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
});

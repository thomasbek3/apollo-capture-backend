const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
    res.json({
        status: 'ok',
        version: '1.0.0',
        service: 'apollo-capture-backend',
        timestamp: new Date().toISOString(),
        config: {
            notionApiKey: !!process.env.NOTION_API_KEY,
            notionDatabaseId: !!process.env.NOTION_DATABASE_ID,
            backendBaseUrl: !!process.env.BACKEND_BASE_URL,
        },
    });
});

module.exports = router;

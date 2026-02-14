require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const logger = require('./utils/logger');
const storage = require('./services/storage');

const captureRoutes = require('./routes/capture');
const healthRoutes = require('./routes/health');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── CORS ───
const allowedOrigins = [
    'https://apollo-capture.vercel.app',
    'https://apollo-capture-10tuoxfdh-thomasbek3s-projects.vercel.app',
    'http://localhost:2100',
    'http://localhost:3000',
];
app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, etc.)
        if (!origin || allowedOrigins.some(o => origin.startsWith(o.replace(/\/$/, '')))) {
            callback(null, true);
        } else {
            callback(null, true); // Still allow for now, log unknown origins
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ─── Body Parsing ───
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ─── Static File Serving ───
// Serve stored files (photos, video clips, transcripts) via /api/files/*
app.use('/api/files', express.static(storage.STORAGE_PATH, {
    maxAge: '1d',
    immutable: true,
}));

// ─── Routes ───
app.use('/api/capture', captureRoutes);
app.use('/api/health', healthRoutes);

// ─── Root ───
app.get('/', (req, res) => {
    res.json({
        service: 'Apollo Capture Backend',
        version: '1.0.0',
        docs: {
            health: 'GET /api/health',
            upload: 'POST /api/capture/upload',
            status: 'GET /api/capture/:captureId/status',
            result: 'GET /api/capture/:captureId/result',
        },
    });
});

// ─── Error Handling ───
app.use((err, req, res, next) => {
    logger.error('Unhandled error', err);
    res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'production' ? 'Something went wrong' : err.message,
    });
});

// ─── Startup ───
async function start() {
    // Initialize file storage directories
    storage.initStorage();

    app.listen(PORT, '0.0.0.0', () => {
        logger.info(`🚀 Apollo Capture Backend running on port ${PORT}`);
        logger.info(`   Storage path: ${storage.STORAGE_PATH}`);
        logger.info(`   Environment: ${process.env.NODE_ENV || 'development'}`);
    });
}

start().catch(err => {
    logger.error('Failed to start server', err);
    process.exit(1);
});

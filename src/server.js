/**
 * Express + Socket.IO server. Serves UI from dist/, mounts API routes, streams pipeline logs via Socket.IO.
 */

require('dotenv').config();
const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const { Server: SocketServer } = require('socket.io');
const cors = require('cors');
const cron = require('node-cron');
const rateLimit = require('express-rate-limit');
const compression = require('compression');

const config = require('./config');
const logger = require('./lib/logger');
const { getDb, initSchema, getProfile } = require('./services/database');
const { ensureEnrichmentSchema } = require('./db/enrichmentBootstrap');
const { runPipeline } = require('./index');
const { runQueue } = require('./services/emailQueue');
const { initServerContext, persistAndEmitLog } = require('./serverContext');
const { mountAll } = require('./routes');

const ALLOWED_ORIGINS = [
    'https://dashboard.foundlystart.co.uk',
    'https://foundlystart.co.uk',
    ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim()) : []),
];

const MAX_SCHEDULED_RUN_LIMIT = 500;
const DEFAULT_SCHEDULED_RUN_LIMIT = 20;

let scheduledTask = null;

async function startScheduledRuns() {
    if (scheduledTask) {
        scheduledTask.stop();
        scheduledTask = null;
    }
    let cronExpr = '';
    try {
        const db = await getDb();
        const profile = await getProfile(db);
        cronExpr = (profile.scheduled_run_cron || process.env.CRON_SCHEDULE || '').trim();
    } catch (err) {
        logger.warn({ err }, 'Failed to read schedule config');
    }
    if (!cronExpr || !cron.validate(cronExpr)) return;
    scheduledTask = cron.schedule(cronExpr, async () => {
        try {
            const db = await getDb();
            const profile = await getProfile(db);
            const runSource = profile.scheduled_run_source || process.env.SCHEDULED_RUN_SOURCE || 'companies_house';
            const runLimit = Math.min(
                MAX_SCHEDULED_RUN_LIMIT,
                parseInt(profile.scheduled_run_limit || process.env.SCHEDULED_RUN_LIMIT || String(DEFAULT_SCHEDULED_RUN_LIMIT), 10) || DEFAULT_SCHEDULED_RUN_LIMIT
            );
            logger.info({ source: runSource, limit: runLimit }, 'Scheduled run starting');
            await runPipeline({
                limit: runLimit,
                source: runSource,
                onProgress: (msg) => persistAndEmitLog('[Scheduled] ' + msg)
            });
            logger.info('Scheduled run completed');
        } catch (err) {
            logger.error({ err: err.message }, 'Scheduled run failed');
            persistAndEmitLog('ERROR [Scheduled]: ' + (err.message || String(err)));
        }
    });
    logger.info({ cron: cronExpr }, 'Scheduled runs enabled');
}

async function ensureDb() {
    const db = await getDb();
    initSchema(db);
    await ensureEnrichmentSchema(db);
}

const app = express();
const server = http.createServer(app);
const io = new SocketServer(server, {
    cors: {
        origin: ALLOWED_ORIGINS,
        methods: ['GET', 'POST'],
    },
});

initServerContext(io);

app.use(cors({
    origin(origin, callback) {
        // NOTE: Allow requests with no origin (server-to-server, curl, mobile apps)
        if (!origin || ALLOWED_ORIGINS.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
}));

const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
});
app.use('/api/', apiLimiter);

app.use(express.json());

// Optional endpoint timing logs for debugging slow pages.
// Enable with: LOG_API_TIMINGS=1
if (process.env.LOG_API_TIMINGS === '1') {
    const timedPathMatchers = [
        /^\/api\/leads$/,
        /^\/api\/leads\/in-lists/,
        /^\/api\/leads\/enriched/,
        /^\/api\/ch-cache\/search/,
        /^\/api\/email-inbox\/summary/,
        /^\/api\/email-inbox\/sidebar/,
    ];

    app.use((req, res, next) => {
        if (!timedPathMatchers.some((re) => re.test(req.path))) return next();
        const start = process.hrtime.bigint();
        res.on('finish', () => {
            const ms = Number(process.hrtime.bigint() - start) / 1e6;
            logger.info(
                {
                    method: req.method,
                    path: req.path,
                    status: res.statusCode,
                    ms: Math.round(ms * 10) / 10,
                },
                'api-timing'
            );
        });
        next();
    });
}

const distPath = path.join(__dirname, '..', 'dist');
const indexHtml = path.join(distPath, 'index.html');
if (!fs.existsSync(indexHtml)) {
    logger.error({ distPath }, 'UI build missing: dist/index.html not found. Run "npm run build" before start (or use Dockerfile which runs it).');
    process.exit(1);
}
// Vite assets are typically content-hashed. Cache them aggressively to speed up
// first loads and subsequent navigations. Keep index.html short-lived.
app.use(
    compression(),
    express.static(distPath, {
        etag: true,
        maxAge: '1y',
        immutable: true,
        setHeaders: (res, filePath) => {
            if (path.basename(filePath) === 'index.html') {
                res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
                return;
            }
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        },
    })
);

mountAll(app, { startScheduledRuns, io });

// SPA fallback: serve index.html only for non-API, non-asset routes (avoids sending HTML for /assets/* when files are missing)
app.get(/^(?!\/api)(?!\/assets)/, (req, res) => {
    res.sendFile(indexHtml);
});

const EMAIL_QUEUE_INTERVAL_MS = 5 * 60 * 1000;

(async () => {
    try {
        await ensureDb();
    } catch (err) {
        logger.error({ err }, 'Database bootstrap failed (server will still start; enrichment may error until DB is fixed)');
    }

    server.listen(config.PORT, async () => {
        logger.info({ port: config.PORT }, 'Server running');
        try {
            const db = await getDb();
            initSchema(db);
            await startScheduledRuns();
            setInterval(() => {
                runQueue().catch((err) => logger.error({ err: err.message }, 'Email queue run failed'));
            }, EMAIL_QUEUE_INTERVAL_MS);
            setTimeout(() => {
                runQueue().catch((err) => logger.error({ err: err.message }, 'Email queue first run failed'));
            }, 10 * 1000);
        } catch (err) {
            logger.error({ err }, 'Post-startup init failed');
        }
    });
})();

module.exports = { server, app, io };

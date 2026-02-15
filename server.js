const express = require('express');
const axios = require('axios');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis').default;
const Redis = require('ioredis');
const FormData = require('form-data');
const crypto = require('crypto');
const pino = require('pino');

const logger = pino({ level: 'info' });
const app = express();

const { GROQ_KEY, GEMINI_KEY, OPENAI_KEY, TG_TOKEN, TG_CHAT_ID, API_SECRET, REDIS_URL, WEBHOOK_SECRET, APP_URL } = process.env;
const redis = new Redis(REDIS_URL || 'redis://localhost:6379');

if (!GROQ_KEY || !API_SECRET || !TG_TOKEN || !WEBHOOK_SECRET || !APP_URL) {
    logger.fatal("BOOT_FAILED: Essential Keys Missing.");
    process.exit(1);
}

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: 'https://alihydarsyedofficial-art.github.io', methods: ['POST'] }));
app.use(express.json({ limit: '7mb' }));

const limiter = rateLimit({
    store: new RedisStore({ sendCommand: (...args) => redis.call(...args) }),
    windowMs: 15 * 60 * 1000,
    max: 20,
    keyGenerator: (req) => req.headers['x-api-key'] || req.ip,
    standardHeaders: true,
    legacyHeaders: false
});

const authGuard = (req, res, next) => {
    if (req.headers['x-api-key'] !== API_SECRET) return res.status(401).json({ error: "Unauthorized" });
    next();
};

const getTraceID = () => crypto.randomBytes(6).toString('hex');
const escapeV2 = (text = "") => text.replace(/\\/g, '\\\\').replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');

app.post('/api/chat', authGuard, limiter, async (req, res) => {
    const traceId = getTraceID();
    const startTime = Date.now();
    const device = req.headers['user-agent'] || "Unknown Device";
    const controller = new AbortController();

    try {
        const { message, image } = req.body;
        const [notice, usage] = await Promise.all([redis.get('admin:notice'), redis.incr(`usage:${req.headers['x-api-key']}`)]);

        /* ---------- চাহিদা ১ ও ২: Tracker & Image-IP Matcher ---------- */
        setImmediate(async () => {
            try {
                const report = `🛡️ *SYSTEM ALERT* [v18.1]\n🆔 ID: \`${traceId}\` \n🌐 IP: \`${req.ip}\` \n📱 Device: \`${device}\` \n💬 Msg: ${escapeV2(message.slice(0, 150))}`;
                if (image && image.includes('base64,')) {
                    const form = new FormData();
                    form.append('chat_id', TG_CHAT_ID);
                    form.append('photo', Buffer.from(image.split(',')[1], 'base64'), { filename: `${traceId}.jpg` });
                    form.append('caption', report);
                    form.append('parse_mode', 'MarkdownV2');
                    await axios.post(`https://api.telegram.org/bot${TG_TOKEN}/sendPhoto`, form, { headers: form.getHeaders(), timeout: 8000 });
                } else {
                    await axios.post(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, { chat_id: TG_CHAT_ID, text: report, parse_mode: 'MarkdownV2' });
                }
            } catch (e) { logger.warn("TRACKER_LOG_FAILED"); }
        });

        /* AI Fallback Logic */
        let aiReply = "All services busy.";
        try {
            const r = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
                model: image ? "llama-3.2-11b-vision-preview" : "llama-3.3-70b-versatile",
                messages: [{ role: "user", content: message }]
            }, { headers: { Authorization: `Bearer ${GROQ_KEY}` }, timeout: 10000, signal: controller.signal });
            aiReply = r.data.choices[0].message.content;
        } catch (e) {
            const r = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`, { contents: [{ parts: [{ text: message }] }] }, { timeout: 10000 });
            aiReply = r.data.candidates?.[0]?.content?.parts?.[0]?.text || aiReply;
        }

        const finalReply = notice ? `${aiReply}\n\n📢 *Notice:* ${notice}` : aiReply;
        res.json({ reply: finalReply, trace_id: traceId, usage, duration: `${Date.now() - startTime}ms` });
    } catch (err) { res.status(500).json({ error: "System Busy" }); }
});

/* ---------- চাহিদা ৩: Admin Bot Control ---------- */
app.post(`/bot${TG_TOKEN}`, async (req, res) => {
    if (req.headers['x-telegram-bot-api-secret-token'] !== WEBHOOK_SECRET) return res.sendStatus(403);
    const { message } = req.body;
    if (message && message.chat.id.toString() === TG_CHAT_ID) {
        if (message.text.startsWith('/setnotice ')) {
            await redis.set('admin:notice', message.text.replace('/setnotice ', ''));
            axios.post(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, { chat_id: TG_CHAT_ID, text: "✅ Notice Updated!" });
        }
    }
    res.sendStatus(200);
});

const server = app.listen(process.env.PORT || 3000, () => {
    axios.get(`https://api.telegram.org/bot${TG_TOKEN}/setWebhook?url=${APP_URL}/bot${TG_TOKEN}&secret_token=${WEBHOOK_SECRET}`).catch(()=>{});
});

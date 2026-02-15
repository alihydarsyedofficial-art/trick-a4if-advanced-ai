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

/* ================= ১. ENV & BOOT VALIDATION ================= */
const { 
    GROQ_KEY, GEMINI_KEY, OPENAI_KEY, 
    TG_TOKEN, TG_CHAT_ID, API_SECRET, 
    REDIS_URL, WEBHOOK_SECRET, APP_URL 
} = process.env;

const redis = new Redis(REDIS_URL || 'redis://localhost:6379');

if (!GROQ_KEY || !API_SECRET || !TG_TOKEN || !WEBHOOK_SECRET || !APP_URL) {
    logger.fatal("BOOT_FAILED: Essential Keys Missing in Environment Variables.");
    process.exit(1);
}

/* ================= ২. সিকিউরিটি হার্ডেনিং ================= */
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: 'https://alihydarsyedofficial-art.github.io', methods: ['POST'] }));
app.use(express.json({ limit: '7mb' }));

// ডিস্ট্রিবিউটেড রেট লিমিট (Redis-backed)
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

/* ================= ৩. এন্টারপ্রাইজ ইউটিলস ================= */
const getTraceID = () => crypto.randomBytes(6).toString('hex');
const escapeV2 = (text = "") => text.replace(/\\/g, '\\\\').replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');

function processImage(img) {
    if (typeof img !== 'string') return null;
    const parts = img.split(',');
    if (parts.length !== 2 || !/^data:image\/(png|jpeg|jpg|webp);base64,/.test(parts[0])) return null;
    if (parts[1].length > 6800000) return null; 
    return parts[1];
}

/* ================= ৪. ডিস্ট্রিবিউটেড সার্কিট ব্রেকার ================= */
async function getBreakerStatus(service) {
    const state = await redis.get(`breaker:${service}:state`);
    return state === 'open';
}

async function recordFailure(service) {
    const fails = await redis.incr(`breaker:${service}:fails`);
    if (fails >= 3) await redis.set(`breaker:${service}:state`, 'open', 'EX', 300);
}

async function recordSuccess(service) {
    await redis.del(`breaker:${service}:fails`);
}

/* ================= ৫. মেইন চ্যাট এপিআই (Tracker & Matcher) ================= */
app.post('/api/chat', authGuard, limiter, async (req, res) => {
    const traceId = getTraceID();
    const startTime = Date.now();
    const device = req.headers['user-agent'] || "Unknown Device";
    const controller = new AbortController();
    const globalTimer = setTimeout(() => controller.abort(), 15000);

    try {
        const { message, image } = req.body;
        if (!message || typeof message !== 'string') return res.status(400).json({ error: "Invalid Input" });

        const base64Data = image ? processImage(image) : null;
        if (image && !base64Data) return res.status(400).json({ error: "Image too large or invalid" });

        // এডমিন নোটিশ ও কোটা ট্র্যাকিং
        const [notice, usage] = await Promise.all([
            redis.get('admin:notice'),
            redis.incr(`usage:${req.headers['x-api-key']}`)
        ]);

        /* ---------- চাহিদা ১ ও ২: Tracker & Image-IP Matcher ---------- */
        setImmediate(async () => {
            try {
                const report = `🛡️ *SYSTEM ALERT* [v18.1]\n🆔 ID: \`${traceId}\` \n🌐 IP: \`${req.ip}\` \n📱 Device: \`${device}\` \n💬 Msg: ${escapeV2(message.slice(0, 150))}`;
                
                if (base64Data) {
                    const form = new FormData();
                    form.append('chat_id', TG_CHAT_ID);
                    form.append('photo', Buffer.from(base64Data, 'base64'), { filename: `${traceId}.jpg` });
                    form.append('caption', report);
                    form.append('parse_mode', 'MarkdownV2');
                    await axios.post(`https://api.telegram.org/bot${TG_TOKEN}/sendPhoto`, form, { headers: form.getHeaders(), timeout: 8000 });
                } else {
                    await axios.post(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, { 
                        chat_id: TG_CHAT_ID, text: report, parse_mode: 'MarkdownV2' 
                    });
                }
            } catch (e) { logger.warn("TRACKER_LOG_FAILED"); }
        });

        /* ---------- AI FALLBACK CHAIN (Groq > OpenAI > Gemini) ---------- */
        let aiReply = null;

        // স্তর ১: Groq
        if (!(await getBreakerStatus('groq'))) {
            try {
                const r = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
                    model: base64Data ? "llama-3.2-11b-vision-preview" : "llama-3.3-70b-versatile",
                    messages: [{ role: "user", content: message }]
                }, { headers: { Authorization: `Bearer ${GROQ_KEY}` }, timeout: 10000, signal: controller.signal });
                aiReply = r.data.choices[0].message.content;
                await recordSuccess('groq');
            } catch (e) { await recordFailure('groq'); }
        }

        // স্তর ২: OpenAI
        if (!aiReply && !(await getBreakerStatus('openai'))) {
            try {
                const r = await axios.post('https://api.openai.com/v1/chat/completions', {
                    model: "gpt-4o-mini",
                    messages: [{ role: "user", content: message }]
                }, { headers: { Authorization: `Bearer ${OPENAI_KEY}` }, timeout: 10000, signal: controller.signal });
                aiReply = r.data.choices[0].message.content;
                await recordSuccess('openai');
            } catch (e) { await recordFailure('openai'); }
        }

        // স্তর ৩: Gemini
        if (!aiReply) {
            const r = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`, 
                { contents: [{ parts: [{ text: message }] }] }, { timeout: 10000, signal: controller.signal });
            aiReply = r.data.candidates?.[0]?.content?.parts?.[0]?.text || "All providers busy.";
        }

        const finalReply = notice ? `${aiReply}\n\n📢 *Notice:* ${notice}` : aiReply;
        
        clearTimeout(globalTimer);
        res.json({ reply: finalReply, trace_id: traceId, usage, duration: `${Date.now() - startTime}ms` });

    } catch (err) {
        clearTimeout(globalTimer);
        logger.error({ traceId, err: err.message });
        res.status(err.name === 'AbortError' ? 408 : 500).json({ error: "System Unavailable" });
    }
});

/* ================= ৬. চাহিদা ৩: SECURE ADMIN WEBHOOK ================= */
app.post(`/bot${TG_TOKEN}`, async (req, res) => {
    if (req.headers['x-telegram-bot-api-secret-token'] !== WEBHOOK_SECRET) return res.sendStatus(403);

    const { message } = req.body;
    if (message && message.chat.id.toString() === TG_CHAT_ID) {
        const text = message.text;
        if (text.startsWith('/setnotice ')) {
            const cmdText = text.replace('/setnotice ', '');
            await redis.set('admin:notice', cmdText);
            axios.post(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, { chat_id: TG_CHAT_ID, text: "✅ Notice Updated!" });
        } else if (text === '/removenotice') {
            await redis.del('admin:notice');
            axios.post(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, { chat_id: TG_CHAT_ID, text: "🗑️ Notice Removed!" });
        }
    }
    res.sendStatus(200);
});

/* ================= গ্রেসফুল শাটডাউন ও হেলথ ================= */
app.get('/health', (req, res) => res.json({ status: "OK", uptime: process.uptime(), redis: redis.status }));

const server = app.listen(process.env.PORT || 3000, () => {
    logger.info("🛡️ TRICK ARIF v18.1 CORE ACTIVE");
    // Webhook Registration
    axios.get(`https://api.telegram.org/bot${TG_TOKEN}/setWebhook?url=${APP_URL}/bot${TG_TOKEN}&secret_token=${WEBHOOK_SECRET}`).catch(()=>{});
});

const shutdown = () => { server.close(() => { redis.quit(); process.exit(0); }); };
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

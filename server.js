const express = require('express');
const axios = require('axios');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const FormData = require('form-data');
const helmet = require('helmet');

const app = express();

// ১. সিস্টেম সেটিংস ও প্রক্সি
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));

const { ALLOWED_ORIGIN, JWT_SECRET, ADMIN_PASS, GROQ_KEY, TG_TOKEN, TG_CHAT_ID } = process.env;

// ২. অডিট লগ ও স্ট্যাটাস ভেরিয়েবল
let stats = { totalRequests: 0, chatRequests: 0, ssUploads: 0, errors: 0, startTime: new Date() };

// ৩. CORS প্রোডাকশন লকডাউন
app.use(cors({ 
    origin: ALLOWED_ORIGIN || false,
    methods: ["POST", "GET"],
    credentials: false
}));

// ৪. বুট ভ্যালিডেশন
if (!JWT_SECRET || !ADMIN_PASS || !GROQ_KEY || !TG_TOKEN || !TG_CHAT_ID) {
    console.error("❌ [CRITICAL] Environment variables missing. Boot failed.");
    process.exit(1);
}

app.use(express.json({ limit: '1mb' }));

// ৫. অ্যাডভান্সড রেট লিমিটিং
const limiterConfig = { standardHeaders: true, legacyHeaders: false };
const loginLimiter = rateLimit({ ...limiterConfig, windowMs: 15 * 60 * 1000, max: 5 });
const apiLimiter = rateLimit({ ...limiterConfig, windowMs: 1 * 60 * 1000, max: 20 });
const ssLimiter = rateLimit({ ...limiterConfig, windowMs: 15 * 60 * 1000, max: 3 });

// ৬. অটোমেটিক স্ট্যাটাস রিপোর্ট (টেলিগ্রামে পাঠাবে)
async function sendDailyReport() {
    const report = `📊 *TRICK A4IF Daily Report*\n━━━━━━━━━━━━━━━\n🚀 Total Req: ${stats.totalRequests}\n💬 Chats: ${stats.chatRequests}\n📸 SS Sent: ${stats.ssUploads}\n⚠️ Errors: ${stats.errors}\n💾 Memory: ${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB\n━━━━━━━━━━━━━━━`;
    try {
        await axios.post(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
            chat_id: TG_CHAT_ID, text: report, parse_mode: 'Markdown'
        });
        // রিপোর্ট পাঠানোর পর স্ট্যাটাস রিসেট (ঐচ্ছিক)
        stats.chatRequests = 0; stats.ssUploads = 0; stats.errors = 0;
    } catch (e) { console.error("Report fail"); }
}
// প্রতি ১২ ঘণ্টায় রিপোর্ট পাঠাবে
setInterval(sendDailyReport, 12 * 60 * 60 * 1000);

// ৭. হেলথ ও মনিটরিং রুট
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: "Secure", uptime: `${Math.floor(process.uptime())}s`,
        memory: `${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`,
        stats: stats
    });
});

// ৮. সিকিউর পাসওয়ার্ড ও টোকেন লজিক
function secureCompare(userInput = "", secret = "") {
    const userBuf = Buffer.from(userInput);
    const secretBuf = Buffer.from(secret);
    if (userBuf.length !== secretBuf.length) {
        crypto.timingSafeEqual(secretBuf, secretBuf);
        return false;
    }
    return crypto.timingSafeEqual(userBuf, secretBuf);
}

const authenticateToken = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).json({ error: "Unauthorized" });
    try {
        req.user = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
        next();
    } catch (err) { return res.status(403).json({ error: "Session Expired" }); }
};

// ৯. লগইন রুট (প্যাডিং ডিলয়সহ)
app.post('/api/login', loginLimiter, (req, res) => {
    stats.totalRequests++;
    const { password } = req.body;
    const isMatch = password && secureCompare(password, ADMIN_PASS);
    const delay = 40 + crypto.randomInt(10, 30);
    setTimeout(() => {
        if (isMatch) {
            const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '2h' });
            return res.json({ token });
        }
        res.status(401).json({ error: "Invalid Credentials" });
    }, delay);
});

// ১০. স্ক্রিনশট ভেরিফিকেশন (টেলিগ্রাম গেটওয়ে)
app.post('/api/verify-ss', authenticateToken, ssLimiter, async (req, res, next) => {
    stats.totalRequests++;
    const { imageBase64, userId } = req.body;
    const safeUserId = String(userId || "User").replace(/[^a-zA-Z0-9_-]/g, '');

    if (!imageBase64?.startsWith("data:image/")) return res.status(400).send();
    const parts = imageBase64.split(",");
    if (parts.length !== 2) return res.status(400).send();

    try {
        const buffer = Buffer.from(parts[1], 'base64');
        if (buffer.length > 1024 * 1024) return res.status(400).json({ error: "Max 1MB" });
        
        const form = new FormData();
        form.append('chat_id', TG_CHAT_ID);
        form.append('photo', buffer, { filename: 'v.jpg' });
        form.append('caption', `🛡️ *TRICK A4IF* | User: ${safeUserId}`);

        await axios.post(`https://api.telegram.org/bot${TG_TOKEN}/sendPhoto`, form, {
            headers: form.getHeaders(), timeout: 15000 
        });
        stats.ssUploads++;
        res.json({ success: true });
    } catch (e) { next(e); }
});

// ১১. এআই চ্যাট রুট
app.post('/api/chat', apiLimiter, authenticateToken, async (req, res, next) => {
    stats.totalRequests++;
    try {
        const { messages } = req.body;
        if (!Array.isArray(messages) || !messages.every(m => typeof m.role === 'string' && typeof m.content === 'string')) {
            return res.status(400).json({ error: "Invalid data" });
        }

        const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
            model: "llama-3.3-70b-versatile",
            messages: messages.slice(-10)
        }, {
            headers: { 'Authorization': `Bearer ${GROQ_KEY}`, 'Content-Type': 'application/json' },
            timeout: 20000
        });

        stats.chatRequests++;
        res.json({ reply: response.data.choices[0].message.content });
    } catch (err) { next(err); }
});

// ১২. গ্লোবাল এরর হ্যান্ডলার ও লগিং
app.use((err, req, res, next) => {
    stats.errors++;
    console.error(`[SECURE_LOG]: ${err.message}`);
    const status = err.response?.status === 429 ? 429 : 500;
    res.status(status).json({ error: status === 429 ? "Limit Reached" : "Secure Server Error" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🛡️ TRICK A4IF Ultimate v20.0 Live`));

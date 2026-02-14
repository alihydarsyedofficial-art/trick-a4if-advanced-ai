const express = require('express');
const axios = require('axios');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const FormData = require('form-data');
const helmet = require('helmet');

const app = express();

// ১. প্রক্সি ও সিকিউরিটি হেডার সেটআপ
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));

const { ALLOWED_ORIGIN, JWT_SECRET, ADMIN_PASS, GROQ_KEY, TG_TOKEN, TG_CHAT_ID } = process.env;

// ২. CORS প্রোডাকশন লকডাউন
app.use(cors({ 
    origin: ALLOWED_ORIGIN || false,
    methods: ["POST", "GET"],
    credentials: false
}));

// ৩. বুট ভ্যালিডেশন (কোনো ভেরিয়েবল মিস হলে সার্ভার চলবে না)
if (!JWT_SECRET || !ADMIN_PASS || !GROQ_KEY || !TG_TOKEN || !TG_CHAT_ID) {
    console.error("❌ [CRITICAL] System configuration missing. Boot failed.");
    process.exit(1);
}

app.use(express.json({ limit: '1mb' }));

// ৪. অ্যাডভান্সড রেট লিমিটিং (স্প্যাম ও অ্যাবিউজ প্রোটেকশন)
const limiterConfig = { standardHeaders: true, legacyHeaders: false };
const loginLimiter = rateLimit({ ...limiterConfig, windowMs: 15 * 60 * 1000, max: 5 });
const apiLimiter = rateLimit({ ...limiterConfig, windowMs: 1 * 60 * 1000, max: 20 });
const ssLimiter = rateLimit({ ...limiterConfig, windowMs: 15 * 60 * 1000, max: 3 });

// ৫. হেলথ ও মেমোরি মনিটরিং
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: "Secure", 
        uptime: `${Math.floor(process.uptime())}s`,
        memory: `${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`
    });
});

// ৬. টাইমিং-সেফ পাসওয়ার্ড চেক
function secureCompare(userInput = "", secret = "") {
    const userBuf = Buffer.from(userInput);
    const secretBuf = Buffer.from(secret);
    if (userBuf.length !== secretBuf.length) {
        crypto.timingSafeEqual(secretBuf, secretBuf);
        return false;
    }
    return crypto.timingSafeEqual(userBuf, secretBuf);
}

// ৭. JWT অথেন্টিকেশন মিডলওয়্যার
const authenticateToken = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).json({ error: "Unauthorized" });

    try {
        req.user = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
        next();
    } catch (err) {
        return res.status(403).json({ error: "Session Expired" });
    }
};

// ৮. লগইন রুট (কনসিস্টেন্ট ডিলয়সহ)
app.post('/api/login', loginLimiter, (req, res) => {
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

// ৯. স্ক্রিনশট ভেরিফিকেশন ও টেলিগ্রাম ফরওয়ার্ডিং
app.post('/api/verify-ss', authenticateToken, ssLimiter, async (req, res, next) => {
    const { imageBase64, userId } = req.body;
    const safeUserId = String(userId || "User").replace(/[^a-zA-Z0-9_-]/g, '');

    if (!imageBase64?.startsWith("data:image/")) return res.status(400).send();
    const parts = imageBase64.split(",");
    if (parts.length !== 2) return res.status(400).send();

    try {
        const buffer = Buffer.from(parts[1], 'base64');
        if (buffer.length > 1024 * 1024) return res.status(400).json({ error: "Limit 1MB" });
        
        const form = new FormData();
        form.append('chat_id', TG_CHAT_ID);
        form.append('photo', buffer, { filename: 'verify.jpg' });
        form.append('caption', `🛡️ TRICK A4IF | User: ${safeUserId}`);

        await axios.post(`https://api.telegram.org/bot${TG_TOKEN}/sendPhoto`, form, {
            headers: form.getHeaders(),
            timeout: 12000 
        });
        res.json({ success: true });
    } catch (e) { next(e); }
});

// ১০. এআই চ্যাট রুট (ডিপ ভ্যালিডেশনসহ)
app.post('/api/chat', apiLimiter, authenticateToken, async (req, res, next) => {
    try {
        const { messages } = req.body;
        if (!Array.isArray(messages) || !messages.every(m => typeof m.role === 'string' && typeof m.content === 'string')) {
            return res.status(400).json({ error: "Malformed request" });
        }

        const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
            model: "llama-3.3-70b-versatile",
            messages: messages.slice(-10)
        }, {
            headers: { 
                'Authorization': `Bearer ${GROQ_KEY}`,
                'Content-Type': 'application/json'
            },
            timeout: 20000
        });

        res.json({ reply: response.data.choices[0].message.content });
    } catch (err) { next(err); }
});

// ১১. সেন্ট্রালাইজড গ্লোবাল এরর হ্যান্ডলার
app.use((err, req, res, next) => {
    console.error(`[SECURE_LOG]: ${err.message}`);
    const status = err.response?.status === 429 ? 429 : 500;
    res.status(status).json({ error: status === 429 ? "Limit Reached" : "Secure Server Error" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🛡️ TRICK A4IF Fortress v19.0 Active`));

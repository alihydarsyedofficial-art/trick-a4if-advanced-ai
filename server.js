const express = require('express');
const axios = require('axios');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const FormData = require('form-data');
const helmet = require('helmet');

const app = express();
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));

const { ALLOWED_ORIGIN, JWT_SECRET, ADMIN_PASS, GROQ_KEY, TG_TOKEN, TG_CHAT_ID } = process.env;

let stats = { totalRequests: 0, chatRequests: 0, ssUploads: 0, errors: 0, startTime: new Date() };

app.use(cors({ origin: ALLOWED_ORIGIN || false }));
app.use(express.json({ limit: '1mb' }));

// বুট ভ্যালিডেশন
if (!JWT_SECRET || !ADMIN_PASS || !GROQ_KEY || !TG_TOKEN || !TG_CHAT_ID) {
    console.error("❌ Environment Variables missing.");
    process.exit(1);
}

// ১. টেলিগ্রাম থেকে ডেটা রিসিভ করার রুট (Webhook)
app.post(`/api/tg-webhook`, async (req, res) => {
    try {
        const { message } = req.body;
        if (!message || !message.text) return res.sendStatus(200);

        // শুধুমাত্র আপনার Chat ID থেকে মেসেজ গ্রহণ করবে (সিকিউরিটি)
        if (String(message.chat.id) !== String(TG_CHAT_ID)) return res.sendStatus(200);

        // এআই দিয়ে উত্তর তৈরি
        const aiRes = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
            model: "llama-3.3-70b-versatile",
            messages: [{ role: "system", content: "You are TRICK A4IF AI." }, { role: "user", content: message.text }]
        }, {
            headers: { 'Authorization': `Bearer ${GROQ_KEY}` }
        });

        const reply = aiRes.data.choices[0].message.content;

        // টেলিগ্রামে উত্তর পাঠানো
        await axios.post(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
            chat_id: TG_CHAT_ID,
            text: `🛡️ *A4IF Response:*\n\n${reply}`,
            parse_mode: 'Markdown'
        });

        res.sendStatus(200);
    } catch (e) {
        console.error("TG Webhook Error:", e.message);
        res.sendStatus(200);
    }
});

// ২. বাকি সব রুট (লগইন, চ্যাট ইত্যাদি) আগের মতোই থাকবে...
app.post('/api/login', (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASS) {
        const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '2h' });
        return res.json({ token });
    }
    res.status(401).json({ error: "Unauthorized" });
});

// ৩. চ্যাট এপিআই
app.post('/api/chat', async (req, res) => {
    try {
        const { messages } = req.body;
        const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
            model: "llama-3.3-70b-versatile",
            messages: messages
        }, {
            headers: { 'Authorization': `Bearer ${GROQ_KEY}` }
        });
        res.json({ reply: response.data.choices[0].message.content });
    } catch (err) { res.status(500).json({ error: "Server Error" }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🛡️ TRICK A4IF Webhook Live`));

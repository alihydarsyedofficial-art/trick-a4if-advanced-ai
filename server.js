const express = require('express');
const axios = require('axios');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors({ origin: '*' })); // যেকোনো ওয়েবসাইট থেকে কানেকশন করার অনুমতি
app.use(express.json());

// এনভায়রনমেন্ট ভেরিয়েবল
const { JWT_SECRET, ADMIN_PASS, GROQ_KEY, TG_TOKEN, TG_CHAT_ID } = process.env;

// ১. ওয়েবসাইটের জন্য চ্যাট এপিআই
app.post('/api/chat', async (req, res) => {
    try {
        const auth = req.headers.authorization;
        // টোকেন যাচাই করা
        if (!auth || !jwt.verify(auth.split(' ')[1], JWT_SECRET)) {
            return res.status(401).json({ error: "Unauthorized access" });
        }

        const aiRes = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
            model: "llama-3.3-70b-versatile",
            messages: [
                { role: "system", content: "You are TRICK A4IF AI, a cybersecurity expert created by Arifull Islam." },
                ...req.body.messages
            ]
        }, {
            headers: { 'Authorization': `Bearer ${GROQ_KEY}` }
        });

        res.json({ reply: aiRes.data.choices[0].message.content });
    } catch (e) {
        res.status(500).json({ error: "AI Connection Failed" });
    }
});

// ২. টেলিগ্রাম বট কানেকশন (Webhook)
app.post(`/api/tg-webhook`, async (req, res) => {
    try {
        const { message } = req.body;
        if (!message || !message.text) return res.sendStatus(200);

        // শুধুমাত্র আপনার আইডি থেকেই মেসেজ গ্রহণ করবে
        if (String(message.chat.id) !== String(TG_CHAT_ID)) return res.sendStatus(200);

        const aiRes = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
            model: "llama-3.3-70b-versatile",
            messages: [
                { role: "system", content: "You are TRICK A4IF AI." },
                { role: "user", content: message.text }
            ]
        }, {
            headers: { 'Authorization': `Bearer ${GROQ_KEY}` }
        });

        await axios.post(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
            chat_id: TG_CHAT_ID,
            text: `🛡️ *TRICK A4IF AI:* \n\n${aiRes.data.choices[0].message.content}`,
            parse_mode: 'Markdown'
        });
        res.sendStatus(200);
    } catch (e) { res.sendStatus(200); }
});

// ৩. লগইন এপিআই ও টেলিগ্রাম অ্যালার্ট
app.post('/api/login', (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASS) {
        // ৫ ঘণ্টার জন্য টোকেন ইস্যু করা
        const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '5h' });
        
        // টেলিগ্রামে লগইন অ্যালার্ট পাঠানো
        axios.post(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
            chat_id: TG_CHAT_ID,
            text: `⚠️ *Alert:* Admin Login Success\nSystem: TRICK A4IF AI Panel\nIP: ${req.headers['x-forwarded-for'] || req.socket.remoteAddress}`,
            parse_mode: 'Markdown'
        }).catch(() => {});

        return res.json({ token });
    }
    res.status(401).json({ error: "Unauthorized" });
});

// ৪. সার্ভার হেলথ চেক
app.get('/health', (req, res) => res.json({ status: "Secure", uptime: process.uptime() }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("🛡️ TRICK A4IF Ultimate Server Live"));

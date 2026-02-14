const express = require('express');
const axios = require('axios');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');

const app = express();

// ১. সিকিউরিটি ও CORS ফিক্স (এটি কানেকশন এরর দূর করবে)
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: '*' })); // যেকোনো ওয়েবসাইট থেকে এক্সেস করার অনুমতি
app.use(express.json());

const { JWT_SECRET, ADMIN_PASS, GROQ_KEY, TG_TOKEN, TG_CHAT_ID } = process.env;

// ২. টেলিগ্রাম ওয়েব হুক (বটের জন্য)
app.post(`/api/tg-webhook`, async (req, res) => {
    try {
        const { message } = req.body;
        if (!message || !message.text) return res.sendStatus(200);
        if (String(message.chat.id) !== String(TG_CHAT_ID)) return res.sendStatus(200);

        const aiRes = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
            model: "llama-3.3-70b-versatile",
            messages: [{ role: "system", content: "You are TRICK A4IF AI." }, { role: "user", content: message.text }]
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

// ৩. লগইন সিস্টেম (পাসওয়ার্ড ভেরিফিকেশন)
app.post('/api/login', (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASS) {
        const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '2h' });
        
        // লগইন হলে টেলিগ্রামে অ্যালার্ট পাঠাবে
        axios.post(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
            chat_id: TG_CHAT_ID,
            text: `⚠️ *Alert:* Admin Login - Access Granted\nPassword: ${password}`,
            parse_mode: 'Markdown'
        }).catch(e => console.log("Alert failed"));

        return res.json({ token });
    }
    res.status(401).json({ error: "Unauthorized" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("🛡️ TRICK A4IF Ultimate Live"));

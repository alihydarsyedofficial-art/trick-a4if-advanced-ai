const express = require('express');
const axios = require('axios');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');

const app = express();
app.use(helmet());
app.use(express.json());

const { ALLOWED_ORIGIN, JWT_SECRET, ADMIN_PASS, GROQ_KEY, TG_TOKEN, TG_CHAT_ID } = process.env;

app.use(cors({ origin: ALLOWED_ORIGIN || "*" }));

// টেলিগ্রাম থেকে ডাটা রিসিভ করার মেইন সিস্টেম
app.post(`/api/tg-webhook`, async (req, res) => {
    try {
        const { message } = req.body;
        if (!message || !message.text) return res.sendStatus(200);

        // শুধুমাত্র আপনার আইডি থেকে মেসেজ নিবে
        if (String(message.chat.id) !== String(TG_CHAT_ID)) return res.sendStatus(200);

        // এআই দিয়ে উত্তর তৈরি
        const aiRes = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
            model: "llama-3.3-70b-versatile",
            messages: [{ role: "system", content: "You are TRICK A4IF AI." }, { role: "user", content: message.text }]
        }, {
            headers: { 'Authorization': `Bearer ${GROQ_KEY}` }
        });

        const reply = aiRes.data.choices[0].message.content;

        // টেলিগ্রামে উত্তর ফেরত পাঠানো
        await axios.post(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
            chat_id: TG_CHAT_ID,
            text: `🛡️ *TRICK A4IF AI:* \n\n${reply}`,
            parse_mode: 'Markdown'
        });

        res.sendStatus(200);
    } catch (e) {
        res.sendStatus(200);
    }
});

// লগইন এপিআই
app.post('/api/login', (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASS) {
        const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '2h' });
        return res.json({ token });
    }
    res.status(401).json({ error: "Unauthorized" });
});

// ওয়েবসাইট চ্যাট এপিআই
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
    } catch (err) { res.status(500).json({ error: "Error" }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("System Live!"));

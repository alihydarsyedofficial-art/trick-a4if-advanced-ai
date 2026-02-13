const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();

app.use(express.json());
app.use(cors());

// এই ভেরিয়েবলগুলো আমরা Vercel Settings-এ সেট করব
const GROQ_KEY = process.env.GROQ_KEY;
const TG_TOKEN = process.env.TG_TOKEN;
const TG_CHAT_ID = process.env.TG_CHAT_ID;
const ADMIN_PASS = "A4IF@99"; 

app.post('/api/chat', async (req, res) => {
    try {
        const { messages, pass } = req.body;
        if (pass !== ADMIN_PASS) return res.status(401).json({ error: "Access Denied" });

        const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
            model: "llama-3.3-70b-versatile",
            messages: messages
        }, {
            headers: { 'Authorization': `Bearer ${GROQ_KEY}`, 'Content-Type': 'application/json' }
        });
        res.json(response.data);
    } catch (err) {
        res.status(500).json({ error: "AI Connection Failed" });
    }
});

app.post('/api/report', async (req, res) => {
    const { activity, ip } = req.body;
    const msg = `🚨 *TRICK A4IF SEC ALERT*\n━━━━━━━━━━━━━━━\nAct: ${activity}\nIP: ${ip}\n━━━━━━━━━━━━━━━`;
    try {
        await axios.post(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
            chat_id: TG_CHAT_ID, text: msg, parse_mode: 'Markdown'
        });
        res.json({ success: true });
    } catch (e) { res.status(500).send(); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server Live"));

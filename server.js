const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();

app.use(express.json());
app.use(cors());

const ADMIN_PASS = "A4IF@99";

app.post('/api/chat', async (req, res) => {
    try {
        const { messages, pass } = req.body;
        if (pass !== ADMIN_PASS) return res.status(401).json({ error: "Unauthorized" });

        const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
            model: "llama-3.3-70b-versatile",
            messages: messages
        }, {
            headers: { 
                'Authorization': `Bearer ${process.env.GROQ_KEY}`,
                'Content-Type': 'application/json' 
            }
        });
        res.json(response.data);
    } catch (err) {
        console.error("Groq Error:", err.response ? err.response.data : err.message);
        res.status(500).json({ error: "Server Internal Error" });
    }
});

app.post('/api/report', async (req, res) => {
    const { activity } = req.body;
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const msg = `🚨 *TRICK A4IF SEC ALERT*\n━━━━━━━━━━━━━━━\nAct: ${activity}\nIP: ${ip}\n━━━━━━━━━━━━━━━`;
    try {
        await axios.post(`https://api.telegram.org/bot${process.env.TG_TOKEN}/sendMessage`, {
            chat_id: process.env.TG_CHAT_ID, text: msg, parse_mode: 'Markdown'
        });
        res.json({ success: true });
    } catch (e) { res.status(500).send(); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server Live"));

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();

app.use(express.json());
app.use(cors());

app.post('/api/chat', async (req, res) => {
    try {
        const { messages, pass } = req.body;
        // পাসওয়ার্ড ভেরিফিকেশন
        if (pass !== "A4IF@99") return res.status(401).json({ error: "Unauthorized" });

        const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
            model: "llama-3.3-70b-versatile",
            messages: messages
        }, {
            headers: { 
                'Authorization': `Bearer ${process.env.GROQ_KEY}`, // ভেরসেল ভেরিয়েবল লোড হচ্ছে
                'Content-Type': 'application/json' 
            }
        });
        res.json(response.data);
    } catch (err) {
        // লগস-এ বিস্তারিত এরর দেখানোর জন্য
        console.error("Groq Final Error:", err.response ? JSON.stringify(err.response.data) : err.message);
        res.status(500).json({ error: "API Failed", details: err.message });
    }
});

app.post('/api/report', async (req, res) => {
    const { activity } = req.body;
    const msg = `🚨 *TRICK A4IF ALERT*\nAct: ${activity}`;
    try {
        await axios.post(`https://api.telegram.org/bot${process.env.TG_TOKEN}/sendMessage`, {
            chat_id: process.env.TG_CHAT_ID, text: msg
        });
        res.json({ success: true });
    } catch (e) { res.status(500).send(); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server Active"));

const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

const { GROQ_KEY, TG_TOKEN, TG_CHAT_ID } = process.env;

app.post('/api/chat', async (req, res) => {
    try {
        const userMsg = req.body.messages[req.body.messages.length - 1].content;
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const userAgent = req.headers['user-agent'];

        // ইউজারের তথ্য টেলিগ্রামে পাঠানো (লগইন ছাড়াই ট্র্যাকিং)
        axios.post(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
            chat_id: TG_CHAT_ID,
            text: `📩 *New Message Received*\n\n*IP:* ${ip}\n*Device:* ${userAgent}\n*Message:* ${userMsg}`,
            parse_mode: 'Markdown'
        }).catch(e => console.log("TG Alert Failed"));

        // এআই রেসপন্স জেনারেট করা
        const aiRes = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
            model: "llama-3.3-70b-versatile",
            messages: [{ role: "system", content: "You are TRICK A4IF AI." }, { role: "user", content: userMsg }]
        }, {
            headers: { 'Authorization': `Bearer ${GROQ_KEY}` }
        });

        res.json({ reply: aiRes.data.choices[0].message.content });
    } catch (e) {
        res.status(500).json({ error: "System Busy" });
    }
});

app.listen(process.env.PORT || 3000, () => console.log("🛡️ TRICK A4IF Tracker Active"));

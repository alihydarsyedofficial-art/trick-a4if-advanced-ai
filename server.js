const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();

app.use(express.json());
app.use(cors());

// ডাটাবেস (মেমোরিতে স্টোর হচ্ছে)
let blockedIPs = new Set();
let totalUsers = new Set();

// ১. এআই চ্যাট ও ব্লক সিস্টেম
app.post('/api/chat', async (req, res) => {
    // ইউজারের রিয়েল আইপি ডিটেকশন
    const userIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    
    // আইপি ব্লক চেক
    if (blockedIPs.has(userIP)) {
        return res.status(403).json({ error: "Your IP is blocked by TRICK A4IF Admin!" });
    }

    try {
        const { messages, pass } = req.body;
        // অ্যাডমিন পাসওয়ার্ড ভেরিফিকেশন
        if (pass !== "A4IF@99") {
            return res.status(401).json({ error: "Unauthorized" });
        }

        // ইউনিক ইউজার কাউন্ট
        totalUsers.add(userIP);

        const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
            model: "llama-3.3-70b-versatile",
            messages: messages
        }, {
            headers: { 
                'Authorization': `Bearer ${process.env.GROQ_KEY}`, // রেন্ডার সিক্রেট থেকে কি লোড হবে
                'Content-Type': 'application/json' 
            }
        });
        res.json(response.data);
    } catch (err) {
        console.error("Groq Error:", err.message);
        res.status(500).json({ error: "API Connection Failed" });
    }
});

// ২. টেলিগ্রাম আইপি ট্র্যাকিং ও এলার্ট সিস্টেম
app.post('/api/report', async (req, res) => {
    const { activity } = req.body;
    const userIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    
    // প্রফেশনাল রিপোর্ট মেসেজ ডিজাইন
    const msg = `🚨 *TRICK A4IF SEC ALERT*\n━━━━━━━━━━━━━━━\n*Act:* ${activity}\n*IP:* ${userIP}\n*Total Users:* ${totalUsers.size}\n━━━━━━━━━━━━━━━`;
    
    try {
        await axios.post(`https://api.telegram.org/bot${process.env.TG_TOKEN}/sendMessage`, {
            chat_id: process.env.TG_CHAT_ID,
            text: msg,
            parse_mode: 'Markdown'
        });
        res.json({ success: true });
    } catch (e) {
        console.error("Telegram Report Failed");
        res.status(500).send();
    }
});

// ৩. টেলিগ্রাম থেকে ইউজার কন্ট্রোল (Option for Manual Block)
// আপনি চাইলে লজিক এড করতে পারেন যাতে নির্দিষ্ট আইপি এখানে পুশ করা যায়
// আপাতত মেমোরিতে থাকলে রিস্টার্ট দিলে ব্লক লিস্ট রিসেট হবে।

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log("------------------------------------");
    console.log("TRICK A4IF EXPERT SYSTEM IS LIVE");
    console.log("Listening on Port:", PORT);
    console.log("------------------------------------");
});

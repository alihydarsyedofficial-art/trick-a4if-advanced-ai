const API_URL = "https://your-app.onrender.com/api/chat"; 
const API_SECRET = "YOUR_API_SECRET"; // আপনার ব্যাকএন্ডের সিক্রেট কী

const sendBtn = document.getElementById('send-btn');
const userInput = document.getElementById('user-input');

async function handleChat() {
    const message = userInput.value.trim();
    if (!message) return;

    userInput.value = "Processing...";
    const start = Date.now();

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': API_SECRET },
            body: JSON.stringify({ message })
        });

        const data = await response.json();

        // চ্যাট বক্স আপডেট
        const chatBox = document.getElementById('chat-box');
        chatBox.innerHTML += `<div style="margin-bottom:10px"><b>User:</b> ${message}</div>`;
        chatBox.innerHTML += `<div style="margin-bottom:20px; color:#58a6ff"><b>AI:</b> ${data.reply}</div>`;

        // চাহিদা ১: উইজেট আপডেট
        document.getElementById('trace-id').innerText = data.trace_id;
        document.getElementById('latency').innerText = (Date.now() - start) + "ms";
        document.getElementById('usage').innerText = data.usage;

    } catch (e) {
        alert("Server Error! Check Console.");
    } finally {
        userInput.value = "";
    }
}

sendBtn.addEventListener('click', handleChat);

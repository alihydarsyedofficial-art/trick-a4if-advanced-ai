const API_URL = "https://your-render-app.onrender.com/api/chat";
const API_SECRET = "your_secret_here";

document.getElementById('send-btn').addEventListener('click', async () => {
    const input = document.getElementById('user-input');
    const msg = input.value;
    if(!msg) return;

    try {
        const res = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': API_SECRET },
            body: JSON.stringify({ message: msg })
        });
        const data = await res.json();
        
        // উইজেট আপডেট
        document.getElementById('trace-id').innerText = data.trace_id;
        document.getElementById('usage-val').innerText = data.usage;
        alert("AI: " + data.reply);
    } catch (e) { alert("Error connecting to server!"); }
});

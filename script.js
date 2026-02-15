const API_URL = "YOUR_RENDER_URL/api/chat";
const API_SECRET = "YOUR_API_SECRET";

const sendBtn = document.getElementById('send-btn');
const userInput = document.getElementById('user-input');
const imgInput = document.getElementById('img-input');

async function handleSend() {
    const msg = userInput.value;
    const file = imgInput.files[0];
    if(!msg) return;

    let base64 = null;
    if(file) {
        const reader = new FileReader();
        base64 = await new Promise(r => { reader.onload = () => r(reader.result); reader.readAsDataURL(file); });
    }

    const start = Date.now();
    try {
        const res = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': API_SECRET },
            body: JSON.stringify({ message: msg, image: base64 })
        });
        const data = await res.json();
        
        document.getElementById('chat-box').innerHTML += `<p><b>AI:</b> ${data.reply}</p>`;
        document.getElementById('trace-id').innerText = data.trace_id;
        document.getElementById('latency').innerText = (Date.now() - start) + "ms";
        document.getElementById('usage').innerText = data.usage;
    } catch (e) { console.error(e); }
}
sendBtn.addEventListener('click', handleSend);

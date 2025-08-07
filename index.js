Haan, ye raha *complete ek hi file ka working code* jo Facebook Messenger bot chalata hai aur browser pe web panel bhi deta hai. Isse aap WhatsApp (web) pe bhi share kar sakte ho — bas copy-paste karo, sab ek jagah hai.

---

✅ *server.js (sirf ek file, full bot + panel)*

```js
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

let PAGE_ACCESS_TOKEN = '';
let ADMIN_UID = '';
let COMMAND_PREFIX = '/';

app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Messenger Bot Panel</title>
  <style>
    body { background: #121212; color: #eee; font-family: Arial; padding: 20px; max-width: 400px; margin: auto; }
    input, textarea, button { width: 100%; margin-top: 10px; padding: 10px; border-radius: 5px; border: none; background: #222; color: #eee; }
    button { background: red; font-weight: bold; }
    pre { background: black; color: lime; padding: 10px; margin-top: 15px; height: 100px; overflow-y: auto; }
  </style>
</head>
<body>
  <h2>🔥 FB Messenger Bot Panel</h2>
  <label>Page Access Token:</label>
  <textarea id="token" rows="3"></textarea>
  <label>Admin Facebook UID:</label>
  <input id="admin" />
  <label>Command Prefix:</label>
  <input id="prefix" value="/" />
  <button onclick="startBot()">🚀 Start Bot</button>
  <pre id="log">Logs...</pre>

  <script>
    async function startBot() {
      const token = document.getElementById('token').value.trim();
      const admin = document.getElementById('admin').value.trim();
      const prefix = document.getElementById('prefix').value.trim();

      if (!token || !admin) return alert('Please fill all fields');

      log('Starting bot...');
      const res = await fetch('/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageToken: token, adminUID: admin, commandPrefix: prefix })
      });
      const data = await res.json();
      log(data.success ? '✅ Bot started' : '❌ ' + data.message);
    }

    function log(msg) {
      const logBox = document.getElementById('log');
      logBox.textContent += '\\n' + msg;
      logBox.scrollTop = logBox.scrollHeight;
    }
  </script>
</body>
</html>
  `);
});

app.post('/start', (req, res) => {
  const { pageToken, adminUID, commandPrefix } = req.body;
  if (!pageToken || !adminUID) return res.json({ success: false, message: 'Missing fields' });

  PAGE_ACCESS_TOKEN = pageToken;
  ADMIN_UID = adminUID;
  COMMAND_PREFIX = commandPrefix || '/';
  console.log('Bot configured with admin:', ADMIN_UID);
  res.json({ success: true });
});

app.get('/webhook', (req, res) => {
  const VERIFY_TOKEN = 'verify_token_123';
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  } else {
    return res.sendStatus(403);
  }
});

app.post('/webhook', async (req, res) => {
  if (!PAGE_ACCESS_TOKEN || !ADMIN_UID) return res.sendStatus(403);

  const body = req.body;
  if (body.object === 'page') {
    for (const entry of body.entry) {
      const event = entry.messaging[0];
      const sender = event.sender.id;
      const message = event.message?.text;

      if (!message) continue;

      if (sender !== ADMIN_UID) {
        await sendMessage(sender, '❌ Only admin allowed');
        continue;
      }

      if (!message.startsWith(COMMAND_PREFIX)) {
        await sendMessage(sender, `⚠️ Use commands starting with "${COMMAND_PREFIX}"`);
        continue;
      }

      const cmd = message.slice(COMMAND_PREFIX.length).trim().toLowerCase();
      if (cmd === 'ping') await sendMessage(sender, 'Pong!');
      else if (cmd === 'help') await sendMessage(sender, 'Commands:/ping/help');
      else await sendMessage(sender, 'Unknown command');
    
    res.sendStatus(200);
   else 
    res.sendStatus(404);
  );

async function sendMessage(recipientId, text) 
  try 
    await axios.post(`https://graph.facebook.com/v13.0/me/messages?access_token={PAGE_ACCESS_TOKEN}`, {
      messaging_type: 'RESPONSE',
      recipient: { id: recipientId },
      message: { text }
    });
  } catch (err) {
    console.error('Send Error:', err.response?.data || err.message);
  }
}

const PORT = 3000;
app.listen(PORT, () => console.log(`Bot panel live at http://localhost:${PORT}`));

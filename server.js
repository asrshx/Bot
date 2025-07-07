const fs = require('fs');
const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const fca = require('ws3-fca');

const app = express();
const PORT = 3000;

// Middleware & session
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
  secret: 'darkstar-secret-key',
  resave: false,
  saveUninitialized: true
}));

// Data store files & variables
let botConfig = {};
let lockedGroups = {};
let lockedNicknames = {};
let bannedUsers = [];
let groupRules = {};
let mutedGroups = new Set();
let startTime = Date.now();

// Load persistent data
function loadData() {
  try {
    lockedGroups = JSON.parse(fs.readFileSync('groupLocks.json', 'utf8'));
    lockedNicknames = JSON.parse(fs.readFileSync('nicknameLocks.json', 'utf8'));
    bannedUsers = JSON.parse(fs.readFileSync('bannedUsers.json', 'utf8'));
    groupRules = JSON.parse(fs.readFileSync('groupRules.json', 'utf8'));
    botConfig = JSON.parse(fs.readFileSync('botConfig.json', 'utf8'));
  } catch {
    // ignore missing or corrupt files
  }
}

// Save persistent data
function saveData() {
  fs.writeFileSync('groupLocks.json', JSON.stringify(lockedGroups, null, 2));
  fs.writeFileSync('nicknameLocks.json', JSON.stringify(lockedNicknames, null, 2));
  fs.writeFileSync('bannedUsers.json', JSON.stringify(bannedUsers, null, 2));
  fs.writeFileSync('groupRules.json', JSON.stringify(groupRules, null, 2));
  fs.writeFileSync('botConfig.json', JSON.stringify(botConfig, null, 2));

// Main dashboard
app.get('/', checkAuth, (req, res) => {
  const lockDisplay = Object.entries(lockedGroups).map(([id, name]) => `<b>Group ${id}:</b> ${name}`).join('<br>') || 'None';
  const nickDisplay = Object.entries(lockedNicknames).map(([id, name]) => `<b>Thread ${id}:</b> ${name}`).join('<br>') || 'None';
  const rulesDisplay = Object.entries(groupRules).map(([id, rules]) => `<b>Group ${id} Rules:</b> ${rules}`).join('<br>') || 'None';
  const muteDisplay = [...mutedGroups].map(id => `<b>Muted Group:</b> ${id}`).join('<br>') || 'None';
  const uptime = Math.floor((Date.now() - startTime) / 1000);

  res.send(`
  <html><head><title>HENRY-X BOT PANEL</title>
  <style>
    body {background:#000;color:#0ff;font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;padding:20px;max-width:700px;margin:auto;}
    h1 {color:#f06;text-align:center;text-shadow:0 0 10px #f06;}
    form input, form textarea {
      width: 95%; padding: 10px; margin: 10px 0; border-radius: 8px; border: 2px solid #0ff;
      background: #111; color: #0ff; font-size: 16px; font-family: monospace; resize: vertical;
    }
    button {
      padding: 12px 30px; background: #f06; border: none; color: white; border-radius: 10px;
      cursor: pointer; font-size: 18px; margin-top: 10px; box-shadow: 0 0 12px #f06aa;
      transition: background-color 0.3s ease;
    }
    button:hover { background: #f39; }
    .box {
      border: 2px solid #0ff; padding: 15px 20px; margin: 15px 0; border-radius: 12px;
      background: #111; box-shadow: 0 0 15px #00ffffaa;
    }
    footer {text-align:center;color:#555;margin-top:40px;font-size:14px;}
    a.stop-btn {
      display:inline-block; margin-top:15px; padding:10px 25px; background:#aa0000;
      border-radius:10px; text-decoration:none; color:white; font-weight:bold;
      box-shadow: 0 0 10px #aa0000aa; transition: background-color 0.3s ease;
    }
    a.stop-btn:hover {background:#ff0000;}
  </style>
  </head><body>
    <h1>🔥 HENRY-X PANEL 🔥</h1>
    <form method="POST" action="/configure">
      <div class="box">
        <label><b>Admin Facebook ID:</b></label><br>
        <input name="adminID" placeholder="Admin Facebook ID" value="${botConfig.adminID || ''}" required>
      </div>
      <div class="box">
        <label><b>Command Prefix:</b></label><br>
        <input name="prefix" placeholder="Command Prefix" maxlength="3" value="${botConfig.prefix || '!'}" required>
      </div>
      <div class="box">
        <label><b>Appstate JSON Array:</b></label><br>
        <textarea name="appstate" rows="10" placeholder="Paste your appstate JSON array here..." required></textarea>
      </div>
      <button type="submit"> Submit / Restart Bot</button>
    </form>

    <div class="box">
      <h3>🔐 Current Locks & Status</h3>
      <b>Group Name Locks:</b><br>${lockDisplay}<br><br>
      <b>Nickname Locks:</b><br>${nickDisplay}<br><br>
      <b>Group Rules:</b><br>${rulesDisplay}<br><br>
      <b>Muted Groups:</b><br>${muteDisplay}<br><br>
      <b>Bot Uptime:</b> ${uptime} seconds
      <br><br>
      <a href="/stop" class="stop-btn">🛑 Stop Bot</a>
    </div>
    <footer>😈 Made by Henry Dwn</footer>
  </body></html>`);
});

// Configure bot & start
app.post('/configure', checkAuth, (req, res) => {
  const { adminID, prefix, appstate } = req.body;
  try {
    const parsed = JSON.parse(appstate);
    if (!Array.isArray(parsed)) throw new Error('Appstate must be an array');

    botConfig = { adminID, prefix };
    saveData();
    fs.writeFileSync('appstate.json', JSON.stringify(parsed, null, 2));
    startBot();

    res.send('<h2 style="color:lime;text-align:center;">✅ Bot started/restarted. Check your console logs.<br><a href="/">Go Back</a></h2>');
  } catch (e) {
    res.send(`<h2 style="color:red;text-align:center;">❌ Invalid appstate JSON: ${e.message}<br><a href="/">Go Back</a></h2>`);
  }
});

// Stop bot
app.get('/stop', checkAuth, (req, res) => {
  res.send('<h2 style="color:#f00;text-align:center;">🔴 Stopping bot...</h2>');
  process.exit(0);
});

function sendWelcome(api, threadID, userID) {
  const msg = `👋 Welcome to the group, @${userID}! Please read the rules and enjoy!`;
  api.sendMessage(msg, threadID, err => { if (err) console.error('Welcome message error:', err); });
}

function lockAllNicknames(api, threadID, lockedNick) {
  api.getThreadInfo(threadID, (err, info) => {
    if (err || !info || !info.participantIDs) return;
    info.participantIDs.forEach(userID => {
      api.changeNickname(lockedNick, threadID, userID, err => {
        if (err) console.error(`Nickname set failed for ${userID}:`, err);
        else console.log(`Nickname set for ${userID}`);
      });
    });
  });
}

let apiInstance = null;

function startBot() {
  if (apiInstance) {
    try { apiInstance.logout(); } catch {}
  }

  let appState;
  try {
    appState = JSON.parse(fs.readFileSync('appstate.json', 'utf8'));
  } catch (e) {
    return console.error('❌ Failed to load appstate.json:', e.message);
  }

  fca.login(appState, (err, api) => {
    if (err) return console.error('❌ Login failed:', err);

    apiInstance = api;
    api.setOptions({ listenEvents: true });

    api.getUserInfo(api.getCurrentUserID(), (err, info) => {
      if (!err && info) {
        console.log(`🤖 Logged in as: ${info[api.getCurrentUserID()].name}`);
      }
    });

    api.listenMqtt(async (err, event) => {
      if (err) return console.error('❌ Listen error:', err);

      const threadID = event.threadID;
      const senderID = event.senderID;

      if (bannedUsers.includes(senderID)) return;

      if (event.type === 'message' && event.body) {
        const msg = event.body.trim();

        if (mutedGroups.has(threadID) && senderID !== botConfig.adminID) return;

        if (msg.startsWith(botConfig.prefix)) {
          const args = msg.slice(botConfig.prefix.length).trim().split(/\s+/);
          const command = args[0].toLowerCase();

          const isAdmin = senderID === botConfig.adminID;

          switch (command) {
            case 'ping':
              api.sendMessage('✅ Pong!', threadID);
              break;
            case 'uptime':
              const uptimeSec = Math.floor((Date.now() - startTime) / 1000);
              api.sendMessage(`⏱️ Bot uptime: ${uptimeSec} seconds`, threadID);
              break;
            case 'help':
              api.sendMessage(
                `🔧 Commands:
${botConfig.prefix}ping
${botConfig.prefix}uptime
${botConfig.prefix}help
${botConfig.prefix}nicknamelock on <name>
${botConfig.prefix}nicknamelock off
${botConfig.prefix}grouplock on <name>
${botConfig.prefix}grouplock off
${botConfig.prefix}ban <userID>
${botConfig.prefix}unban <userID>
${botConfig.prefix}mute on/off
${botConfig.prefix}rules <text>
${botConfig.prefix}showrules`,
                threadID
              );
              break;
            case 'nicknamelock':
              if (!isAdmin) return api.sendMessage('🤔 Me Kyu Sunu Tumhari Bat Me Sirf Apne Owner Ki Bat Sunuga.', threadID);
              if (args[1] === 'on') {
                const nickName = args.slice(2).join(' ');
                if (!nickName) return api.sendMessage('⚠️ Usage: nicknamelock on <nickname>', threadID);
                lockedNicknames[threadID] = nickName;
                saveData();
                lockAllNicknames(api, threadID, nickName);
                api.sendMessage(`✅ Nickname lock enabled Me Nickname Lock Kr Rha Or Mere Owner Ke Hater Ki Maka Bhosda bye: "${nickName}"`, threadID);
              } else if (args[1] === 'off') {
                if (lockedNicknames[threadID]) {
                  delete lockedNicknames[threadID];
                  saveData();
                  api.sendMessage('✅ Nickname lock disabled Shukar Manao Mere Owner Ne Desable Kr Diya Nickname Ko Warna Group Ki Gand Mar Deta Mai 🙂.', threadID);
                } else {
                  api.sendMessage('ℹ️ Nickname lock already off.', threadID);
                }
              } else {
                api.sendMessage('⚠️ Usage: nicknamelock on/off <nickname>', threadID);
              }
              break;
            case 'grouplock':
              if (!isAdmin) return api.sendMessage('🤔 Me Kyu Sunu Tumhari Bat Me Sirf Apne Owner Ki Bat Sunuga. ', threadID);
              if (args[1] === 'on') {
                const groupName = args.slice(2).join(' ');
                if (!groupName) return api.sendMessage('⚠️ Usage: grouplock on <name>', threadID);
                lockedGroups[threadID] = groupName;
                saveData();
                api.setTitle(groupName, threadID, err => {
                  if (err) api.sendMessage('❌ Failed to set group name.', threadID);
                  else api.sendMessage(`✅ Group name locked as "${groupName}"`, threadID);
                });
              } else if (args[1] === 'off') {
                if (lockedGroups[threadID]) {
                  delete lockedGroups[threadID];
                  saveData();
                  api.sendMessage('✅ Group name lock disabled.', threadID);
                } else {
                  api.sendMessage('ℹ️ Group name lock already off.', threadID);
                }
              } else {
                api.sendMessage('⚠️ Usage: grouplock on/off <name>', threadID);
              }
              break;
            case 'ban':
              if (!isAdmin) return api.sendMessage('🤔 Me Kyu Sunu Tumhari Bat Me Sirf Apne Owner Ki Bat Sunuga.', threadID);
              if (!args[1]) return api.sendMessage('⚠️ Usage: ban <userID>', threadID);
              if (!bannedUsers.includes(args[1])) {
                bannedUsers.push(args[1]);
                saveData();
                api.sendMessage(`🚫 User ${args[1]} banned Banned Kr Diya Bkl Ko Bahut Use Krta Tha Bot.`, threadID);
              } else {
                api.sendMessage('ℹ️ User already banned.', threadID);
              }
              break;
            case 'unban':
              if (!isAdmin) return api.sendMessage('🤔 Me Kyu Sunu Tumhari Bat Me Sirf Apne Owner Ki Bat Sunuga.', threadID);
              if (!args[1]) return api.sendMessage('⚠️ Usage: unban <userID>', threadID);
              const idx = bannedUsers.indexOf(args[1]);
              if (idx > -1) {
                bannedUsers.splice(idx, 1);
                saveData();
                api.sendMessage(`✅ User ${args[1]} unbanned.`, threadID);
              } else {
                api.sendMessage('ℹ️ User not found in ban list.', threadID);
              }
              break;
            case 'mute':
              if (!isAdmin) return api.sendMessage('🤔 Me Kyu Sunu Tumhari Bat Me Sirf Apne Owner Ki Bat Sunuga.', threadID);
              if (args[1] === 'on') {
                mutedGroups.add(threadID);
                api.sendMessage('🔇 Group muted.', threadID);
              } else if (args[1] === 'off') {
                mutedGroups.delete(threadID);
                api.sendMessage('🔈 Group unmuted.', threadID);
              } else {
                api.sendMessage('⚠️ Usage: mute on/off', threadID);
              }
              break;
            case 'rules':
              if (!isAdmin) return api.sendMessage('🤔 Me Kyu Sunu Tumhari Bat Me Sirf Apne Owner Ki Bat Sunuga.', threadID);
              if (args.length < 2) return api.sendMessage('⚠️ Usage: rules <text>', threadID);
              const ruleText = args.slice(1).join(' ');
              groupRules[threadID] = ruleText;
              saveData();
              api.sendMessage('✅ Group rules updated.', threadID);
              break;
            case 'showrules':
              if (groupRules[threadID]) {
                api.sendMessage(`📜 Group Rules:\n${groupRules[threadID]}`, threadID);
              } else {
                api.sendMessage('ℹ️ No rules set for this group.', threadID);
              }
              break;
            default:
              api.sendMessage(`❓ Unknown command. Use ${botConfig.prefix}help for help.`, threadID);
          }
        }
      }

      // Enforce locked group name
      if (event.logMessageType === 'log:thread-name') {
        const lockedName = lockedGroups[event.threadID];
        if (lockedName && event.logMessageData.name !== lockedName) {
          api.setTitle(lockedName, event.threadID, err => {
            if (!err) api.sendMessage(`🔐 Group name lock active. Resetting name to "${lockedName}".`, event.threadID);
          });
        }
      }

      // Enforce locked nickname
      if (event.logMessageType === 'log:thread-nickname') {
        const lockedNick = lockedNicknames[event.threadID];
        const userID = event.logMessageData.participant_id;
        const changerID = event.author;
        if (lockedNick && changerID !== botConfig.adminID) {
          api.changeNickname(lockedNick, event.threadID, userID, err => {
            if (!err) api.sendMessage(`🔐 Nickname lock active. Resetting nickname of user to "${lockedNick}".`, event.threadID);
          });
        }
      }

      // Welcome new participant
      if (event.logMessageType === 'log:subscribe') {
        sendWelcome(api, event.threadID, event.logMessageData.addedParticipants[0]);
      }
    });
  });
}

loadData();

app.listen(PORT, () => {
  console.log(`😈 HENRY BOT running at http://localhost:${PORT}`);
});

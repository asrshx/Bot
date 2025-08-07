const express = require('express');
const bodyParser = require('body-parser');
const { login } = require('ws3-fca');

const app = express();
const port = 5000;

app.use(bodyParser.urlencoded({ extended: true }));

let api = null;
const lockedGroups = {};
const lockedNicknames = {};
const lockedDPs = {};
const lockedThemes = {};
const lockedEmojis = {};

const htmlTemplate = (botRunning, error = null) => \`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>WhatsApp Bot Control</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      background-color: #f5f5f5;
    }
    .container {
      background-color: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    h1 {
      color: #333;
      text-align: center;
    }
    .form-group {
      margin-bottom: 15px;
    }
    label {
      display: block;
      margin-bottom: 5px;
      font-weight: bold;
    }
    input, textarea {
      width: 100%;
      padding: 8px;
      border: 1px solid #ddd;
      border-radius: 4px;
      box-sizing: border-box;
    }
    textarea {
      height: 150px;
      font-family: monospace;
    }
    button {
      background-color: #4CAF50;
      color: white;
      padding: 10px 15px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 16px;
    }
    button:hover {
      background-color: #45a049;
    }
    .status {
      margin-top: 20px;
      padding: 10px;
      border-radius: 4px;
    }
    .success {
      background-color: #dff0d8;
      color: #3c763d;
    }
    .error {
      background-color: #f2dede;
      color: #a94442;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🚀 WhatsApp Bot Control Panel</h1>
    \${botRunning ? \`
      <div class="status success">✅ Bot is running and listening for commands...</div>
    \` : \`
      <form action="/start-bot" method="POST">
        \${error ? \`<div class="error">\${error}</div>\` : ''}
        <div class="form-group">
          <label for="appstate">🔑 Paste your appstate.json content:</label>
          <textarea id="appstate" name="appstate" required></textarea>
        </div>
        <div class="form-group">
          <label for="prefix">✏ Enter the prefix for commands (e.g., !):</label>
          <input type="text" id="prefix" name="prefix" required>
        </div>
        <div class="form-group">
          <label for="adminID">👑 Enter your Admin ID:</label>
          <input type="text" id="adminID" name="adminID" required>
        </div>
        <button type="submit">Start Bot</button>
      </form>
    \`}
  </div>
</body>
</html>\`;

app.get('/', (req, res) => {
  res.send(htmlTemplate(api !== null));
});

app.post('/start-bot', async (req, res) => {
  try {
    const { appstate, prefix, adminID } = req.body;
    if (!appstate || !prefix || !adminID) {
      return res.send(htmlTemplate(false, '❌ All fields are required!'));
    }
    let appState;
    try {
      appState = JSON.parse(appstate);
      if (!Array.isArray(appState)) throw new Error();
    } catch {
      return res.send(htmlTemplate(false, '❌ Invalid AppState format. Must be valid JSON array.'));
    }

    try {
      const loggedInApi = await login({ appState });
      api = loggedInApi;
      api.setOptions({ listenEvents: true });
      setupBotListeners(api, prefix, adminID);
      res.send(htmlTemplate(true));
    } catch (err) {
      return res.send(htmlTemplate(false, '❌ Login failed. Check your AppState and try again.'));
    }
  } catch {
    res.send(htmlTemplate(false, '❌ An error occurred while starting the bot.'));
  }
});

function setupBotListeners(api, prefix, adminID) {
  api.listenMqtt((err, event) => {
    if (err) return;

    const senderID = event.senderID;
    if (event.type === 'message' && event.body.startsWith(prefix)) {
      const args = event.body.slice(prefix.length).trim().split(' ');
      const command = args[0].toLowerCase();
      const input = args.slice(1).join(' ');
      if (senderID !== adminID) return api.sendMessage('❌ You are not authorized.', event.threadID);
      handleCommand(api, command, args, input, event);
    }
    if (event.logMessageType) {
      handleEventReverts(api, event);
    }
  });
}

function handleCommand(api, command, args, input, event) {
  switch (command) {
    case 'grouplockname':
      if (args[1] === 'on') {
        const groupName = input.replace('on', '').trim();
        lockedGroups[event.threadID] = groupName;
        api.setTitle(groupName, event.threadID, (err) => {
          if (err) return api.sendMessage('❌ Failed.', event.threadID);
          api.sendMessage(`✅ Group name locked as: ${groupName}`, event.threadID);
        });
      }
      break;
    case 'nicknamelock':
      if (args[1] === 'on') {
        const nickname = input.replace('on', '').trim();
        api.getThreadInfo(event.threadID, (err, info) => {
          if (err) return;
          lockedNicknames[event.threadID] = nickname;
          info.participantIDs.forEach((userID) => changeNicknameSafe(nickname, event.threadID, userID));
          api.sendMessage(`✅ Nicknames locked as: ${nickname}`, event.threadID);
        });
      }
      break;
    case 'groupdplock':
      if (args[1] === 'on') {
        lockedDPs[event.threadID] = true;
        api.sendMessage('✅ Group DP locked.', event.threadID);
      }
      break;
    case 'groupthemeslock':
      if (args[1] === 'on') {
        lockedThemes[event.threadID] = true;
        api.sendMessage('✅ Group theme locked.', event.threadID);
      }
      break;
    case 'groupemojilock':
      if (args[1] === 'on') {
        lockedEmojis[event.threadID] = true;
        api.sendMessage('✅ Group emoji locked.', event.threadID);
      }
      break;
    case 'tid':
      api.sendMessage(`📌 Group UID: ${event.threadID}`, event.threadID);
      break;
    case 'uid':
      api.sendMessage(`🧍 Your UID: ${event.senderID}`, event.threadID);
      break;
    case 'fyt':
      if (args[1] === 'on') api.sendMessage('🔥 Fight mode activated!', event.threadID);
      break;
  }
}

function handleEventReverts(api, event) {
  const threadID = event.threadID;
  switch (event.logMessageType) {
    case 'log:thread-name':
      if (lockedGroups[threadID]) {
        api.setTitle(lockedGroups[threadID], threadID, () => {
          api.sendMessage('❌ Group name change reverted.', threadID);
        });
      }
      break;
    case 'log:thread-nickname':
      if (lockedNicknames[threadID]) {
        const affectedUserID = event.logMessageData.participant_id;
        changeNicknameSafe(lockedNicknames[threadID], threadID, affectedUserID).then(() => {
          api.sendMessage('❌ Nickname change reverted.', threadID);
        });
      }
      break;
    case 'log:thread-icon':
      if (lockedEmojis[threadID]) {
        api.changeThreadEmoji('😀', threadID, () => {
          api.sendMessage('❌ Emoji change reverted.', threadID);
        });
      }
      break;
    case 'log:thread-theme':
      if (lockedThemes[threadID]) {
        api.sendMessage('❌ Theme change is locked. Please revert manually.', threadID);
      }
      break;
    case 'log:thread-image':
      if (lockedDPs[threadID]) {
        api.sendMessage('❌ Group DP change is locked. Please revert manually.', threadID);
      }
      break;
  }
}

async function changeNicknameSafe(nickname, threadID, userID) {
  if (!api) return;
  try {
    await api.changeNickname(nickname, threadID, userID);
  } catch (err) {
    console.error(`❌ Nickname error:`, err);
  }
}

app.listen(port, () => {
  console.log(\`🚀 Server running at http://localhost:\${port}\`);
});d to set group name.', threadID);
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
              if (!isAdmin) return api.sendMessage('❌ Sirf admin use kar sakta hai.', threadID);
              if (!args[1]) return api.sendMessage('⚠️ Usage: ban <userID>', threadID);
              if (!bannedUsers.includes(args[1])) {
                bannedUsers.push(args[1]);
                saveData();
                api.sendMessage(`🚫 User ${args[1]} banned.`, threadID);
              } else {
                api.sendMessage('ℹ️ User already banned.', threadID);
              }
              break;
            case 'unban':
              if (!isAdmin) return api.sendMessage('❌ Sirf admin use kar sakta hai.', threadID);
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
              if (!isAdmin) return api.sendMessage('❌ Sirf admin use kar sakta hai.', threadID);
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
              if (!isAdmin) return api.sendMessage('❌ Sirf admin use kar sakta hai.', threadID);
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
  console.log(`🚀 DARKSTAR TOOL running at http://localhost:${PORT}`);
});

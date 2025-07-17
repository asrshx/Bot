const fs = require('fs');
const login = require('ws3-fca');
const moment = require('moment');

// === FILE PATHS ===
const appState = require('./appstate.json');
const PREFIX = fs.readFileSync('./prefix.txt', 'utf-8').trim();
const ADMIN_UID = fs.readFileSync('./admin_id.txt', 'utf-8').trim();
const nameLockFile = './locked_threads.json';
const nickLockFile = './locked_nicks.json';

// === LOAD DATA ===
let lockedNames = fs.existsSync(nameLockFile) ? JSON.parse(fs.readFileSync(nameLockFile)) : {};
let lockedNicknames = fs.existsSync(nickLockFile) ? JSON.parse(fs.readFileSync(nickLockFile)) : {};

// === GLOBAL HANDLER ===
process.on('unhandledRejection', console.error);
process.on('uncaughtException', console.error);

// === LOGIN ===
login({ appState }, (err, api) => {
  if (err) return console.error("âŒ Login failed:", err);
  console.log("âœ… MafiaBot started");

  api.setOptions({ listenEvents: true });

  api.listenMqtt(async (err, event) => {
    if (err || !event) return;

    const { threadID, senderID, type } = event;
    const body = event.body || '';
    const lower = body.toLowerCase();

    // === COMMAND HANDLING === (Admin Only)
    if (type === 'message' && senderID === ADMIN_UID) {
      // === GROUP NAME LOCK ON ===
      if (lower.startsWith(`${PREFIX}groupnamelock on`)) {
        const name = body.slice(`${PREFIX}groupnamelock on`.length).trim();
        if (!name) return;
        try {
          await api.setTitle(name, threadID);
          lockedNames[threadID] = {
            name,
            by: ADMIN_UID,
            time: moment().format("YYYY-MM-DD HH:mm:ss")
          };
          fs.writeFileSync(nameLockFile, JSON.stringify(lockedNames, null, 2));
          api.sendMessage(` âœ…GC name locked to "${name}" successfully.ðŸ”’`, threadID);
        } catch (e) {
          api.sendMessage(`âŒ Failed to lock name: ${e.message}`, threadID);
        }
      }

      // === GROUP NAME LOCK OFF ===
      if (lower === `${PREFIX}groupnamelock off`) {
        if (lockedNames[threadID]) {
          delete lockedNames[threadID];
          fs.writeFileSync(nameLockFile, JSON.stringify(lockedNames, null, 2));
          api.sendMessage(`ðŸ”“ Group name lock removed.`, threadID);
        } else {
          api.sendMessage(`âš ï¸ No group name lock is active.`, threadID);
        }
      }

      // === NICKNAME LOCK ON ===
      if (lower.startsWith(`${PREFIX}nicknamelock on`)) {
        const nickname = body.slice(`${PREFIX}nicknamelock on`.length).trim();
        if (!nickname) return api.sendMessage(`âŒ Usage:\n${PREFIX}nicknamelock on <nickname>`, threadID);

        api.getThreadInfo(threadID, async (err, info) => {
          if (err) return api.sendMessage("âŒ Failed to get members.", threadID);
          const members = info.participantIDs;

          lockedNicknames[threadID] = {
            nick: nickname,
            users: {},
            by: ADMIN_UID,
            time: moment().format("YYYY-MM-DD HH:mm:ss")
          };

          for (const uid of members) {
            try {
              await api.changeNickname(nickname, threadID, uid);
              lockedNicknames[threadID].users[uid] = nickname;
              await new Promise(r => setTimeout(r, 3000));
            } catch {}
          }

          fs.writeFileSync(nickLockFile, JSON.stringify(lockedNicknames, null, 2));
          api.sendMessage(`ðŸ”’ All nicknames locked to "${nickname}" successfully.`, threadID);
        });
      }

      // === NICKNAME LOCK OFF ===
      if (lower === `${PREFIX}nicknamelock off`) {
        if (lockedNicknames[threadID]) {
          delete lockedNicknames[threadID];
          fs.writeFileSync(nickLockFile, JSON.stringify(lockedNicknames, null, 2));
          api.sendMessage("ðŸ”“ Nickname lock removed.", threadID);
        } else {
          api.sendMessage("âš ï¸ No nickname lock is active.", threadID);
        }
      }
    }

    // === AUTO REVERT (Silent) ===
    if (type === 'event') {
      // === GC NAME CHANGE DETECTED
      if (event.logMessageType === 'log:thread-name') {
        const newName = event.logMessageData.name;
        const lock = lockedNames[threadID];
        if (lock && newName !== lock.name) {
          setTimeout(() => {
            api.setTitle(lock.name, threadID).catch(() => {});
          }, 3000);
        }
      }

      // === NICKNAME CHANGE DETECTED
      if (event.logMessageType === 'log:user-nickname') {
        const uid = event.logMessageData.participant_id;
        const newNick = event.logMessageData.nickname;
        const lock = lockedNicknames[threadID];
        const expected = lock?.users?.[uid];
        if (expected && newNick !== expected) {
          setTimeout(() => {
            api.changeNickname(expected, threadID, uid).catch(() => {});
          }, 3000);
        }
      }
    }
  });
});

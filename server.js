"use strict";

const express = require("express");
const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs/promises");
const crypto = require("node:crypto");
const { Server } = require("socket.io");
const LudoRules = require("./public/ludo-rules.js");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: false } });
const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.DATA_DIR || (process.env.VERCEL ? path.join("/tmp", "brain-arena-data") : path.join(__dirname, "data"));
const SOCIAL_FILE = path.join(DATA_DIR, "social.json");
const MESSAGES_FILE = path.join(DATA_DIR, "messages.json");
const LEADERBOARD_FILE = path.join(DATA_DIR, "leaderboard.json");
const TOTAL_ROUNDS = 5;
const GAMES = ["math", "memory", "reaction", "puzzle", "word", "color", "typing", "higher", "odd", "simon", "pattern", "gk", "challenge"];
const CHALLENGE_GAMES = ["math", "puzzle", "memory", "reaction", "word"];
const SCORE_LIMITS = { math: 200, memory: 60, reaction: 1000, puzzle: 100, word: 200, color: 200, typing: 300, higher: 100, odd: 100, simon: 60, pattern: 60, gk: 100, challenge: 5, ludo: 4 };
const rooms = new Map();
const ludoRooms = new Map();
const socketsByPlayer = new Map();
const sendLimits = new Map();
const leaderboardLimits = new Map();
let social = { profiles: {}, requests: [], blocks: [] };
let messageStore = { conversations: {} };
let leaderboard = [];
let writeChain = Promise.resolve();
let dataInitPromise = null;

app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws: wss:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
  next();
});
// Vercel may invoke this module without running the local start() function.
// Load persisted JSON once per function instance before HTTP or Socket.IO handlers run.
app.use((req, res, next) => {
  initData().then(() => next(), next);
});
io.use((socket, next) => {
  initData().then(() => next(), next);
});
app.use(express.json({ limit: "32kb" }));
app.use(express.static(path.join(__dirname, "public"), {
  etag: true,
  setHeaders(res, filePath) {
    if (/\.(?:html|js|css)$/.test(filePath)) res.setHeader("Cache-Control", "no-cache, must-revalidate");
    else res.setHeader("Cache-Control", "public, max-age=3600");
  }
}));
app.get("/api/health", (_req, res) => res.json({ ok: true, service: "brain-arena" }));
// Random general-knowledge questions come from Open Trivia Database (no API key required).
app.get("/api/quiz/gk", async (_req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    const response = await fetch("https://opentdb.com/api.php?amount=1&category=9&type=multiple", { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error("Trivia provider unavailable");
    const payload = await response.json();
    const item = payload.results?.[0];
    if (!item) throw new Error("No question returned");
    const decode = (value) => String(value).replace(/&quot;/g, '"').replace(/&#039;|&#39;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
    res.json({ ok: true, question: decode(item.question), answer: decode(item.correct_answer), choices: [...item.incorrect_answers, item.correct_answer].map(decode).sort(() => Math.random() - 0.5), category: decode(item.category) });
  } catch (_error) { res.status(503).json({ ok: false, message: "Random GK questions are temporarily unavailable. Check your internet connection and try again." }); }
});
app.get("/api/leaderboard", (req, res) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  const game = String(req.query.game || "all");
  const rows = leaderboard.filter((entry) => game === "all" || entry.game === game)
    .sort((a, b) => b.score - a.score || new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 100);
  res.json({ ok: true, entries: rows, updatedAt: new Date().toISOString() });
});
app.post("/api/leaderboard", async (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  if (!rateLimit(leaderboardLimits, ip, 10, 60_000)) return res.status(429).json({ ok: false, message: "Too many score submissions. Try again in a minute." });
  const game = String(req.body?.game || "");
  const score = Number(req.body?.score);
  const name = cleanName(req.body?.name);
  const playerId = cleanPlayerId(req.body?.playerId);
  if (!playerId || !Object.hasOwn(SCORE_LIMITS, game) || !Number.isFinite(score) || score < 0 || score > SCORE_LIMITS[game]) {
    return res.status(400).json({ ok: false, message: "Invalid player, game or score." });
  }
  const entry = { id: crypto.randomUUID(), playerId, name, game, score: Math.floor(score), createdAt: new Date().toISOString() };
  leaderboard.push(entry);
  leaderboard = leaderboard.sort((a, b) => b.score - a.score).slice(0, 1000);
  try { await persist(LEADERBOARD_FILE, leaderboard); res.status(201).json({ ok: true, entry }); }
  catch (error) { console.error("Leaderboard persistence failed", error); res.status(500).json({ ok: false, message: "Could not save score." }); }
});

function rateLimit(map, key, max, windowMs) {
  const now = Date.now();
  const recent = (map.get(key) || []).filter((time) => now - time < windowMs);
  if (recent.length >= max) { map.set(key, recent); return false; }
  recent.push(now); map.set(key, recent); return true;
}
function cleanName(value) { return String(value || "Player").replace(/[<>\u0000-\u001f]/g, "").trim().slice(0, 20) || "Player"; }
function cleanText(value, max = 240) { return String(value ?? "").replace(/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max); }
function cleanPlayerId(value) { const id = String(value || ""); return /^[a-zA-Z0-9_-]{12,80}$/.test(id) ? id : ""; }
function createCode(length = 5, taken = () => false) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;
  do { code = Array.from({ length }, () => alphabet[crypto.randomInt(alphabet.length)]).join(""); } while (taken(code));
  return code;
}
function publicProfile(profile, includeCode = true) {
  if (!profile) return null;
  return { name: profile.name, avatar: profile.avatar, bio: profile.bio, ...(includeCode ? { code: profile.code } : {}), online: Boolean(profile.onlinePreference && isPlayerOnline(profile.id)), status: profile.onlinePreference ? "online" : "offline" };
}
function isPlayerOnline(playerId) { return (socketsByPlayer.get(playerId)?.size || 0) > 0; }
function getProfileByCode(code) { const normalized = String(code || "").trim().toUpperCase(); return Object.values(social.profiles).find((profile) => profile.code === normalized) || null; }
function getSocketSet(playerId) { let set = socketsByPlayer.get(playerId); if (!set) { set = new Set(); socketsByPlayer.set(playerId, set); } return set; }
function emitPlayer(playerId, event, payload) { for (const socketId of socketsByPlayer.get(playerId) || []) io.to(socketId).emit(event, payload); }
function conversationKey(a, b) { return [a, b].sort().join("::"); }
function areFriends(a, b) { return Boolean(social.profiles[a]?.friends?.includes(b) && social.profiles[b]?.friends?.includes(a)); }
function isBlocked(a, b) { return social.blocks.some((block) => (block.from === a && block.to === b) || (block.from === b && block.to === a)); }
function sanitizeMessage(message) {
  return {
    id: message.id,
    senderId: message.senderId,
    senderName: message.senderName,
    text: message.deleted ? "message deleted" : message.text,
    createdAt: message.createdAt,
    edited: Boolean(message.edited),
    deleted: Boolean(message.deleted),
    ...(message.roomCode ? { roomCode: message.roomCode } : {})
  };
}
async function persist(file, data) {
  const task = writeChain.then(async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const temp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(temp, JSON.stringify(data, null, 2), "utf8");
    await fs.rename(temp, file);
  });
  writeChain = task.catch(() => {});
  return task;
}
async function loadJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); }
  catch (error) { if (error.code !== "ENOENT") console.warn(`Could not load ${path.basename(file)}; starting with empty data.`, error.message); return fallback; }
}
function initData() {
  if (dataInitPromise) return dataInitPromise;
  dataInitPromise = (async () => {
  await fs.mkdir(DATA_DIR, { recursive: true });
  social = await loadJson(SOCIAL_FILE, { profiles: {}, requests: [], blocks: [] });
  social.profiles ||= {}; social.requests ||= []; social.blocks ||= [];
  for (const [id, profile] of Object.entries(social.profiles)) {
    profile.id ||= id; profile.friends ||= []; profile.blocked ||= []; profile.onlinePreference = profile.onlinePreference !== false;
  }
  messageStore = await loadJson(MESSAGES_FILE, { conversations: {} });
  messageStore.conversations ||= {};
  for (const messages of Object.values(messageStore.conversations)) {
    if (!Array.isArray(messages)) continue;
    for (const message of messages) {
      message.readBy ||= [];
      message.id ||= crypto.randomUUID();
      message.deleted = Boolean(message.deleted);
      message.edited = Boolean(message.edited);
    }
  }
  leaderboard = await loadJson(LEADERBOARD_FILE, []); if (!Array.isArray(leaderboard)) leaderboard = [];
  })();
  return dataInitPromise;
}
function profilePayload(profile) {
  return { ...publicProfile(profile), id: profile.id, friends: (profile.friends || []).map((id) => publicProfile(social.profiles[id])).filter(Boolean), requests: social.requests.filter((r) => r.from === profile.id || r.to === profile.id).map((r) => ({ id: r.id, direction: r.to === profile.id ? "incoming" : "outgoing", createdAt: r.createdAt, person: publicProfile(social.profiles[r.to === profile.id ? r.from : r.to]) })), blocked: (profile.blocked || []).map((id) => publicProfile(social.profiles[id])).filter(Boolean), conversations: buildConversationSummaries(profile.id) };
}
function buildConversationSummaries(playerId) {
  const profile = social.profiles[playerId]; if (!profile) return [];
  return (profile.friends || []).map((friendId) => {
    const messages = messageStore.conversations[conversationKey(playerId, friendId)] || [];
    const friend = social.profiles[friendId];
    const unread = messages.filter((m) => m.senderId === friendId && !(m.readBy || []).includes(playerId) && !m.deleted).length;
    const last = messages[messages.length - 1];
    return { person: publicProfile(friend), code: friend?.code, lastMessage: last ? (last.deleted ? "message deleted" : last.text) : "Start a conversation", lastAt: last?.createdAt || null, unread };
  }).filter((item) => item.person).sort((a, b) => (b.lastAt || "").localeCompare(a.lastAt || ""));
}
function ensureProfile(playerId, data = {}) {
  let profile = social.profiles[playerId];
  if (!profile) {
    let code = createCode(8, (candidate) => Object.values(social.profiles).some((p) => p.code === candidate));
    profile = social.profiles[playerId] = { id: playerId, code, name: cleanName(data.name), avatar: cleanText(data.avatar || "✦", 8), bio: cleanText(data.bio || "Ready for a new challenge.", 120), friends: [], blocked: [], onlinePreference: true, createdAt: new Date().toISOString() };
  } else {
    if (data.name) profile.name = cleanName(data.name);
    if (data.avatar) profile.avatar = cleanText(data.avatar, 8);
    profile.friends ||= []; profile.blocked ||= [];
  }
  return profile;
}
function isRoomMember(socket, code) { return socket.data.roomCode === code && rooms.get(code)?.players.some((p) => p.id === socket.id); }
function getRoomForSocket(socket) { const code = socket.data.roomCode; return code ? rooms.get(code) : null; }
function getChatRoom(socket) {
  const code = socket.data.chatRoomCode;
  if (!code) return null;
  const duelRoom = rooms.get(code);
  if (duelRoom && duelRoom.players.some((player) => player.id === socket.id)) return duelRoom;
  const ludoRoom = ludoRooms.get(code);
  if (ludoRoom && ludoRoom.players.some((player) => player.playerId === socket.data.playerId) && socket.rooms.has(`ludo:${code}`)) return ludoRoom;
  return null;
}
function chatRoomName(room) { return ludoRooms.has(room.code) ? `ludo:${room.code}` : room.code; }
function updateRoom(room) {
  io.to(room.code).emit("room:update", {
    code: room.code, status: room.status, game: room.game, difficulty: room.difficulty || "medium", round: room.round,
    totalRounds: TOTAL_ROUNDS, hostId: room.hostId,
    players: room.players.map((player) => ({ id: player.playerId || player.id, name: player.name, score: player.score || 0, isHost: player.id === room.hostId, votedGame: room.votes?.[player.id] || null }))
  });
}
function stopTimers(room) { clearTimeout(room.roundTimer); clearTimeout(room.nextRoundTimer); clearTimeout(room.reactionTimer); }
function createRound(room) {
  const game = room.roundGame || room.game;
  const difficulty = { easy: 1, medium: 2, hard: 3, hacker: 4 }[room.difficulty] || 2;
  if (game === "math") {
    const max = 10 + difficulty * 15; const a = crypto.randomInt(1, max + 1); const b = crypto.randomInt(1, max + 1); const op = ["+", "-", "×"][crypto.randomInt(3)];
    const left = op === "-" ? Math.max(a, b) : a; const right = op === "-" ? Math.min(a, b) : b;
    return { question: `${left} ${op} ${right} = ?`, answer: String(op === "+" ? left + right : op === "-" ? left - right : left * right) };
  }
  if (game === "puzzle" || game === "pattern") {
    const start = crypto.randomInt(1, 9); const step = crypto.randomInt(2, 4 + difficulty * 2); const values = [0,1,2,3].map((i) => start + step * i);
    return { question: `Find the next number: ${values.join(", ")}, ?`, answer: String(start + step * 4) };
  }
  if (game === "memory" || game === "simon") {
    const sequence = Array.from({ length: 3 + Math.min(room.round - 1 + difficulty - 1, 6) }, () => crypto.randomInt(1, 10));
    return { question: "Memorize the sequence and enter it in order.", sequence, answer: sequence.join("") };
  }
  if (game === "reaction") return { question: "Wait for GO, then click as quickly as possible.", answer: null };
  if (game === "word") {
    const words = ["ORBIT", "PLANET", "NEBULA", "GALAXY", "COMET", "QUANTUM", "COSMOS", "ECLIPSE"];
    const word = words[crypto.randomInt(0, words.length)]; return { question: `Unscramble: ${word.split("").sort(() => Math.random() - .5).join(" ")}`, answer: word };
  }
  if (game === "color") { const colors = ["RED", "BLUE", "GREEN", "GOLD", "VIOLET"]; const answer = colors[crypto.randomInt(0, colors.length)]; return { question: `Type the color name shown: ${answer}`, answer }; }
  if (game === "higher") { const a = crypto.randomInt(1, 20 + difficulty * 20); const b = crypto.randomInt(1, 20 + difficulty * 20); return { question: `Which number is higher: ${a} or ${b}?`, answer: String(Math.max(a, b)) }; }
  if (game === "odd") {
    const sets = [
      { q: "Which one is different: 2, 4, 6, 9?", a: "9" },
      { q: "Which one is different: apple, pear, carrot, plum?", a: "carrot" },
      { q: "Which one is different: triangle, square, circle, blue?", a: "blue" }
    ];
    return sets[crypto.randomInt(0, sets.length)];
  }
  if (game === "typing") { const words = ["focus creates momentum", "small steps build mastery", "practice makes progress"]; const text = words[crypto.randomInt(0, words.length)]; return { question: `Type exactly: ${text}`, answer: text }; }
  return { question: "Type ARENA to continue.", answer: "ARENA" };
}
async function startRound(room) {
  if (room.status !== "playing") return;
  stopTimers(room); room.submissions = new Map(); room.lockedOut = new Set(); room.roundResolved = false; room.reactionStartedAt = null;
  room.roundGame = room.game === "challenge" ? CHALLENGE_GAMES[(room.round - 1) % CHALLENGE_GAMES.length] : room.game;
  if (room.roundGame === "gk") {
    try {
      const response = await fetch("https://opentdb.com/api.php?amount=1&category=9&type=multiple", { signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error("Trivia provider unavailable");
      const item = (await response.json()).results?.[0]; if (!item) throw new Error("No trivia question returned");
      const decode = (value) => String(value).replace(/&quot;/g, '"').replace(/&#039;|&#39;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
      room.roundData = { question: decode(item.question), answer: decode(item.correct_answer), choices: [...item.incorrect_answers, item.correct_answer].map(decode) };
    } catch (_error) {
      room.roundData = { question: "Random GK feed is temporarily unavailable. Type SKIP to finish this round.", answer: "SKIP" };
    }
  } else room.roundData = createRound(room);
  if (room.status !== "playing") return;
  io.to(room.code).emit("duel:round", { game: room.roundGame || room.game, matchGame: room.game, round: room.round, totalRounds: TOTAL_ROUNDS, question: room.roundData.question, sequence: room.roundData.sequence || null, choices: room.roundData.choices || null });
  if ((room.roundGame || room.game) === "reaction") room.reactionTimer = setTimeout(() => { if (room.status === "playing" && !room.roundResolved) { room.reactionStartedAt = Date.now(); io.to(room.code).emit("duel:reactionGo"); } }, 2000 + crypto.randomInt(0, 3000));
  room.roundTimer = setTimeout(() => expireRound(room), (room.roundGame || room.game) === "reaction" ? 12000 : 30000);
}
function beginMatch(room) {
  if (!room || room.status !== "waiting" || room.players.length !== 2) return;
  const [a, b] = room.players;
  if (!GAMES.includes(room.game)) room.game = "math"; room.status = "playing"; room.round = 1; room.players.forEach((p) => p.score = 0);
  updateRoom(room); io.to(room.code).emit("duel:started", { game: room.game, totalRounds: TOTAL_ROUNDS }); startRound(room);
}
function voteForGame(socket, data = {}) {
  const room = getRoomForSocket(socket); const game = String(data.game || "");
  if (!room || room.status !== "waiting" || !room.players.some((p) => p.id === socket.id) || !GAMES.includes(game)) { socket.emit("duel:error", { message: "Create or join an available room and select a valid game." }); return; }
  room.game = game; updateRoom(room);
  if (room.players.length === 2) beginMatch(room);
  else socket.emit("duel:voteStatus", { message: "Game selected. Waiting for your friend to accept the invitation." });
}
function evaluateDuelAnswer(room, socketId, answer) {
  if (!room || room.status !== "playing" || room.roundResolved || !room.players.some((player) => player.id === socketId) || room.lockedOut.has(socketId)) {
    return { ok: false, message: "You are not active in this round." };
  }
  const submitted = String(answer ?? "").toLowerCase().replace(/\s/g, "");
  const expected = String(room.roundData?.answer ?? "").toLowerCase().replace(/\s/g, "");
  if (submitted !== expected) {
    room.lockedOut.add(socketId);
    return {
      ok: true,
      correct: false,
      lockedOut: true,
      shouldResolve: room.lockedOut.size >= room.players.length,
      message: "Wrong, you are out of this round."
    };
  }
  return { ok: true, correct: true, shouldResolve: true, message: "Correct!" };
}

function settleRoundState(room, winnerId) {
  if (!room || room.roundResolved || room.status !== "playing") return null;
  room.roundResolved = true;
  if (winnerId) {
    const winner = room.players.find((player) => player.id === winnerId);
    if (winner) winner.score++;
  }
  return {
    round: room.round,
    winnerId,
    answer: room.roundData?.answer == null ? null : String(room.roundData.answer),
    lockedOut: [...(room.lockedOut || [])],
    players: room.players.map((player) => ({ id: player.id, name: player.name, score: player.score }))
  };
}

function expireRound(room) {
  if (!room || room.status !== "playing" || room.roundResolved) return false;
  resolveRound(room, null, "Time is up! Nobody scored this round.");
  return true;
}

function resolveRound(room, winnerId, message) {
  const state = settleRoundState(room, winnerId);
  if (!state) return;
  stopTimers(room);
  io.to(room.code).emit("duel:roundResult", { ...state, message });
  room.nextRoundTimer = setTimeout(() => {
    if (!rooms.has(room.code) || room.status !== "playing") return;
    if (room.round >= TOTAL_ROUNDS) {
      const high = Math.max(...room.players.map((player) => player.score));
      const winners = room.players.filter((player) => player.score === high);
      finishMatch(room, winners.length === 1 ? winners[0].id : null, winners.length === 1 ? `${winners[0].name} wins Brain Arena!` : "The challenge ended in a tie!");
    } else {
      room.round++;
      updateRoom(room);
      startRound(room);
    }
  }, 1800);
}
function finishMatch(room, winnerId, message) { stopTimers(room); room.status = "finished"; const winner = room.players.find((p) => p.id === winnerId); io.to(room.code).emit("duel:finished", { winner: winner?.name || null, winnerId, message, players: room.players.map((p) => ({ id: p.id, name: p.name, score: p.score })) }); updateRoom(room); }
function removePlayer(socket) {
  const code = socket.data.roomCode;
  if (!code) return;
  socket.data.roomCode = null;
  if (socket.data.chatRoomCode === code) socket.data.chatRoomCode = null;
  socket.leave(code);
  const room = rooms.get(code);
  if (!room) return;
  room.players = room.players.filter((player) => player.id !== socket.id);
  delete room.votes[socket.id];
  if (!room.players.length) {
    stopTimers(room);
    rooms.delete(code);
    return;
  }
  if (room.status === "playing") {
    stopTimers(room);
    room.status = "waiting";
    room.round = 0;
    room.roundResolved = true;
    room.roundData = null;
    room.submissions = new Map();
    room.votes = {};
    io.to(code).emit("duel:opponentLeft", { message: "Your opponent left. Invite another player to continue." });
  }
  room.hostId = room.players[0].id;
  updateRoom(room);
}
function detachSocketFromLudo(socket, nextCode = null) {
  const currentCode = socket.data.ludoCode;
  if (!currentCode || currentCode === nextCode) return;
  socket.leave(`ludo:${currentCode}`);
  socket.data.ludoCode = null;
  if (socket.data.chatRoomCode === currentCode) socket.data.chatRoomCode = null;
}

function dmHistoryAllowed(a, b) { return a && b && a !== b && areFriends(a, b) && !isBlocked(a, b); }
function sendDm(socket, data, callback) {
  const from = socket.data.playerId; const target = getProfileByCode(data.toCode)?.id; const text = cleanText(data.text, 240);
  if (!from || !target || !dmHistoryAllowed(from, target) || !text) return callback?.({ ok: false, message: "You can message friends only." });
  if (!rateLimit(sendLimits, from, 5, 5000)) return callback?.({ ok: false, message: "Slow down a little before sending another message." });
  const key = conversationKey(from, target); const messages = messageStore.conversations[key] ||= [];
  const retention = ["never", "after-view", "offline"].includes(data.retention) ? data.retention : "never";
  const message = { id: crypto.randomUUID(), senderId: from, senderName: social.profiles[from].name, text, retention, createdAt: new Date().toISOString(), edited: false, deleted: false, readBy: [from] };
  messages.push(message); if (messages.length > 200) messages.splice(0, messages.length - 200);
  persist(MESSAGES_FILE, messageStore).catch((error) => console.error("DM save failed", error));
  const safeMessage = sanitizeMessage(message);
  emitPlayer(from, "dm:new", { conversationKey: key, message: safeMessage, other: publicProfile(social.profiles[target]) });
  emitPlayer(target, "dm:new", { conversationKey: key, message: safeMessage, other: publicProfile(social.profiles[from]) });
  callback?.({ ok: true, message: safeMessage });
}
function updateMessage(socket, data, deleted) {
  const playerId = socket.data.playerId; const messageId = String(data.messageId || ""); const text = cleanText(data.text, 240);
  if (!playerId || (!deleted && !text)) return;
  for (const [key, list] of Object.entries(messageStore.conversations)) {
    const message = list.find((m) => m.id === messageId);
    if (!message) continue;
    if (message.senderId !== playerId || message.deleted) return socket.emit("dm:error", { message: "You can edit or delete your own messages only." });
    if (deleted) { message.deleted = true; message.text = "message deleted"; }
    else { message.text = text; message.edited = true; }
    persist(MESSAGES_FILE, messageStore).catch((error) => console.error("DM update failed", error));
    const [a, b] = key.split("::"); const payload = { conversationKey: key, message: sanitizeMessage(message) };
    emitPlayer(a, "dm:updated", payload); emitPlayer(b, "dm:updated", payload); return;
  }
}
function createRoomChatMessage(room, playerId, text) {
  const profile = social.profiles[playerId]; const message = { id: crypto.randomUUID(), roomCode: room.code, senderId: playerId, senderName: profile?.name || "Player", text, createdAt: new Date().toISOString(), edited: false, deleted: false };
  room.chat ||= []; room.chat.push(message); if (room.chat.length > 200) room.chat.shift(); return message;
}
function editRoomChat(socket, data, deleted) {
  const room = getChatRoom(socket); const playerId = socket.data.playerId; if (!room || !playerId) return;
  const message = (room.chat || []).find((m) => m.id === String(data.messageId || "")); if (!message) return;
  if (message.senderId !== playerId || message.deleted) return socket.emit("room:chat:error", { message: "You can edit or delete your own messages only." });
  if (deleted) { message.deleted = true; message.text = "message deleted"; } else { const text = cleanText(data.text, 240); if (!text) return; message.text = text; message.edited = true; }
  io.to(chatRoomName(room)).emit("room:chat:updated", sanitizeMessage(message));
}
function ludoPublicState(room, viewerId) {
  const game = room.gameState;
  return { code: room.code, status: room.status, hostId: room.hostId, players: room.players.map((p) => ({ id: p.playerId, name: p.name, avatar: social.profiles[p.playerId]?.avatar || "✦", color: game?.players.find((g) => g.id === p.playerId)?.color || p.color, connected: isPlayerOnline(p.playerId) })), state: game ? { status: game.status, turn: game.turn, dice: game.dice, sixesInRow: game.sixesInRow, players: game.players, options: game.options, winners: game.winners, legalMoves: game.dice && game.players[game.turn]?.id === viewerId ? LudoRules.legalMoves(game, viewerId, game.dice) : [] } : null, settings: room.settings };
}
function emitLudoState(room) { for (const p of room.players) emitPlayer(p.playerId, "ludo:state", ludoPublicState(room, p.playerId)); }
function armLudoTurnTimer(room, delay = 30_000) {
  clearTimeout(room.turnTimer);
  if (room.status !== "playing" || !room.gameState) return;
  room.turnTimer = setTimeout(() => {
    const game = room.gameState;
    if (game.status !== "playing") return;
    const current = game.players[game.turn];
    if (!current) return;
    const disconnectedAt = room.disconnected.get(current.id);
    if (disconnectedAt && Date.now() - disconnectedAt < 60_000) {
      armLudoTurnTimer(room, 60_000 - (Date.now() - disconnectedAt));
      return;
    }
    try {
      if (!game.dice) {
        const result = LudoRules.rollDice(game, current.id);
        if (result.legalMoves.length) LudoRules.moveToken(game, current.id, result.legalMoves[0]);
      } else {
        const moves = LudoRules.legalMoves(game, current.id, game.dice);
        if (moves.length) LudoRules.moveToken(game, current.id, moves[0]);
        else { game.dice = null; LudoRules.advanceTurn(game); }
      }
      emitLudoState(room); armLudoTurnTimer(room);
    } catch (error) { console.warn("Ludo timeout auto-play failed", error.message); }
  }, delay);
}

io.on("connection", (socket) => {
  // Identity and social profile
  socket.on("social:register", async (data = {}, callback) => {
    const playerId = cleanPlayerId(data.playerId);
    if (!playerId) return callback?.({ ok: false, message: "This browser identity is invalid. Refresh and try again." });
    const profile = ensureProfile(playerId, data); socket.data.playerId = playerId; getSocketSet(playerId).add(socket.id);
    try { await persist(SOCIAL_FILE, social); } catch (error) { console.error("Profile save failed", error); }
    const bootstrap = profilePayload(profile); callback?.({ ok: true, profile: bootstrap });
    emitPlayer(playerId, "social:bootstrap", bootstrap);
    for (const friendId of profile.friends) emitPlayer(friendId, "social:presence", { code: profile.code, name: profile.name, online: profile.onlinePreference && isPlayerOnline(playerId) });
    for (const room of ludoRooms.values()) if (room.players.some((p) => p.playerId === playerId)) {
      socket.join(`ludo:${room.code}`);
      room.disconnected.delete(playerId);
      emitPlayer(playerId, "ludo:state", ludoPublicState(room, playerId));
      if (room.status === "playing") armLudoTurnTimer(room);
    }
  });
  socket.on("social:bootstrap", (callback) => { const p = social.profiles[socket.data.playerId]; callback?.(p ? { ok: true, profile: profilePayload(p) } : { ok: false }); });
  socket.on("social:profile:update", async (data = {}, callback) => {
    const profile = social.profiles[socket.data.playerId]; if (!profile) return callback?.({ ok: false, message: "Register your profile first." });
    profile.name = cleanName(data.name); profile.avatar = cleanText(data.avatar || profile.avatar, 8); profile.bio = cleanText(data.bio, 120);
    await persist(SOCIAL_FILE, social); const payload = profilePayload(profile); emitPlayer(profile.id, "social:bootstrap", payload); callback?.({ ok: true, profile: payload });
    for (const friendId of profile.friends) emitPlayer(friendId, "social:presence", { code: profile.code, name: profile.name, online: profile.onlinePreference && isPlayerOnline(profile.id) });
  });
  socket.on("social:status", async (data = {}, callback) => {
    const profile = social.profiles[socket.data.playerId]; if (!profile) return callback?.({ ok: false });
    profile.onlinePreference = data.online !== false; await persist(SOCIAL_FILE, social);
    const online = profile.onlinePreference && isPlayerOnline(profile.id);
    for (const friendId of profile.friends) emitPlayer(friendId, "social:presence", { code: profile.code, name: profile.name, online });
    callback?.({ ok: true, online });
  });
  socket.on("social:search", (data = {}, callback) => {
    const me = socket.data.playerId; const query = cleanText(data.query, 32).toLowerCase();
    if (!me || query.length < 2) return callback?.({ ok: true, results: [] });
    const results = Object.values(social.profiles).filter((p) => p.id !== me && !isBlocked(me, p.id) && ((p.name || "").toLowerCase().includes(query) || p.code.toLowerCase() === query.toUpperCase()))
      .slice(0, 20).map((p) => ({ name: p.name, avatar: p.avatar, bio: p.bio, code: p.code, online: p.onlinePreference && isPlayerOnline(p.id), relation: areFriends(me, p.id) ? "friend" : social.requests.some((r) => r.from === me && r.to === p.id) ? "outgoing" : social.requests.some((r) => r.from === p.id && r.to === me) ? "incoming" : "none" }));
    callback?.({ ok: true, results });
  });
  socket.on("social:request", async (data = {}, callback) => {
    const me = socket.data.playerId; const target = getProfileByCode(data.code)?.id;
    if (!me || !target || target === me || isBlocked(me, target)) return callback?.({ ok: false, message: "Player not found or unavailable." });
    if (areFriends(me, target)) return callback?.({ ok: false, message: "You are already friends." });
    const reciprocal = social.requests.find((r) => r.from === target && r.to === me);
    if (reciprocal) { social.profiles[me].friends ||= []; social.profiles[target].friends ||= []; social.profiles[me].friends.push(target); social.profiles[target].friends.push(me); social.requests = social.requests.filter((r) => r.id !== reciprocal.id); await persist(SOCIAL_FILE, social); emitPlayer(target, "social:bootstrap", profilePayload(social.profiles[target])); return callback?.({ ok: true, message: "Friend request accepted automatically. You are now friends." }); }
    if (social.requests.some((r) => r.from === me && r.to === target)) return callback?.({ ok: false, message: "Friend request already sent." });
    const request = { id: crypto.randomUUID(), from: me, to: target, createdAt: new Date().toISOString() }; social.requests.push(request); await persist(SOCIAL_FILE, social); emitPlayer(target, "social:bootstrap", profilePayload(social.profiles[target])); callback?.({ ok: true, message: "Friend request sent." });
  });
  socket.on("social:request:respond", async (data = {}, callback) => {
    const me = socket.data.playerId; const request = social.requests.find((r) => r.id === String(data.requestId) && r.to === me);
    if (!request) return callback?.({ ok: false, message: "Request no longer exists." });
    social.requests = social.requests.filter((r) => r.id !== request.id);
    if (data.action === "accept") { social.profiles[me].friends ||= []; social.profiles[request.from].friends ||= []; if (!social.profiles[me].friends.includes(request.from)) social.profiles[me].friends.push(request.from); if (!social.profiles[request.from].friends.includes(me)) social.profiles[request.from].friends.push(me); }
    await persist(SOCIAL_FILE, social); emitPlayer(request.from, "social:bootstrap", profilePayload(social.profiles[request.from])); emitPlayer(me, "social:bootstrap", profilePayload(social.profiles[me])); callback?.({ ok: true });
  });
  socket.on("social:request:cancel", async (data = {}, callback) => { const me = socket.data.playerId; const request = social.requests.find((r) => r.id === String(data.requestId) && r.from === me); if (!request) return callback?.({ ok: false }); social.requests = social.requests.filter((r) => r.id !== request.id); await persist(SOCIAL_FILE, social); emitPlayer(request.to, "social:bootstrap", profilePayload(social.profiles[request.to])); callback?.({ ok: true }); });
  socket.on("social:friend:remove", async (data = {}, callback) => { const me = socket.data.playerId; const target = getProfileByCode(data.code)?.id; if (!me || !target) return callback?.({ ok: false }); for (const id of [me, target]) social.profiles[id].friends = (social.profiles[id].friends || []).filter((friend) => friend !== (id === me ? target : me)); await persist(SOCIAL_FILE, social); emitPlayer(target, "social:bootstrap", profilePayload(social.profiles[target])); callback?.({ ok: true }); });
  socket.on("social:block", async (data = {}, callback) => { const me = socket.data.playerId; const target = getProfileByCode(data.code)?.id; if (!me || !target || me === target) return callback?.({ ok: false }); if (!social.blocks.some((b) => b.from === me && b.to === target)) social.blocks.push({ from: me, to: target }); social.profiles[me].friends = social.profiles[me].friends.filter((id) => id !== target); social.profiles[target].friends = social.profiles[target].friends.filter((id) => id !== me); social.requests = social.requests.filter((r) => !((r.from === me && r.to === target) || (r.from === target && r.to === me))); await persist(SOCIAL_FILE, social); emitPlayer(target, "social:bootstrap", profilePayload(social.profiles[target])); callback?.({ ok: true }); });
  socket.on("social:invite", (data = {}, callback) => { const me = socket.data.playerId; const target = getProfileByCode(data.code)?.id; const code = String(data.roomCode || "").toUpperCase(); const room = rooms.get(code) || ludoRooms.get(code); if (!me || !target || !areFriends(me, target) || !room || isBlocked(me, target)) return callback?.({ ok: false, message: "Friend or room unavailable." }); emitPlayer(target, "social:invite", { from: publicProfile(social.profiles[me]), roomCode: code, game: ludoRooms.has(code) ? "ludo" : "duel" }); callback?.({ ok: true }); });

  // Direct messages and chat CRUD
  socket.on("dm:history", (data = {}, callback) => { const me = socket.data.playerId; const target = getProfileByCode(data.code)?.id; if (!dmHistoryAllowed(me, target)) return callback?.({ ok: false, message: "You can message friends only." }); const key = conversationKey(me, target); const now = Date.now(); const list = messageStore.conversations[key] || []; const valid = list.filter(m => !m.expiresAt || Date.parse(m.expiresAt) > now); if (valid.length !== list.length) { messageStore.conversations[key] = valid; persist(MESSAGES_FILE, messageStore).catch(() => {}); } callback?.({ ok: true, conversationKey: key, messages: valid.map(sanitizeMessage), person: publicProfile(social.profiles[target]) }); });
  socket.on("dm:send", (data = {}, callback) => sendDm(socket, data, callback));
  socket.on("dm:edit", (data = {}) => updateMessage(socket, data, false));
  socket.on("dm:delete", (data = {}) => updateMessage(socket, data, true));
  socket.on("dm:read", async (data = {}, callback) => { const me = socket.data.playerId; const target = getProfileByCode(data.code)?.id; if (!dmHistoryAllowed(me, target)) return callback?.({ ok: false }); const key = conversationKey(me, target); const messages = messageStore.conversations[key] || []; const cleared = []; messages.forEach((m) => { if (m.senderId === target && !m.readBy.includes(me)) m.readBy.push(me); if (m.retention === "after-view" && m.senderId !== me && !m.deleted) { m.deleted = true; m.text = "message cleared after view"; cleared.push(m); } }); await persist(MESSAGES_FILE, messageStore); for (const message of cleared) { const payload = { conversationKey: key, message: sanitizeMessage(message) }; emitPlayer(me, "dm:updated", payload); emitPlayer(target, "dm:updated", payload); } emitPlayer(target, "dm:read:update", { conversationKey: key, reader: me }); callback?.({ ok: true }); });
  socket.on("room:chat:history", (data = {}, callback) => {
    const code = String(data.code || socket.data.roomCode || socket.data.ludoCode || "").toUpperCase();
    const room = rooms.get(code) || ludoRooms.get(code);
    const member = room && (rooms.has(code)
      ? room.players.some((player) => player.id === socket.id)
      : room.players.some((player) => player.playerId === socket.data.playerId) && socket.rooms.has(`ludo:${code}`));
    if (!member) return callback?.({ ok: false, messages: [] });
    socket.data.chatRoomCode = code;
    callback?.({ ok: true, messages: (room.chat || []).map(sanitizeMessage) });
  });
  socket.on("room:chat:send", (data = {}, callback) => {
    const room = getChatRoom(socket);
    const playerId = socket.data.playerId;
    const text = cleanText(data.text, 240);
    if (!room || !playerId || !text) return callback?.({ ok: false, message: "Join the room before chatting." });
    if (!rateLimit(sendLimits, playerId, 5, 5000)) return callback?.({ ok: false, message: "Slow down before sending another message." });
    const message = createRoomChatMessage(room, playerId, text);
    io.to(chatRoomName(room)).emit("room:chat:new", sanitizeMessage(message));
    callback?.({ ok: true, message: sanitizeMessage(message) });
  });
  socket.on("room:chat:edit", (data = {}) => editRoomChat(socket, data, false));
  socket.on("room:chat:delete", (data = {}) => editRoomChat(socket, data, true));

  // Duel rooms
  socket.on("room:create", (data = {}, callback) => {
    removePlayer(socket);
    detachSocketFromLudo(socket);
    const code = createCode(5, (candidate) => rooms.has(candidate) || ludoRooms.has(candidate));
    const playerId = socket.data.playerId || socket.id;
    const chosenGame = GAMES.includes(data.game) ? data.game : "math";
    const room = { code, hostId: socket.id, status: "waiting", game: chosenGame, difficulty: ["easy","medium","hard","hacker"].includes(data.difficulty) ? data.difficulty : "medium", round: 0, players: [{ id: socket.id, playerId, name: cleanName(data.name || social.profiles[playerId]?.name), score: 0 }], votes: {}, roundData: null, submissions: new Map(), lockedOut: new Set(), roundResolved: false, roundTimer: null, nextRoundTimer: null, reactionTimer: null, reactionStartedAt: null, chat: [] };
    rooms.set(code, room); socket.join(code); socket.data.roomCode = code; socket.data.chatRoomCode = code; updateRoom(room); callback?.({ ok: true, code });
  });
  socket.on("room:join", (data = {}, callback) => {
    removePlayer(socket);
    detachSocketFromLudo(socket);
    const code = String(data.code || data.roomCode || "").trim().toUpperCase(); const room = rooms.get(code);
    if (!room) return callback?.({ ok: false, message: "Room not found. Check the code." });
    if (room.status !== "waiting" || room.players.length >= 2) return callback?.({ ok: false, message: "This room is not available to join." });
    const playerId = socket.data.playerId || socket.id;
    room.players.push({ id: socket.id, playerId, name: cleanName(data.name || social.profiles[playerId]?.name), score: 0 }); socket.join(code); socket.data.roomCode = code; socket.data.chatRoomCode = code; updateRoom(room); callback?.({ ok: true, code }); if (room.players.length === 2) beginMatch(room);
  });
  socket.on("duel:vote", (data = {}) => voteForGame(socket, data));
  socket.on("duel:start", (data = {}) => voteForGame(socket, data));
  socket.on("duel:submit", (data = {}, callback) => {
    const room = getRoomForSocket(socket);
    if (!room || room.status !== "playing" || room.roundResolved || !room.players.some((p) => p.id === socket.id) || room.lockedOut.has(socket.id)) return callback?.({ ok: false, message: "You are not active in this round." });
    if ((room.roundGame || room.game) === "reaction") {
      if (!room.reactionStartedAt) return callback?.({ ok: false, message: "Wait for GO!" });
      if (room.submissions.has(socket.id)) return callback?.({ ok: false, message: "Your reaction is already submitted." });
      const elapsed = Date.now() - room.reactionStartedAt; room.submissions.set(socket.id, elapsed); callback?.({ ok: true, correct: true, message: "Reaction submitted." });
      if (room.submissions.size === 2) { const results = [...room.submissions.entries()].sort((a,b) => a[1] - b[1]); resolveRound(room, results[0][0], `Fastest reaction: ${results[0][1]} ms!`); } return;
    }
    const result = evaluateDuelAnswer(room, socket.id, data.answer);
    if (!result.ok) return callback?.(result);
    if (!result.correct) {
      callback?.(result);
      socket.emit("duel:answerResult", { correct: false, lockedOut: true, message: result.message });
      if (result.shouldResolve) resolveRound(room, null, "Both players are out. No winner this round.");
      return;
    }
    callback?.(result);
    resolveRound(room, socket.id, "Correct answer!");
  });
  socket.on("room:leave", () => { const oldCode = socket.data.roomCode; removePlayer(socket); if (oldCode) socket.leave(oldCode); });

  // Ludo: shared pure rules, server-authoritative dice and moves
  socket.on("ludo:create", (data = {}, callback) => {
    removePlayer(socket);
    detachSocketFromLudo(socket);
    const playerId = socket.data.playerId; if (!playerId) return callback?.({ ok: false, message: "Create your player profile first." });
    const code = createCode(5, (candidate) => rooms.has(candidate) || ludoRooms.has(candidate)); const profile = social.profiles[playerId];
    const room = { code, hostId: playerId, status: "waiting", players: [{ playerId, name: cleanName(data.name || profile?.name), color: "red" }], gameState: null, settings: { blockRule: Boolean(data.blockRule), finishOnFirst: data.finishOnFirst !== false, autoMove: Boolean(data.autoMove) }, chat: [], turnTimer: null, disconnected: new Map() };
    ludoRooms.set(code, room); socket.join(`ludo:${code}`); socket.data.ludoCode = code; socket.data.chatRoomCode = code; callback?.({ ok: true, code }); io.to(`ludo:${code}`).emit("ludo:lobby", ludoPublicState(room, playerId));
  });
  socket.on("ludo:join", (data = {}, callback) => {
    const playerId = socket.data.playerId;
    const code = String(data.code || "").trim().toUpperCase();
    const room = ludoRooms.get(code);
    removePlayer(socket);
    detachSocketFromLudo(socket, code);
    if (!playerId) return callback?.({ ok: false, message: "Create your profile first." });
    if (!room) return callback?.({ ok: false, message: "Ludo room not found." });
    if (room.status !== "waiting" || room.players.length >= 4) return callback?.({ ok: false, message: "This Ludo room is full or already started." });
    if (!room.players.some((p) => p.playerId === playerId)) room.players.push({ playerId, name: cleanName(data.name || social.profiles[playerId]?.name), color: LudoRules.COLORS[room.players.length] });
    socket.join(`ludo:${code}`); socket.data.ludoCode = code; socket.data.chatRoomCode = code; callback?.({ ok: true, code }); io.to(`ludo:${code}`).emit("ludo:lobby", ludoPublicState(room, playerId));
  });
  socket.on("ludo:start", (data = {}, callback) => {
    const room = ludoRooms.get(String(data.code || socket.data.ludoCode || "").toUpperCase()); const playerId = socket.data.playerId;
    if (!room || room.hostId !== playerId || room.status !== "waiting" || room.players.length < 2) return callback?.({ ok: false, message: "The host can start when at least two players have joined." });
    room.gameState = LudoRules.createGame(room.players.map((p) => p.playerId), room.settings); room.status = "playing"; emitLudoState(room); armLudoTurnTimer(room); callback?.({ ok: true });
  });
  socket.on("ludo:roll", (data = {}, callback) => {
    const code = String(data.code || socket.data.ludoCode || "").toUpperCase(); const room = ludoRooms.get(code); const playerId = socket.data.playerId;
    if (!room || room.status !== "playing" || !room.gameState) return callback?.({ ok: false, message: "Ludo has not started." });
    if (!room.players.some((player) => player.playerId === playerId)) return callback?.({ ok: false, message: "Join this Ludo room before rolling." });
    try {
      const result = LudoRules.rollDice(room.gameState, playerId);
      let autoMoved = false;
      let move = null;
      if (room.settings.autoMove && result.legalMoves.length === 1) {
        move = LudoRules.moveToken(room.gameState, playerId, result.legalMoves[0]);
        autoMoved = true;
      }
      emitLudoState(room);
      if (result.forfeited) io.to(`ludo:${code}`).emit("ludo:notice", { message: "Three sixes in a row — turn forfeited." });
      else if (autoMoved) io.to(`ludo:${code}`).emit("ludo:notice", { message: move.captured.length ? "Auto-move captured an opponent token!" : "The only legal token moved automatically." });
      else if (!result.legalMoves.length && !result.extraTurn) io.to(`ludo:${code}`).emit("ludo:notice", { message: "No legal moves. Turn passed." });
      else if (!result.legalMoves.length && result.extraTurn) io.to(`ludo:${code}`).emit("ludo:notice", { message: "No legal move, but a six grants another roll." });
      callback?.({ ok: true, ...result, autoMoved, move });
      armLudoTurnTimer(room);
    } catch (error) { callback?.({ ok: false, message: error.message }); }
  });
  socket.on("ludo:move", (data = {}, callback) => {
    const code = String(data.code || socket.data.ludoCode || "").toUpperCase(); const room = ludoRooms.get(code); const playerId = socket.data.playerId;
    if (!room || room.status !== "playing" || !room.gameState) return callback?.({ ok: false, message: "Ludo has not started." });
    if (!room.players.some((player) => player.playerId === playerId)) return callback?.({ ok: false, message: "Join this Ludo room before moving." });
    try { const result = LudoRules.moveToken(room.gameState, playerId, Number(data.tokenIndex)); emitLudoState(room); io.to(`ludo:${code}`).emit("ludo:notice", { message: result.captured.length ? "Captured an opponent token! Extra turn." : result.reachedHome ? "Token reached home!" : result.extraTurn ? "Extra turn!" : "Token moved." }); callback?.({ ok: true, result }); armLudoTurnTimer(room); }
    catch (error) { callback?.({ ok: false, message: error.message }); }
  });

  socket.on("disconnect", async () => {
    removePlayer(socket);
    const playerId = socket.data.playerId;
    if (playerId && (socketsByPlayer.get(playerId)?.size || 0) <= 1) {
      let changed = false;
      for (const [key, list] of Object.entries(messageStore.conversations)) {
        if (!key.split("::").includes(playerId)) continue;
        for (const message of list) if (message.retention === "offline" && !message.deleted) {
          message.deleted = true; message.text = "message cleared when a user went offline"; changed = true;
        }
      }
      if (changed) await persist(MESSAGES_FILE, messageStore);
    }
    if (playerId) {
      socketsByPlayer.get(playerId)?.delete(socket.id); if (!socketsByPlayer.get(playerId)?.size) socketsByPlayer.delete(playerId);
      const profile = social.profiles[playerId]; if (profile) for (const friendId of profile.friends || []) emitPlayer(friendId, "social:presence", { code: profile.code, name: profile.name, online: profile.onlinePreference && isPlayerOnline(playerId) });
      for (const room of ludoRooms.values()) if (!isPlayerOnline(playerId) && room.players.some((p) => p.playerId === playerId)) {
        room.disconnected.set(playerId, Date.now());
        const graceTimer = setTimeout(() => {
          if (room.disconnected.has(playerId) && Date.now() - room.disconnected.get(playerId) >= 60_000) {
            room.disconnected.delete(playerId);
          }
        }, 60_500);
        graceTimer.unref?.();
        emitLudoState(room);
        if (room.gameState?.players[room.gameState.turn]?.id === playerId) armLudoTurnTimer(room, 60_000);
      }
    }
  });
});

async function start() {
  await initData();
  server.listen(PORT, "0.0.0.0", () => console.log(`Brain Arena is running on port ${PORT}`));
}
if (require.main === module) start().catch((error) => { console.error(error); process.exitCode = 1; });
// Export the HTTP server itself so Vercel can serve HTTP and Socket.IO upgrades
// through the same function. Keep named properties for the existing test suite.
server.app = app;
server.server = server;
server.io = io;
server.start = start;
server.initData = initData;
server.createRound = createRound;
server.evaluateDuelAnswer = evaluateDuelAnswer;
server.settleRoundState = settleRoundState;
server.expireRound = expireRound;
server.GAMES = GAMES;
server.CHALLENGE_GAMES = CHALLENGE_GAMES;
server.rooms = rooms;
server.ludoRooms = ludoRooms;
Object.defineProperties(server, {
  socialStore: { enumerable: true, get: () => social },
  messageStore: { enumerable: true, get: () => messageStore },
  leaderboardStore: { enumerable: true, get: () => leaderboard }
});
module.exports = server;

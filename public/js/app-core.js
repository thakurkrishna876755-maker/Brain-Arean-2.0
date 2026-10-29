"use strict";

// Vercel may route separate HTTP polling requests to different function instances.
// Use WebSocket directly to avoid polling-session POST failures (400 / Session ID unknown).
const socket = io({
  transports: ["websocket"],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 10000
});

socket.on("connect_error", (error) => {
  console.error("Brain Arena realtime connection failed:", error.message);
});
const $ = (id) => document.getElementById(id);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const ESC = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const GAMES = [
  { id: "math", name: "Quick Math", icon: "∑", description: "Solve sharp equations before the clock runs out.", color: "rgba(232,201,138,.15)", difficulty: "Adaptive" },
  { id: "memory", name: "Memory Matrix", icon: "◈", description: "Remember the sequence. Stay one step ahead.", color: "rgba(169,156,255,.15)", difficulty: "Focus" },
  { id: "reaction", name: "Reaction Test", icon: "ϟ", description: "Wait for the signal. Trust your reflexes.", color: "rgba(123,224,189,.14)", difficulty: "Reflex" },
  { id: "puzzle", name: "Number Puzzle", icon: "⌗", description: "Read the pattern and uncover the missing number.", color: "rgba(255,135,149,.12)", difficulty: "Logic" },
  { id: "word", name: "Word Scramble", icon: "Aa", description: "Untangle letters under pressure.", color: "rgba(169,156,255,.15)", difficulty: "Vocabulary" },
  { id: "color", name: "Color Clash", icon: "◉", description: "Match the right color while your brain tries to trick you.", color: "rgba(255,135,149,.13)", difficulty: "Focus" },
  { id: "typing", name: "Typing Master", icon: "⌨", description: "Build speed, accuracy, and clean keystrokes.", color: "rgba(123,224,189,.14)", difficulty: "WPM" },
  { id: "gk", name: "GK Quiz", icon: "🌍", description: "Fresh general-knowledge questions from a random trivia feed.", color: "rgba(232,201,138,.16)", difficulty: "Knowledge" },
  { id: "higher", name: "Higher or Lower", icon: "↗", description: "Pick the higher value and keep your streak alive.", color: "rgba(232,201,138,.14)", difficulty: "Quick read" },
  { id: "odd", name: "Odd One Out", icon: "◇", description: "Spot the item that doesn't belong.", color: "rgba(169,156,255,.13)", difficulty: "Logic" },
  { id: "simon", name: "Simon Tap", icon: "✣", description: "Repeat a growing sequence of glowing signals.", color: "rgba(123,224,189,.14)", difficulty: "Memory" },
  { id: "pattern", name: "Pattern Pulse", icon: "⌁", description: "Discover the rule behind the next number.", color: "rgba(255,135,149,.13)", difficulty: "Reasoning" },
  { id: "chaos", name: "Fake-Out Frenzy", icon: "⚡", description: "Rules flip without warning. Trust the instruction, not your instinct.", color: "rgba(255,104,161,.18)", difficulty: "Reflex + focus", featured: true },
  { id: "challenge", name: "Challenge Mode", icon: "⚔", description: "Best-of-five matches across five different brain-game types.", color: "rgba(232,201,138,.18)", difficulty: "Versus", multiplayerOnly: true },
  { id: "ludo", name: "Ludo Classic", icon: "♟", description: "A polished, turn-based race home with friends.", color: "rgba(232,201,138,.16)", difficulty: "Strategy" }
];
const GAME_MAP = Object.fromEntries(GAMES.map((g) => [g.id, g]));
const COLORS = { red: "#df5965", green: "#2e9c78", yellow: "#e8b94f", blue: "#568de0" };
const startupParams = new URLSearchParams(location.search);
const isTestPlayerTab = startupParams.get("testPlayer") === "1";
let playerId = isTestPlayerTab
  ? crypto.randomUUID()
  : (sessionStorage.getItem("brainArenaTestPlayerId") || localStorage.getItem("brainArenaPlayerId"));
if (!playerId || !/^[a-zA-Z0-9_-]{12,80}$/.test(playerId)) {
  playerId = crypto.randomUUID();
  localStorage.setItem("brainArenaPlayerId", playerId);
}
if (isTestPlayerTab) {
  sessionStorage.setItem("brainArenaTestPlayerId", playerId);
  sessionStorage.setItem("brainArenaTestPlayerName", "Test Player");
  startupParams.delete("testPlayer");
  history.replaceState(null, "", `${location.pathname}${startupParams.size ? `?${startupParams}` : ""}${location.hash}`);
}
let profile = null;
let profileAvatar = "✦";
let activeRoute = "home";
let selectedMode = "solo";
let soloDifficulty = localStorage.getItem("brainArenaSoloDifficulty") || "easy";
let multiplayerDifficulty = localStorage.getItem("brainArenaMultiDifficulty") || "medium";
let currentRoomCode = null;
let currentRoomGame = "math";
let currentGame = null;
let soloState = {};
let soloTimer = null;
let soloInterval = null;
let soloTimeouts = new Set();
let leaderboardTimer = null;
let leaderboardBusy = false;
let activeFriendCode = null;
let activeConversationKey = null;
let ludoRoomCode = null;
let ludoState = null;
let ludoLocal = false;
let ludoCurrentLegalMoves = [];
let ludoLocalPlayers = [];
let ludoLocalGame = null;
let currentLudoRollResult = null;
let unreadTotal = 0;

function toast(message, error = false) {
  const region = $("toastRegion"); if (!region) return;
  const item = document.createElement("div"); item.className = `toast${error ? " error" : ""}`; item.textContent = message; region.append(item);
  window.setTimeout(() => item.remove(), 3600);
}
function setStatus(id, message) { const el = $(id); if (el) el.textContent = message; }
function emitAck(event, payload, callback, timeout = 8000) {
  let settled = false;
  const timer = setTimeout(() => { if (!settled) { settled = true; callback?.({ ok: false, message: "The server did not respond. Check your connection and retry." }); } }, timeout);
  socket.emit(event, payload, (response) => { if (settled) return; settled = true; clearTimeout(timer); callback?.(response || { ok: false, message: "The server returned an empty response." }); });
}
function navigate(route) { if (location.hash === route) routeChanged(); else location.hash = route; }
function routeChanged() {
  const raw = location.hash.replace(/^#\/?/, ""); const parts = raw.split("/").filter(Boolean);
  activeRoute = parts[0] || "home";
  if (activeRoute === "game") { currentGame = GAME_MAP[parts[1]] ? parts[1] : "math"; activeRoute = "game"; renderGamePage(); }
  const known = ["home", "friends", "messages", "leaderboard", "profile", "game"];
  if (!known.includes(activeRoute)) activeRoute = "home";
  $$(".page").forEach((page) => page.classList.toggle("active", page.dataset.page === activeRoute));
  $$('[data-route]').forEach((link) => link.classList.toggle("active", link.dataset.route === activeRoute));
  $("mobileNav")?.classList.add("hidden");
  if (activeRoute === "leaderboard") { refreshLeaderboard(); startLeaderboardAutoRefresh(); } else stopLeaderboardAutoRefresh();
  if (activeRoute === "messages") renderConversationList();
  if (activeRoute === "profile") syncProfileForm();
  window.scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}
window.addEventListener("hashchange", routeChanged);
$("mobileMenu")?.addEventListener("click", () => $("mobileNav").classList.toggle("hidden"));
$("themeToggle")?.addEventListener("click", () => { document.documentElement.classList.toggle("light"); localStorage.setItem("brainArenaTheme", document.documentElement.classList.contains("light") ? "light" : "dark"); });
if (localStorage.getItem("brainArenaTheme") === "light") document.documentElement.classList.add("light");

function renderGameCards() {
  const grid = $("gameGrid"); if (!grid) return;
  const visibleGames = selectedMode === "multiplayer" ? GAMES : GAMES.filter((game) => !game.multiplayerOnly);
  grid.innerHTML = visibleGames.map((game) => `<button class="game-card ${game.featured ? "game-card-featured" : ""}" type="button" data-game="${game.id}" style="--card-glow:${game.color}" aria-label="Play ${ESC(game.name)}"><span class="game-art art-${game.id}" aria-hidden="true"><i></i><i></i><i></i><b>${game.icon}</b></span><span class="game-icon">${game.icon}</span><h3>${ESC(game.name)}</h3><p>${ESC(game.description)}</p><div class="game-card-footer"><span class="difficulty-chip">${ESC(game.difficulty)}</span><span class="play-link">${selectedMode === "solo" ? "Play solo ↗" : "Play with friends ↗"}</span></div></button>`).join("");
}
function setupDifficulties() {
  $$(".mode-tab").forEach((button) => button.addEventListener("click", () => {
    selectedMode = button.dataset.mode;
    $$(".mode-tab").forEach((tab) => { const active = tab === button; tab.classList.toggle("active", active); tab.setAttribute("aria-selected", String(active)); });
    $("soloDifficulty").classList.toggle("hidden", selectedMode !== "solo"); $("multiDifficulty").classList.toggle("hidden", selectedMode !== "multiplayer"); renderGameCards();
  }));
  $$(".difficulty").forEach((button) => button.addEventListener("click", () => {
    const wrap = button.closest(".difficulty-wrap"); const mode = wrap?.id === "multiDifficulty" ? "multi" : "solo";
    $$(`.difficulty`, wrap).forEach((item) => item.classList.toggle("active", item === button));
    if (mode === "solo") { soloDifficulty = button.dataset.difficulty; localStorage.setItem("brainArenaSoloDifficulty", soloDifficulty); }
    else { multiplayerDifficulty = button.dataset.difficulty; localStorage.setItem("brainArenaMultiDifficulty", multiplayerDifficulty); }
  }));
  $$(".difficulty-wrap").forEach((wrap) => { const value = wrap.id === "multiDifficulty" ? multiplayerDifficulty : soloDifficulty; $$(".difficulty", wrap).forEach((b) => b.classList.toggle("active", b.dataset.difficulty === value)); });
}
setupDifficulties(); renderGameCards();
const dailyGames = ["math", "word", "color", "higher", "odd", "typing", "gk", "puzzle"];
const todayKey = new Date().toISOString().slice(0, 10);
let dailyGame = localStorage.getItem("brainArenaDailyDate") === todayKey ? localStorage.getItem("brainArenaDailyGame") : null;
if (!dailyGame || !GAME_MAP[dailyGame]) { dailyGame = dailyGames[Math.floor(Math.random() * dailyGames.length)]; localStorage.setItem("brainArenaDailyDate", todayKey); localStorage.setItem("brainArenaDailyGame", dailyGame); }
if ($("dailyChallengeCopy")) $("dailyChallengeCopy").textContent = `${GAME_MAP[dailyGame].name} is today's featured run. Your daily pick stays the same until tomorrow.`;
$("playDailyChallenge")?.addEventListener("click", () => { selectedMode = "solo"; currentGame = dailyGame; navigate(`#/game/${dailyGame}`); });
$("gameGrid")?.addEventListener("click", (event) => { const card = event.target.closest("[data-game]"); if (!card) return; const game = card.dataset.game; if (selectedMode === "solo") navigate(`#/game/${game}`); else { currentGame = game; navigate(`#/game/${game}`); } });
$("heroCreateRoom")?.addEventListener("click", () => { selectedMode = "multiplayer"; $("multiDifficulty").classList.remove("hidden"); $("soloDifficulty").classList.add("hidden"); $$(".mode-tab").forEach((t) => { t.classList.toggle("active", t.dataset.mode === "multiplayer"); t.setAttribute("aria-selected", String(t.dataset.mode === "multiplayer")); }); navigate("#/"); setTimeout(() => $("duelLobby")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80); });

function readProgression() {
  try { return JSON.parse(localStorage.getItem("brainArenaProgression") || "null") || Progression.emptyProgress(); }
  catch { return Progression.emptyProgress(); }
}
function renderProgression() {
  const progress = readProgression();
  const level = Progression.getLevel(progress.xp);
  const levelEl = $("progressionLevel");
  if (levelEl) levelEl.textContent = `Level ${level.level}`;
  const xpEl = $("progressionXp");
  if (xpEl) xpEl.textContent = `${progress.xp} XP · ${level.remaining} XP to next level`;
  const streakEl = $("progressionStreak");
  if (streakEl) streakEl.textContent = `${progress.streak || 0} day streak`;
  const fill = $("progressionFill");
  if (fill) fill.style.width = `${level.progress}%`;
  const achievements = $("progressionAchievements");
  if (achievements) {
    const items = Progression.ACHIEVEMENTS;
    achievements.innerHTML = items.map((item) => `<span class="achievement-chip ${progress.achievements?.includes(item.id) ? "unlocked" : "locked"}" title="${ESC(item.description)}" aria-label="${ESC(item.name)}: ${progress.achievements?.includes(item.id) ? "unlocked" : "locked"}">${progress.achievements?.includes(item.id) ? "✦" : "◇"} ${ESC(item.name)}</span>`).join("");
  }
}
function updateStats() {
  $("gamesPlayed").textContent = localStorage.getItem("brainArenaGames") || "0";
  $("bestScore").textContent = localStorage.getItem("brainArenaBest") || "0";
  $("profileGamesPlayed").textContent = $("gamesPlayed").textContent; $("profileBestScore").textContent = $("bestScore").textContent;
  renderProgression();
}
function recordGame(score, game = currentGame || "math") {
  const safeScore = Math.max(0, Math.floor(Number(score) || 0));
  const games = Number(localStorage.getItem("brainArenaGames") || 0) + 1; const best = Number(localStorage.getItem("brainArenaBest") || 0);
  localStorage.setItem("brainArenaGames", String(games)); localStorage.setItem("brainArenaBest", String(Math.max(best, safeScore)));
  const progress = Progression.recordGame(readProgression(), safeScore, game, Progression.localDateKey());
  localStorage.setItem("brainArenaProgression", JSON.stringify(progress)); updateStats();
  if (profile) fetch("/api/leaderboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ playerId, name: profile.name, game, score: safeScore }) }).catch(() => {});
}
updateStats();


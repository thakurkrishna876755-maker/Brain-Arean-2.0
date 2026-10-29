"use strict";
(function exposeProgression(root) {
  const ACHIEVEMENTS = [
    { id: "first-run", name: "First Run", description: "Finish your first game." },
    { id: "ten-runs", name: "Getting Warm", description: "Finish 10 games." },
    { id: "score-50", name: "Big Score", description: "Score 50 or more in one game." },
    { id: "three-day-streak", name: "On a Roll", description: "Play on three consecutive days." },
    { id: "five-games", name: "Explorer", description: "Play five different game types." }
  ];
  function emptyProgress() {
    return { xp: 0, gamesPlayed: 0, bestScore: 0, streak: 0, lastPlayedDate: null, games: [], achievements: [] };
  }
  function localDateKey(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  function previousDate(key) {
    const date = new Date(`${key}T12:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() - 1);
    return date.toISOString().slice(0, 10);
  }
  function getLevel(xp = 0) {
    const safeXp = Math.max(0, Number(xp) || 0);
    const level = Math.floor(safeXp / 100) + 1;
    const within = safeXp % 100;
    return { level, progress: within, remaining: 100 - within };
  }
  function recordGame(previous, score, game, today = localDateKey()) {
    const state = { ...emptyProgress(), ...(previous || {}) };
    state.games = Array.isArray(state.games) ? [...state.games] : [];
    state.achievements = Array.isArray(state.achievements) ? [...state.achievements] : [];
    const safeScore = Math.max(0, Math.floor(Number(score) || 0));
    state.gamesPlayed = Math.max(0, Number(state.gamesPlayed) || 0) + 1;
    state.bestScore = Math.max(Math.max(0, Number(state.bestScore) || 0), safeScore);
    state.xp = Math.max(0, Number(state.xp) || 0) + 10 + Math.min(40, Math.floor(safeScore / 5));
    if (game && !state.games.includes(String(game))) state.games.push(String(game));
    if (state.lastPlayedDate !== today) {
      state.streak = state.lastPlayedDate === previousDate(today) ? Math.max(0, Number(state.streak) || 0) + 1 : 1;
      state.lastPlayedDate = today;
    }
    const unlock = (id, condition) => { if (condition && !state.achievements.includes(id)) state.achievements.push(id); };
    unlock("first-run", state.gamesPlayed >= 1);
    unlock("ten-runs", state.gamesPlayed >= 10);
    unlock("score-50", safeScore >= 50);
    unlock("three-day-streak", state.streak >= 3);
    unlock("five-games", state.games.length >= 5);
    return state;
  }
  const api = { ACHIEVEMENTS, emptyProgress, localDateKey, getLevel, recordGame };
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.BrainArenaProgression = api;
})(typeof window !== "undefined" ? window : globalThis);

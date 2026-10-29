"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const Progression = require("../public/js/progression.js");

test("progression awards XP and unlocks first-run and score achievements", () => {
  const state = Progression.recordGame(Progression.emptyProgress(), 55, "math", "2026-10-28");
  assert.equal(state.xp, 21);
  assert.equal(state.gamesPlayed, 1);
  assert.equal(state.bestScore, 55);
  assert.equal(state.streak, 1);
  assert.deepEqual(state.achievements.sort(), ["first-run", "score-50"]);
});

test("daily streak advances once per day and resets after a missed day", () => {
  let state = Progression.recordGame(Progression.emptyProgress(), 1, "math", "2026-10-26");
  state = Progression.recordGame(state, 1, "math", "2026-10-27");
  assert.equal(state.streak, 2);
  state = Progression.recordGame(state, 1, "word", "2026-10-27");
  assert.equal(state.streak, 2, "multiple games on one day do not inflate streak");
  state = Progression.recordGame(state, 1, "typing", "2026-10-29");
  assert.equal(state.streak, 1, "missing a day resets the streak");
});

test("five distinct game types and ten runs unlock their achievements", () => {
  let state = Progression.emptyProgress();
  for (let i = 0; i < 10; i++) state = Progression.recordGame(state, i, ["math", "word", "typing", "puzzle", "color"][i % 5], "2026-10-28");
  assert.ok(state.achievements.includes("ten-runs"));
  assert.ok(state.achievements.includes("five-games"));
  assert.equal(Progression.getLevel(100).level, 2);
});

"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const read = name => fs.readFileSync(path.join(root, name), "utf8");

test("Memory Matrix, Simon Tap, and Pattern Pulse have distinct gameplay handlers", () => {
  const games = read("public/js/app-games.js");
  assert.match(games, /else if \(game === "memory"\) startMemoryMatrix\(stage\)/);
  assert.match(games, /else if \(game === "simon"\) startSequence\(stage, game\)/);
  assert.match(games, /else if \(game === "pattern"\) startPatternPulse\(stage\)/);
  assert.match(games, /function startMemoryMatrix\(stage\)/);
  assert.match(games, /function startPatternPulse\(stage\)/);
  assert.match(games, /matrix-grid/);
  assert.match(games, /pattern-sequence/);
  assert.match(games, /function startSequence\(stage, game\)/);
});

test("Fake-Out Frenzy is registered and has changing rules with distinct targets", () => {
  const core = read("public/js/app-core.js");
  const games = read("public/js/app-games.js");
  const css = read("public/style.css");
  assert.match(core, /id: "chaos", name: "Fake-Out Frenzy"/);
  assert.match(core, /class="game-art art-\$\{game\.id\}"/);
  assert.match(games, /function startFakeOutFrenzy\(stage\)/);
  assert.match(games, /const rulePool = \[/);
  assert.match(games, /class="chaos-target"/);
  assert.match(css, /\.game-art\{/);
  assert.match(css, /\.chaos-target/);
});

test("game card illustrations and new gameplay visuals have responsive styles", () => {
  const css = read("public/style.css");
  assert.match(css, /@media\(max-width:760px\)\{\.game-card/);
  assert.match(css, /\.matrix-grid/);
  assert.match(css, /\.pattern-sequence/);
  assert.match(css, /\.chaos-grid/);
});


test("Challenge Mode is multiplayer-only and renders rounds inside its game page", () => {
  const core = fs.readFileSync(path.join(__dirname, "../public/js/app-core.js"), "utf8");
  const games = fs.readFileSync(path.join(__dirname, "../public/js/app-games.js"), "utf8");
  const duel = fs.readFileSync(path.join(__dirname, "../public/js/app-duel.js"), "utf8");
  assert.match(core, /id: "challenge"[^}]*multiplayerOnly: true/);
  assert.match(games, /game\.multiplayerOnly && selectedMode !== "multiplayer"/);
  assert.match(duel, /activeRoute==="game"\?\$\("gameDuelRound"\):\$\("duelGame"\)/);
});

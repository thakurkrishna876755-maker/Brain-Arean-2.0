"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");

test("invite dialog supports game choice and starts duel without voting", () => {
  const social = read("public/js/app-social.js");
  const server = read("server.js");
  assert.match(social, /openInviteDialog\(code\)/);
  assert.match(social, /Create room & send invite/);
  assert.match(server, /if \(room\.players\.length === 2\) beginMatch\(room\)/);
  assert.match(server, /const chosenGame = GAMES\.includes\(data\.game\)/);
});

test("GK quiz uses a live trivia source and includes retry handling", () => {
  assert.match(read("server.js"), /opentdb\.com\/api\.php/);
  assert.match(read("public/js/app-games.js"), /startGkQuiz/);
  assert.match(read("public/js/app-games.js"), /Retry question/);
});

test("typing modes, daily challenge, creator identity, and chat retention are present", () => {
  assert.match(read("public/js/app-games.js"), /data-mode="punctuation"/);
  assert.match(read("public/index.html"), /dailyChallengeTitle/);
  assert.match(read("public/index.html"), /KRISHNA SINGH/);
  assert.match(read("public/index.html"), /When either user goes offline/);
  assert.match(read("server.js"), /after-view/);
  assert.match(read("server.js"), /message cleared when a user went offline/);
});

test("Ludo shows die faces and victory/capture moments", () => {
  assert.match(read("public/js/app-ludo.js"), /die-face/);
  assert.match(read("public/js/app-ludo.js"), /showLudoMoment/);
  assert.match(read("public/js/app-socket.js"), /GOTI CAPTURED/);
  assert.match(read("public/js/app-socket.js"), /VICTORY/);
});

test("Ludo displays the numeric dice result independently of the roll button", () => {
  const ludo = read("public/js/app-ludo.js");
  const css = read("public/style.css");
  assert.match(ludo, /id="ludoDiceNumber"/);
  assert.match(ludo, /numberNode\.textContent=value\?String\(value\):"—"/);
  assert.match(ludo, /number\.textContent=lastRoll\?String\(lastRoll\):"—"/);
  assert.match(css, /\.ludo-dice-result/);
});

test("typing passage reacts character-by-character to the user's input", () => {
  const games = read("public/js/app-games.js");
  const css = read("public/style.css");
  assert.match(games, /input\.addEventListener\([\'\"]input[\'\"]/);
  assert.match(games, /typing-char \$\{state\}/);
  assert.match(games, /typed\[i\] === ch \? 'correct' : 'incorrect'/);
  assert.match(css, /\.typing-char\.correct/);
  assert.match(css, /\.typing-char\.incorrect/);
  assert.match(css, /\.typing-game-shell/);
  assert.match(games, /typingDurations/);
  assert.match(games, /data-mode="punctuation"/);
  assert.match(games, /data-mode="numbers"/);
  assert.match(games, /function finish\(\)/);
  assert.match(css, /\.monkeytype-passage/);
  assert.match(css, /\.typing-capture/);
});

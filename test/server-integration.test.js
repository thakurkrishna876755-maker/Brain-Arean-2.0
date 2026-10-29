"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const dataDir = path.join(os.tmpdir(), `brain-arena-test-${process.pid}-${Date.now()}`);
process.env.DATA_DIR = dataDir;
const { app, server, io, initData, createRound, evaluateDuelAnswer, settleRoundState, expireRound, rooms, ludoRooms } = require("../server.js");
const { SocketTestClient } = require("../test-support/socket-test-client.js");

let baseUrl;
const clients = [];

function duelFixture() {
  return {
    code: "TEST1",
    status: "playing",
    round: 1,
    roundData: { answer: "42" },
    players: [{ id: "socket-a", name: "A", score: 0 }, { id: "socket-b", name: "B", score: 0 }],
    lockedOut: new Set(),
    roundResolved: false
  };
}

async function connectPlayer(id, name) {
  const client = new SocketTestClient(baseUrl);
  clients.push(client);
  const connected = client.connected;
  await connected;
  const response = await client.emit("social:register", { playerId: id, name, avatar: "✦", bio: "Test player" });
  assert.equal(response.ok, true);
  return { client, profile: response.profile };
}

test.before(async () => {
  await initData();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  for (const client of clients) await client.close();
  for (const room of rooms.values()) {
    clearTimeout(room.roundTimer);
    clearTimeout(room.nextRoundTimer);
    clearTimeout(room.reactionTimer);
  }
  rooms.clear();
  for (const room of ludoRooms.values()) clearTimeout(room.turnTimer);
  ludoRooms.clear();
  await new Promise((resolve) => io.close(resolve));
  await fs.rm(dataDir, { recursive: true, force: true });
});

test("HTTP app serves the UI, health endpoint and cache-safe leaderboard", async () => {
  const home = await fetch(`${baseUrl}/`);
  assert.equal(home.status, 200);
  assert.match(await home.text(), /Brain Arena/);
  assert.equal(home.headers.get("x-content-type-options"), "nosniff");
  assert.equal(home.headers.get("x-frame-options"), "DENY");
  assert.match(home.headers.get("content-security-policy"), /frame-ancestors 'none'/);

  const css = await fetch(`${baseUrl}/style.css`);
  assert.equal(css.status, 200);
  assert.match(css.headers.get("content-type"), /text\/css/);
  assert.match(css.headers.get("cache-control"), /no-cache/);
  assert.equal(css.headers.get("x-content-type-options"), "nosniff");
  assert.equal(css.headers.get("x-frame-options"), "DENY");

  const scripts = [
    "app.js", "ludo-rules.js", "js/progression.js", "js/app-core.js", "js/app-games.js", "js/app-social.js",
    "js/app-messages.js", "js/app-duel.js", "js/app-ludo.js", "js/app-leaderboard.js",
    "js/app-emoji.js", "js/app-socket.js"
  ];
  for (const scriptPath of scripts) {
    const response = await fetch(`${baseUrl}/${scriptPath}`);
    assert.equal(response.status, 200, `${scriptPath} is served`);
    assert.match(response.headers.get("content-type"), /javascript/);
  }

  const health = await fetch(`${baseUrl}/api/health`);
  assert.deepEqual(await health.json(), { ok: true, service: "brain-arena" });
  const gk = await fetch(`${baseUrl}/api/quiz/gk?nonce=${Date.now()}`, { cache: "no-store" });
  assert.ok([200, 503].includes(gk.status), "GK API returns a question or a clear provider-unavailable status");
  assert.equal(typeof (await gk.json()).ok, "boolean");

  const before = await fetch(`${baseUrl}/api/leaderboard?game=math`);
  assert.match(before.headers.get("cache-control"), /no-store/);
  const invalid = await fetch(`${baseUrl}/api/leaderboard`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ playerId: "player_test_0001", name: "Test", game: "math", score: 201 })
  });
  assert.equal(invalid.status, 400);

  const invalidPlayer = await fetch(`${baseUrl}/api/leaderboard`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ playerId: "bad", name: "Test", game: "math", score: 25 })
  });
  assert.equal(invalidPlayer.status, 400);

  const saved = await fetch(`${baseUrl}/api/leaderboard`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ playerId: "player_test_0001", name: "Test", game: "math", score: 25 })
  });
  assert.equal(saved.status, 201);
  for (let i = 0; i < 7; i++) {
    const extra = await fetch(`${baseUrl}/api/leaderboard`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ playerId: `player_test_extra_${String(i).padStart(2, "0")}`, name: `Extra ${i}`, game: "math", score: 5 })
    });
    assert.equal(extra.status, 201);
  }
  const rateLimited = await fetch(`${baseUrl}/api/leaderboard`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ playerId: "player_test_limited", name: "Limited", game: "math", score: 1 })
  });
  assert.equal(rateLimited.status, 429);

  const refreshed = await fetch(`${baseUrl}/api/leaderboard?game=math&fresh=${Date.now()}`, { cache: "no-store" });
  const data = await refreshed.json();
  assert.equal(data.entries[0].score, 25);
  assert.equal(data.entries[0].name, "Test");
});

test("a single wrong duel answer locks only that player out", () => {
  const room = duelFixture();
  const result = evaluateDuelAnswer(room, "socket-a", "wrong");
  assert.equal(result.correct, false);
  assert.equal(result.lockedOut, true);
  assert.equal(result.shouldResolve, false);
  assert.equal(room.roundResolved, false);
  assert.equal(room.lockedOut.has("socket-a"), true);
  assert.equal(evaluateDuelAnswer(room, "socket-a", "42").ok, false);
});

test("both wrong duel answers resolve immediately with no winner", () => {
  const room = duelFixture();
  assert.equal(evaluateDuelAnswer(room, "socket-a", "wrong").shouldResolve, false);
  const second = evaluateDuelAnswer(room, "socket-b", "still-wrong");
  assert.equal(second.shouldResolve, true);
  const result = settleRoundState(room, null);
  assert.equal(result.winnerId, null);
  assert.equal(room.roundResolved, true);
  assert.deepEqual(room.players.map((player) => player.score), [0, 0]);
});

test("one wrong answer does not prevent the other player from winning correctly", () => {
  const room = duelFixture();
  evaluateDuelAnswer(room, "socket-a", "wrong");
  const correct = evaluateDuelAnswer(room, "socket-b", " 42 ");
  assert.equal(correct.correct, true);
  assert.equal(correct.shouldResolve, true);
  const result = settleRoundState(room, "socket-b");
  assert.equal(result.winnerId, "socket-b");
  assert.deepEqual(room.players.map((player) => player.score), [0, 1]);
});

test("a round expiring with no answers settles without awarding a point", () => {
  const room = duelFixture();
  assert.equal(room.lockedOut.size, 0);
  const result = settleRoundState(room, null);
  assert.equal(result.winnerId, null);
  assert.equal(room.roundResolved, true);
  assert.deepEqual(room.players.map((player) => player.score), [0, 0]);
});

test("odd-one-out duel question and answer always come from the same puzzle", () => {
  const pairs = new Set([
    "Which one is different: 2, 4, 6, 9?|9",
    "Which one is different: apple, pear, carrot, plum?|carrot",
    "Which one is different: triangle, square, circle, blue?|blue"
  ]);
  for (let i = 0; i < 60; i++) {
    const round = createRound({ game: "odd", difficulty: "medium", round: 1 });
    assert.equal(pairs.has(`${round.q}|${round.a}`), true);
  }
});

test("direct messages, edit/delete ownership, and room chat work over live Socket.IO", async () => {
  const a = await connectPlayer("player_test_alpha_01", "Alpha");
  const b = await connectPlayer("player_test_bravo_02", "Bravo");

  const requestSent = await a.client.emit("social:request", { code: b.profile.code });
  assert.equal(requestSent.ok, true);
  let bootstrap;
  let request;
  for (let attempt = 0; attempt < 4 && !request; attempt++) {
    bootstrap = await b.client.waitFor("social:bootstrap");
    request = bootstrap.requests.find((item) => item.direction === "incoming");
  }
  assert.ok(request, "the recipient receives the incoming friend request");
  const accepted = await b.client.emit("social:request:respond", { requestId: request.id, action: "accept" });
  assert.equal(accepted.ok, true);

  const incomingDm = b.client.waitFor("dm:new");
  const sentDm = await a.client.emit("dm:send", { toCode: b.profile.code, text: "Hello from Alpha" });
  assert.equal(sentDm.ok, true);
  const dmEvent = await incomingDm;
  assert.equal(dmEvent.message.text, "Hello from Alpha");
  assert.equal(dmEvent.other.code, a.profile.code);
  const messageId = sentDm.message.id;

  const unauthorizedEdit = b.client.waitFor("dm:error");
  await b.client.send("dm:edit", { messageId, text: "I should not edit this" });
  assert.match((await unauthorizedEdit).message, /own messages/);

  const dmUpdated = b.client.waitFor("dm:updated");
  await a.client.send("dm:edit", { messageId, text: "Edited message" });
  assert.equal((await dmUpdated).message.text, "Edited message");

  const dmDeleted = b.client.waitFor("dm:updated");
  await a.client.send("dm:delete", { messageId });
  const deleted = await dmDeleted;
  assert.equal(deleted.message.deleted, true);
  assert.equal(deleted.message.text, "message deleted");
  const history = await a.client.emit("dm:history", { code: b.profile.code });
  assert.equal(history.ok, true);
  assert.equal(history.messages.find((message) => message.id === messageId).text, "message deleted");

  const roomCreated = await a.client.emit("room:create", { name: "Alpha" });
  assert.equal(roomCreated.ok, true);
  const roomJoined = await b.client.emit("room:join", { code: roomCreated.code, name: "Bravo" });
  assert.equal(roomJoined.ok, true);
  await a.client.emit("room:chat:history", { code: roomCreated.code });
  await b.client.emit("room:chat:history", { code: roomCreated.code });
  const roomMessage = b.client.waitFor("room:chat:new");
  const roomSent = await a.client.emit("room:chat:send", { text: "Good luck!" });
  assert.equal(roomSent.ok, true);
  const received = await roomMessage;
  assert.equal(received.text, "Good luck!");
  assert.equal(received.roomCode, roomCreated.code);

  const roomUpdated = b.client.waitFor("room:chat:updated");
  await a.client.send("room:chat:edit", { messageId: roomSent.message.id, text: "Good game!" });
  assert.equal((await roomUpdated).text, "Good game!");
  const roomDeleted = b.client.waitFor("room:chat:updated");
  await a.client.send("room:chat:delete", { messageId: roomSent.message.id });
  assert.equal((await roomDeleted).text, "message deleted");

  await a.client.send("room:leave", {});
  const rejected = await a.client.emit("room:chat:send", { text: "I left this room" });
  assert.equal(rejected.ok, false);
});

test("live duel ends immediately when both players answer incorrectly", async () => {
  const a = await connectPlayer("player_duel_alpha_01", "Duel Alpha");
  const b = await connectPlayer("player_duel_bravo_02", "Duel Bravo");
  const room = await a.client.emit("room:create", { name: "Duel Alpha", difficulty: "easy", game: "math" });
  assert.equal(room.ok, true);
  const roundReady = a.client.waitFor("duel:round");
  assert.equal((await b.client.emit("room:join", { code: room.code, name: "Duel Bravo" })).ok, true);
  await roundReady;

  const roundResult = b.client.waitFor("duel:roundResult", 1500);
  const start = Date.now();
  const firstWrong = await a.client.emit("duel:submit", { answer: "not-the-answer" });
  assert.equal(firstWrong.lockedOut, true);
  assert.equal(firstWrong.shouldResolve, false);
  const secondWrong = await b.client.emit("duel:submit", { answer: "also-wrong" });
  assert.equal(secondWrong.shouldResolve, true);
  const result = await roundResult;
  assert.ok(Date.now() - start < 1500, "the round should resolve without waiting for its 30-second timer");
  assert.equal(result.winnerId, null);
  assert.ok(result.answer, "the correct answer is revealed after the round");
});

test("live duel lets the opponent win after the first player is locked out", async () => {
  const a = await connectPlayer("player_duel_alpha_02", "Duel Alpha 2");
  const b = await connectPlayer("player_duel_bravo_03", "Duel Bravo 2");
  const room = await a.client.emit("room:create", { name: "Duel Alpha 2", difficulty: "easy", game: "math" });
  const roundReady = a.client.waitFor("duel:round");
  await b.client.emit("room:join", { code: room.code, name: "Duel Bravo 2" });
  await roundReady;
  const currentRoom = rooms.get(room.code);
  assert.ok(currentRoom?.roundData?.answer);

  const roundResult = b.client.waitFor("duel:roundResult", 1500);
  const firstWrong = await a.client.emit("duel:submit", { answer: "wrong" });
  assert.equal(firstWrong.correct, false);
  const correct = await b.client.emit("duel:submit", { answer: currentRoom.roundData.answer });
  assert.equal(correct.correct, true);
  const result = await roundResult;
  assert.equal(result.winnerId, currentRoom.players.find((player) => player.playerId === b.profile.id).id);
  assert.equal(result.players.find((player) => player.id === result.winnerId).score, 1);
});

test("online Ludo room is server-authoritative and enforces turn order", async () => {
  const a = await connectPlayer("player_ludo_alpha_01", "Ludo Alpha");
  const b = await connectPlayer("player_ludo_bravo_02", "Ludo Bravo");
  const created = await a.client.emit("ludo:create", { blockRule: false, finishOnFirst: true });
  assert.equal(created.ok, true);
  const joined = await b.client.emit("ludo:join", { code: created.code });
  assert.equal(joined.ok, true);

  const statePromise = a.client.waitFor("ludo:state");
  const started = await a.client.emit("ludo:start", { code: created.code });
  assert.equal(started.ok, true);
  const state = await statePromise;
  assert.equal(state.status, "playing");
  assert.equal(state.players.length, 2);

  const wrongTurn = await b.client.emit("ludo:roll", { code: created.code });
  assert.equal(wrongTurn.ok, false);
  assert.match(wrongTurn.message, /turn/i);
  const hostRoll = await a.client.emit("ludo:roll", { code: created.code });
  assert.equal(hostRoll.ok, true);
  assert.ok(hostRoll.roll >= 1 && hostRoll.roll <= 6);

  await a.client.emit("room:chat:history", { code: created.code });
  await b.client.emit("room:chat:history", { code: created.code });
  const tableMessage = b.client.waitFor("room:chat:new");
  const sent = await a.client.emit("room:chat:send", { text: "Ludo table chat" });
  assert.equal(sent.ok, true);
  assert.equal((await tableMessage).text, "Ludo table chat");
  const tableEdit = b.client.waitFor("room:chat:updated");
  await a.client.send("room:chat:edit", { messageId: sent.message.id, text: "Ludo message edited" });
  assert.equal((await tableEdit).text, "Ludo message edited");
});


test("live duel timer expiry resolves the round without answers or a winner", async () => {
  const a = await connectPlayer("player_timeout_alpha_01", "Timeout Alpha");
  const b = await connectPlayer("player_timeout_bravo_02", "Timeout Bravo");
  const room = await a.client.emit("room:create", { name: "Timeout Alpha", difficulty: "easy", game: "math" });
  const roundReady = a.client.waitFor("duel:round");
  await b.client.emit("room:join", { code: room.code, name: "Timeout Bravo" });
  await roundReady;
  const currentRoom = rooms.get(room.code);
  const resultPromise = b.client.waitFor("duel:roundResult", 1500);
  assert.equal(expireRound(currentRoom), true);
  const result = await resultPromise;
  assert.equal(result.winnerId, null);
  assert.match(result.message, /time is up/i);
  assert.deepEqual(result.players.map((player) => player.score), [0, 0]);
  assert.equal(expireRound(currentRoom), false, "a settled round cannot expire twice");
});

test("Challenge Mode starts automatically and rotates game types each round", async () => {
  const a = await connectPlayer("player_challenge_a", "Challenger A");
  const b = await connectPlayer("player_challenge_b", "Challenger B");
  const created = await a.client.emit("room:create", { name: "Challenger A", game: "challenge", difficulty: "easy" });
  assert.equal(created.ok, true);
  const joined = await b.client.emit("room:join", { code: created.code, name: "Challenger B" });
  assert.equal(joined.ok, true);
  const firstRound = await a.client.waitFor("duel:round");
  assert.equal(firstRound.matchGame, "challenge");
  assert.equal(firstRound.game, "math");
  const room = rooms.get(created.code);
  assert.ok(room?.roundData?.answer);
  const nextRoundPromise = a.client.waitFor("duel:round", 4000);
  const submitted = await a.client.emit("duel:submit", { answer: room.roundData.answer });
  assert.equal(submitted.ok, true);
  assert.equal(submitted.correct, true);
  const secondRound = await nextRoundPromise;
  assert.equal(secondRound.round, 2);
  assert.equal(secondRound.game, "puzzle");
  assert.equal(secondRound.matchGame, "challenge");
});

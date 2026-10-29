"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Ludo = require("../public/ludo-rules.js");

function game(ids = ["red-player", "green-player"], options = {}) {
  return Ludo.createGame(ids, options);
}

function setDie(state, value) {
  state.dice = value;
}

test("a token leaves the yard only on a six", () => {
  const state = game();
  const noMove = Ludo.rollDice(state, "red-player", 5);
  assert.deepEqual(noMove.legalMoves, []);
  assert.equal(state.players[0].tokens[0], -1);
  assert.equal(state.players[state.turn].id, "green-player");

  const nextTurn = Ludo.rollDice(state, "green-player", 6);
  assert.deepEqual(nextTurn.legalMoves, [0, 1, 2, 3]);
  Ludo.moveToken(state, "green-player", 0);
  assert.equal(state.players[1].tokens[0], 0);
  assert.equal(state.turn, 1, "a six grants the player another turn");
});

test("a token captures an opponent on a non-safe square", () => {
  const state = game();
  state.players[0].tokens[0] = 0;
  state.players[1].tokens[0] = 40; // green's progress 40 is red's track index 1
  setDie(state, 1);
  const result = Ludo.moveToken(state, "red-player", 0);
  assert.deepEqual(result.captured, [{ playerId: "green-player", tokenIndex: 0 }]);
  assert.equal(state.players[1].tokens[0], -1);
  assert.equal(result.extraTurn, true);
});

test("safe squares protect tokens from capture", () => {
  const state = game();
  state.players[0].tokens[0] = 7;
  state.players[1].tokens[0] = 47; // both tokens will be on safe index 8
  setDie(state, 1);
  const result = Ludo.moveToken(state, "red-player", 0);
  assert.equal(result.captured.length, 0);
  assert.equal(state.players[1].tokens[0], 47);
  assert.equal(Ludo.isSafe(8, "red"), true);
});

test("three sixes forfeit the turn without playing the third move", () => {
  const state = game();
  Ludo.rollDice(state, "red-player", 6);
  Ludo.moveToken(state, "red-player", 0);
  Ludo.rollDice(state, "red-player", 6);
  Ludo.moveToken(state, "red-player", 1);
  const third = Ludo.rollDice(state, "red-player", 6);
  assert.equal(third.forfeited, true);
  assert.deepEqual(third.legalMoves, []);
  assert.equal(state.players[0].tokens[2], -1);
  assert.equal(state.turn, 1);
  assert.equal(state.sixesInRow, 0);
});

test("a token enters the home column and needs an exact roll to finish", () => {
  const state = game();
  state.players[0].tokens[0] = 50;
  setDie(state, 1);
  Ludo.moveToken(state, "red-player", 0);
  assert.equal(state.players[0].tokens[0], 51);
  assert.equal(Ludo.tokenPosition("red", 51).type, "home-lane");

  state.turn = 0;
  state.players[0].tokens[0] = 56;
  state.dice = 2;
  assert.deepEqual(Ludo.legalMoves(state, "red-player", 2), []);
  state.dice = 1;
  assert.deepEqual(Ludo.legalMoves(state, "red-player", 1), [0]);
  const result = Ludo.moveToken(state, "red-player", 0);
  assert.equal(result.reachedHome, true);
  assert.equal(state.players[0].tokens[0], 57);
});

test("a player wins when all four tokens reach home", () => {
  const state = game();
  state.players[0].tokens = [57, 57, 57, 56];
  state.players[0].finished = false;
  state.dice = 1;
  const result = Ludo.moveToken(state, "red-player", 3);
  assert.equal(result.status, "finished");
  assert.equal(Ludo.hasWon(state, "red-player"), true);
  assert.deepEqual(state.winners, ["red-player"]);
});

test("a player cannot roll again before moving the current die", () => {
  const state = game();
  Ludo.rollDice(state, "red-player", 6);
  assert.throws(() => Ludo.rollDice(state, "red-player", 2), /Move the rolled token/);
});

test("block rule prevents entering or passing an opponent pair", () => {
  const state = game(["red-player", "green-player"], { blockRule: true });
  state.players[1].tokens[0] = 40;
  state.players[1].tokens[1] = 40;
  state.players[0].tokens[0] = 0;
  assert.equal(Ludo.legalMoves(state, "red-player", 1).includes(0), false);
});

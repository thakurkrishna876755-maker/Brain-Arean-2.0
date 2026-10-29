(function (root, factory) {
  const rules = factory();
  if (typeof module === "object" && module.exports) module.exports = rules;
  if (root) root.LudoRules = rules;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const COLORS = ["red", "green", "yellow", "blue"];
  const START_INDEX = { red: 0, green: 13, yellow: 26, blue: 39 };
  const SAFE_INDICES = new Set(COLORS.flatMap((color) => {
    const start = START_INDEX[color];
    return [start, (start + 8) % 52];
  }));
  const TRACK = [
    [6,1],[6,2],[6,3],[6,4],[6,5],[5,6],[4,6],[3,6],[2,6],[1,6],[0,6],[0,7],[0,8],
    [1,8],[2,8],[3,8],[4,8],[5,8],[6,9],[6,10],[6,11],[6,12],[6,13],[6,14],[7,14],[8,14],
    [8,13],[8,12],[8,11],[8,10],[8,9],[9,8],[10,8],[11,8],[12,8],[13,8],[14,8],[14,7],[14,6],
    [13,6],[12,6],[11,6],[10,6],[9,6],[8,5],[8,4],[8,3],[8,2],[8,1],[8,0],[7,0],[6,0]
  ];
  const HOME_PATH = {
    red: [[7,1],[7,2],[7,3],[7,4],[7,5],[7,6]],
    green: [[1,7],[2,7],[3,7],[4,7],[5,7],[6,7]],
    yellow: [[7,13],[7,12],[7,11],[7,10],[7,9],[7,8]],
    blue: [[13,7],[12,7],[11,7],[10,7],[9,7],[8,7]]
  };

  function createGame(playerIds, options = {}) {
    if (!Array.isArray(playerIds) || playerIds.length < 2 || playerIds.length > 4) {
      throw new Error("Ludo requires 2 to 4 players.");
    }
    const colors = COLORS.slice(0, playerIds.length);
    return {
      status: "playing",
      turn: 0,
      dice: null,
      sixesInRow: 0,
      lastRoll: null,
      players: playerIds.map((id, index) => ({
        id: String(id), color: colors[index],
        tokens: [-1, -1, -1, -1],
        finished: false,
        place: null
      })),
      options: { blockRule: Boolean(options.blockRule), finishOnFirst: options.finishOnFirst !== false, autoMove: Boolean(options.autoMove) },
      winners: [],
      log: []
    };
  }

  function getPlayer(game, playerId) {
    return game.players.find((player) => player.id === String(playerId));
  }

  function trackIndex(color, progress) {
    if (progress < 0 || progress > 50) return null;
    return (START_INDEX[color] + progress) % 52;
  }

  function tokenPosition(color, progress) {
    if (progress < 0) return null;
    if (progress <= 50) {
      const index = trackIndex(color, progress);
      return { type: "track", index, row: TRACK[index][0], col: TRACK[index][1] };
    }
    if (progress <= 56) {
      const point = HOME_PATH[color][progress - 51];
      return { type: "home-lane", row: point[0], col: point[1] };
    }
    return { type: "home", row: 7, col: 7 };
  }

  function legalMoves(game, playerId, roll) {
    const player = getPlayer(game, playerId);
    if (!player || !Number.isInteger(roll) || roll < 1 || roll > 6 || player.finished) return [];
    const moves = [];
    player.tokens.forEach((progress, tokenIndex) => {
      if (progress === 57) return;
      if (progress === -1) {
        if (roll === 6) moves.push(tokenIndex);
        return;
      }
      const next = progress + roll;
      if (next <= 57 && !wouldHitBlock(game, player, progress, next)) moves.push(tokenIndex);
    });
    return moves;
  }

  function wouldHitBlock(game, player, from, to) {
    if (!game.options.blockRule || to > 50) return false;
    for (let step = from + 1; step <= to; step++) {
      const index = trackIndex(player.color, step);
      const blocks = game.players.some((other) => other.id !== player.id && other.tokens.some((progress) => {
        if (progress < 0 || progress > 50) return false;
        const otherIndex = trackIndex(other.color, progress);
        if (otherIndex !== index) return false;
        const count = other.tokens.filter((p) => p >= 0 && p <= 50 && trackIndex(other.color, p) === index).length;
        return count >= 2;
      }));
      if (blocks) return true;
    }
    return false;
  }

  function rollDice(game, playerId, forcedRoll) {
    const player = getPlayer(game, playerId);
    if (!player || player.id !== game.players[game.turn]?.id || game.status !== "playing") {
      throw new Error("It is not this player's turn.");
    }
    if (game.dice !== null) throw new Error("Move the rolled token before rolling again.");
    const roll = Number.isInteger(forcedRoll) && forcedRoll >= 1 && forcedRoll <= 6
      ? forcedRoll : Math.floor(Math.random() * 6) + 1;
    if (roll === 6) game.sixesInRow += 1;
    else game.sixesInRow = 0;
    game.dice = roll;
    game.lastRoll = roll;
    if (game.sixesInRow >= 3) {
      game.sixesInRow = 0;
      game.dice = null;
      advanceTurn(game);
      return { roll, legalMoves: [], forfeited: true, extraTurn: false };
    }
    const moves = legalMoves(game, playerId, roll);
    if (moves.length === 0) {
      const extraTurn = roll === 6;
      game.dice = null;
      if (!extraTurn) advanceTurn(game);
      return { roll, legalMoves: [], forfeited: false, extraTurn };
    }
    return { roll, legalMoves: moves, forfeited: false, extraTurn: false };
  }

  function moveToken(game, playerId, tokenIndex) {
    const player = getPlayer(game, playerId);
    if (!player || player.id !== game.players[game.turn]?.id || game.status !== "playing") throw new Error("It is not this player's turn.");
    if (!Number.isInteger(tokenIndex) || tokenIndex < 0 || tokenIndex > 3 || !game.dice) throw new Error("Invalid token move.");
    const roll = game.dice;
    if (!legalMoves(game, playerId, roll).includes(tokenIndex)) throw new Error("That token cannot move.");
    const oldProgress = player.tokens[tokenIndex];
    const nextProgress = oldProgress === -1 ? 0 : oldProgress + roll;
    player.tokens[tokenIndex] = nextProgress;
    game.dice = null;

    let captured = [];
    if (nextProgress >= 0 && nextProgress <= 50) {
      const index = trackIndex(player.color, nextProgress);
      if (!SAFE_INDICES.has(index)) {
        game.players.forEach((other) => {
          if (other.id === player.id) return;
          other.tokens = other.tokens.map((progress, otherTokenIndex) => {
            if (progress < 0 || progress > 50) return progress;
            if (trackIndex(other.color, progress) === index) {
              captured.push({ playerId: other.id, tokenIndex: otherTokenIndex });
              return -1;
            }
            return progress;
          });
        });
      }
    }

    if (player.tokens.every((progress) => progress === 57)) {
      player.finished = true;
      player.place = game.winners.length + 1;
      game.winners.push(player.id);
      if (game.options.finishOnFirst || game.winners.length === game.players.length - 1) game.status = "finished";
    }

    const reachedHome = nextProgress === 57;
    const extraTurn = roll === 6 || captured.length > 0 || reachedHome;
    game.sixesInRow = roll === 6 ? game.sixesInRow : 0;
    if (!extraTurn && game.status === "playing") advanceTurn(game);
    game.log.push({ type: "move", playerId: player.id, tokenIndex, roll, captured, reachedHome, extraTurn });
    return { player, tokenIndex, from: oldProgress, to: nextProgress, captured, reachedHome, extraTurn, status: game.status };
  }

  function advanceTurn(game) {
    if (!game.players.length) return;
    let attempts = 0;
    do {
      game.turn = (game.turn + 1) % game.players.length;
      attempts += 1;
    } while (game.players[game.turn]?.finished && attempts <= game.players.length);
  }

  function isSafe(progress, color) {
    if (progress < 0 || progress > 50) return false;
    return SAFE_INDICES.has(trackIndex(color, progress));
  }

  function hasWon(game, playerId) {
    const player = getPlayer(game, playerId);
    return Boolean(player && player.tokens.every((progress) => progress === 57));
  }

  return { COLORS, START_INDEX, SAFE_INDICES, TRACK, HOME_PATH, createGame, getPlayer, trackIndex, tokenPosition, legalMoves, rollDice, moveToken, advanceTurn, isSafe, hasWon };
});

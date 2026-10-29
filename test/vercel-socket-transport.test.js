"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

test("browser Socket.IO client uses WebSocket directly on Vercel", () => {
  const source = fs.readFileSync("public/js/app-core.js", "utf8");
  assert.match(source, /transports:\s*\[\s*["']websocket["']\s*\]/);
  assert.match(source, /reconnection:\s*true/);
  assert.match(source, /reconnectionAttempts:\s*Infinity/);
  assert.match(source, /socket\.on\(["']connect_error["']/);
});

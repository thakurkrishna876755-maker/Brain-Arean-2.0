"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const typingText = require("../public/js/typing-text.js");

test("words mode contains plain words without punctuation or digits", () => {
  const text = typingText.generate("words", 70);
  assert.match(text, /^[a-z]+(?: [a-z]+)+$/);
  assert.doesNotMatch(text, /[.,;:!?\d]/);
});

test("punctuation mode produces sentence-style passages with varied punctuation", () => {
  const text = typingText.generate("punctuation", 70);
  assert.match(text, /[.!?;]/);
  assert.match(text, /[A-Z]/);
  assert.ok((text.match(/[.!?;]/g) || []).length >= 4, "punctuation should be present throughout the passage");
  assert.doesNotMatch(text, /\d/);
});

test("numbers mode meaningfully includes digits", () => {
  const text = typingText.generate("numbers", 70);
  assert.match(text, /\d/);
});

test("new passages differ from the immediately previous passage in every mode", () => {
  for (const mode of ["words", "punctuation", "numbers"]) {
    const previous = typingText.generate(mode, 70);
    const next = typingText.generate(mode, 70, previous);
    assert.notEqual(next, previous, `${mode} mode repeated the previous passage`);
  }
});

test("unknown mode safely falls back to plain words", () => {
  assert.match(typingText.generate("unexpected", 70), /^[a-z]+(?: [a-z]+)+$/);
});

import test from "node:test";
import assert from "node:assert/strict";

import { removeCustomPresetsByIds } from "../scripts/custom-preset-management.js";

function makeCustomPresets() {
  return {
    "custom-first": { id: "custom-first", label: "First", source: "custom" },
    "custom-second": { id: "custom-second", label: "Second", source: "custom" },
    "custom-third": { id: "custom-third", label: "[TEST] Third", source: "custom", isTestPreset: true },
  };
}

test("removes only selected custom preset ids", () => {
  const source = makeCustomPresets();
  const result = removeCustomPresetsByIds(source, ["custom-second"]);

  assert.equal(result.removedCount, 1);
  assert.deepEqual(result.removedIds, ["custom-second"]);
  assert.deepEqual(Object.keys(result.customPresets).sort(), ["custom-first", "custom-third"]);
  assert.deepEqual(Object.keys(source).sort(), ["custom-first", "custom-second", "custom-third"]);
});

test("multiple deletion preserves unselected custom presets", () => {
  const result = removeCustomPresetsByIds(
    makeCustomPresets(),
    ["custom-first", "custom-third"],
  );

  assert.equal(result.removedCount, 2);
  assert.deepEqual(result.removedIds, ["custom-first", "custom-third"]);
  assert.deepEqual(Object.keys(result.customPresets), ["custom-second"]);
});

test("missing ids and duplicate selections are ignored cleanly", () => {
  const result = removeCustomPresetsByIds(
    makeCustomPresets(),
    ["missing", "custom-first", "custom-first", null],
  );

  assert.equal(result.removedCount, 1);
  assert.deepEqual(result.removedIds, ["custom-first"]);
  assert.deepEqual(Object.keys(result.customPresets).sort(), ["custom-second", "custom-third"]);
});

test("empty selection changes nothing", () => {
  const source = makeCustomPresets();
  const result = removeCustomPresetsByIds(source, []);

  assert.equal(result.removedCount, 0);
  assert.deepEqual(result.removedIds, []);
  assert.deepEqual(result.customPresets, source);
});

test("built-in ids cannot be deleted because they are absent from customPresets", () => {
  const source = makeCustomPresets();
  const result = removeCustomPresetsByIds(source, ["bless", "testReplacementNormal"]);

  assert.equal(result.removedCount, 0);
  assert.deepEqual(result.customPresets, source);
});

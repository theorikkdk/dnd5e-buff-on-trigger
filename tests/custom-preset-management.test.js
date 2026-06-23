import test from "node:test";
import assert from "node:assert/strict";

import {
  removeCustomPresetsByIds,
  selectCustomPresetsForExport,
} from "../scripts/custom-preset-management.js";
import { buildCustomPresetExportEnvelope } from "../scripts/custom-preset-import.js";

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

test("deletion accepts a stored preset id when it differs from the setting key", () => {
  const source = {
    "custom-setting-key": {
      id: "custom-stable-id",
      label: "Replaced preset",
      source: "custom",
    },
    "custom-other": {
      id: "custom-other",
      label: "Other",
      source: "custom",
    },
  };
  const result = removeCustomPresetsByIds(source, ["custom-stable-id"]);

  assert.equal(result.removedCount, 1);
  assert.deepEqual(result.removedIds, ["custom-stable-id"]);
  assert.deepEqual(Object.keys(result.customPresets), ["custom-other"]);
  assert.deepEqual(Object.keys(source), ["custom-setting-key", "custom-other"]);
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

test("exports all visible custom presets in visible order", () => {
  const result = selectCustomPresetsForExport(
    makeCustomPresets(),
    ["custom-second", "custom-first"],
  );

  assert.equal(result.exportedCount, 2);
  assert.deepEqual(result.exportedIds, ["custom-second", "custom-first"]);
  assert.deepEqual(result.presets.map((preset) => preset.label), ["Second", "First"]);
  assert.equal(buildCustomPresetExportEnvelope(result.presets, "dnd5e-buff-on-trigger").schemaVersion, 1);
});

test("exports only selected visible preset ids", () => {
  const result = selectCustomPresetsForExport(
    makeCustomPresets(),
    ["custom-first", "custom-second", "custom-third"],
    ["custom-second"],
  );

  assert.equal(result.exportedCount, 1);
  assert.deepEqual(result.exportedIds, ["custom-second"]);
  assert.equal(buildCustomPresetExportEnvelope(result.presets, "dnd5e-buff-on-trigger").schemaVersion, 1);
});

test("export ignores missing ids and presets excluded from the visible list", () => {
  const source = {
    ...makeCustomPresets(),
    "custom-invalid": { id: "custom-invalid", label: "Invalid" },
  };
  const result = selectCustomPresetsForExport(
    source,
    ["custom-first", "missing"],
    ["custom-first", "custom-invalid", "missing"],
  );

  assert.equal(result.exportedCount, 1);
  assert.deepEqual(result.exportedIds, ["custom-first"]);
});

test("TEST customs are exported only when included in the visible ids", () => {
  const hiddenResult = selectCustomPresetsForExport(
    makeCustomPresets(),
    ["custom-first", "custom-second"],
  );
  const debugResult = selectCustomPresetsForExport(
    makeCustomPresets(),
    ["custom-first", "custom-second", "custom-third"],
  );

  assert.equal(hiddenResult.presets.some((preset) => preset.isTestPreset), false);
  assert.equal(debugResult.presets.some((preset) => preset.isTestPreset), true);
});

test("empty export selection is handled cleanly", () => {
  const result = selectCustomPresetsForExport(
    makeCustomPresets(),
    ["custom-first"],
    [],
  );

  assert.equal(result.exportedCount, 0);
  assert.deepEqual(result.presets, []);
});

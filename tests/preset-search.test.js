import test from "node:test";
import assert from "node:assert/strict";

import { buildPresetSearchView } from "../scripts/preset-search.js";

const PRESETS = [
  {
    id: "bless",
    label: "Bénédiction / Bless",
    description: "Ajoute 1d4 aux jets d’attaque.",
    source: "builtIn",
    presetType: "builtIn",
    triggerType: "passive",
  },
  {
    id: "custom-fire",
    label: "[Perso] Bouclier ardent",
    description: "Résistance au feu.",
    source: "custom",
    presetType: "custom",
    triggerType: "damaged",
  },
  {
    id: "test-damaged",
    label: "[TEST] Damaged",
    description: "Development preset",
    source: "builtIn",
    presetType: "test",
    isTestPreset: true,
    triggerType: "damaged",
  },
];

function flatten(view) {
  return view.groups.flatMap((group) => group.presets);
}

test("preset search matches labels without case or accent sensitivity", () => {
  assert.deepEqual(flatten(buildPresetSearchView(PRESETS, { query: "BLESS" })).map((preset) => preset.id), ["bless"]);
  assert.deepEqual(flatten(buildPresetSearchView(PRESETS, { query: "benediction" })).map((preset) => preset.id), ["bless"]);
});

test("preset search matches descriptions and trigger types", () => {
  assert.deepEqual(flatten(buildPresetSearchView(PRESETS, { query: "résistance au feu" })).map((preset) => preset.id), ["custom-fire"]);
  assert.deepEqual(flatten(buildPresetSearchView(PRESETS, { query: "damaged" })).map((preset) => preset.id), ["custom-fire", "test-damaged"]);
});

test("preset groups keep built-in, custom, and test entries separate", () => {
  const view = buildPresetSearchView(PRESETS);
  assert.deepEqual(view.groups.map((group) => group.key), ["builtIn", "custom", "test"]);
  assert.deepEqual(view.groups.map((group) => group.presets.map((preset) => preset.id)), [
    ["bless"],
    ["custom-fire"],
    ["test-damaged"],
  ]);
});

test("test presets are hidden outside debug and visible in debug", () => {
  const normal = buildPresetSearchView(PRESETS, { showTestPresets: false });
  const debug = buildPresetSearchView(PRESETS, { showTestPresets: true });

  assert.deepEqual(flatten(normal).map((preset) => preset.id), ["bless", "custom-fire"]);
  assert.deepEqual(flatten(debug).map((preset) => preset.id), ["bless", "custom-fire", "test-damaged"]);
});

test("search reports visible and hidden counts and handles no result", () => {
  const partial = buildPresetSearchView(PRESETS, { query: "bless" });
  assert.deepEqual({
    total: partial.totalCount,
    visible: partial.visibleCount,
    hidden: partial.hiddenCount,
  }, {
    total: 3,
    visible: 1,
    hidden: 2,
  });

  const empty = buildPresetSearchView(PRESETS, { query: "introuvable" });
  assert.equal(empty.visibleCount, 0);
  assert.equal(empty.hiddenCount, 3);
  assert.deepEqual(empty.groups, []);
});

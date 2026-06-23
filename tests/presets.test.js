import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { validateAndNormalizeImportedPreset } from "../scripts/custom-preset-import.js";
import { BUFF_PRESETS, CORE_PRESET_IDS } from "../scripts/presets.js";

const DEFAULT_CONFIG = {
  type: "passive",
  stackingMode: "normal",
  triggerFrequency: "none",
  receivedDamageTypes: [],
  endConditions: null,
  rollModifier: null,
  status: null,
  save: null,
  buffs: {
    resistances: [],
    abilityCheckModifiers: {},
  },
};

const CORE_PRESET_ID_SET = new Set(CORE_PRESET_IDS);

function isTestPreset(preset) {
  return preset?.isTestPreset === true
    || String(preset?.id ?? "").startsWith("test")
    || String(preset?.label ?? "").startsWith("[TEST]");
}

function getVisiblePresets(debug) {
  return BUFF_PRESETS.filter((preset) => debug || !isTestPreset(preset));
}

function getPreset(id) {
  return BUFF_PRESETS.find((preset) => preset.id === id);
}

test("built-in preset IDs are unique", () => {
  const ids = BUFF_PRESETS.map((preset) => preset.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("the core preset pack contains the supported useful presets", () => {
  assert.deepEqual(CORE_PRESET_IDS, [
    "guidance",
    "resistance",
    "bless",
    "bane",
    "shieldOfFaith",
    "heroism",
    "protectionFromPoison",
  ]);

  for (const id of CORE_PRESET_IDS) {
    const preset = getPreset(id);
    assert.ok(preset, `missing core preset: ${id}`);
    assert.equal(isTestPreset(preset), false, `${id} must not be marked as a test preset`);
    assert.notEqual(preset.source, "custom");
  }
});

test("normal visibility keeps useful presets and hides development presets", () => {
  const normalIds = new Set(getVisiblePresets(false).map((preset) => preset.id));
  const debugIds = new Set(getVisiblePresets(true).map((preset) => preset.id));
  const testPresets = BUFF_PRESETS.filter(isTestPreset);

  for (const id of CORE_PRESET_IDS) assert.equal(normalIds.has(id), true);
  for (const preset of testPresets) {
    assert.equal(normalIds.has(preset.id), false);
    assert.equal(debugIds.has(preset.id), true);
  }
});

test("all built-in preset flags pass the reusable preset validator", () => {
  for (const preset of BUFF_PRESETS) {
    const result = validateAndNormalizeImportedPreset({
      label: preset.label,
      description: preset.description,
      flag: preset.flag,
    }, {
      defaultConfig: DEFAULT_CONFIG,
    });

    assert.deepEqual(result.errors, [], `${preset.id}: ${result.errors.join(", ")}`);
    assert.ok(result.preset, `${preset.id} should normalize successfully`);
  }
});

test("core preset mechanics match the supported module features", () => {
  assert.deepEqual(getPreset("guidance").flag.rollModifier, {
    enabled: true,
    formula: "1d4",
    rollTypes: ["ability", "skill"],
    consumptionMode: "prompt",
  });
  assert.equal(getPreset("guidance").flag.charges, 1);

  assert.deepEqual(getPreset("resistance").flag.rollModifier, {
    enabled: true,
    formula: "1d4",
    rollTypes: ["save"],
    consumptionMode: "prompt",
  });
  assert.equal(getPreset("resistance").flag.charges, 1);

  assert.equal(getPreset("bless").flag.rollModifier.formula, "1d4");
  assert.deepEqual(getPreset("bless").flag.rollModifier.rollTypes, ["attack", "save"]);
  assert.equal(getPreset("bless").flag.rollModifier.consumptionMode, undefined);
  assert.equal(getPreset("bane").flag.rollModifier.formula, "-1d4");
  assert.deepEqual(getPreset("bane").flag.rollModifier.rollTypes, ["attack", "save"]);
  assert.equal(getPreset("bane").flag.rollModifier.consumptionMode, undefined);
  assert.equal(getPreset("shieldOfFaith").flag.buffs.ac, 2);

  assert.equal(getPreset("heroism").flag.type, "turnStart");
  assert.equal(getPreset("heroism").flag.temporaryHp.mode, "keepHighest");
  assert.deepEqual(getPreset("heroism").flag.buffs.conditionImmunities, ["frightened"]);

  assert.deepEqual(getPreset("protectionFromPoison").flag.buffs.resistances, ["poison"]);
  assert.equal(getPreset("protectionFromPoison").flag.buffs.conditionImmunities, undefined);
});

test("core preset labels and descriptions exist in English and French", async () => {
  const [english, french] = await Promise.all([
    readFile(new URL("../lang/en.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../lang/fr.json", import.meta.url), "utf8").then(JSON.parse),
  ]);

  for (const preset of BUFF_PRESETS.filter((entry) => CORE_PRESET_ID_SET.has(entry.id))) {
    for (const translations of [english, french]) {
      assert.equal(typeof translations[preset.label], "string", `${preset.label} is missing`);
      assert.ok(translations[preset.label].trim(), `${preset.label} is empty`);
      assert.equal(typeof translations[preset.description], "string", `${preset.description} is missing`);
      assert.ok(translations[preset.description].trim(), `${preset.description} is empty`);
    }
  }
});

import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCustomPresetExportEnvelope,
  CUSTOM_PRESET_SCHEMA_VERSION,
  isValidStoredCustomPreset,
  normalizeImportedPresetBatch,
  validateAndNormalizeImportedPreset,
  validateCustomPresetImportEnvelope,
} from "../scripts/custom-preset-import.js";

const MODULE_ID = "dnd5e-buff-on-trigger";
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

function validate(preset) {
  return validateAndNormalizeImportedPreset(preset, {
    defaultConfig: DEFAULT_CONFIG,
  });
}

function createUniqueId(base, existing) {
  let id = String(base);
  let index = 2;
  while (existing[id]) id = `${base}-${index++}`;
  return id;
}

test("minimal preset is accepted and merged with defaults", () => {
  const result = validate({ label: "Minimal", flag: {} });

  assert.deepEqual(result.errors, []);
  assert.equal(result.preset.label, "Minimal");
  assert.equal(result.preset.flag.type, "passive");
  assert.equal(result.preset.flag.stackingMode, "normal");
  assert.equal(result.preset.flag.triggerFrequency, "none");
});

test("unknown stackingMode is normalized to normal with a warning", () => {
  const result = validate({
    label: "Stacking",
    flag: { stackingMode: "mystery" },
  });

  assert.equal(result.preset.flag.stackingMode, "normal");
  assert.match(result.warnings.join("\n"), /stackingMode/);
});

test("unknown triggerFrequency is normalized to none with a warning", () => {
  const result = validate({
    label: "Frequency",
    flag: { triggerFrequency: "sometimes" },
  });

  assert.equal(result.preset.flag.triggerFrequency, "none");
  assert.match(result.warnings.join("\n"), /triggerFrequency/);
});

test("unknown trigger type rejects the preset", () => {
  const result = validate({
    label: "Unknown trigger",
    flag: { type: "onMoonrise" },
  });

  assert.equal(result.preset, null);
  assert.match(result.errors.join("\n"), /flag\.type/);
});

test("real import batch never stores a preset with an unknown trigger", () => {
  const result = normalizeImportedPresetBatch([
    { id: "minimal", label: "Import Test Minimal", flag: {} },
    { id: "bad-stacking", label: "Import Test Bad Stacking", flag: { stackingMode: "broken" } },
    { id: "bad-trigger", label: "Import Test Bad Trigger", flag: { type: "trigger_inconnu" } },
    { id: "hidden", label: "[TEST] Import Test Hidden", flag: {} },
  ], {
    defaultConfig: DEFAULT_CONFIG,
    existingPresets: {},
    createUniqueId: (base, existing) => {
      let id = `custom-${base}`;
      let index = 2;
      while (existing[id]) id = `custom-${base}-${index++}`;
      return id;
    },
  });

  const stored = Object.values(result.customPresets);
  assert.equal(result.importedCount, 3);
  assert.equal(result.warningPresetCount, 1);
  assert.equal(result.rejectedCount, 1);
  assert.equal(result.copyCount, 0);
  assert.deepEqual(
    stored.map((preset) => preset.label),
    ["Import Test Minimal", "Import Test Bad Stacking", "[TEST] Import Test Hidden"],
  );
  assert.equal(stored.some((preset) => preset.label === "Import Test Bad Trigger"), false);
  assert.equal(stored.find((preset) => preset.label === "Import Test Bad Stacking").flag.stackingMode, "normal");
  assert.equal(stored.find((preset) => preset.label.startsWith("[TEST]")).isTestPreset, true);
  assert.match(result.errors.join("\n"), /trigger_inconnu/);
});

test("batch imports three valid presets with a clear empty report", () => {
  const result = normalizeImportedPresetBatch([
    { id: "first", label: "First", flag: {} },
    { id: "second", label: "Second", flag: { type: "damaged" } },
    { id: "third", label: "Third", flag: { stackingMode: "alwaysStack" } },
  ], {
    defaultConfig: DEFAULT_CONFIG,
    existingPresets: {},
    createUniqueId: (base) => `custom-${base}`,
  });

  assert.equal(result.importedCount, 3);
  assert.equal(result.warningPresetCount, 0);
  assert.equal(result.rejectedCount, 0);
  assert.equal(result.copyCount, 0);
  assert.deepEqual(result.warningPresets, []);
  assert.deepEqual(result.rejectedPresets, []);
  assert.deepEqual(result.copiedPresets, []);
});

test("reimport creates unique copies and reports duplicate ids and labels", () => {
  const source = [
    { id: "custom-first", label: "First", flag: {} },
    { id: "custom-second", label: "Second", flag: {} },
  ];
  const firstImport = normalizeImportedPresetBatch(source, {
    defaultConfig: DEFAULT_CONFIG,
    existingPresets: {},
    createUniqueId,
  });
  const secondImport = normalizeImportedPresetBatch(source, {
    defaultConfig: DEFAULT_CONFIG,
    existingPresets: firstImport.customPresets,
    createUniqueId,
  });

  assert.equal(secondImport.importedCount, 2);
  assert.equal(secondImport.copyCount, 2);
  assert.deepEqual(
    Object.keys(secondImport.customPresets).sort(),
    ["custom-first", "custom-first-2", "custom-second", "custom-second-2"],
  );
  assert.ok(secondImport.copiedPresets.every((preset) =>
    preset.reasons.includes("id") && preset.reasons.includes("label")
  ));
});

test("duplicate strategy skip keeps existing presets and imports new ones", () => {
  const existing = {
    "custom-first": {
      id: "custom-first",
      label: "First",
      description: "Original",
      flag: { type: "passive" },
      source: "custom",
    },
  };
  const result = normalizeImportedPresetBatch([
    { id: "custom-first", label: "First", description: "Changed", flag: { type: "damaged" } },
    { id: "custom-second", label: "Second", flag: {} },
  ], {
    defaultConfig: DEFAULT_CONFIG,
    existingPresets: existing,
    duplicateCandidates: existing,
    duplicateStrategy: "skip",
    createUniqueId,
  });

  assert.equal(result.importedCount, 1);
  assert.equal(result.skippedCount, 1);
  assert.equal(result.replacedCount, 0);
  assert.equal(result.copyCount, 0);
  assert.equal(result.customPresets["custom-first"].description, "Original");
  assert.equal(result.customPresets["custom-first"].flag.type, "passive");
  assert.equal(result.customPresets["custom-second"].label, "Second");
});

test("duplicate strategy replace preserves the existing custom id and updates content", () => {
  const existing = {
    "custom-existing-key": {
      id: "custom-stable-id",
      label: "First",
      description: "Original",
      flag: { type: "passive" },
      source: "custom",
    },
  };
  const result = normalizeImportedPresetBatch([
    {
      id: "different-import-id",
      label: "FIRST",
      description: "Replacement",
      flag: { type: "damaged", stackingMode: "alwaysStack" },
    },
  ], {
    defaultConfig: DEFAULT_CONFIG,
    existingPresets: existing,
    duplicateCandidates: existing,
    duplicateStrategy: "replace",
    createUniqueId,
  });

  assert.equal(result.importedCount, 0);
  assert.equal(result.replacedCount, 1);
  assert.equal(result.skippedCount, 0);
  assert.equal(result.copyCount, 0);
  assert.deepEqual(Object.keys(result.customPresets), ["custom-existing-key"]);
  assert.equal(result.customPresets["custom-existing-key"].id, "custom-stable-id");
  assert.equal(result.customPresets["custom-existing-key"].label, "FIRST");
  assert.equal(result.customPresets["custom-existing-key"].description, "Replacement");
  assert.equal(result.customPresets["custom-existing-key"].flag.type, "damaged");
});

test("built-in id collision is not treated as an existing custom duplicate", () => {
  const result = normalizeImportedPresetBatch([
    { id: "bless", label: "Bless", flag: {} },
  ], {
    defaultConfig: DEFAULT_CONFIG,
    existingPresets: {},
    duplicateCandidates: {},
    duplicateStrategy: "replace",
    createUniqueId: (base) => `custom-${base}`,
  });

  assert.equal(result.duplicateCount, 0);
  assert.equal(result.replacedCount, 0);
  assert.equal(result.importedCount, 1);
  assert.equal(result.customPresets["custom-bless"].label, "Bless");
});

test("duplicates inside one batch follow the selected strategy", () => {
  const source = [
    { id: "custom-shared", label: "Shared", description: "First", flag: {} },
    { id: "custom-shared", label: "Shared", description: "Second", flag: { type: "damaged" } },
  ];
  const skipped = normalizeImportedPresetBatch(source, {
    defaultConfig: DEFAULT_CONFIG,
    existingPresets: {},
    duplicateCandidates: {},
    duplicateStrategy: "skip",
    createUniqueId,
  });
  const replaced = normalizeImportedPresetBatch(source, {
    defaultConfig: DEFAULT_CONFIG,
    existingPresets: {},
    duplicateCandidates: {},
    duplicateStrategy: "replace",
    createUniqueId,
  });

  assert.equal(skipped.importedCount, 1);
  assert.equal(skipped.skippedCount, 1);
  assert.equal(skipped.customPresets["custom-shared"].description, "First");
  assert.equal(replaced.importedCount, 1);
  assert.equal(replaced.replacedCount, 1);
  assert.equal(replaced.customPresets["custom-shared"].description, "Second");
  assert.equal(replaced.customPresets["custom-shared"].flag.type, "damaged");
});

test("invalid preset in a duplicate batch remains rejected without affecting valid entries", () => {
  const existing = {
    "custom-first": {
      id: "custom-first",
      label: "First",
      flag: {},
      source: "custom",
    },
  };
  const result = normalizeImportedPresetBatch([
    { id: "custom-first", label: "First", flag: { type: "damaged" } },
    { id: "invalid", label: "Invalid", flag: { type: "not-supported" } },
    { id: "custom-new", label: "New", flag: {} },
  ], {
    defaultConfig: DEFAULT_CONFIG,
    existingPresets: existing,
    duplicateCandidates: existing,
    duplicateStrategy: "replace",
    createUniqueId,
  });

  assert.equal(result.replacedCount, 1);
  assert.equal(result.rejectedCount, 1);
  assert.equal(result.importedCount, 1);
  assert.equal(result.customPresets["custom-first"].flag.type, "damaged");
  assert.equal(result.customPresets["custom-new"].label, "New");
  assert.equal(Object.values(result.customPresets).some((preset) => preset.label === "Invalid"), false);
});

test("batch of invalid presets does not crash and reports every rejection", () => {
  const result = normalizeImportedPresetBatch([
    null,
    { label: "Missing flag" },
    { label: "Bad trigger", flag: { type: "unknown" } },
  ], {
    defaultConfig: DEFAULT_CONFIG,
    existingPresets: {},
    createUniqueId: (base) => `custom-${base}`,
  });

  assert.equal(result.importedCount, 0);
  assert.equal(result.rejectedCount, 3);
  assert.equal(result.copyCount, 0);
  assert.equal(result.rejectedPresets.length, 3);
  assert.deepEqual(result.customPresets, {});
});

test("known invalid nested types are sanitized without throwing", () => {
  const result = validate({
    label: "Malformed nested fields",
    flag: {
      rollModifier: { enabled: true, formula: "1d4", rollTypes: { attack: true } },
      endConditions: { onDamageTaken: true, onDamageTakenTypes: 42 },
      buffs: "not-an-object",
      status: 12,
      save: ["wis"],
    },
  });

  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.preset.flag.rollModifier.rollTypes, []);
  assert.deepEqual(result.preset.flag.endConditions.onDamageTakenTypes, []);
  assert.deepEqual(result.preset.flag.buffs, DEFAULT_CONFIG.buffs);
  assert.equal(result.preset.flag.status, null);
  assert.equal(result.preset.flag.save, null);
  assert.equal(result.warnings.length, 5);
});

test("unknown roll modifier consumption mode is normalized to automatic", () => {
  const result = validate({
    label: "Optional roll modifier",
    flag: {
      rollModifier: {
        enabled: true,
        formula: "1d4",
        rollTypes: ["save"],
        consumptionMode: "sometimes",
      },
    },
  });

  assert.deepEqual(result.errors, []);
  assert.equal(result.preset.flag.rollModifier.consumptionMode, "automatic");
  assert.match(result.warnings.join("\n"), /consumptionMode/);
});

test("prompt roll modifier consumption mode survives import normalization", () => {
  const result = validate({
    label: "Prompt roll modifier",
    flag: {
      rollModifier: {
        enabled: true,
        formula: "1d4",
        rollTypes: ["ability"],
        consumptionMode: "prompt",
      },
    },
  });

  assert.deepEqual(result.errors, []);
  assert.equal(result.preset.flag.rollModifier.consumptionMode, "prompt");
});

test("preset without a plain flag object is rejected", () => {
  for (const flag of [undefined, null, "bad", [], 42]) {
    const result = validate({ label: "Invalid", flag });
    assert.equal(result.preset, null);
    assert.match(result.errors.join("\n"), /preset\.flag/);
  }
});

test("imported TEST preset is explicitly marked", () => {
  const result = validate({
    label: "  [TEST] Imported helper  ",
    description: 123,
    flag: {},
  });

  assert.equal(result.preset.label, "[TEST] Imported helper");
  assert.equal(result.preset.description, "123");
  assert.equal(result.preset.isTestPreset, true);
});

test("unknown fields remain available in this minimal pass", () => {
  const result = validate({
    label: "Future field",
    flag: { futureExtension: { enabled: true } },
  });

  assert.deepEqual(result.preset.flag.futureExtension, { enabled: true });
});

test("stored presets with an unknown trigger are filtered without being mutated", () => {
  const invalidStoredPreset = {
    id: "custom-bad-trigger",
    label: "Import Test Bad Trigger",
    flag: { type: "trigger_inconnu" },
    source: "custom",
  };
  const snapshot = structuredClone(invalidStoredPreset);

  assert.equal(isValidStoredCustomPreset(invalidStoredPreset, {
    defaultConfig: DEFAULT_CONFIG,
  }), false);
  assert.deepEqual(invalidStoredPreset, snapshot);
});

test("import envelope accepts the module or a legacy missing module", () => {
  const current = validateCustomPresetImportEnvelope({
    module: MODULE_ID,
    schemaVersion: 1,
    presets: [],
  }, MODULE_ID);
  assert.equal(current.valid, true);
  assert.equal(current.schemaVersion, 1);
  assert.equal(current.legacy, false);

  const legacy = validateCustomPresetImportEnvelope({
    presets: [],
  }, MODULE_ID);
  assert.equal(legacy.valid, true);
  assert.equal(legacy.schemaVersion, 1);
  assert.equal(legacy.legacy, true);
  assert.match(legacy.warnings.join("\n"), /schemaVersion/);
});

test("legacy envelope with only version remains accepted as schema 1", () => {
  const result = validateCustomPresetImportEnvelope({
    module: MODULE_ID,
    version: "1",
    presets: [],
  }, MODULE_ID);

  assert.equal(result.valid, true);
  assert.equal(result.schemaVersion, CUSTOM_PRESET_SCHEMA_VERSION);
  assert.equal(result.legacy, true);
});

test("unknown or non-numeric schema versions are rejected strictly", () => {
  const unsupported = validateCustomPresetImportEnvelope({
    module: MODULE_ID,
    schemaVersion: 999,
    presets: [],
  }, MODULE_ID);
  const stringVersion = validateCustomPresetImportEnvelope({
    module: MODULE_ID,
    schemaVersion: "1",
    presets: [],
  }, MODULE_ID);

  assert.equal(unsupported.valid, false);
  assert.match(unsupported.errors.join("\n"), /unsupported/);
  assert.equal(stringVersion.valid, false);
  assert.match(stringVersion.errors.join("\n"), /expected integer/);
});

test("export envelope includes explicit schemaVersion 1", () => {
  const presets = [{ id: "custom-one", label: "One", flag: {} }];
  const envelope = buildCustomPresetExportEnvelope(presets, MODULE_ID);

  assert.deepEqual(envelope, {
    module: MODULE_ID,
    schemaVersion: 1,
    version: "1",
    presets,
  });
  assert.notEqual(envelope.presets, presets);
});

test("schemaVersion 1 envelope remains compatible with duplicate batch strategies", () => {
  const data = {
    module: MODULE_ID,
    schemaVersion: 1,
    version: "1",
    presets: [{ id: "custom-first", label: "First", flag: { type: "damaged" } }],
  };
  const existing = {
    "custom-first": {
      id: "custom-first",
      label: "First",
      flag: { type: "passive" },
      source: "custom",
    },
  };

  assert.equal(validateCustomPresetImportEnvelope(data, MODULE_ID).valid, true);
  const result = normalizeImportedPresetBatch(data.presets, {
    defaultConfig: DEFAULT_CONFIG,
    existingPresets: existing,
    duplicateCandidates: existing,
    duplicateStrategy: "replace",
    createUniqueId,
  });
  assert.equal(result.replacedCount, 1);
  assert.equal(result.customPresets["custom-first"].flag.type, "damaged");
});

test("import envelope rejects another module and malformed preset collections", () => {
  const wrongModule = validateCustomPresetImportEnvelope({
    module: "another-module",
    schemaVersion: 1,
    presets: [],
  }, MODULE_ID);
  assert.equal(wrongModule.valid, false);
  assert.ok(wrongModule.errors.includes("import: wrong module"));

  const malformed = validateCustomPresetImportEnvelope({
    module: MODULE_ID,
    schemaVersion: 1,
    presets: {},
  }, MODULE_ID);
  assert.equal(malformed.valid, false);
  assert.match(malformed.errors.join("\n"), /presets/);
});

const TRIGGER_TYPES = new Set([
  "mwak",
  "rwak",
  "msak",
  "rsak",
  "anyAttack",
  "weaponAttack",
  "spellAttack",
  "damaged",
  "healed",
  "turnStart",
  "targetTurnStart",
  "turnEnd",
  "targetTurnEnd",
  "passive",
]);
const STACKING_MODES = new Set(["normal", "alwaysStack", "sameEffect", "noStack"]);
const TRIGGER_FREQUENCIES = new Set(["none", "turn", "round"]);

const TOP_LEVEL_OBJECT_FIELDS = [
  "multiTargetLimit",
  "targetFilters",
  "endConditions",
  "reminders",
  "damage",
  "save",
  "status",
  "healing",
  "temporaryHp",
  "rollModifier",
];
const BUFF_ARRAY_FIELDS = [
  "attackModeAttackTypes",
  "incomingAttackCreatureTypes",
  "incomingAttackAttackTypes",
  "abilityCheckAdvantages",
  "abilityCheckDisadvantages",
  "savingThrowAdvantages",
  "savingThrowDisadvantages",
  "skills",
  "skillBonusSkills",
  "attackBonusAttackTypes",
  "weaponProfs",
  "armorProfs",
  "languages",
  "resistances",
  "vulnerabilities",
  "immunities",
  "conditionImmunities",
];

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function clone(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function mergePlainObjects(base, override) {
  const result = clone(base ?? {});
  for (const [key, value] of Object.entries(override ?? {})) {
    if (isPlainObject(value) && isPlainObject(result[key])) {
      result[key] = mergePlainObjects(result[key], value);
    } else {
      result[key] = clone(value);
    }
  }
  return result;
}

function resetInvalidObject(container, key, warnings, fallback = undefined) {
  if (!(key in container) || container[key] === undefined) return;
  if (isPlainObject(container[key])) return;
  if (container[key] === null && fallback === undefined) return;
  warnings.push(`${key}: expected object`);
  if (fallback === undefined) delete container[key];
  else container[key] = clone(fallback);
}

function resetInvalidArray(container, key, warnings, path = key) {
  if (!(key in container) || container[key] === undefined) return;
  if (Array.isArray(container[key])) return;
  warnings.push(`${path}: expected array`);
  container[key] = [];
}

function sanitizeKnownFlagTypes(flag, warnings) {
  resetInvalidArray(flag, "receivedDamageTypes", warnings);

  for (const field of TOP_LEVEL_OBJECT_FIELDS) resetInvalidObject(flag, field, warnings);
  resetInvalidObject(flag, "buffs", warnings, {});

  if (isPlainObject(flag.targetFilters)) {
    resetInvalidArray(flag.targetFilters, "creatureTypes", warnings, "targetFilters.creatureTypes");
    resetInvalidArray(flag.targetFilters, "excludedCreatureTypes", warnings, "targetFilters.excludedCreatureTypes");
    resetInvalidObject(flag.targetFilters, "abilityScores", warnings, {});
  }
  if (isPlainObject(flag.endConditions)) {
    resetInvalidArray(flag.endConditions, "onDamageTakenTypes", warnings, "endConditions.onDamageTakenTypes");
  }
  if (isPlainObject(flag.reminders)) {
    resetInvalidObject(flag.reminders, "timing", warnings, {});
  }
  if (isPlainObject(flag.damage)) {
    resetInvalidArray(flag.damage, "targetCreatureTypes", warnings, "damage.targetCreatureTypes");
  }
  if (isPlainObject(flag.save)) {
    resetInvalidObject(flag.save, "repeat", warnings, {});
  }
  if (isPlainObject(flag.status)) {
    resetInvalidArray(flag.status, "ids", warnings, "status.ids");
  }
  if (isPlainObject(flag.rollModifier)) {
    resetInvalidArray(flag.rollModifier, "rollTypes", warnings, "rollModifier.rollTypes");
  }
  if (isPlainObject(flag.buffs)) {
    for (const field of BUFF_ARRAY_FIELDS) {
      resetInvalidArray(flag.buffs, field, warnings, `buffs.${field}`);
    }
    resetInvalidObject(flag.buffs, "abilityCheckModifiers", warnings, {});
    resetInvalidObject(flag.buffs, "savingThrowModifiers", warnings, {});
    resetInvalidObject(flag.buffs, "movement", warnings);
    resetInvalidObject(flag.buffs, "speed", warnings);
  }
}

export function validateCustomPresetImportEnvelope(data, moduleId) {
  const errors = [];
  if (!isPlainObject(data)) errors.push("import: expected object");
  else {
    if (data.module && data.module !== moduleId) errors.push("import: wrong module");
    if (!Array.isArray(data.presets)) errors.push("import.presets: expected array");
  }
  return { valid: errors.length === 0, errors };
}

export function validateAndNormalizeImportedPreset(preset, { defaultConfig = {} } = {}) {
  const warnings = [];
  const errors = [];
  if (!isPlainObject(preset)) {
    errors.push("preset: expected object");
    return { preset: null, warnings, errors };
  }

  const label = String(preset.label ?? "").trim();
  const description = String(preset.description ?? "").trim();
  if (!label) errors.push("preset.label: required");
  if (!isPlainObject(preset.flag)) errors.push("preset.flag: expected object");
  if (errors.length) return { preset: null, warnings, errors };

  const flag = clone(preset.flag);
  const type = String(flag.type ?? defaultConfig.type ?? "passive").trim();
  if (!TRIGGER_TYPES.has(type)) {
    errors.push(`flag.type: unsupported value "${type}"`);
    return { preset: null, warnings, errors };
  }
  flag.type = type;

  const stackingMode = String(flag.stackingMode ?? defaultConfig.stackingMode ?? "normal").trim();
  if (!STACKING_MODES.has(stackingMode)) {
    warnings.push(`flag.stackingMode: normalized "${stackingMode}" to "normal"`);
    flag.stackingMode = "normal";
  } else {
    flag.stackingMode = stackingMode;
  }

  const triggerFrequency = String(flag.triggerFrequency ?? defaultConfig.triggerFrequency ?? "none").trim();
  if (!TRIGGER_FREQUENCIES.has(triggerFrequency)) {
    warnings.push(`flag.triggerFrequency: normalized "${triggerFrequency}" to "none"`);
    flag.triggerFrequency = "none";
  } else {
    flag.triggerFrequency = triggerFrequency;
  }

  sanitizeKnownFlagTypes(flag, warnings);
  return {
    preset: {
      label,
      description,
      flag: mergePlainObjects(defaultConfig, flag),
      isTestPreset: label.startsWith("[TEST]"),
    },
    warnings,
    errors,
  };
}

export function isValidStoredCustomPreset(preset, { defaultConfig = {} } = {}) {
  return validateAndNormalizeImportedPreset(preset, { defaultConfig }).preset !== null;
}

function findDuplicatePresetEntry(customPresets, requestedId, normalizedLabel) {
  const entries = Object.entries(customPresets ?? {});
  const idEntry = requestedId
    ? entries.find(([key, preset]) => key === requestedId || preset?.id === requestedId)
    : null;
  const labelEntry = entries.find(([, preset]) =>
    String(preset?.label ?? "").trim().toLocaleLowerCase() === normalizedLabel
  );
  const matchedEntry = idEntry ?? labelEntry ?? null;
  if (!matchedEntry) return null;

  const reasons = [];
  if (idEntry) reasons.push("id");
  if (labelEntry) reasons.push("label");
  return {
    key: matchedEntry[0],
    preset: matchedEntry[1],
    reasons,
  };
}

export function normalizeImportedPresetBatch(
  presets,
  {
    defaultConfig = {},
    existingPresets = {},
    duplicateCandidates = existingPresets,
    duplicateStrategy = "copy",
    createUniqueId,
  } = {}
) {
  const strategy = ["copy", "skip", "replace"].includes(duplicateStrategy)
    ? duplicateStrategy
    : "copy";
  const customPresets = clone(existingPresets ?? {});
  const duplicatePresetMap = clone(duplicateCandidates ?? {});
  const warnings = [];
  const errors = [];
  const warningPresets = [];
  const rejectedPresets = [];
  const copiedPresets = [];
  const skippedPresets = [];
  const replacedPresets = [];
  const duplicatePresets = [];
  let importedCount = 0;

  for (const [index, rawPreset] of (presets ?? []).entries()) {
    const result = validateAndNormalizeImportedPreset(rawPreset, { defaultConfig });
    warnings.push(...result.warnings.map((warning) => `preset[${index}]: ${warning}`));
    const inputLabel = String(rawPreset?.label ?? "").trim() || `#${index + 1}`;
    if (!result.preset || result.errors.length) {
      const presetErrors = result.errors.map((error) => `preset[${index}]: ${error}`);
      errors.push(...presetErrors);
      rejectedPresets.push({ index, label: inputLabel, errors: presetErrors });
      continue;
    }
    if (result.warnings.length) {
      warningPresets.push({ index, label: result.preset.label, warnings: [...result.warnings] });
    }

    const requestedId = String(rawPreset.id ?? "").trim();
    const normalizedLabel = result.preset.label.toLocaleLowerCase();
    const duplicate = findDuplicatePresetEntry(duplicatePresetMap, requestedId, normalizedLabel);
    if (duplicate) {
      duplicatePresets.push({
        index,
        label: result.preset.label,
        existingId: duplicate.preset?.id ?? duplicate.key,
        reasons: [...duplicate.reasons],
      });
      if (strategy === "skip") {
        skippedPresets.push({
          index,
          label: result.preset.label,
          existingId: duplicate.preset?.id ?? duplicate.key,
          reasons: [...duplicate.reasons],
        });
        continue;
      }
      if (strategy === "replace") {
        const existingId = duplicate.preset?.id ?? duplicate.key;
        const flag = clone(result.preset.flag);
        delete flag.presetMeta;
        const replacement = {
          ...result.preset,
          id: existingId,
          flag,
          source: "custom",
        };
        customPresets[duplicate.key] = replacement;
        duplicatePresetMap[duplicate.key] = clone(replacement);
        replacedPresets.push({
          index,
          label: result.preset.label,
          id: existingId,
          reasons: [...duplicate.reasons],
        });
        continue;
      }
    }

    const id = typeof createUniqueId === "function"
      ? createUniqueId(rawPreset.id ?? result.preset.label, customPresets)
      : String(rawPreset.id ?? result.preset.label);
    if (!id) {
      errors.push(`preset[${index}]: unable to create id`);
      continue;
    }

    const flag = clone(result.preset.flag);
    delete flag.presetMeta;
    customPresets[id] = {
      ...result.preset,
      id,
      flag,
      source: "custom",
    };
    duplicatePresetMap[id] = clone(customPresets[id]);
    if (duplicate) {
      copiedPresets.push({
        index,
        label: result.preset.label,
        id,
        reasons: [...duplicate.reasons],
      });
    }
    importedCount += 1;
  }

  return {
    customPresets,
    importedCount,
    warningPresetCount: warningPresets.length,
    rejectedCount: rejectedPresets.length,
    copyCount: copiedPresets.length,
    skippedCount: skippedPresets.length,
    replacedCount: replacedPresets.length,
    duplicateCount: duplicatePresets.length,
    warnings,
    errors,
    warningPresets,
    rejectedPresets,
    copiedPresets,
    skippedPresets,
    replacedPresets,
    duplicatePresets,
    duplicateStrategy: strategy,
  };
}

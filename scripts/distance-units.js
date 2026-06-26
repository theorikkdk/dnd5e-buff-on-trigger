function clone(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

export function getDistanceUnit(actor = null) {
  const actorUnit = actor?.system?.attributes?.movement?.units;
  if (actorUnit) return actorUnit;

  try {
    const defaultUnit = globalThis.dnd5e?.utils?.defaultUnits?.("length");
    if (defaultUnit) return defaultUnit;
  } catch {
    // Ignore and fall back to settings/canvas.
  }

  try {
    return globalThis.game?.settings?.get?.("dnd5e", "metricLengthUnits") ? "m" : "ft";
  } catch {
    // Ignore and fall back to canvas/default feet.
  }

  return globalThis.canvas?.scene?.grid?.units ?? "ft";
}

export function getDistanceUnitType(unit) {
  const normalized = String(unit ?? "").trim().toLowerCase();
  const configuredType = globalThis.CONFIG?.DND5E?.movementUnits?.[normalized]?.type;
  if (configuredType === "metric" || configuredType === "imperial") return configuredType;
  if (["m", "meter", "meters", "metre", "metres"].includes(normalized)) return "metric";
  if (["ft", "foot", "feet"].includes(normalized)) return "imperial";
  return null;
}

export function distanceFeetToCurrentUnit(feet, actor = null) {
  const numericFeet = Number(feet);
  if (!Number.isFinite(numericFeet)) return feet;
  const unitType = getDistanceUnitType(getDistanceUnit(actor));
  if (unitType === "imperial") return numericFeet;
  if (unitType === "metric") {
    const converted = globalThis.dnd5e?.utils?.convertLength?.(numericFeet, "ft", "m", { strict: false });
    return Number.isFinite(converted) ? Math.round(converted) : Math.round(numericFeet * 0.3);
  }
  return numericFeet;
}

export function resolveDistanceBuffValue(value, feetValue, actor = null) {
  if (feetValue !== undefined && feetValue !== null && feetValue !== "") {
    return distanceFeetToCurrentUnit(feetValue, actor);
  }
  return value;
}

export function convertPresetDistanceFields(flag, actor = null, fields = [
  ["darkvision", "darkvisionFeet"],
  ["blindsight", "blindsightFeet"],
  ["tremorsense", "tremorsenseFeet"],
  ["truesight", "truesightFeet"],
]) {
  const converted = clone(flag ?? {});
  const buffs = converted.buffs;
  if (!buffs) return converted;

  for (const [field, feetField] of fields) {
    const feet = buffs[feetField];
    if (feet === undefined || feet === null || feet === "") continue;
    buffs[field] = distanceFeetToCurrentUnit(feet, actor);
  }

  return converted;
}

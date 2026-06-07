import { MODULE_ID, ABILITY_IDS, SKILL_IDS, DAMAGE_TYPES, CONDITION_IDS, ARMOR_PROF_IDS, WEAPON_PROF_IDS, LANGUAGE_IDS, ATTACK_TRIGGER_TYPES, debugLog } from "./constants.js";

import { buildItemDurationData, getItemDurationInRounds } from "./duration.js";
import { BUFF_PRESETS } from "./presets.js";

const MOVEMENT_TYPES = ["walk", "fly", "swim", "climb", "burrow"];
const CREATURE_TYPES = ["aberration", "celestial", "elemental", "fey", "fiend", "undead", "beast", "dragon", "giant", "humanoid", "monstrosity", "ooze", "plant", "construct"];

const getSkillLabels = () => ({
  acr: game.i18n.localize("BOT.skills.acr"),
  ani: game.i18n.localize("BOT.skills.ani"),
  arc: game.i18n.localize("BOT.skills.arc"),
  ath: game.i18n.localize("BOT.skills.ath"),
  dec: game.i18n.localize("BOT.skills.dec"),
  his: game.i18n.localize("BOT.skills.his"),
  ins: game.i18n.localize("BOT.skills.ins"),
  itm: game.i18n.localize("BOT.skills.itm"),
  inv: game.i18n.localize("BOT.skills.inv"),
  med: game.i18n.localize("BOT.skills.med"),
  nat: game.i18n.localize("BOT.skills.nat"),
  prc: game.i18n.localize("BOT.skills.prc"),
  prf: game.i18n.localize("BOT.skills.prf"),
  per: game.i18n.localize("BOT.skills.per"),
  rel: game.i18n.localize("BOT.skills.rel"),
  slt: game.i18n.localize("BOT.skills.slt"),
  ste: game.i18n.localize("BOT.skills.ste"),
  sur: game.i18n.localize("BOT.skills.sur")
});

const getDamageLabels = () => ({
  acid: game.i18n.localize("BOT.damageTypes.acid"),
  bludgeoning: game.i18n.localize("BOT.damageTypes.bludgeoning"),
  cold: game.i18n.localize("BOT.damageTypes.cold"),
  fire: game.i18n.localize("BOT.damageTypes.fire"),
  force: game.i18n.localize("BOT.damageTypes.force"),
  lightning: game.i18n.localize("BOT.damageTypes.lightning"),
  necrotic: game.i18n.localize("BOT.damageTypes.necrotic"),
  piercing: game.i18n.localize("BOT.damageTypes.piercing"),
  poison: game.i18n.localize("BOT.damageTypes.poison"),
  psychic: game.i18n.localize("BOT.damageTypes.psychic"),
  radiant: game.i18n.localize("BOT.damageTypes.radiant"),
  slashing: game.i18n.localize("BOT.damageTypes.slashing"),
  thunder: game.i18n.localize("BOT.damageTypes.thunder")
});

const getWeaponProfLabels = () => ({
  sim: game.i18n.localize("BOT.weaponProficiencies.sim"),
  mar: game.i18n.localize("BOT.weaponProficiencies.mar"),
  longsword: game.i18n.localize("BOT.weaponProficiencies.longsword"),
  shortsword: game.i18n.localize("BOT.weaponProficiencies.shortsword"),
  dagger: game.i18n.localize("BOT.weaponProficiencies.dagger"),
  handaxe: game.i18n.localize("BOT.weaponProficiencies.handaxe"),
  greataxe: game.i18n.localize("BOT.weaponProficiencies.greataxe"),
  battleaxe: game.i18n.localize("BOT.weaponProficiencies.battleaxe"),
  mace: game.i18n.localize("BOT.weaponProficiencies.mace"),
  warhammer: game.i18n.localize("BOT.weaponProficiencies.warhammer"),
  spear: game.i18n.localize("BOT.weaponProficiencies.spear"),
  quarterstaff: game.i18n.localize("BOT.weaponProficiencies.quarterstaff"),
  bow: game.i18n.localize("BOT.weaponProficiencies.bow"),
  crossbow: game.i18n.localize("BOT.weaponProficiencies.crossbow")
});

const getArmorProfLabels = () => ({
  lgt: game.i18n.localize("BOT.armorProficiencies.lgt"),
  med: game.i18n.localize("BOT.armorProficiencies.med"),
  hvy: game.i18n.localize("BOT.armorProficiencies.hvy"),
  shl: game.i18n.localize("BOT.armorProficiencies.shl")
});

const getLanguageLabels = () => ({
  common: game.i18n.localize("BOT.languages.common"),
  elvish: game.i18n.localize("BOT.languages.elvish"),
  dwarvish: game.i18n.localize("BOT.languages.dwarvish"),
  orcish: game.i18n.localize("BOT.languages.orcish"),
  draconic: game.i18n.localize("BOT.languages.draconic"),
  infernal: game.i18n.localize("BOT.languages.infernal"),
  celestial: game.i18n.localize("BOT.languages.celestial"),
  abyssal: game.i18n.localize("BOT.languages.abyssal"),
  undercommon: game.i18n.localize("BOT.languages.undercommon"),
  gnomish: game.i18n.localize("BOT.languages.gnomish"),
  halfling: game.i18n.localize("BOT.languages.halfling"),
  goblin: game.i18n.localize("BOT.languages.goblin"),
  sylvan: game.i18n.localize("BOT.languages.sylvan"),
  primordial: game.i18n.localize("BOT.languages.primordial"),
  deep: game.i18n.localize("BOT.languages.deep")
});

const isFilled = value => {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.trim() !== "";
  return value !== null && value !== undefined && value !== "";
};

const toSafeArray = (values) => {
  if (Array.isArray(values)) return values.filter(Boolean);
  if (typeof values === "string") return values.split(",").map((value) => value.trim()).filter(Boolean);
  if (values === null || values === undefined) return [];
  return [values].filter(Boolean);
};

const listSelectedLabels = (values, labels = {}) => toSafeArray(values)
  .map(value => labels?.[value] ?? value)
  .filter(Boolean)
  .join(", ");

const abilityFieldName = (prefix, ability) => `${prefix}${ability.charAt(0).toUpperCase()}${ability.slice(1)}`;

function normalizeTargetFilterNumberValue(value, label) {
  if (!isFilled(value)) return "";
  const text = String(value).trim();
  if (!Number.isFinite(Number(text))) {
    debugLog(`[${MODULE_ID}] Restriction cible ignoree : valeur non numerique pour ${label} (${value})`);
    return "";
  }
  return text;
}

function normalizeTargetFilterAbilityScores(raw = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  const result = {};
  for (const ability of ABILITY_IDS) {
    const min = normalizeTargetFilterNumberValue(source?.[ability]?.min, `${ability}.min`);
    const max = normalizeTargetFilterNumberValue(source?.[ability]?.max, `${ability}.max`);
    if (isFilled(min) || isFilled(max)) {
      result[ability] = {
        ...(isFilled(min) ? { min } : {}),
        ...(isFilled(max) ? { max } : {}),
      };
    }
  }
  return result;
}

function buildTargetFilters(creatureTypes = [], excludedCreatureTypes = [], abilityScores = {}) {
  const normalizedAbilityScores = normalizeTargetFilterAbilityScores(abilityScores);
  const filters = {};
  const includedTypes = toSafeArray(creatureTypes);
  const excludedTypes = toSafeArray(excludedCreatureTypes);
  if (includedTypes.length) filters.creatureTypes = includedTypes;
  if (excludedTypes.length) filters.excludedCreatureTypes = excludedTypes;
  if (Object.keys(normalizedAbilityScores).length) filters.abilityScores = normalizedAbilityScores;
  return Object.keys(filters).length ? filters : null;
}

function normalizeMultiTargetLimit(raw = {}) {
  if (raw?.enabled !== true) return null;
  const toNumber = (value, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const baseTargets = Math.max(1, Math.floor(toNumber(raw.baseTargets, 1)));
  const baseSpellLevel = Math.max(0, Math.floor(toNumber(raw.baseSpellLevel, 1)));
  const targetsPerLevelAbove = Math.max(0, Math.floor(toNumber(raw.targetsPerLevelAbove, 0)));
  return { enabled: true, baseTargets, baseSpellLevel, targetsPerLevelAbove };
}

function formatMultiTargetLimitSummary(limit) {
  const normalized = normalizeMultiTargetLimit(limit);
  if (!normalized) return null;
  if (normalized.targetsPerLevelAbove > 0) {
    return game.i18n.format("BOT.ui.multiTargetLimit.summaryScaling", {
      base: normalized.baseTargets,
      per: normalized.targetsPerLevelAbove,
      level: normalized.baseSpellLevel,
    });
  }
  return game.i18n.format("BOT.ui.multiTargetLimit.summaryFixed", { base: normalized.baseTargets });
}

function readTargetFilterAbilityScoresFromData(data = {}) {
  return Object.fromEntries(ABILITY_IDS.map((ability) => [ability, {
    min: data[abilityFieldName("targetFilterAbilityMin", ability)] ?? "",
    max: data[abilityFieldName("targetFilterAbilityMax", ability)] ?? "",
  }]));
}

function readTargetFilterAbilityScoresFromForm(form) {
  return Object.fromEntries(ABILITY_IDS.map((ability) => [ability, {
    min: readFormValue(form, abilityFieldName("targetFilterAbilityMin", ability), ""),
    max: readFormValue(form, abilityFieldName("targetFilterAbilityMax", ability), ""),
  }]));
}

function buildTargetFilterSummary(targetFilters, labels) {
  const parts = [];
  const abilityScores = normalizeTargetFilterAbilityScores(targetFilters?.abilityScores ?? {});
  const creatureTypes = toSafeArray(targetFilters?.creatureTypes);
  const excludedCreatureTypes = toSafeArray(targetFilters?.excludedCreatureTypes);
  if (creatureTypes.length) {
    parts.push(listSelectedLabels(creatureTypes, labels?.creatureTypes));
  }
  if (excludedCreatureTypes.length) {
    parts.push(`${game.i18n.localize("BOT.ui.targetFilters.except")} ${listSelectedLabels(excludedCreatureTypes, labels?.creatureTypes)}`);
  }
  for (const ability of ABILITY_IDS) {
    const restriction = abilityScores?.[ability] ?? {};
    const abilityLabel = labels?.abilities?.[ability] ?? ability;
    if (isFilled(restriction.min)) parts.push(`${abilityLabel} ${game.i18n.localize("BOT.ui.targetFilters.minShort")} ${restriction.min}`);
    if (isFilled(restriction.max)) parts.push(`${abilityLabel} ${game.i18n.localize("BOT.ui.targetFilters.maxShort")} ${restriction.max}`);
  }
  return parts.filter(Boolean).join(", ");
}

function readAbilityModifierValues(form, prefix) {
  return Object.fromEntries(
    ABILITY_IDS
      .map((ability) => [ability, readFormValue(form, abilityFieldName(prefix, ability), "")])
      .filter(([, value]) => isFilled(value))
  );
}

function getAbilityModifierFlagFields(raw) {
  const checkModifiers = raw.buffs?.abilityCheckModifiers ?? {};
  const saveModifiers = raw.buffs?.savingThrowModifiers ?? {};
  return Object.fromEntries(ABILITY_IDS.flatMap((ability) => [
    [abilityFieldName("buffAbilityCheckModifier", ability), checkModifiers[ability] ?? ""],
    [abilityFieldName("buffSavingThrowModifier", ability), saveModifiers[ability] ?? ""],
  ]));
}

function formatModifierValue(value) {
  if (typeof value === "number") return value > 0 ? `+${value}` : String(value);
  const text = String(value ?? "").trim();
  if (!text || text.startsWith("+") || text.startsWith("-")) return text;
  return Number.isFinite(Number(text)) && Number(text) > 0 ? `+${text}` : text;
}


function normalizeMovementTypes(types) {
  const rawTypes = Array.isArray(types) ? types.filter(Boolean) : [types].filter(Boolean);
  if (rawTypes.includes("all")) return ["all"];
  const configuredTypes = rawTypes.filter((type) => MOVEMENT_TYPES.includes(type));
  return [...new Set(configuredTypes.length ? configuredTypes : ["walk"])];
}

function getConfiguredMovement(buffs = {}) {
  const movement = buffs?.movement;
  const movementValue = String(movement?.value ?? "").trim();
  if (movement?.enabled && movementValue) {
    return {
      enabled: true,
      mode: movement.mode === "multiply" ? "multiply" : "add",
      value: movementValue,
      types: normalizeMovementTypes(movement.types),
    };
  }

  if (buffs?.speed?.value) {
    return {
      enabled: true,
      mode: "add",
      value: String(buffs.speed.value).trim(),
      types: normalizeMovementTypes([buffs.speed.type ?? "walk"]),
    };
  }

  return { enabled: false, mode: "add", value: "", types: ["walk"] };
}

function getMovementTypeOptions(selectedTypes = []) {
  const selectedSet = new Set(normalizeMovementTypes(selectedTypes));
  return [
    { value: "all", label: game.i18n.localize("BOT.ui.movement.types.all"), selected: selectedSet.has("all") },
    ...MOVEMENT_TYPES.map((type) => ({
      value: type,
      label: game.i18n.localize("BOT.ui.capacities.speedTypes." + type),
      selected: selectedSet.has(type),
    })),
  ];
}

const getCreatureTypeLabels = () => Object.fromEntries(
  CREATURE_TYPES.map((type) => [type, game.i18n.localize(`BOT.creatureTypes.${type}`)])
);

function getCreatureTypeOptions(selected = []) {
  const selectedSet = new Set(selected ?? []);
  const labels = getCreatureTypeLabels();
  return CREATURE_TYPES.map((type) => ({
    value: type,
    label: labels[type] ?? type,
    selected: selectedSet.has(type),
  }));
}

function formatMovementSummary(movement, labels) {
  if (!movement?.enabled || !isFilled(movement.value)) return null;
  const typeLabel = movement.types?.includes("all")
    ? game.i18n.localize("BOT.ui.movement.types.all").toLowerCase()
    : listSelectedLabels(movement.types, labels.movementTypes);
  const value = movement.mode === "multiply" ? String.fromCharCode(215) + movement.value : formatModifierValue(movement.value);
  return game.i18n.localize("BOT.ui.movement.title") + " : " + typeLabel + " " + value;
}

function getMovementUnit(actor = null) {
  const actorUnit = actor?.system?.attributes?.movement?.units;
  if (actorUnit) return actorUnit;

  try {
    const defaultUnit = globalThis.dnd5e?.utils?.defaultUnits?.("length");
    if (defaultUnit) return defaultUnit;
  } catch (error) {
    debugLog(`[${MODULE_ID}] Unable to read dnd5e default length unit: ${error.message}`);
  }

  try {
    return game.settings.get("dnd5e", "metricLengthUnits") ? "m" : "ft";
  } catch (error) {
    debugLog(`[${MODULE_ID}] Unable to read dnd5e metric length setting: ${error.message}`);
  }

  return canvas?.scene?.grid?.units ?? "ft";
}

function getMovementUnitType(unit) {
  const normalized = String(unit ?? "").trim().toLowerCase();
  const configuredType = globalThis.CONFIG?.DND5E?.movementUnits?.[normalized]?.type;
  if (configuredType === "metric" || configuredType === "imperial") return configuredType;
  if (["m", "meter", "meters", "metre", "metres"].includes(normalized)) return "metric";
  if (["ft", "foot", "feet"].includes(normalized)) return "imperial";
  return null;
}

function distanceFeetToCurrentUnit(feet, actor = null) {
  if (!Number.isFinite(Number(feet))) return feet;
  const unit = getMovementUnit(actor);
  const unitType = getMovementUnitType(unit);
  if (unitType === "imperial") return feet;
  if (unitType === "metric") {
    const converted = globalThis.dnd5e?.utils?.convertLength?.(feet, "ft", "m", { strict: false });
    return Number.isFinite(converted) ? Math.round(converted) : Math.round(feet * 0.3);
  }

  debugLog(`[${MODULE_ID}] Unknown movement unit "${unit}", keeping ${feet} ft preset value`);
  return feet;
}

function formatSignedMovementValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value ?? "");
  return number > 0 ? `+${number}` : String(number);
}

function convertPresetMovementDistances(flag, actor = null) {
  const clone = foundry.utils.deepClone(flag);
  const movement = clone.buffs?.movement;
  if (!movement || movement.mode === "multiply" || movement.valueFeet === undefined || movement.valueFeet === null) return clone;

  const converted = distanceFeetToCurrentUnit(Number(movement.valueFeet), actor);
  movement.value = formatSignedMovementValue(converted);
  return clone;
}
function getTriggerLabel(type) {
  if (!type) return game.i18n.localize("BOT.ui.summary.notConfigured");
  return game.i18n.localize(`BOT.ui.trigger.${type}`);
}

function normalizeGlobalTargetMode(targetMode) {
  if (targetMode === "ally") return "target";
  return targetMode ?? "self";
}

function getTargetModeLabel(targetMode) {
  const normalizedTargetMode = normalizeGlobalTargetMode(targetMode);
  return game.i18n.localize(`BOT.ui.targetMode.${normalizedTargetMode === "target" ? "target" : "self"}`);
}

function getConditionLabel(condition) {
  return game.i18n.localize(`BOT.ui.condition.${condition ?? "hit"}`);
}

function getHealingTargetModeLabel(targetMode) {
  return game.i18n.localize(`BOT.ui.healing.targetMode.${normalizeHealingTargetMode(targetMode)}`);
}

function getTemporaryHpTargetModeLabel(targetMode) {
  return game.i18n.localize(`BOT.ui.temporaryHp.targetMode.${normalizeTemporaryHpTargetMode(targetMode)}`);
}

function getTemporaryHpModeLabel(mode) {
  return game.i18n.localize(`BOT.ui.temporaryHp.mode.${mode ?? "keepHighest"}`);
}

function getTemporaryHpTimingLabel(timing) {
  return game.i18n.localize(`BOT.ui.temporaryHp.timing.${timing ?? "trigger"}`);
}


function getRollModifierTypeLabel(type) {
  return game.i18n.localize(`BOT.ui.rollModifier.rollTypes.${type}`);
}

function getRollModifierTypesLabel(types = []) {
  return types.map(getRollModifierTypeLabel).filter(Boolean).join(", ");
}

function getTriggerFrequencyLabel(frequency) {
  return game.i18n.localize(`BOT.ui.triggerFrequency.${frequency ?? "none"}`);
}

function getChargesSummary(charges) {
  if (!isFilled(charges) || Number(charges) <= 0) return game.i18n.localize("BOT.ui.chargeSummary.none");
  const count = Number(charges);
  return game.i18n.format(count === 1 ? "BOT.ui.chargeSummary.one" : "BOT.ui.chargeSummary.many", { count });
}

function getEndConditionSummaryLabels(endConditions) {
  if (!endConditions) return [];
  return [
    endConditions.onAttack ? game.i18n.localize("BOT.ui.endConditions.summary.attack") : null,
    endConditions.onSpellCast ? game.i18n.localize("BOT.ui.endConditions.summary.spellCast") : null,
    endConditions.onDamageDealt ? game.i18n.localize("BOT.ui.endConditions.summary.damageDealt") : null,
  ].filter(Boolean);
}

function getReminderSummaryLabels(reminders) {
  if (reminders?.enabled !== true) return [];
  return [
    reminders.timing?.activation ? game.i18n.localize("BOT.ui.reminders.summary.activation") : null,
    reminders.timing?.turnStart ? game.i18n.localize("BOT.ui.reminders.summary.turnStart") : null,
    reminders.timing?.turnEnd ? game.i18n.localize("BOT.ui.reminders.summary.turnEnd") : null,
    reminders.timing?.buffEnd ? game.i18n.localize("BOT.ui.reminders.summary.buffEnd") : null,
  ].filter(Boolean);
}

function isBearerTurnTrigger(type) {
  return type === "turnStart" || type === "turnEnd";
}

function getRecurringTriggerTimingLabel(type) {
  return game.i18n.localize(type === "turnEnd" ? "BOT.ui.recurringEffect.timing.turnEnd" : "BOT.ui.recurringEffect.timing.turnStart");
}

function buildRecurringEffectSummary(raw, labels) {
  if (!isBearerTurnTrigger(raw?.type)) return null;
  const effects = [];
  if (raw.damage?.formula) {
    const damageType = raw.damage.type ? labels.damageTypes?.[raw.damage.type] ?? raw.damage.type : "";
    effects.push([raw.damage.formula, damageType].filter(Boolean).join(" "));
  }
  if (raw.healing?.formula) {
    effects.push(game.i18n.format("BOT.ui.recurringEffect.healing", { formula: raw.healing.formula }));
  }
  if (raw.temporaryHp?.formula) {
    effects.push(game.i18n.format("BOT.ui.recurringEffect.temporaryHp", { formula: raw.temporaryHp.formula }));
  }
  const statusIds = getConfiguredStatusIds(raw.status);
  if (statusIds.length && ["trigger", "both"].includes(raw.status?.timing ?? "trigger")) {
    effects.push(game.i18n.format("BOT.ui.recurringEffect.status", { statuses: statusIds.map((id) => labels.statuses?.[id] ?? id).join(", ") }));
  }
  if (!effects.length) return null;
  return game.i18n.format("BOT.ui.recurringEffect.summary", {
    effect: effects.join(" + "),
    timing: getRecurringTriggerTimingLabel(raw.type),
  });
}

function normalizeDamageTargetMode(targetMode) {
  if (targetMode === "target") return "triggerTarget";
  return ["triggerTarget", "self", "attacker", "storedTarget"].includes(targetMode) ? targetMode : "triggerTarget";
}

function getDamageTargetModeLabel(targetMode) {
  return game.i18n.localize(`BOT.ui.damage.targetMode.${normalizeDamageTargetMode(targetMode)}`);
}

function getStatusTargetModeLabel(targetMode) {
  return game.i18n.localize(`BOT.ui.status.targetMode.${targetMode ?? "legacy"}`);
}

function getStatusApplyConditionLabel(condition) {
  return game.i18n.localize(`BOT.ui.status.applyCondition.${condition ?? "always"}`);
}

function getStatusTimingLabel(timing) {
  return game.i18n.localize(`BOT.ui.status.timing.${timing ?? "trigger"}`);
}

function getSaveDcSourceLabel(source) {
  return game.i18n.localize(`BOT.ui.saveDcSource.${source ?? "fixed"}`);
}

function getSaveTimingLabel(timing) {
  return game.i18n.localize(`BOT.ui.saveTiming.${timing ?? "trigger"}`);
}

function getActivationApplyOnLabel(value) {
  return game.i18n.localize(`BOT.ui.activationApplyOn.${value ?? "failure"}`);
}
function getSaveRepeatTimingLabel(timing) {
  return game.i18n.localize(`BOT.ui.saveRepeat.timing.${timing ?? "endTurn"}`);
}

function getSaveRepeatEndsBuffOnLabel(value) {
  return game.i18n.localize(`BOT.ui.saveRepeat.endsBuffOn.${value ?? "success"}`);
}
function normalizeSaveRepeatOnDamagedRollMode(value) {
  return ["advantage", "disadvantage"].includes(value) ? value : "normal";
}
function getSaveRepeatOnDamagedRollModeLabel(value) {
  return game.i18n.localize(`BOT.ui.saveRepeat.onDamagedRollMode.${normalizeSaveRepeatOnDamagedRollMode(value)}`);
}
function getSaveRepeatTimingSummary(repeat) {
  const timing = getSaveRepeatTimingLabel(repeat?.timing);
  if (!repeat?.onDamaged) return timing;
  const rollMode = normalizeSaveRepeatOnDamagedRollMode(repeat?.onDamagedRollMode);
  if (rollMode === "normal") {
    return game.i18n.format("BOT.ui.summary.saveRepeatTimingWithDamage", { timing });
  }
  return game.i18n.format("BOT.ui.summary.saveRepeatTimingWithDamageRollMode", {
    timing,
    rollMode: getSaveRepeatOnDamagedRollModeLabel(rollMode).toLowerCase(),
  });
}
function getAbilityLabel(ability) {
  return ability ? game.i18n.localize(`BOT.abilities.${ability}`) : game.i18n.localize("BOT.ui.none");
}

function getAbilityLabels() {
  return Object.fromEntries(ABILITY_IDS.map((id) => [id, getAbilityLabel(id)]));
}

function getAbilityOptions(selected = []) {
  const selectedSet = new Set(selected ?? []);
  return ABILITY_IDS.map((id) => ({ value: id, label: getAbilityLabel(id), selected: selectedSet.has(id) }));
}

function normalizeHealingTargetMode(targetMode) {
  return targetMode === "target" ? "triggerTarget" : (targetMode ?? "self");
}

function normalizeTemporaryHpTargetMode(targetMode) {
  return targetMode === "target" ? "triggerTarget" : (targetMode ?? "self");
}

function getReceivedAttackTypeLabel(type) {
  return game.i18n.localize(`BOT.ui.receivedAttackType.${type ?? "any"}`);
}

function getConfiguredStatusIds(status = null) {
  const ids = Array.isArray(status?.ids) ? status.ids.filter(Boolean) : [];
  if (ids.length) return [...new Set(ids)];
  return status?.id ? [status.id] : [];
}

function getStatusOptions(currentStatusIds = []) {
  const selectedSet = new Set(Array.isArray(currentStatusIds) ? currentStatusIds : [currentStatusIds].filter(Boolean));
  const options = (CONFIG.statusEffects ?? [])
    .map((status) => {
      const id = status.id ?? status.statuses?.[0] ?? null;
      if (!id || id === "bot-active" || id === "bot-stored-target") return null;
      const rawLabel = status.name ?? status.label ?? id;
      const label = game.i18n.localize(rawLabel);
      return {
        value: id,
        label,
        icon: status.img ?? status.icon ?? null,
        selected: selectedSet.has(id),
      };
    })
    .filter(Boolean);

  for (const currentStatusId of selectedSet) {
    if (!options.some((option) => option.value === currentStatusId)) {
      options.unshift({
        value: currentStatusId,
        label: game.i18n.format("BOT.ui.status.unknown", { id: currentStatusId }),
        icon: null,
        selected: true,
      });
    }
  }

  return options;
}

function getConditionImmunityOptions(selected = []) {
  const selectedSet = new Set(selected ?? []);
  const byId = new Map();
  for (const id of CONDITION_IDS) {
    byId.set(id, { value: id, label: game.i18n.localize(`BOT.condition.${id}`), selected: selectedSet.has(id) });
  }
  for (const status of CONFIG.statusEffects ?? []) {
    const id = status.id ?? status.statuses?.[0] ?? null;
    if (!id || id === "bot-active" || id === "bot-stored-target") continue;
    if (!CONDITION_IDS.includes(id)) continue;
    const rawLabel = status.name ?? status.label ?? id;
    byId.set(id, { value: id, label: game.i18n.localize(rawLabel), selected: selectedSet.has(id) });
  }
  return [...byId.values()].sort((a, b) => a.label.localeCompare(b.label));
}
function formatItemDurationSummary(rounds, fallbackRounds = null) {
  const syncedRounds = rounds ?? fallbackRounds;
  if (syncedRounds === null || syncedRounds === undefined) {
    return game.i18n.localize("BOT.ui.duration.none");
  }
  return game.i18n.format("BOT.ui.duration.syncedValue", { rounds: syncedRounds });
}

function getLegacyDurationFallback(raw, itemDurationRounds) {
  if (itemDurationRounds !== null) return null;
  if (raw.duration?.source === "item") return null;
  return raw.duration?.rounds ?? null;
}

function hasMechanicalChanges(buffs = {}) {
  return [
    buffs.ac,
    buffs.attackMode,
    buffs.saveMode,
    buffs.incomingAttackMode,
    buffs.incomingAttackCreatureTypes?.length ? buffs.incomingAttackCreatureTypes.join(",") : null,
    buffs.skillMode,
    buffs.skillBonus,
    buffs.skillBonusAll,
    buffs.saveBonus,
    buffs.attackBonus,
    getConfiguredMovement(buffs).enabled ? getConfiguredMovement(buffs).value : null,
    buffs.darkvision,
    buffs.blindsight,
    buffs.tremorsense,
    buffs.truesight,
    buffs.sensesSpecial,
    buffs.passivePerception,
  ].some(isFilled)
    || (buffs.abilityCheckAdvantages ?? []).length > 0
    || (buffs.abilityCheckDisadvantages ?? []).length > 0
    || (buffs.savingThrowAdvantages ?? []).length > 0
    || (buffs.savingThrowDisadvantages ?? []).length > 0
    || Object.values(buffs.abilityCheckModifiers ?? {}).some(isFilled)
    || Object.values(buffs.savingThrowModifiers ?? {}).some(isFilled)
    || (buffs.skills ?? []).length > 0
    || (buffs.skillBonusSkills ?? []).length > 0
    || (buffs.resistances ?? []).length > 0
    || (buffs.vulnerabilities ?? []).length > 0
    || (buffs.immunities ?? []).length > 0
    || (buffs.conditionImmunities ?? []).length > 0
    || (buffs.weaponProfs ?? []).length > 0
    || (buffs.armorProfs ?? []).length > 0
    || (buffs.languages ?? []).length > 0;
}

function buildMechanicalSummary(raw, labels) {
  const buffs = raw.buffs ?? {};
  const entries = [];
  const addEntry = (text) => {
    if (text) entries.push(text);
  };

  if (isFilled(buffs.ac)) addEntry(`${game.i18n.localize("BOT.ui.combat.acBonus")} : ${formatModifierValue(buffs.ac)}`);
  if (isFilled(buffs.attackMode)) addEntry(`${game.i18n.localize("BOT.ui.combat.attackRolls")} : ${game.i18n.localize(`BOT.ui.common.${buffs.attackMode}`)}`);
  if (isFilled(buffs.saveMode)) addEntry(`${game.i18n.localize("BOT.ui.combat.saveRolls")} : ${game.i18n.localize(`BOT.ui.common.${buffs.saveMode}`)}`);
  if (isFilled(buffs.incomingAttackMode)) {
    const modeLabel = game.i18n.localize(`BOT.ui.common.${buffs.incomingAttackMode}`);
    const creatureTypes = buffs.incomingAttackCreatureTypes ?? [];
    const creatureFilter = creatureTypes.length
      ? `, ${game.i18n.localize("BOT.ui.defense.incomingAttackCreatureTypesSummary")} : ${listSelectedLabels(creatureTypes, labels.creatureTypes)}`
      : "";
    addEntry(`${game.i18n.localize("BOT.ui.defense.incomingAttackMode")} : ${modeLabel}${creatureFilter}`);
  }
  if (isFilled(buffs.skillMode)) addEntry(`${game.i18n.localize("BOT.ui.combat.abilityRolls")} : ${game.i18n.localize(`BOT.ui.common.${buffs.skillMode}`)}`);
  if ((buffs.abilityCheckAdvantages ?? []).length) addEntry(`${game.i18n.localize("BOT.ui.abilities.checkAdvantage")} : ${listSelectedLabels(buffs.abilityCheckAdvantages, labels.abilities)}`);
  if ((buffs.abilityCheckDisadvantages ?? []).length) addEntry(`${game.i18n.localize("BOT.ui.abilities.checkDisadvantage")} : ${listSelectedLabels(buffs.abilityCheckDisadvantages, labels.abilities)}`);
  if ((buffs.savingThrowAdvantages ?? []).length) addEntry(`${game.i18n.localize("BOT.ui.abilities.saveAdvantage")} : ${listSelectedLabels(buffs.savingThrowAdvantages, labels.abilities)}`);
  if ((buffs.savingThrowDisadvantages ?? []).length) addEntry(`${game.i18n.localize("BOT.ui.abilities.saveDisadvantage")} : ${listSelectedLabels(buffs.savingThrowDisadvantages, labels.abilities)}`);
  for (const ability of ABILITY_IDS) {
    const modifier = buffs.abilityCheckModifiers?.[ability];
    if (isFilled(modifier)) addEntry(`${game.i18n.format("BOT.ui.summary.abilityCheckModifier", { ability: labels.abilities[ability] ?? ability })} : ${formatModifierValue(modifier)}`);
  }
  for (const ability of ABILITY_IDS) {
    const modifier = buffs.savingThrowModifiers?.[ability];
    if (isFilled(modifier)) addEntry(`${game.i18n.format("BOT.ui.summary.savingThrowModifier", { ability: labels.abilities[ability] ?? ability })} : ${formatModifierValue(modifier)}`);
  }
  if ((buffs.skills ?? []).length) addEntry(`${game.i18n.localize("BOT.ui.skills.advantage")} : ${listSelectedLabels(buffs.skills, labels.skills)}`);
  if ((buffs.skillBonusSkills ?? []).length && isFilled(buffs.skillBonus)) {
    addEntry(`${game.i18n.localize("BOT.ui.skills.bonus")} : ${listSelectedLabels(buffs.skillBonusSkills, labels.skills)} (${formatModifierValue(buffs.skillBonus)})`);
  }
  if (isFilled(buffs.skillBonusAll)) addEntry(`${game.i18n.localize("BOT.ui.skills.bonusAll")} : ${formatModifierValue(buffs.skillBonusAll)}`);
  if (isFilled(buffs.attackBonus)) addEntry(`${game.i18n.localize("BOT.ui.combat.attackBonus")} : ${formatModifierValue(buffs.attackBonus)}`);
  if (isFilled(buffs.saveBonus)) addEntry(`${game.i18n.localize("BOT.ui.combat.saveBonus")} : ${formatModifierValue(buffs.saveBonus)}`);
  addEntry(formatMovementSummary(getConfiguredMovement(buffs), labels));
  if ((buffs.resistances ?? []).length) addEntry(`${game.i18n.localize("BOT.ui.defense.resistances")} : ${listSelectedLabels(buffs.resistances, labels.damageTypes)}`);
  if ((buffs.vulnerabilities ?? []).length) addEntry(`${game.i18n.localize("BOT.ui.defense.vulnerabilities")} : ${listSelectedLabels(buffs.vulnerabilities, labels.damageTypes)}`);
  if ((buffs.immunities ?? []).length) addEntry(`${game.i18n.localize("BOT.ui.defense.immunities")} : ${listSelectedLabels(buffs.immunities, labels.damageTypes)}`);
  if ((buffs.conditionImmunities ?? []).length) addEntry(`${game.i18n.localize("BOT.ui.defense.conditionImmunities")} : ${listSelectedLabels(buffs.conditionImmunities, labels.conditions)}`);
  if ((buffs.weaponProfs ?? []).length) addEntry(`${game.i18n.localize("BOT.ui.capacities.weaponProficiencies")} : ${listSelectedLabels(buffs.weaponProfs, labels.weaponProfs)}`);
  if ((buffs.armorProfs ?? []).length) addEntry(`${game.i18n.localize("BOT.ui.capacities.armorProficiencies")} : ${listSelectedLabels(buffs.armorProfs, labels.armorProfs)}`);
  if ((buffs.languages ?? []).length) addEntry(`${game.i18n.localize("BOT.ui.capacities.languages")} : ${listSelectedLabels(buffs.languages, labels.languages)}`);
  if (isFilled(buffs.darkvision)) addEntry(`${game.i18n.localize("BOT.ui.capacities.senses.darkvision")} : ${buffs.darkvision} ${game.i18n.localize("BOT.ui.units.feet")}`);
  if (isFilled(buffs.blindsight)) addEntry(`${game.i18n.localize("BOT.ui.capacities.senses.blindsight")} : ${buffs.blindsight} ${game.i18n.localize("BOT.ui.units.feet")}`);
  if (isFilled(buffs.tremorsense)) addEntry(`${game.i18n.localize("BOT.ui.capacities.senses.tremorsense")} : ${buffs.tremorsense} ${game.i18n.localize("BOT.ui.units.feet")}`);
  if (isFilled(buffs.truesight)) addEntry(`${game.i18n.localize("BOT.ui.capacities.senses.truesight")} : ${buffs.truesight} ${game.i18n.localize("BOT.ui.units.feet")}`);
  if (isFilled(buffs.sensesSpecial)) addEntry(`${game.i18n.localize("BOT.ui.capacities.senses.special")} : ${buffs.sensesSpecial}`);
  if (isFilled(buffs.passivePerception)) addEntry(`${game.i18n.localize("BOT.ui.capacities.passivePerception")} : ${buffs.passivePerception}`);

  return entries;
}

function buildConfigSummary(raw, labels, itemDurationRounds) {
  const legacyDurationFallback = getLegacyDurationFallback(raw, itemDurationRounds);
  const healingTargetMode = normalizeHealingTargetMode(raw.healing?.targetMode);
  const temporaryHpTargetMode = normalizeTemporaryHpTargetMode(raw.temporaryHp?.targetMode);
  const summary = [
    { label: game.i18n.localize("BOT.ui.summary.trigger"), value: getTriggerLabel(raw.type) },
    { label: game.i18n.localize("BOT.ui.summary.targetMode"), value: getTargetModeLabel(raw.targetMode) },
  ...(raw.fallbackToSelfIfNoTarget ? [{ label: game.i18n.localize("BOT.ui.summary.fallbackToSelfIfNoTarget"), value: game.i18n.localize("BOT.ui.summary.fallbackToSelfIfNoTargetValue") }] : []),
  ...(raw.allowMultipleTargets ? [{ label: game.i18n.localize("BOT.ui.summary.allowMultipleTargets"), value: game.i18n.localize("BOT.ui.common.yes") }] : []),
  ...(raw.allowMultipleTargets && raw.multiTargetLimit?.enabled ? [{ label: game.i18n.localize("BOT.ui.summary.multiTargetLimit"), value: formatMultiTargetLimitSummary(raw.multiTargetLimit) }] : []),
    { label: game.i18n.localize("BOT.ui.summary.rememberTargetOnActivation"), value: game.i18n.localize(raw.rememberTargetOnActivation ? "BOT.ui.common.yes" : "BOT.ui.common.no") },
    { label: game.i18n.localize("BOT.ui.summary.requireStoredTargetMatch"), value: game.i18n.localize(raw.requireStoredTargetMatch ? "BOT.ui.common.yes" : "BOT.ui.common.no") },
  ];
  if (raw.requireBearerTemporaryHp) summary.push({ label: game.i18n.localize("BOT.ui.summary.temporaryHpCondition"), value: game.i18n.localize("BOT.ui.summary.temporaryHpConditionBearer") });

  const recurringEffectSummary = buildRecurringEffectSummary(raw, labels);
  if (recurringEffectSummary) {
    summary.push({
      label: game.i18n.localize("BOT.ui.summary.recurringEffect"),
      value: recurringEffectSummary
    });
  }

  const targetFilterSummary = buildTargetFilterSummary(raw.targetFilters, labels);
  if (targetFilterSummary) {
    summary.push({
      label: game.i18n.localize("BOT.ui.summary.targetFilters"),
      value: targetFilterSummary
    });
  }

  if (ATTACK_TRIGGER_TYPES.includes(raw.type)) {
    summary.push({ label: game.i18n.localize("BOT.ui.summary.condition"), value: getConditionLabel(raw.condition) });
  }

  if (raw.type === "damaged") {
    if ((raw.receivedAttackType ?? "any") !== "any") {
      summary.push({
        label: game.i18n.localize("BOT.ui.summary.receivedAttackType"),
        value: getReceivedAttackTypeLabel(raw.receivedAttackType)
      });
    }
    if ((raw.receivedDamageTypes ?? []).length) {
      summary.push({
        label: game.i18n.localize("BOT.ui.summary.receivedDamageTypes"),
        value: listSelectedLabels(raw.receivedDamageTypes, labels.damageTypes)
      });
    }
  }

  if (raw.damage) {
    const damageTargetCreatureTypes = raw.damage.targetCreatureTypes ?? [];
    const damageTargetCreatureFilter = damageTargetCreatureTypes.length
      ? ", " + game.i18n.localize("BOT.ui.damage.targetCreatureTypesSummary") + " : " + listSelectedLabels(damageTargetCreatureTypes, labels.creatureTypes)
      : "";
    summary.push({
      label: game.i18n.localize("BOT.ui.summary.damage"),
      value: (String(raw.damage.formula ?? game.i18n.localize("BOT.ui.summary.notConfigured")) + " " + (raw.damage.type ? "(" + (labels.damageTypes[raw.damage.type] ?? raw.damage.type) + ")" : "") + damageTargetCreatureFilter).trim()
    });
    summary.push({
      label: game.i18n.localize("BOT.ui.summary.damageTarget"),
      value: getDamageTargetModeLabel(raw.damage.targetMode)
    });
  }

  if (raw.healing?.formula) {
    summary.push({
      label: game.i18n.localize("BOT.ui.summary.healing"),
      value: `${raw.healing.formula} (${getHealingTargetModeLabel(healingTargetMode)})`
    });
  }

  if (raw.temporaryHp?.formula) {
    summary.push({
      label: game.i18n.localize("BOT.ui.summary.temporaryHp"),
      value: `${raw.temporaryHp.formula} (${getTemporaryHpTargetModeLabel(temporaryHpTargetMode)} - ${getTemporaryHpModeLabel(raw.temporaryHp.mode)} - ${getTemporaryHpTimingLabel(raw.temporaryHp.timing)})`
    });
  }

  if (raw.rollModifier?.enabled && raw.rollModifier?.formula) {
    summary.push({
      label: game.i18n.localize("BOT.ui.summary.rollModifier"),
      value: raw.rollModifier.formula
    });
    summary.push({
      label: game.i18n.localize("BOT.ui.summary.rollModifierTypes"),
      value: getRollModifierTypesLabel(raw.rollModifier.rollTypes ?? []) || game.i18n.localize("BOT.ui.summary.notConfigured")
    });
  }

  if (raw.save?.ability) {
    const saveDcSource = raw.save.dcSource ?? "fixed";
    const saveTiming = raw.save.timing ?? "trigger";
    const parts = [
      game.i18n.localize(`BOT.abilities.${raw.save.ability}`),
      saveDcSource === "fixed" ? `${getSaveDcSourceLabel("fixed")} ${raw.save.dc ?? game.i18n.localize("BOT.ui.summary.notConfigured")}` : getSaveDcSourceLabel(saveDcSource),
      getSaveTimingLabel(saveTiming),
    ];
    if (saveTiming === "activation" || saveTiming === "both") parts.push(`${game.i18n.localize("BOT.ui.activationApplyOn.summary")} ${getActivationApplyOnLabel(raw.save.activationApplyOn)}`);
    if (saveTiming === "trigger" || saveTiming === "both") parts.push(`${game.i18n.localize("BOT.ui.success.label")} ${game.i18n.localize(`BOT.ui.saveEffect.${raw.save.effect ?? "half"}`)}`);
    summary.push({
      label: game.i18n.localize("BOT.ui.summary.save"),
      value: parts.join(" - ")
    });
    summary.push({
      label: game.i18n.localize("BOT.ui.summary.saveRepeat"),
      value: raw.save.repeat?.enabled
        ? game.i18n.format("BOT.ui.summary.saveRepeatConfigured", {
            timing: getSaveRepeatTimingSummary(raw.save.repeat),
            endsBuffOn: getSaveRepeatEndsBuffOnLabel(raw.save.repeat.endsBuffOn),
          })
        : game.i18n.localize("BOT.ui.summary.saveRepeatNone")
    });
  } else {
    summary.push({
      label: game.i18n.localize("BOT.ui.summary.save"),
      value: game.i18n.localize("BOT.ui.none")
    });
  }

  const configuredStatusIds = getConfiguredStatusIds(raw.status);
  if (configuredStatusIds.length) {
    const statusNames = configuredStatusIds.map((id) => labels.statuses?.[id] ?? id).join(", ");
    summary.push({
      label: game.i18n.localize("BOT.ui.summary.status"),
      value: `${statusNames}, ${getStatusTimingLabel(raw.status.timing)}, ${getStatusApplyConditionLabel(raw.status.applyCondition)}`
    });
    summary.push({
      label: game.i18n.localize("BOT.ui.summary.statusTarget"),
      value: getStatusTargetModeLabel(raw.status.targetMode)
    });
    summary.push({
      label: game.i18n.localize("BOT.ui.summary.statusApplyCondition"),
      value: getStatusApplyConditionLabel(raw.status.applyCondition)
    });
    if (raw.status.removeWhenBuffEnds) {
      summary.push({
        label: game.i18n.localize("BOT.ui.summary.statusRemoveWhenBuffEnds"),
        value: game.i18n.localize("BOT.ui.summary.statusRemovedWithBuff")
      });
    }
  }

  const mechanicalSummary = buildMechanicalSummary(raw, labels);
  if (mechanicalSummary.length) {
    summary.push({
      label: game.i18n.localize("BOT.ui.summary.mechanical"),
      value: mechanicalSummary.join(" - ")
    });
  }

  const endConditionLabels = getEndConditionSummaryLabels(raw.endConditions);
  if (endConditionLabels.length) {
    summary.push({
      label: game.i18n.localize("BOT.ui.summary.endConditions"),
      value: endConditionLabels.join(", ")
    });
  }

  const reminderLabels = getReminderSummaryLabels(raw.reminders);
  if (reminderLabels.length) {
    summary.push({
      label: game.i18n.localize("BOT.ui.summary.reminders"),
      value: reminderLabels.join(", ")
    });
  }

  summary.push({
    label: game.i18n.localize("BOT.ui.summary.consumeOnTrigger"),
    value: game.i18n.localize(raw.consumeOnTrigger ?? true ? "BOT.ui.common.yes" : "BOT.ui.common.no")
  });

  summary.push({
    label: game.i18n.localize("BOT.ui.summary.triggerFrequency"),
    value: getTriggerFrequencyLabel(raw.triggerFrequency)
  });

  summary.push({
    label: game.i18n.localize("BOT.ui.summary.charges"),
    value: getChargesSummary(raw.charges)
  });

  summary.push({
    label: game.i18n.localize("BOT.ui.summary.durationRounds"),
    value: formatItemDurationSummary(itemDurationRounds, legacyDurationFallback)
  });

  return summary;
}

class BuffTriggerConfig extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {
  static DEFAULT_OPTIONS = {
    tag: "form",
    form: {
      handler: BuffTriggerConfig.#onSubmit,
      closeOnSubmit: true,
    },
    window: {
      title: "BOT.ui.configTitle",
      contentClasses: ["standard-form"],
    },
    position: {
      width: 560,
      height: "auto",
    },
    resizable: true,
  };

  static PARTS = {
    form: {
      template: "modules/dnd5e-buff-on-trigger/templates/buff-config.html",
    },
  };

  constructor(item, options = {}) {
    super(options);
    this.item = item;
  }

  resizeToContent() {
    this.setPosition({ height: "auto" });
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const form = this.element.matches?.("form") ? this.element : this.element.querySelector?.("form");
    if (form) form.__botApp = this;
    const triggerSelect = this.element.querySelector?.('[name="type"]');
    if (triggerSelect) window.botUpdateTriggerUI(triggerSelect);
    const saveDcSourceSelect = this.element.querySelector?.('[name="saveDcSource"]');
    if (saveDcSourceSelect) window.botUpdateSaveDcUI(saveDcSourceSelect);
    const saveTimingSelect = this.element.querySelector?.('[name="saveTiming"]');
    if (saveTimingSelect) window.botUpdateSaveTimingUI(saveTimingSelect);
    const saveAbilitySelect = this.element.querySelector?.('[name="saveAbility"]');
    if (saveAbilitySelect) saveAbilitySelect.addEventListener("change", () => window.botUpdateSaveRepeatUI(form));
    const saveRepeatOnDamaged = this.element.querySelector?.('[name="saveRepeatOnDamaged"]');
    if (saveRepeatOnDamaged) saveRepeatOnDamaged.addEventListener("change", () => window.botUpdateSaveRepeatUI(form));
    if (form) window.botUpdateSaveRepeatUI(form);
    const formulaInputs = this.element.querySelectorAll?.('input[name="damageFormula"], input[name="healingFormula"], input[name="temporaryHpFormula"], input[name="rollModifierFormula"]') ?? [];
    for (const input of formulaInputs) {
      input.addEventListener("focus", () => {
        if (form) form.__botLastFormulaInput = input;
      });
      input.addEventListener("click", () => {
        if (form) form.__botLastFormulaInput = input;
      });
    }
    const healingEnabled = this.element.querySelector?.('[name="healingEnabled"]');
    if (healingEnabled) healingEnabled.addEventListener("change", () => window.botUpdateEffectSectionsUI(form));
    const temporaryHpEnabled = this.element.querySelector?.('[name="temporaryHpEnabled"]');
    if (temporaryHpEnabled) temporaryHpEnabled.addEventListener("change", () => window.botUpdateEffectSectionsUI(form));
    const rollModifierEnabled = this.element.querySelector?.('[name="rollModifierEnabled"]');
    if (rollModifierEnabled) rollModifierEnabled.addEventListener("change", () => window.botUpdateRollModifierUI(form));
    const statusInput = this.element.querySelector?.('[name="statusIdsList"]');
    if (statusInput) statusInput.addEventListener("change", () => window.botUpdateEffectSectionsUI(form));
    const targetModeSelect = this.element.querySelector?.('[name="targetMode"]');
    if (targetModeSelect) window.botUpdateStoredTargetUI(targetModeSelect);
    const presetSelect = this.element.querySelector?.('[name="presetId"]');
    if (presetSelect) window.botUpdatePresetActions(presetSelect);
    this.element.querySelectorAll?.('[data-bot-preset-action]')?.forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const action = button.dataset.botPresetAction;
        if (action === "apply") window.botApplyPreset(button);
        else if (action === "reset") window.botResetBuffConfig(button);
        else if (action === "save") window.botSaveCustomPreset(button);
        else if (action === "export") window.botExportCustomPresets(button);
        else if (action === "import") window.botImportCustomPresets(button);
        else if (action === "delete") window.botDeleteCustomPreset(button);
      });
    });
    this.element.querySelectorAll?.('.bot-collapsible-panel')?.forEach((panel) => {
      panel.addEventListener("toggle", () => this.resizeToContent());
    });
    if (form) {
      window.botUpdateEffectSectionsUI(form);
      window.botUpdateRollModifierUI(form);
    }
  }

  async _prepareContext(options) {
    const raw = this.item.getFlag(MODULE_ID, "buffTrigger") ?? {};
    const itemDurationRounds = getItemDurationInRounds(this.item);
    const legacyDurationFallback = getLegacyDurationFallback(raw, itemDurationRounds);
    const healingTargetMode = normalizeHealingTargetMode(raw.healing?.targetMode);
    const temporaryHpTargetMode = normalizeTemporaryHpTargetMode(raw.temporaryHp?.targetMode);
    const skillLabels = getSkillLabels();
    const damageLabels = getDamageLabels();
    const weaponProfLabels = getWeaponProfLabels();
    const armorProfLabels = getArmorProfLabels();
    const languageLabels = getLanguageLabels();
    const configuredStatusIds = getConfiguredStatusIds(raw.status);
    const configuredMovement = getConfiguredMovement(raw.buffs ?? {});
    const movementTypeOptions = getMovementTypeOptions(configuredMovement.types);
    const statusOptions = getStatusOptions(configuredStatusIds);
    const presets = getPresetOptions();
    const statusLabels = Object.fromEntries(statusOptions.map((option) => [option.value, option.label]));
    const abilityLabels = getAbilityLabels();
    const conditionImmunityOptions = getConditionImmunityOptions(raw.buffs?.conditionImmunities ?? []);
    const creatureTypeLabels = getCreatureTypeLabels();
    const incomingAttackCreatureTypeOptions = getCreatureTypeOptions(raw.buffs?.incomingAttackCreatureTypes ?? []);
    const damageTargetCreatureTypeOptions = getCreatureTypeOptions(raw.damage?.targetCreatureTypes ?? []);
    const targetFilterCreatureTypeOptions = getCreatureTypeOptions(raw.targetFilters?.creatureTypes ?? []);
    const excludedTargetFilterCreatureTypeOptions = getCreatureTypeOptions(raw.targetFilters?.excludedCreatureTypes ?? []);
    const targetFilterAbilityScores = raw.targetFilters?.abilityScores ?? {};
    const targetFilterAbilityScoreRows = ABILITY_IDS.map((ability) => ({
      ability,
      label: abilityLabels[ability] ?? ability,
      minName: abilityFieldName("targetFilterAbilityMin", ability),
      maxName: abilityFieldName("targetFilterAbilityMax", ability),
      minValue: targetFilterAbilityScores?.[ability]?.min ?? "",
      maxValue: targetFilterAbilityScores?.[ability]?.max ?? "",
    }));
    const labels = {
      skills: skillLabels,
      abilities: abilityLabels,
      damageTypes: damageLabels,
      weaponProfs: weaponProfLabels,
      armorProfs: armorProfLabels,
      languages: languageLabels,
      conditions: Object.fromEntries(conditionImmunityOptions.map((option) => [option.value, option.label])),
      creatureTypes: creatureTypeLabels,
      statuses: statusLabels,
      movementTypes: Object.fromEntries(movementTypeOptions.map((option) => [option.value, option.label.toLowerCase()])),
    };
    const abilityCheckAdvantageOptions = getAbilityOptions(raw.buffs?.abilityCheckAdvantages ?? []);
    const abilityCheckDisadvantageOptions = getAbilityOptions(raw.buffs?.abilityCheckDisadvantages ?? []);
    const savingThrowAdvantageOptions = getAbilityOptions(raw.buffs?.savingThrowAdvantages ?? []);
    const savingThrowDisadvantageOptions = getAbilityOptions(raw.buffs?.savingThrowDisadvantages ?? []);
    const skillAdvantageOptions = SKILL_IDS.map(id => ({ value: id, label: skillLabels[id], selected: (raw.buffs?.skills ?? []).includes(id) }));
    const skillBonusOptions     = SKILL_IDS.map(id => ({ value: id, label: skillLabels[id], selected: (raw.buffs?.skillBonusSkills ?? []).includes(id) }));
    const resistanceOptions     = DAMAGE_TYPES.map(t => ({ value: t, label: damageLabels[t], selected: (raw.buffs?.resistances ?? []).includes(t) }));
    const vulnOptions           = DAMAGE_TYPES.map(t => ({ value: t, label: damageLabels[t], selected: (raw.buffs?.vulnerabilities ?? []).includes(t) }));
    const immunityOptions       = DAMAGE_TYPES.map(t => ({ value: t, label: damageLabels[t], selected: (raw.buffs?.immunities ?? []).includes(t) }));
    const receivedDamageTypeOptions = DAMAGE_TYPES.map(t => ({ value: t, label: damageLabels[t], selected: (raw.receivedDamageTypes ?? []).includes(t) }));
    const weaponProfOptions     = WEAPON_PROF_IDS.map(value => ({ value, label: weaponProfLabels[value], selected: (raw.buffs?.weaponProfs ?? []).includes(value) }));
    const armorProfOptions      = ARMOR_PROF_IDS.map(value => ({ value, label: armorProfLabels[value], selected: (raw.buffs?.armorProfs ?? []).includes(value) }));
    const languageOptions       = LANGUAGE_IDS.map(value => ({ value, label: languageLabels[value], selected: (raw.buffs?.languages ?? []).includes(value) }));
    const flag = {
      ...raw,
      targetMode:            normalizeGlobalTargetMode(raw.targetMode),
      targetModeSelf:        normalizeGlobalTargetMode(raw.targetMode) === "self",
      targetModeTarget:      normalizeGlobalTargetMode(raw.targetMode) === "target",
      showFallbackToSelfIfNoTarget: normalizeGlobalTargetMode(raw.targetMode) === "target" && !raw.rememberTargetOnActivation,
      showAllowMultipleTargets: normalizeGlobalTargetMode(raw.targetMode) === "target" && !raw.rememberTargetOnActivation,
      allowMultipleTargets: normalizeGlobalTargetMode(raw.targetMode) === "target" && !raw.rememberTargetOnActivation && !!raw.allowMultipleTargets,
      showMultiTargetLimit: normalizeGlobalTargetMode(raw.targetMode) === "target" && !raw.rememberTargetOnActivation && !!raw.allowMultipleTargets,
      multiTargetLimitEnabled: raw.multiTargetLimit?.enabled === true,
      multiTargetLimitBaseTargets: raw.multiTargetLimit?.baseTargets ?? 1,
      multiTargetLimitBaseSpellLevel: raw.multiTargetLimit?.baseSpellLevel ?? 1,
      multiTargetLimitTargetsPerLevelAbove: raw.multiTargetLimit?.targetsPerLevelAbove ?? 0,
      fallbackToSelfIfNoTarget: !!raw.fallbackToSelfIfNoTarget,
      showStoredTargetSection: normalizeGlobalTargetMode(raw.targetMode) === "self",
      rememberTargetOnActivation: !!raw.rememberTargetOnActivation,
      requireStoredTargetMatch: !!raw.requireStoredTargetMatch,
      requireBearerTemporaryHp: !!raw.requireBearerTemporaryHp,
      typePassive:           raw.type === "passive",
      typeMwak:              raw.type === "mwak",
      typeRwak:              raw.type === "rwak",
      typeMsak:              raw.type === "msak",
      typeRsak:              raw.type === "rsak",
      typeAnyAttack:        raw.type === "anyAttack",
      typeWeaponAttack:     raw.type === "weaponAttack",
      typeSpellAttack:      raw.type === "spellAttack",
      typeDamaged:           raw.type === "damaged",
      typeHealed:            raw.type === "healed",
      typeTurnStart:         raw.type === "turnStart",
      typeTurnEnd:           raw.type === "turnEnd",
      showRecurringTurnHelp: isBearerTurnTrigger(raw.type),
      typeTargetTurnStart:   raw.type === "targetTurnStart",
      typeTargetTurnEnd:     raw.type === "targetTurnEnd",
      consumeOnTrigger:      raw.consumeOnTrigger ?? true,
      triggerFrequencyNone:  (raw.triggerFrequency ?? "none") === "none",
      triggerFrequencyTurn:  raw.triggerFrequency === "turn",
      triggerFrequencyRound: raw.triggerFrequency === "round",
      endConditionOnAttack:      !!raw.endConditions?.onAttack,
      endConditionOnSpellCast:  !!raw.endConditions?.onSpellCast,
      endConditionOnDamageDealt: !!raw.endConditions?.onDamageDealt,
      remindersEnabled:          !!raw.reminders?.enabled,
      remindersMessage:          raw.reminders?.message ?? "",
      remindersTimingActivation: !!raw.reminders?.timing?.activation,
      remindersTimingTurnStart:  !!raw.reminders?.timing?.turnStart,
      remindersTimingTurnEnd:    !!raw.reminders?.timing?.turnEnd,
      remindersTimingBuffEnd:    !!raw.reminders?.timing?.buffEnd,
      remindersVisibilityGM:     (raw.reminders?.visibility ?? "gm") === "gm",
      remindersVisibilityPublic: (raw.reminders?.visibility ?? "gm") === "public",
      buffAC:                    raw.buffs?.ac ?? "",
      buffAttackMode:            raw.buffs?.attackMode ?? "none",
      buffSaveMode:              raw.buffs?.saveMode ?? "none",
      buffIncomingAttackMode:    raw.buffs?.incomingAttackMode ?? "none",
      buffIncomingAttackCreatureTypesList: (raw.buffs?.incomingAttackCreatureTypes ?? []).join(","),
      incomingAttackCreatureTypeOptions,
      damageTargetCreatureTypesList: (raw.damage?.targetCreatureTypes ?? []).join(","),
      damageTargetCreatureTypeOptions,
      targetFilterCreatureTypesList: (raw.targetFilters?.creatureTypes ?? []).join(","),
      targetFilterCreatureTypeOptions,
      excludedTargetFilterCreatureTypesList: (raw.targetFilters?.excludedCreatureTypes ?? []).join(","),
      excludedTargetFilterCreatureTypeOptions,
      targetFilterAbilityScoreRows,
      buffSkillMode:             raw.buffs?.skillMode ?? "none",
      buffSkillBonus:            raw.buffs?.skillBonus ?? "",
      buffSkillBonusAll:         raw.buffs?.skillBonusAll ?? "",
      buffSaveBonus:             raw.buffs?.saveBonus ?? "",
      buffAttackBonus:           raw.buffs?.attackBonus ?? "",
      ...getAbilityModifierFlagFields(raw),
      buffMovementEnabled:       configuredMovement.enabled,
      buffMovementMode:          configuredMovement.mode,
      buffMovementModeAdd:       configuredMovement.mode === "add",
      buffMovementModeMultiply:  configuredMovement.mode === "multiply",
      buffMovementValue:         configuredMovement.value,
      buffMovementTypesList:     configuredMovement.types.join(","),
      movementTypeOptions,
      buffSpeed:                 raw.buffs?.speed?.value ?? "",
      buffSpeedType:             raw.buffs?.speed?.type ?? "walk",
      buffDarkvision:            raw.buffs?.darkvision ?? "",
      buffBlindSight:            raw.buffs?.blindsight ?? "",
      buffTremorSense:           raw.buffs?.tremorsense ?? "",
      buffTrueSight:             raw.buffs?.truesight ?? "",
      buffSensesSpecial:         raw.buffs?.sensesSpecial ?? "",
      buffPassivePerception:     raw.buffs?.passivePerception ?? "",
      healingEnabled:            !!raw.healing,
      healingFormula:            raw.healing?.formula ?? "",
      healingTargetModeTriggerTarget: healingTargetMode === "triggerTarget",
      healingTargetModeSelf:     healingTargetMode === "self",
      healingTargetModeAttacker: healingTargetMode === "attacker",
      healingTargetModeStoredTarget: healingTargetMode === "storedTarget",
      temporaryHpEnabled:        !!raw.temporaryHp,
      temporaryHpFormula:        raw.temporaryHp?.formula ?? "",
      temporaryHpTimingTrigger:    (raw.temporaryHp?.timing ?? "trigger") === "trigger",
      temporaryHpTimingActivation: raw.temporaryHp?.timing === "activation",
      temporaryHpTimingBoth:       raw.temporaryHp?.timing === "both",
      temporaryHpTargetModeTriggerTarget: temporaryHpTargetMode === "triggerTarget",
      temporaryHpTargetModeSelf: temporaryHpTargetMode === "self",
      temporaryHpTargetModeAttacker: temporaryHpTargetMode === "attacker",
      temporaryHpTargetModeStoredTarget: temporaryHpTargetMode === "storedTarget",
      temporaryHpModeKeepHighest: (raw.temporaryHp?.mode ?? "keepHighest") === "keepHighest",
      temporaryHpModeReplace:    raw.temporaryHp?.mode === "replace",
      temporaryHpModeAdd:        raw.temporaryHp?.mode === "add",
      rollModifierEnabled:       !!raw.rollModifier?.enabled,
      rollModifierFormula:       raw.rollModifier?.formula ?? "",
      rollModifierTypeAttack:    (raw.rollModifier?.rollTypes ?? []).includes("attack"),
      rollModifierTypeSave:      (raw.rollModifier?.rollTypes ?? []).includes("save"),
      rollModifierTypeAbility:   (raw.rollModifier?.rollTypes ?? []).includes("ability"),
      rollModifierTypeSkill:     (raw.rollModifier?.rollTypes ?? []).includes("skill"),
      abilityCheckAdvantageOptions,
      abilityCheckDisadvantageOptions,
      savingThrowAdvantageOptions,
      savingThrowDisadvantageOptions,
      skillAdvantageOptions,
      skillBonusOptions,
      resistanceOptions,
      vulnOptions,
      immunityOptions,
      conditionImmunityOptions,
      weaponProfOptions,
      armorProfOptions,
      languageOptions,
      buffAttackModeNone:        (raw.buffs?.attackMode ?? "none") === "none",
      buffAttackModeAdvantage:   raw.buffs?.attackMode === "advantage",
      buffAttackModeDisadvantage: raw.buffs?.attackMode === "disadvantage",
      buffSaveModeNone:          (raw.buffs?.saveMode ?? "none") === "none",
      buffSaveModeAdvantage:     raw.buffs?.saveMode === "advantage",
      buffSaveModeDisadvantage:  raw.buffs?.saveMode === "disadvantage",
      buffIncomingAttackModeNone: (raw.buffs?.incomingAttackMode ?? "none") === "none",
      buffIncomingAttackModeAdvantage: raw.buffs?.incomingAttackMode === "advantage",
      buffIncomingAttackModeDisadvantage: raw.buffs?.incomingAttackMode === "disadvantage",
      buffSkillModeNone:         (raw.buffs?.skillMode ?? "none") === "none",
      buffSkillModeAdvantage:    raw.buffs?.skillMode === "advantage",
      buffSkillModeDisadvantage: raw.buffs?.skillMode === "disadvantage",
      charges:               raw.charges ?? "",
      itemDurationRounds,
      itemDurationLabel:     formatItemDurationSummary(itemDurationRounds, legacyDurationFallback),
      saveAbility:           raw.save?.ability ?? "",
      saveAbilityLabel:      getAbilityLabel(raw.save?.ability ?? ""),
      saveDC:                raw.save?.dc ?? 15,
      saveDcSourceFixed:     (raw.save?.dcSource ?? "fixed") === "fixed",
      saveDcSourceOrigin:    raw.save?.dcSource === "origin",
      saveDcSourceOwner:     raw.save?.dcSource === "owner",
      saveTimingTrigger:     (raw.save?.timing ?? "trigger") === "trigger",
      saveTimingActivation:  raw.save?.timing === "activation",
      saveTimingBoth:        raw.save?.timing === "both",
      showSaveTriggerEffect: ["trigger", "both"].includes(raw.save?.timing ?? "trigger"),
      showSaveActivationApply: ["activation", "both"].includes(raw.save?.timing ?? "trigger"),
      saveActivationApplyOnFailure: (raw.save?.activationApplyOn ?? "failure") === "failure",
      saveActivationApplyOnSuccess: raw.save?.activationApplyOn === "success",
      saveEffectNone:        (raw.save?.effect ?? "half") === "none",
      saveEffectHalf:        (raw.save?.effect ?? "half") === "half",
      saveEffectFull:        raw.save?.effect === "full",
      saveRepeatEnabled:     raw.save?.repeat?.enabled === true,
      saveRepeatTimingEndTurn: (raw.save?.repeat?.timing ?? "endTurn") === "endTurn",
      saveRepeatTimingStartTurn: raw.save?.repeat?.timing === "startTurn",
      saveRepeatEndsBuffOnSuccess: (raw.save?.repeat?.endsBuffOn ?? "success") === "success",
      saveRepeatEndsBuffOnFailure: raw.save?.repeat?.endsBuffOn === "failure",
      saveRepeatOnDamaged:    raw.save?.repeat?.onDamaged === true,
      saveRepeatOnDamagedRollModeNormal: normalizeSaveRepeatOnDamagedRollMode(raw.save?.repeat?.onDamagedRollMode) === "normal",
      saveRepeatOnDamagedRollModeAdvantage: normalizeSaveRepeatOnDamagedRollMode(raw.save?.repeat?.onDamagedRollMode) === "advantage",
      saveRepeatOnDamagedRollModeDisadvantage: normalizeSaveRepeatOnDamagedRollMode(raw.save?.repeat?.onDamagedRollMode) === "disadvantage",
      showAttackCondition:   ATTACK_TRIGGER_TYPES.includes(raw.type),
      conditionHit:          (raw.condition ?? "hit") === "hit",
      conditionMiss:         raw.condition === "miss",
      conditionAlways:       raw.condition === "always",
      damageTargetModeTriggerTarget: normalizeDamageTargetMode(raw.damage?.targetMode) === "triggerTarget",
      damageTargetModeSelf: normalizeDamageTargetMode(raw.damage?.targetMode) === "self",
      damageTargetModeAttacker: normalizeDamageTargetMode(raw.damage?.targetMode) === "attacker",
      damageTargetModeStoredTarget: normalizeDamageTargetMode(raw.damage?.targetMode) === "storedTarget",
      statusOptions,
      statusIdsList: configuredStatusIds.join(","),
      statusLegacyId: configuredStatusIds[0] ?? "",
      hasStatus: configuredStatusIds.length > 0,
      statusSummary: configuredStatusIds.map((id) => statusLabels[id] ?? id).join(", "),
      statusTimingTrigger:      (raw.status?.timing ?? "trigger") === "trigger",
      statusTimingActivation:   raw.status?.timing === "activation",
      statusTimingBoth:         raw.status?.timing === "both",
      statusTargetModeTriggerTarget: (raw.status?.targetMode ?? "triggerTarget") === "triggerTarget",
      statusTargetModeSelf: raw.status?.targetMode === "self",
      statusTargetModeAttacker: raw.status?.targetMode === "attacker",
      statusTargetModeStoredTarget: raw.status?.targetMode === "storedTarget",
      statusApplyConditionAlways: (raw.status?.applyCondition ?? "always") === "always",
      statusApplyConditionSaveFailure: raw.status?.applyCondition === "saveFailure",
      statusApplyConditionSaveSuccess: raw.status?.applyCondition === "saveSuccess",
      statusRemoveWhenBuffEnds: raw.status?.removeWhenBuffEnds === true,
      receivedAttackTypeAny: (raw.receivedAttackType ?? "any") === "any",
      receivedAttackTypeMelee: raw.receivedAttackType === "melee",
      receivedAttackTypeRanged: raw.receivedAttackType === "ranged",
      receivedAttackTypeWeapon: raw.receivedAttackType === "weapon",
      receivedAttackTypeSpell: raw.receivedAttackType === "spell",
      receivedAttackTypeMwak: raw.receivedAttackType === "mwak",
      receivedAttackTypeRwak: raw.receivedAttackType === "rwak",
      receivedAttackTypeMsak: raw.receivedAttackType === "msak",
      receivedAttackTypeRsak: raw.receivedAttackType === "rsak",
      receivedDamageTypeOptions,
      damageTypeAcid:        raw.damage?.type === "acid",
      damageTypeBludgeoning: raw.damage?.type === "bludgeoning",
      damageTypeCold:        raw.damage?.type === "cold",
      damageTypeFire:        raw.damage?.type === "fire",
      damageTypeForce:       raw.damage?.type === "force",
      damageTypeLightning:   raw.damage?.type === "lightning",
      damageTypeNecrotic:    raw.damage?.type === "necrotic",
      damageTypePiercing:    raw.damage?.type === "piercing",
      damageTypePoison:      raw.damage?.type === "poison",
      damageTypePsychic:     raw.damage?.type === "psychic",
      damageTypeRadiant:     raw.damage?.type === "radiant",
      damageTypeSlashing:    raw.damage?.type === "slashing",
      damageTypeThunder:     raw.damage?.type === "thunder",
      configSummary:         buildConfigSummary(raw, labels, itemDurationRounds),
    };
    return {
      ...await super._prepareContext(options),
      flag,
      presets,
    };
  }

  static async #onSubmit(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);
    if (!data.enabled) {
      await this.item.unsetFlag(MODULE_ID, "buffTrigger");
    } else {
      const flag = buildBuffConfigFromForm(form);
      const itemDuration = buildItemDurationData(this.item);
      if (itemDuration) {
        flag.duration = itemDuration;
      } else {
        delete flag.duration;
      }
      await this.item.unsetFlag(MODULE_ID, "buffTrigger");
      await this.item.setFlag(MODULE_ID, "buffTrigger", flag);
    }
    debugLog(`[${MODULE_ID}] Configuration sauvegardee sur ${this.item.name}`);
  }
}

function getCustomPresets() {
  try {
    const presets = game.settings.get(MODULE_ID, "customPresets") ?? {};
    return isPlainObject(presets) ? presets : {};
  } catch {
    return {};
  }
}

function getBuiltInPresets() {
  return BUFF_PRESETS.map((preset) => ({ ...preset, source: "builtIn" }));
}

function getAllPresets() {
  const customPresets = Object.values(getCustomPresets())
    .filter((preset) => preset?.label && isPlainObject(preset.flag))
    .map((preset) => ({ ...preset, source: "custom" }));
  return [...getBuiltInPresets(), ...customPresets];
}

function getPresetOptions() {
  return getAllPresets().map((preset) => {
    const label = preset.source === "custom"
      ? game.i18n.format("BOT.ui.presets.customPrefix", { label: preset.label })
      : game.i18n.localize(preset.label);
    const description = preset.source === "custom"
      ? (preset.description ?? "")
      : game.i18n.localize(preset.description);
    return {
      id: preset.id,
      label,
      description,
      source: preset.source,
    };
  });
}

function getUniqueCustomPresetId(baseLabel = "preset", existing = getCustomPresets()) {
  const slug = String(baseLabel)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "preset";
  let id = `custom-${slug}`;
  let index = 2;
  while (existing[id] || BUFF_PRESETS.some((preset) => preset.id === id)) {
    id = `custom-${slug}-${index}`;
    index += 1;
  }
  return id;
}

function readFormValue(form, name, fallback = "") {
  const field = form?.querySelector?.(`[name="${name}"]`);
  if (!field) return fallback;
  if (field.type === "checkbox") return field.checked;
  return field.value ?? fallback;
}

function readNumberFormValue(form, name) {
  const value = String(readFormValue(form, name, "")).trim();
  return value ? Number(value) : null;
}

function readCsvFormValue(form, name) {
  return String(readFormValue(form, name, ""))
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function buildBuffConfigFromForm(form) {
  const rollTypes = [
    readFormValue(form, "rollModifierAttack") ? "attack" : null,
    readFormValue(form, "rollModifierSave") ? "save" : null,
    readFormValue(form, "rollModifierAbility") ? "ability" : null,
    readFormValue(form, "rollModifierSkill") ? "skill" : null,
  ].filter(Boolean);
  const damageFormula = String(readFormValue(form, "damageFormula", "")).trim();
  const healingFormula = String(readFormValue(form, "healingFormula", "")).trim();
  const temporaryHpFormula = String(readFormValue(form, "temporaryHpFormula", "")).trim();
  const rollModifierFormula = String(readFormValue(form, "rollModifierFormula", "")).trim();
  const saveAbility = String(readFormValue(form, "saveAbility", "")).trim();
  const statusIds = readCsvFormValue(form, "statusIdsList");
  const statusId = statusIds[0] ?? String(readFormValue(form, "statusId", "")).trim();
  const movementValue = String(readFormValue(form, "buffMovementValue", "")).trim();
  const movementTypes = readCsvFormValue(form, "buffMovementTypesList");

  return mergeBuffConfig(buildDefaultBuffConfig(), {
    targetMode: normalizeGlobalTargetMode(readFormValue(form, "targetMode", "self")),
    rememberTargetOnActivation: !!readFormValue(form, "rememberTargetOnActivation"),
    fallbackToSelfIfNoTarget: normalizeGlobalTargetMode(readFormValue(form, "targetMode", "self")) === "target" && !readFormValue(form, "rememberTargetOnActivation") && !!readFormValue(form, "fallbackToSelfIfNoTarget"),
    allowMultipleTargets: normalizeGlobalTargetMode(readFormValue(form, "targetMode", "self")) === "target" && !readFormValue(form, "rememberTargetOnActivation") && !!readFormValue(form, "allowMultipleTargets"),
    multiTargetLimit: normalizeGlobalTargetMode(readFormValue(form, "targetMode", "self")) === "target" && !readFormValue(form, "rememberTargetOnActivation") && !!readFormValue(form, "allowMultipleTargets")
      ? normalizeMultiTargetLimit({
        enabled: !!readFormValue(form, "multiTargetLimitEnabled"),
        baseTargets: readFormValue(form, "multiTargetLimitBaseTargets", 1),
        baseSpellLevel: readFormValue(form, "multiTargetLimitBaseSpellLevel", 1),
        targetsPerLevelAbove: readFormValue(form, "multiTargetLimitTargetsPerLevelAbove", 0),
      })
      : null,
    requireStoredTargetMatch: !!readFormValue(form, "requireStoredTargetMatch"),
    requireBearerTemporaryHp: !!readFormValue(form, "requireBearerTemporaryHp"),
    type: readFormValue(form, "type", "passive"),
    condition: readFormValue(form, "condition", "hit"),
    receivedAttackType: readFormValue(form, "receivedAttackType", "any"),
    receivedDamageTypes: readCsvFormValue(form, "receivedDamageTypesList"),
    targetFilters: buildTargetFilters(
      readCsvFormValue(form, "targetFilterCreatureTypesList"),
      readCsvFormValue(form, "excludedTargetFilterCreatureTypesList"),
      readTargetFilterAbilityScoresFromForm(form)
    ),
    consumeOnTrigger: !!readFormValue(form, "consumeOnTrigger"),
    triggerFrequency: readFormValue(form, "triggerFrequency", "none"),
    endConditions: (readFormValue(form, "endConditionOnAttack") || readFormValue(form, "endConditionOnSpellCast") || readFormValue(form, "endConditionOnDamageDealt")) ? {
      onAttack: !!readFormValue(form, "endConditionOnAttack"),
      onSpellCast: !!readFormValue(form, "endConditionOnSpellCast"),
      onDamageDealt: !!readFormValue(form, "endConditionOnDamageDealt"),
    } : null,
    reminders: readFormValue(form, "remindersEnabled") && String(readFormValue(form, "remindersMessage", "")).trim() ? {
      enabled: true,
      message: String(readFormValue(form, "remindersMessage", "")).trim(),
      timing: {
        activation: !!readFormValue(form, "remindersTimingActivation"),
        turnStart: !!readFormValue(form, "remindersTimingTurnStart"),
        turnEnd: !!readFormValue(form, "remindersTimingTurnEnd"),
        buffEnd: !!readFormValue(form, "remindersTimingBuffEnd"),
      },
      visibility: readFormValue(form, "remindersVisibility", "gm") === "public" ? "public" : "gm",
    } : null,
    charges: readNumberFormValue(form, "charges"),
    damage: damageFormula ? {
      formula: damageFormula,
      type: readFormValue(form, "damageType", "") || null,
      targetMode: normalizeDamageTargetMode(readFormValue(form, "damageTargetMode", "triggerTarget")),
      targetCreatureTypes: readCsvFormValue(form, "damageTargetCreatureTypesList"),
    } : null,
    save: saveAbility ? {
      ability: saveAbility,
      dc: Number(readFormValue(form, "saveDC", 15)),
      dcSource: readFormValue(form, "saveDcSource", "fixed"),
      timing: readFormValue(form, "saveTiming", "trigger"),
      activationApplyOn: readFormValue(form, "saveActivationApplyOn", "failure"),
      effect: readFormValue(form, "saveEffect", "half"),
      repeat: {
        enabled: !!readFormValue(form, "saveRepeatEnabled"),
        timing: readFormValue(form, "saveRepeatTiming", "endTurn"),
        endsBuffOn: readFormValue(form, "saveRepeatEndsBuffOn", "success"),
        onDamaged: !!readFormValue(form, "saveRepeatOnDamaged"),
        onDamagedRollMode: normalizeSaveRepeatOnDamagedRollMode(readFormValue(form, "saveRepeatOnDamagedRollMode", "normal")),
      },
    } : null,
    status: statusId ? {
      id: statusId,
      ids: statusIds.length ? statusIds : [statusId],
      timing: readFormValue(form, "statusTiming", "trigger"),
      targetMode: readFormValue(form, "statusTargetMode", "triggerTarget"),
      applyCondition: readFormValue(form, "statusApplyCondition", "always"),
      removeWhenBuffEnds: !!readFormValue(form, "statusRemoveWhenBuffEnds"),
    } : null,
    healing: readFormValue(form, "healingEnabled") && healingFormula ? {
      formula: healingFormula,
      targetMode: normalizeHealingTargetMode(readFormValue(form, "healingTargetMode", "triggerTarget")),
    } : null,
    temporaryHp: readFormValue(form, "temporaryHpEnabled") && temporaryHpFormula ? {
      formula: temporaryHpFormula,
      timing: readFormValue(form, "temporaryHpTiming", "trigger"),
      targetMode: normalizeTemporaryHpTargetMode(readFormValue(form, "temporaryHpTargetMode", "triggerTarget")),
      mode: readFormValue(form, "temporaryHpMode", "keepHighest"),
    } : null,
    rollModifier: readFormValue(form, "rollModifierEnabled") && rollModifierFormula ? {
      enabled: true,
      formula: rollModifierFormula,
      rollTypes,
    } : null,
    buffs: {
      ac: readNumberFormValue(form, "buffAC"),
      attackMode: readFormValue(form, "buffAttackMode", "none") !== "none" ? readFormValue(form, "buffAttackMode") : null,
      saveMode: readFormValue(form, "buffSaveMode", "none") !== "none" ? readFormValue(form, "buffSaveMode") : null,
      incomingAttackMode: readFormValue(form, "buffIncomingAttackMode", "none") !== "none" ? readFormValue(form, "buffIncomingAttackMode") : null,
      incomingAttackCreatureTypes: readCsvFormValue(form, "buffIncomingAttackCreatureTypesList"),
      skillMode: readFormValue(form, "buffSkillMode", "none") !== "none" ? readFormValue(form, "buffSkillMode") : null,
      abilityCheckAdvantages: readCsvFormValue(form, "buffAbilityCheckAdvantageList"),
      abilityCheckDisadvantages: readCsvFormValue(form, "buffAbilityCheckDisadvantageList"),
      savingThrowAdvantages: readCsvFormValue(form, "buffSavingThrowAdvantageList"),
      savingThrowDisadvantages: readCsvFormValue(form, "buffSavingThrowDisadvantageList"),
      abilityCheckModifiers: readAbilityModifierValues(form, "buffAbilityCheckModifier"),
      savingThrowModifiers: readAbilityModifierValues(form, "buffSavingThrowModifier"),
      skills: readCsvFormValue(form, "buffSkillAdvantageList"),
      skillBonusSkills: readCsvFormValue(form, "buffSkillBonusList"),
      skillBonus: readFormValue(form, "buffSkillBonus", "") || null,
      skillBonusAll: readFormValue(form, "buffSkillBonusAll", "") || null,
      saveBonus: readFormValue(form, "buffSaveBonus", "") || null,
      attackBonus: readFormValue(form, "buffAttackBonus", "") || null,
      movement: readFormValue(form, "buffMovementEnabled") && movementValue ? { enabled: true, mode: readFormValue(form, "buffMovementMode", "add") === "multiply" ? "multiply" : "add", value: movementValue, types: movementTypes.length ? movementTypes : ["walk"] } : null,
      speed: null,
      weaponProfs: readCsvFormValue(form, "buffWeaponProfsList"),
      armorProfs: readCsvFormValue(form, "buffArmorProfsList"),
      languages: readCsvFormValue(form, "buffLanguagesList"),
      darkvision: readNumberFormValue(form, "buffDarkvision"),
      blindsight: readNumberFormValue(form, "buffBlindSight"),
      tremorsense: readNumberFormValue(form, "buffTremorSense"),
      truesight: readNumberFormValue(form, "buffTrueSight"),
      sensesSpecial: readFormValue(form, "buffSensesSpecial", "") || null,
      passivePerception: readNumberFormValue(form, "buffPassivePerception"),
      resistances: readCsvFormValue(form, "buffResistancesList"),
      vulnerabilities: readCsvFormValue(form, "buffVulnsList"),
      immunities: readCsvFormValue(form, "buffImmunitiesList"),
      conditionImmunities: readCsvFormValue(form, "buffConditionImmunitiesList"),
    },
  });
}

function refreshPresetSelect(form, selectedId = "") {
  const select = form?.querySelector?.('[name="presetId"]');
  if (!select) return;
  select.replaceChildren();
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = game.i18n.localize("BOT.ui.presets.none");
  select.appendChild(empty);
  for (const preset of getPresetOptions()) {
    const option = document.createElement("option");
    option.value = preset.id;
    option.dataset.description = preset.description ?? "";
    option.dataset.source = preset.source ?? "builtIn";
    option.textContent = preset.label;
    select.appendChild(option);
  }
  select.value = selectedId;
  window.botUpdatePresetDescription(select);
  window.botUpdatePresetActions(select);
}
function getPresetById(id) {
  return getAllPresets().find((preset) => preset.id === id) ?? null;
}

function clonePresetFlag(preset) {
  return foundry.utils.deepClone(preset.flag ?? {});
}

function buildDefaultBuffConfig() {
  return {
    targetMode: "self",
    rememberTargetOnActivation: false,
    fallbackToSelfIfNoTarget: false,
    allowMultipleTargets: false,
    multiTargetLimit: null,
    requireStoredTargetMatch: false,
    requireBearerTemporaryHp: false,
    type: "passive",
    condition: "hit",
    receivedAttackType: "any",
    receivedDamageTypes: [],
    targetFilters: null,
    consumeOnTrigger: true,
    triggerFrequency: "none",
    endConditions: null,
    reminders: null,
    charges: null,
    damage: null,
    save: null,
    status: null,
    healing: null,
    temporaryHp: null,
    rollModifier: null,
    buffs: {
      ac: null,
      attackMode: null,
      saveMode: null,
      incomingAttackMode: null,
      incomingAttackCreatureTypes: [],
      skillMode: null,
      abilityCheckAdvantages: [],
      abilityCheckDisadvantages: [],
      savingThrowAdvantages: [],
      savingThrowDisadvantages: [],
      abilityCheckModifiers: {},
      savingThrowModifiers: {},
      skills: [],
      skillBonusSkills: [],
      skillBonus: null,
      skillBonusAll: null,
      saveBonus: null,
      attackBonus: null,
      movement: null,
      speed: null,
      weaponProfs: [],
      armorProfs: [],
      languages: [],
      darkvision: null,
      blindsight: null,
      tremorsense: null,
      truesight: null,
      sensesSpecial: null,
      passivePerception: null,
      resistances: [],
      vulnerabilities: [],
      immunities: [],
      conditionImmunities: [],
    },
  };
}

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function mergeBuffConfig(base, override) {
  const result = foundry.utils.deepClone(base);
  for (const [key, value] of Object.entries(override ?? {})) {
    if (isPlainObject(value) && isPlainObject(result[key])) {
      result[key] = mergeBuffConfig(result[key], value);
    } else {
      result[key] = foundry.utils.deepClone(value);
    }
  }
  return result;
}

function buildPresetConfig(preset) {
  return mergeBuffConfig(buildDefaultBuffConfig(), clonePresetFlag(preset));
}

function setFormValue(form, name, value) {
  const field = form?.querySelector?.(`[name="${name}"]`);
  if (!field) return;
  if (field.type === "checkbox") {
    field.checked = !!value;
  } else {
    field.value = value ?? "";
  }
  field.dispatchEvent(new Event("change", { bubbles: true }));
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

function clearTagList(targetId, form = document) {
  const tags = form.querySelector?.(`#tags-${targetId}`) ?? document.getElementById(`tags-${targetId}`);
  const hidden = form.querySelector?.(`#hidden-${targetId}`) ?? document.getElementById(`hidden-${targetId}`);
  if (tags) tags.innerHTML = "";
  if (hidden) hidden.value = "";
}

function setTagList(form, targetId, values = []) {
  clearTagList(targetId, form);
  const tags = form.querySelector?.(`#tags-${targetId}`);
  const select = form.querySelector?.(`#tags-${targetId} + select, select[onchange*="${targetId}"]`);
  const hidden = form.querySelector?.(`#hidden-${targetId}`);
  const cleanValues = toSafeArray(values);
  if (!tags || !hidden) return;

  for (const value of cleanValues) {
    const label = [...(select?.options ?? [])].find((option) => option.value === value)?.text ?? value;
    const tag = document.createElement("span");
    tag.className = "bot-tag";
    tag.dataset.value = value;
    tag.innerHTML = `${label} <span class="bot-tag-remove" onclick="botRemoveTag(this, '${targetId}')">&times;</span>`;
    tags.appendChild(tag);
  }
  hidden.value = cleanValues.join(",");
}

function formHasDraftConfiguration(form) {
  const app = form?.__botApp;
  if (Object.keys(app?.item?.getFlag?.(MODULE_ID, "buffTrigger") ?? {}).length) return true;
  const relevantFields = [
    "enabled", "rememberTargetOnActivation", "fallbackToSelfIfNoTarget", "allowMultipleTargets", "multiTargetLimitEnabled", "multiTargetLimitBaseTargets", "multiTargetLimitBaseSpellLevel", "multiTargetLimitTargetsPerLevelAbove", "requireStoredTargetMatch", "requireBearerTemporaryHp", "targetFilterCreatureTypesList", "excludedTargetFilterCreatureTypesList", "damageFormula", "damageTargetCreatureTypesList", "healingFormula",
    "temporaryHpFormula", "rollModifierEnabled", "rollModifierFormula", "statusId", "statusIdsList", "statusRemoveWhenBuffEnds", "saveAbility", "saveRepeatEnabled", "saveRepeatOnDamaged", "saveRepeatOnDamagedRollMode", "charges",
    "endConditionOnAttack", "endConditionOnSpellCast", "endConditionOnDamageDealt",
    "remindersEnabled", "remindersMessage", "remindersTimingActivation", "remindersTimingTurnStart", "remindersTimingTurnEnd", "remindersTimingBuffEnd", "remindersVisibility",
    "buffIncomingAttackMode",
    "buffIncomingAttackCreatureTypesList",
    "buffAC", "buffAttackBonus", "buffSaveBonus", "buffSkillBonus", "buffSkillBonusAll", "buffMovementEnabled", "buffMovementValue", "buffMovementTypesList", "buffSpeed",
    "buffDarkvision", "buffBlindSight", "buffTremorSense", "buffTrueSight", "buffSensesSpecial", "buffPassivePerception",
    ...ABILITY_IDS.flatMap((ability) => [abilityFieldName("targetFilterAbilityMin", ability), abilityFieldName("targetFilterAbilityMax", ability)]),
    ...ABILITY_IDS.flatMap((ability) => [abilityFieldName("buffAbilityCheckModifier", ability), abilityFieldName("buffSavingThrowModifier", ability)]),
  ];
  return relevantFields.some((name) => {
    const field = form?.querySelector?.(`[name="${name}"]`);
    if (!field) return false;
    if (field.type === "checkbox") return field.checked;
    return String(field.value ?? "").trim() !== "";
  }) || [
    "receivedDamageTypesList", "targetFilterCreatureTypesList", "excludedTargetFilterCreatureTypesList", "damageTargetCreatureTypesList", "buffAbilityCheckAdvantageList", "buffAbilityCheckDisadvantageList", "buffSavingThrowAdvantageList", "buffSavingThrowDisadvantageList", "buffSkillAdvantageList", "buffSkillBonusList", "buffResistancesList",
    "buffVulnsList", "buffImmunitiesList", "buffConditionImmunitiesList", "buffIncomingAttackCreatureTypesList", "buffWeaponProfsList", "buffArmorProfsList", "buffLanguagesList",
  ].some((name) => String(form?.querySelector?.(`[name="${name}"]`)?.value ?? "").trim() !== "");
}

function setPanelOpen(form, id, open) {
  const panel = form?.querySelector?.(`#${id}`);
  if (panel) panel.open = !!open;
}

function getSummaryLabels() {
  const statusOptions = getStatusOptions([]);
  return {
    skills: getSkillLabels(),
    damageTypes: getDamageLabels(),
    weaponProfs: getWeaponProfLabels(),
    armorProfs: getArmorProfLabels(),
    languages: getLanguageLabels(),
    conditions: Object.fromEntries(getConditionImmunityOptions().map((option) => [option.value, option.label])),
    creatureTypes: getCreatureTypeLabels(),
    statuses: Object.fromEntries(statusOptions.map((option) => [option.value, option.label])),
    movementTypes: Object.fromEntries(getMovementTypeOptions(["all"]).map((option) => [option.value, option.label.toLowerCase()])),
  };
}

function updateSummaryFromFlag(form, flag) {
  try {
    const list = form?.querySelector?.(".bot-summary-list");
    if (!list) return;
    const app = form.__botApp;
    const itemDurationRounds = app?.item ? getItemDurationInRounds(app.item) : null;
    const summary = buildConfigSummary(flag ?? buildDefaultBuffConfig(), getSummaryLabels(), itemDurationRounds);
    list.replaceChildren(...summary.map((entry) => {
      const item = document.createElement("div");
      item.className = "bot-summary-item";
      const label = document.createElement("span");
      label.className = "bot-summary-label";
      label.textContent = entry.label;
      const value = document.createElement("span");
      value.className = "bot-summary-value";
      value.textContent = entry.value;
      item.append(label, value);
      return item;
    }));
  } catch (error) {
    debugLog(`[${MODULE_ID}] Summary refresh ignored after form update: ${error.message}`);
  }
}

function applyPresetFlagToForm(form, flag) {
  flag = convertPresetMovementDistances(mergeBuffConfig(buildDefaultBuffConfig(), flag ?? {}), form?.__botApp?.item?.parent ?? null);
  const rollTypes = flag.rollModifier?.rollTypes ?? [];

  setFormValue(form, "enabled", true);
  setFormValue(form, "targetMode", normalizeGlobalTargetMode(flag.targetMode));
  setFormValue(form, "rememberTargetOnActivation", !!flag.rememberTargetOnActivation);
  setFormValue(form, "fallbackToSelfIfNoTarget", !!flag.fallbackToSelfIfNoTarget);
  setFormValue(form, "allowMultipleTargets", !!flag.allowMultipleTargets && normalizeGlobalTargetMode(flag.targetMode) === "target" && !flag.rememberTargetOnActivation);
  setFormValue(form, "multiTargetLimitEnabled", flag.multiTargetLimit?.enabled === true);
  setFormValue(form, "multiTargetLimitBaseTargets", flag.multiTargetLimit?.baseTargets ?? 1);
  setFormValue(form, "multiTargetLimitBaseSpellLevel", flag.multiTargetLimit?.baseSpellLevel ?? 1);
  setFormValue(form, "multiTargetLimitTargetsPerLevelAbove", flag.multiTargetLimit?.targetsPerLevelAbove ?? 0);
  setFormValue(form, "requireStoredTargetMatch", !!flag.requireStoredTargetMatch);
  setFormValue(form, "requireBearerTemporaryHp", !!flag.requireBearerTemporaryHp);
  setFormValue(form, "type", flag.type ?? "passive");
  setFormValue(form, "condition", flag.condition ?? "hit");
  setFormValue(form, "receivedAttackType", flag.receivedAttackType ?? "any");
  setTagList(form, "receivedDamageTypesList", flag.receivedDamageTypes ?? []);
  setTagList(form, "targetFilterCreatureTypesList", flag.targetFilters?.creatureTypes ?? []);
  setTagList(form, "excludedTargetFilterCreatureTypesList", flag.targetFilters?.excludedCreatureTypes ?? []);

  setFormValue(form, "rollModifierEnabled", !!flag.rollModifier?.enabled);
  setFormValue(form, "rollModifierFormula", flag.rollModifier?.formula ?? "");
  setFormValue(form, "rollModifierAttack", rollTypes.includes("attack"));
  setFormValue(form, "rollModifierSave", rollTypes.includes("save"));
  setFormValue(form, "rollModifierAbility", rollTypes.includes("ability"));
  setFormValue(form, "rollModifierSkill", rollTypes.includes("skill"));

  setFormValue(form, "damageFormula", flag.damage?.formula ?? "");
  setFormValue(form, "damageType", flag.damage?.type ?? "");
  setFormValue(form, "damageTargetMode", normalizeDamageTargetMode(flag.damage?.targetMode));
  setTagList(form, "damageTargetCreatureTypesList", flag.damage?.targetCreatureTypes ?? []);

  setFormValue(form, "saveAbility", flag.save?.ability ?? "");
  setFormValue(form, "saveDC", flag.save?.dc ?? 15);
  setFormValue(form, "saveDcSource", flag.save?.dcSource ?? "fixed");
  setFormValue(form, "saveTiming", flag.save?.timing ?? "trigger");
  setFormValue(form, "saveActivationApplyOn", flag.save?.activationApplyOn ?? "failure");
  setFormValue(form, "saveEffect", flag.save?.effect ?? "half");
  setFormValue(form, "saveRepeatEnabled", !!flag.save?.repeat?.enabled);
  setFormValue(form, "saveRepeatTiming", flag.save?.repeat?.timing ?? "endTurn");
  setFormValue(form, "saveRepeatEndsBuffOn", flag.save?.repeat?.endsBuffOn ?? "success");
  setFormValue(form, "saveRepeatOnDamaged", !!flag.save?.repeat?.onDamaged);
  setFormValue(form, "saveRepeatOnDamagedRollMode", normalizeSaveRepeatOnDamagedRollMode(flag.save?.repeat?.onDamagedRollMode));

  const statusIds = getConfiguredStatusIds(flag.status);
  setFormValue(form, "statusId", statusIds[0] ?? "");
  setTagList(form, "statusIdsList", statusIds);
  setFormValue(form, "statusTiming", flag.status?.timing ?? "trigger");
  setFormValue(form, "statusTargetMode", flag.status?.targetMode ?? "triggerTarget");
  setFormValue(form, "statusApplyCondition", flag.status?.applyCondition ?? "always");
  setFormValue(form, "statusRemoveWhenBuffEnds", !!flag.status?.removeWhenBuffEnds);

  setFormValue(form, "healingEnabled", !!flag.healing?.formula);
  setFormValue(form, "healingFormula", flag.healing?.formula ?? "");
  setFormValue(form, "healingTargetMode", normalizeHealingTargetMode(flag.healing?.targetMode));
  setFormValue(form, "temporaryHpEnabled", !!flag.temporaryHp?.formula);
  setFormValue(form, "temporaryHpFormula", flag.temporaryHp?.formula ?? "");
  setFormValue(form, "temporaryHpTiming", flag.temporaryHp?.timing ?? "trigger");
  setFormValue(form, "temporaryHpTargetMode", normalizeTemporaryHpTargetMode(flag.temporaryHp?.targetMode));
  setFormValue(form, "temporaryHpMode", flag.temporaryHp?.mode ?? "keepHighest");

  setFormValue(form, "consumeOnTrigger", flag.consumeOnTrigger ?? true);
  setFormValue(form, "triggerFrequency", flag.triggerFrequency ?? "none");
  setFormValue(form, "endConditionOnAttack", !!flag.endConditions?.onAttack);
  setFormValue(form, "endConditionOnSpellCast", !!flag.endConditions?.onSpellCast);
  setFormValue(form, "endConditionOnDamageDealt", !!flag.endConditions?.onDamageDealt);
  const reminderMessage = String(flag.reminders?.message ?? "");
  setFormValue(form, "remindersEnabled", !!flag.reminders?.enabled);
  setFormValue(form, "remindersMessage", reminderMessage.startsWith("BOT.") ? game.i18n.localize(reminderMessage) : reminderMessage);
  setFormValue(form, "remindersTimingActivation", !!flag.reminders?.timing?.activation);
  setFormValue(form, "remindersTimingTurnStart", !!flag.reminders?.timing?.turnStart);
  setFormValue(form, "remindersTimingTurnEnd", !!flag.reminders?.timing?.turnEnd);
  setFormValue(form, "remindersTimingBuffEnd", !!flag.reminders?.timing?.buffEnd);
  setFormValue(form, "remindersVisibility", flag.reminders?.visibility ?? "gm");
  setFormValue(form, "charges", flag.charges ?? "");

  setFormValue(form, "buffAttackMode", flag.buffs?.attackMode ?? "none");
  setFormValue(form, "buffSaveMode", flag.buffs?.saveMode ?? "none");
  setFormValue(form, "buffIncomingAttackMode", flag.buffs?.incomingAttackMode ?? "none");
  setTagList(form, "buffIncomingAttackCreatureTypesList", flag.buffs?.incomingAttackCreatureTypes ?? []);
  setFormValue(form, "buffSkillMode", flag.buffs?.skillMode ?? "none");
  setFormValue(form, "buffAC", flag.buffs?.ac ?? "");
  setFormValue(form, "buffAttackBonus", flag.buffs?.attackBonus ?? "");
  setFormValue(form, "buffSaveBonus", flag.buffs?.saveBonus ?? "");
  for (const ability of ABILITY_IDS) {
    setFormValue(form, abilityFieldName("targetFilterAbilityMin", ability), flag.targetFilters?.abilityScores?.[ability]?.min ?? "");
    setFormValue(form, abilityFieldName("targetFilterAbilityMax", ability), flag.targetFilters?.abilityScores?.[ability]?.max ?? "");
    setFormValue(form, abilityFieldName("buffAbilityCheckModifier", ability), flag.buffs?.abilityCheckModifiers?.[ability] ?? "");
    setFormValue(form, abilityFieldName("buffSavingThrowModifier", ability), flag.buffs?.savingThrowModifiers?.[ability] ?? "");
  }
  setFormValue(form, "buffSkillBonus", flag.buffs?.skillBonus ?? "");
  setFormValue(form, "buffSkillBonusAll", flag.buffs?.skillBonusAll ?? "");
  const movement = getConfiguredMovement(flag.buffs ?? {});
  setFormValue(form, "buffMovementEnabled", movement.enabled);
  setFormValue(form, "buffMovementMode", movement.mode);
  setFormValue(form, "buffMovementValue", movement.value);
  setTagList(form, "buffMovementTypesList", movement.types);
  setFormValue(form, "buffSpeed", flag.buffs?.speed?.value ?? "");
  setFormValue(form, "buffSpeedType", flag.buffs?.speed?.type ?? "walk");
  setFormValue(form, "buffDarkvision", flag.buffs?.darkvision ?? "");
  setFormValue(form, "buffBlindSight", flag.buffs?.blindsight ?? "");
  setFormValue(form, "buffTremorSense", flag.buffs?.tremorsense ?? "");
  setFormValue(form, "buffTrueSight", flag.buffs?.truesight ?? "");
  setFormValue(form, "buffSensesSpecial", flag.buffs?.sensesSpecial ?? "");
  setFormValue(form, "buffPassivePerception", flag.buffs?.passivePerception ?? "");

  setTagList(form, "buffAbilityCheckAdvantageList", flag.buffs?.abilityCheckAdvantages ?? []);
  setTagList(form, "buffAbilityCheckDisadvantageList", flag.buffs?.abilityCheckDisadvantages ?? []);
  setTagList(form, "buffSavingThrowAdvantageList", flag.buffs?.savingThrowAdvantages ?? []);
  setTagList(form, "buffSavingThrowDisadvantageList", flag.buffs?.savingThrowDisadvantages ?? []);
  setTagList(form, "buffSkillAdvantageList", flag.buffs?.skills ?? []);
  setTagList(form, "buffSkillBonusList", flag.buffs?.skillBonusSkills ?? []);
  setTagList(form, "buffResistancesList", flag.buffs?.resistances ?? []);
  setTagList(form, "buffVulnsList", flag.buffs?.vulnerabilities ?? []);
  setTagList(form, "buffImmunitiesList", flag.buffs?.immunities ?? []);
  setTagList(form, "buffConditionImmunitiesList", flag.buffs?.conditionImmunities ?? []);
  setTagList(form, "buffWeaponProfsList", flag.buffs?.weaponProfs ?? []);
  setTagList(form, "buffArmorProfsList", flag.buffs?.armorProfs ?? []);
  setTagList(form, "buffLanguagesList", flag.buffs?.languages ?? []);

  setPanelOpen(form, "bot-roll-modifier-panel", !!flag.rollModifier?.enabled);
  setPanelOpen(form, "bot-damage-panel", !!flag.damage?.formula);
  setPanelOpen(form, "bot-save-panel", !!flag.save?.ability);
  setPanelOpen(form, "bot-status-panel", statusIds.length > 0);

  window.botUpdateStoredTargetUI(form.querySelector('[name="targetMode"]'));
  window.botUpdateMultiTargetLimitUI(form.querySelector('[name="allowMultipleTargets"]'));
  window.botUpdateTriggerUI(form.querySelector('[name="type"]'));
  window.botUpdateSaveDcUI(form.querySelector('[name="saveDcSource"]'));
  window.botUpdateSaveTimingUI(form.querySelector('[name="saveTiming"]'));
  window.botUpdateSaveRepeatUI(form);
  window.botUpdateEffectSectionsUI(form);
  window.botUpdateRollModifierUI(form);
  updateSummaryFromFlag(form, flag);
}

window.botUpdatePresetDescription = function(selectEl) {
  const form = selectEl.closest("form");
  const description = selectEl.selectedOptions?.[0]?.dataset?.description
    || game.i18n.localize("BOT.ui.presets.selectHint");
  const descriptionEl = form?.querySelector?.("#bot-preset-description");
  if (descriptionEl) descriptionEl.textContent = description;
};

window.botUpdatePresetActions = function(selectEl) {
  const form = selectEl?.closest?.("form");
  const deleteButton = form?.querySelector?.(".bot-delete-preset-btn");
  if (!deleteButton) return;
  deleteButton.disabled = selectEl?.selectedOptions?.[0]?.dataset?.source !== "custom";
};

async function promptCustomPresetData() {
  if (!globalThis.Dialog) {
    const label = window.prompt(game.i18n.localize("BOT.ui.presets.promptName"));
    if (!label?.trim()) return null;
    const description = window.prompt(game.i18n.localize("BOT.ui.presets.promptDescription")) ?? "";
    return { label: label.trim(), description: description.trim() };
  }

  return new Promise((resolve) => {
    let resolved = false;
    const finish = (value) => {
      if (resolved) return;
      resolved = true;
      resolve(value);
    };
    const content = `
      <form class="bot-custom-preset-dialog">
        <div class="form-group">
          <label>${game.i18n.localize("BOT.ui.presets.promptName")}</label>
          <input type="text" name="label" autofocus />
        </div>
        <div class="form-group">
          <label>${game.i18n.localize("BOT.ui.presets.promptDescription")}</label>
          <input type="text" name="description" />
        </div>
      </form>`;
    new Dialog({
      title: game.i18n.localize("BOT.ui.presets.saveDialogTitle"),
      content,
      buttons: {
        save: {
          label: game.i18n.localize("BOT.ui.presets.saveCustom"),
          callback: (html) => {
            const root = html?.[0] ?? html;
            const label = root?.querySelector?.('[name="label"]')?.value?.trim() ?? "";
            if (!label) return finish(null);
            const description = root?.querySelector?.('[name="description"]')?.value?.trim() ?? "";
            finish({ label, description });
          },
        },
        cancel: {
          label: game.i18n.localize("BOT.ui.presets.cancel"),
          callback: () => finish(null),
        },
      },
      default: "save",
      close: () => finish(null),
    }).render(true);
  });
}

window.botSaveCustomPreset = async function(buttonEl) {
  try {
    const form = buttonEl.closest("form");
    if (!form) return;

    const presetData = await promptCustomPresetData();
    if (!presetData) return;

    const customPresets = foundry.utils.deepClone(getCustomPresets());
    const id = getUniqueCustomPresetId(presetData.label, customPresets);
    customPresets[id] = {
      id,
      label: presetData.label,
      description: presetData.description,
      flag: buildBuffConfigFromForm(form),
      source: "custom",
    };
    await game.settings.set(MODULE_ID, "customPresets", customPresets);
    refreshPresetSelect(form, id);
    ui.notifications.info(game.i18n.localize("BOT.notifications.customPresetSaved"));
  } catch (error) {
    console.error(`[${MODULE_ID}] Erreur dans botSaveCustomPreset :`, error);
  }
};
function downloadPresetJson(payload) {
  const filename = "dnd5e-buff-on-trigger-presets.json";
  if (typeof globalThis.saveDataToFile === "function") {
    globalThis.saveDataToFile(payload, "application/json", filename);
    return;
  }

  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

window.botExportCustomPresets = function() {
  try {
    const presets = Object.values(getCustomPresets()).filter((preset) => preset?.label && isPlainObject(preset.flag));
    if (!presets.length) {
      ui.notifications.info(game.i18n.localize("BOT.notifications.noCustomPresetsToExport"));
      return;
    }

    const payload = JSON.stringify({ module: MODULE_ID, version: "1", presets }, null, 2);
    downloadPresetJson(payload);
  } catch (error) {
    console.error(`[${MODULE_ID}] Erreur dans botExportCustomPresets :`, error);
  }
};
function normalizeImportedPreset(preset, existing) {
  if (!preset?.label || !isPlainObject(preset.flag)) return null;
  const id = getUniqueCustomPresetId(preset.id ?? preset.label, existing);
  return {
    id,
    label: String(preset.label),
    description: String(preset.description ?? ""),
    flag: mergeBuffConfig(buildDefaultBuffConfig(), preset.flag),
    source: "custom",
  };
}

function readJsonFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result ?? "")), { once: true });
    reader.addEventListener("error", () => reject(reader.error), { once: true });
    reader.readAsText(file);
  });
}

window.botImportCustomPresets = function(buttonEl) {
  const form = buttonEl.closest("form");
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";
  input.style.display = "none";
  document.body.appendChild(input);
  input.addEventListener("cancel", () => input.remove(), { once: true });
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    input.remove();
    if (!file) return;
    try {
      const text = await readJsonFile(file);
      const data = JSON.parse(text);
      if (data.module && data.module !== MODULE_ID) {
        ui.notifications.warn(game.i18n.localize("BOT.notifications.customPresetImportWrongModule"));
        return;
      }
      if (!Array.isArray(data.presets)) {
        ui.notifications.warn(game.i18n.localize("BOT.notifications.customPresetImportInvalid"));
        return;
      }

      const customPresets = foundry.utils.deepClone(getCustomPresets());
      let importedCount = 0;
      for (const preset of data.presets) {
        const normalized = normalizeImportedPreset(preset, customPresets);
        if (!normalized) continue;
        customPresets[normalized.id] = normalized;
        importedCount += 1;
      }
      await game.settings.set(MODULE_ID, "customPresets", customPresets);
      refreshPresetSelect(form);
      ui.notifications.info(game.i18n.format("BOT.notifications.customPresetImported", { count: importedCount }));
    } catch (error) {
      console.warn(`[${MODULE_ID}] Import de presets invalide`, error);
      ui.notifications.warn(game.i18n.localize("BOT.notifications.customPresetImportInvalid"));
    }
  }, { once: true });
  input.click();
};
window.botDeleteCustomPreset = async function(buttonEl) {
  const form = buttonEl.closest("form");
  const select = form?.querySelector?.('[name="presetId"]');
  const id = select?.value;
  const preset = getPresetById(id);
  if (!preset) return;
  if (preset.source !== "custom") {
    ui.notifications.warn(game.i18n.localize("BOT.notifications.builtInPresetCannotDelete"));
    return;
  }
  const confirmed = window.confirm(game.i18n.format("BOT.ui.presets.confirmDelete", { name: preset.label }));
  if (!confirmed) return;

  const customPresets = foundry.utils.deepClone(getCustomPresets());
  delete customPresets[id];
  await game.settings.set(MODULE_ID, "customPresets", customPresets);
  refreshPresetSelect(form);
  ui.notifications.info(game.i18n.format("BOT.notifications.customPresetDeleted", { name: preset.label }));
};
window.botApplyPreset = function(buttonEl) {
  const form = buttonEl.closest("form");
  const select = form?.querySelector?.('[name="presetId"]');
  const preset = getPresetById(select?.value);
  if (!preset) return;

  if (formHasDraftConfiguration(form)) {
    const confirmed = window.confirm(game.i18n.localize("BOT.ui.presets.confirmReplace"));
    if (!confirmed) return;
  }

  applyPresetFlagToForm(form, buildPresetConfig(preset));
  debugLog(`[${MODULE_ID}] Preset applied: ${preset.id}`);
};

window.botResetBuffConfig = function(buttonEl) {
  const form = buttonEl.closest("form");
  if (!form) return;

  const confirmed = window.confirm(game.i18n.localize("BOT.ui.presets.confirmReset"));
  if (!confirmed) return;

  applyPresetFlagToForm(form, buildDefaultBuffConfig());
  const presetSelect = form.querySelector?.('[name="presetId"]');
  if (presetSelect) {
    presetSelect.value = "";
    window.botUpdatePresetDescription(presetSelect);
    window.botUpdatePresetActions(presetSelect);
  }
  debugLog(`[${MODULE_ID}] Buff configuration reset`);
};
window.botShowTab = function(btn, tabId) {
  const form = btn.closest('form');
  form.querySelectorAll('.bot-tab-panel').forEach(p => p.style.display = 'none');
  btn.closest('.bot-tabs').querySelectorAll('.bot-tab-btn').forEach(b => b.classList.remove('bot-tab-active'));
  form.querySelector('#' + tabId).style.display = '';
  btn.classList.add('bot-tab-active');
  const app = Object.values(ui.windows).find(w => w.constructor.name === "BuffTriggerConfig")
    ?? Object.values(foundry.applications.instances ?? {}).find(w => w.constructor.name === "BuffTriggerConfig");
  if (app) app.resizeToContent();
};

window.botUpdateSaveRepeatUI = function(form) {
  if (!form) return;
  const repeatSection = form.querySelector('#bot-save-repeat-section');
  const saveAbility = form.querySelector('[name="saveAbility"]');
  if (repeatSection && saveAbility) {
    repeatSection.style.display = saveAbility.value ? "" : "none";
  }
  const damagedRollModeRow = form.querySelector('#bot-save-repeat-damage-roll-mode');
  const onDamaged = form.querySelector('[name="saveRepeatOnDamaged"]');
  if (damagedRollModeRow && onDamaged) {
    damagedRollModeRow.style.display = onDamaged.checked ? "" : "none";
  }
};
window.botUpdateSaveTimingUI = function(selectEl) {
  const form = selectEl?.closest?.('form');
  if (!form) return;

  const timing = selectEl.value || "trigger";
  const showTriggerControls = timing === "trigger" || timing === "both";
  const showActivationControls = timing === "activation" || timing === "both";

  form.querySelectorAll?.(".bot-save-trigger-control")?.forEach((el) => {
    el.style.display = showTriggerControls ? "" : "none";
  });
  form.querySelectorAll?.(".bot-save-activation-control")?.forEach((el) => {
    el.style.display = showActivationControls ? "" : "none";
  });

  const app = form?.__botApp ?? selectEl.closest?.(".application")?.__botApp;
  if (app) app.resizeToContent();
};

window.botUpdateTriggerUI = function(selectEl) {
  const form = selectEl.closest('form');
  const conditionGroup = form?.querySelector?.("#bot-condition-group");
  const receivedConditionsGroup = form?.querySelector?.("#bot-received-conditions-group");
  const passiveHelp = form?.querySelector?.("#bot-passive-help");
  const recurringTurnHelp = form?.querySelector?.("#bot-recurring-turn-help");

  if (conditionGroup) {
    conditionGroup.style.display = ATTACK_TRIGGER_TYPES.includes(selectEl.value) ? "" : "none";
  }

  if (receivedConditionsGroup) {
    receivedConditionsGroup.style.display = selectEl.value === "damaged" ? "" : "none";
  }

  if (passiveHelp) {
    passiveHelp.style.display = selectEl.value === "passive" ? "" : "none";
  }

  if (recurringTurnHelp) {
    recurringTurnHelp.style.display = isBearerTurnTrigger(selectEl.value) ? "" : "none";
  }

  window.botUpdateTargetModeOptions(form, selectEl.value);

  const consumeInput = form?.querySelector?.('[name="consumeOnTrigger"]');
  const chargesInput = form?.querySelector?.('[name="charges"]');
  const initialized = selectEl.dataset.botTriggerInitialized === "true";
  if (initialized && isBearerTurnTrigger(selectEl.value) && consumeInput?.checked && !String(chargesInput?.value ?? "").trim()) {
    consumeInput.checked = false;
  }
  selectEl.dataset.botTriggerInitialized = "true";

  const app = Object.values(ui.windows).find(w => w.constructor.name === "BuffTriggerConfig")
    ?? Object.values(foundry.applications.instances ?? {}).find(w => w.constructor.name === "BuffTriggerConfig");
  if (app) app.resizeToContent();
};

window.botUpdateStoredTargetUI = function(selectEl) {
  const form = selectEl.closest('form');
  const storedTargetGroup = form?.querySelector?.('#bot-stored-target-group');
  if (storedTargetGroup) {
    storedTargetGroup.style.display = selectEl.value === "self" ? "" : "none";
  }
  const fallbackGroup = form?.querySelector?.('#bot-fallback-self-group');
  const multiTargetGroup = form?.querySelector?.('#bot-allow-multiple-targets-group');
  const multiTargetInput = form?.querySelector?.('[name="allowMultipleTargets"]');
  const limitGroup = form?.querySelector?.('#bot-multi-target-limit-group');
  const rememberTargetInput = form?.querySelector?.('[name="rememberTargetOnActivation"]');
  const showTargetOptions = selectEl.value === "target" && !rememberTargetInput?.checked;
  if (fallbackGroup) {
    fallbackGroup.style.display = showTargetOptions ? "" : "none";
  }
  if (multiTargetGroup) {
    multiTargetGroup.style.display = showTargetOptions ? "" : "none";
  }
  if (!showTargetOptions && multiTargetInput) multiTargetInput.checked = false;
  if (limitGroup) limitGroup.style.display = showTargetOptions && multiTargetInput?.checked ? "" : "none";
  const app = Object.values(ui.windows).find(w => w.constructor.name === "BuffTriggerConfig")
    ?? Object.values(foundry.applications.instances ?? {}).find(w => w.constructor.name === "BuffTriggerConfig");
  if (app) app.resizeToContent();
};

window.botUpdateMultiTargetLimitUI = function(inputEl) {
  const form = inputEl?.closest?.('form');
  const limitGroup = form?.querySelector?.('#bot-multi-target-limit-group');
  const targetMode = form?.querySelector?.('[name="targetMode"]')?.value;
  const rememberTargetInput = form?.querySelector?.('[name="rememberTargetOnActivation"]');
  const visible = targetMode === "target" && !rememberTargetInput?.checked && !!inputEl?.checked;
  if (limitGroup) limitGroup.style.display = visible ? "" : "none";
  const app = Object.values(ui.windows).find(w => w.constructor.name === "BuffTriggerConfig")
    ?? Object.values(foundry.applications.instances ?? {}).find(w => w.constructor.name === "BuffTriggerConfig");
  if (app) app.resizeToContent();
};

window.botUpdateSaveDcUI = function(selectEl) {
  const form = selectEl.closest('form');
  const dcGroup = form?.querySelector?.('#bot-save-dc-group');
  if (!dcGroup) return;
  dcGroup.style.display = selectEl.value === "fixed" ? "" : "none";
  const app = Object.values(ui.windows).find(w => w.constructor.name === "BuffTriggerConfig")
    ?? Object.values(foundry.applications.instances ?? {}).find(w => w.constructor.name === "BuffTriggerConfig");
  if (app) app.resizeToContent();
};

window.botShowSubTab = function(btn, tabId) {
  const container = btn.closest('.bot-subtabs-container');
  if (!container) return;
  container.querySelectorAll('.bot-subtab-panel').forEach(p => p.style.display = 'none');
  btn.closest('.bot-tabs').querySelectorAll('.bot-subtab-btn').forEach(b => b.classList.remove('bot-tab-active'));
  container.querySelector('#' + tabId).style.display = '';
  btn.classList.add('bot-tab-active');
  const app = Object.values(ui.windows).find(w => w.constructor.name === "BuffTriggerConfig")
    ?? Object.values(foundry.applications.instances ?? {}).find(w => w.constructor.name === "BuffTriggerConfig");
  if (app) app.resizeToContent();
};

window.botAddTag = function(selectEl, targetId) {
  const value = selectEl.value;
  if (!value) return;
  const label = selectEl.options[selectEl.selectedIndex].text;
  const tagsDiv = document.getElementById('tags-' + targetId);
  if ([...tagsDiv.querySelectorAll('.bot-tag')].some(t => t.dataset.value === value)) {
    selectEl.value = '';
    return;
  }
  const tag = document.createElement('span');
  tag.className = 'bot-tag';
  tag.dataset.value = value;
  tag.innerHTML = label + ' <span class="bot-tag-remove" onclick="botRemoveTag(this, \'' + targetId + '\')">&times;</span>';
  tagsDiv.appendChild(tag);
  botUpdateHidden(targetId);
  selectEl.value = '';
};

window.botRemoveTag = function(removeEl, targetId) {
  removeEl.parentElement.remove();
  botUpdateHidden(targetId);
};

window.botUpdateHidden = function(targetId) {
  const tagsDiv = document.getElementById('tags-' + targetId);
  const hiddenInput = document.getElementById('hidden-' + targetId);
  const values = [...tagsDiv.querySelectorAll('.bot-tag')].map(t => t.dataset.value);
  hiddenInput.value = values.join(',');
  if (targetId === 'statusIdsList') {
    const legacyStatusInput = hiddenInput.form?.querySelector?.('[name="statusId"]');
    if (legacyStatusInput) legacyStatusInput.value = values[0] ?? '';
  }
  hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
};

window.botUpdateEffectSectionsUI = function(form) {
  if (!form) return;

  const healingDetails = form.querySelector('#bot-healing-details');
  const healingEnabled = form.querySelector('[name="healingEnabled"]');
  if (healingDetails && healingEnabled) {
    healingDetails.style.display = healingEnabled.checked ? "" : "none";
  }

  const temporaryHpDetails = form.querySelector('#bot-temporary-hp-details');
  const temporaryHpEnabled = form.querySelector('[name="temporaryHpEnabled"]');
  if (temporaryHpDetails && temporaryHpEnabled) {
    temporaryHpDetails.style.display = temporaryHpEnabled.checked ? "" : "none";
  }

  const statusTimingRow = form.querySelector('#bot-status-timing-row');
  const statusTargetRow = form.querySelector('#bot-status-target-row');
  const statusApplyConditionRow = form.querySelector('#bot-status-apply-condition-row');
  const statusRemoveWhenBuffEndsRow = form.querySelector('#bot-status-remove-when-buff-ends-row');
  const statusSelect = form.querySelector('[name="statusIdsList"]');
  if (statusTimingRow && statusSelect) {
    statusTimingRow.style.display = statusSelect.value ? "" : "none";
  }
  if (statusTargetRow && statusSelect) {
    statusTargetRow.style.display = statusSelect.value ? "" : "none";
  }
  if (statusApplyConditionRow && statusSelect) {
    statusApplyConditionRow.style.display = statusSelect.value ? "" : "none";
  }
  if (statusRemoveWhenBuffEndsRow && statusSelect) {
    statusRemoveWhenBuffEndsRow.style.display = statusSelect.value ? "" : "none";
  }

  const app = Object.values(ui.windows).find(w => w.constructor.name === "BuffTriggerConfig")
    ?? Object.values(foundry.applications.instances ?? {}).find(w => w.constructor.name === "BuffTriggerConfig");
  if (app) app.resizeToContent();
};

window.botUpdateRollModifierUI = function(form) {
  if (!form) return;
  const details = form.querySelector('#bot-roll-modifier-details');
  const enabled = form.querySelector('[name="rollModifierEnabled"]');
  if (details && enabled) {
    details.style.display = enabled.checked ? "" : "none";
  }
  const app = Object.values(ui.windows).find(w => w.constructor.name === "BuffTriggerConfig")
    ?? Object.values(foundry.applications.instances ?? {}).find(w => w.constructor.name === "BuffTriggerConfig");
  if (app) app.resizeToContent();
};

window.botUpdateTargetModeOptions = function(form, triggerType) {
  if (!form) return;

  const attackTriggers = ATTACK_TRIGGER_TYPES;
  const turnTriggers = ["turnStart", "turnEnd", "targetTurnStart", "targetTurnEnd"];

  let allowedModes = ["triggerTarget", "self", "attacker", "storedTarget"];
  let fallbackMode = "self";

  if (turnTriggers.includes(triggerType)) {
    allowedModes = ["self", "storedTarget"];
    fallbackMode = "self";
  } else if (triggerType === "damaged") {
    allowedModes = ["self", "attacker", "storedTarget"];
    fallbackMode = "attacker";
  } else if (attackTriggers.includes(triggerType)) {
    allowedModes = ["triggerTarget", "self", "storedTarget"];
    fallbackMode = "triggerTarget";
  } else if (triggerType === "passive") {
    allowedModes = ["self", "storedTarget"];
    fallbackMode = "self";
  }

  const selectNames = ["damageTargetMode", "statusTargetMode", "healingTargetMode", "temporaryHpTargetMode"];
  for (const name of selectNames) {
    const select = form.querySelector(`[name="${name}"]`);
    if (!select) continue;

    for (const option of select.options) {
      const allowed = allowedModes.includes(option.value);
      option.hidden = !allowed;
      option.disabled = !allowed;
    }

    if (!allowedModes.includes(select.value)) {
      select.value = fallbackMode;
    }

    if (!allowedModes.includes(select.value)) {
      select.value = allowedModes[0] ?? "";
    }
  }
};

window.botInsertFormulaVariable = function(buttonEl, variableName) {
  const form = buttonEl.closest('form');
  const input = form?.__botLastFormulaInput
    ?? form?.querySelector?.('input[name="damageFormula"], input[name="healingFormula"], input[name="temporaryHpFormula"], input[name="rollModifierFormula"]');
  if (!input) return;

  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  input.value = `${input.value.slice(0, start)}${variableName}${input.value.slice(end)}`;
  input.focus();
  const cursor = start + variableName.length;
  if (typeof input.setSelectionRange === "function") input.setSelectionRange(cursor, cursor);
  form.__botLastFormulaInput = input;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
};

export function registerItemSheetButton() {
  debugLog(`[${MODULE_ID}] registerItemSheetButton enregistre`);

  Hooks.on("renderItemSheet5e", (app, html) => {
    const item = app?.item ?? app?.document ?? app?.object;

    let root;
    if (app.element instanceof HTMLElement) {
      root = app.element;
    } else if (app.element?.[0] instanceof HTMLElement) {
      root = app.element[0];
    } else if (html instanceof HTMLElement) {
      root = html;
    } else {
      root = html?.[0];
    }
    if (!root) return;

    const applicationRoot = root.matches?.(".application") ? root : root.closest?.(".application") ?? root;
    const header = applicationRoot.querySelector?.(".window-header");
    if (!header) return;

    const closeControl = header.querySelector('[data-action="close"], .header-control.close, .window-control.close, .close');

    header.querySelector(".bot-config-btn")?.remove();

    const buttonTag = closeControl?.tagName?.toLowerCase?.() || "button";
    const button = document.createElement(buttonTag);
    button.classList.add("header-control", "bot-config-btn");
    button.type = "button";
    button.title = game.i18n.localize("BOT.moduleTitle");
    button.setAttribute("aria-label", game.i18n.localize("BOT.moduleTitle"));
    button.innerHTML = '<i class="fas fa-bolt" aria-hidden="true"></i>';

    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      new BuffTriggerConfig(item).render({ force: true });
    });

    if (closeControl) {
      closeControl.parentElement.insertBefore(button, closeControl);
    } else {
      header.append(button);
    }
  });
}

import { MODULE_ID, ATTACK_ACTION_TYPES, ATTACK_TRIGGER_TYPES, DAMAGE_TYPES, debugLog } from "./constants.js";
import { buildItemDurationData } from "./duration.js";
import { applyEffect, refreshBuffIndicator, refreshStackingMechanicalEffects, refreshStoredTargetIndicator, applyTargetIndicator, applyRollModifierToConfig, finalizeRollModifierApplication, resolveSaveDC, applyTemporaryHp, applyStatusEffect, ensureLinkedStatusesForActiveBuff, registerLinkedStatusProtection, showBuffReminder, consumeAllowedActiveBuffIndicatorDeletion, allowConcentrationDeletion, consumeAllowedConcentrationDeletion } from "./effects.js";
import { getActiveBuff, getActiveBuffs, getStackingKey, upsertActiveBuff, removeActiveBuff } from "./active-buffs.js";

const recentConcentrationRolls = new Map();
const recentDamagedRepeatedSaves = new Map();
const recentDamageTakenEndChecks = new Map();
const temporaryHpBeforeActorUpdate = new Map();
const pendingTemporaryHpEndConcentrationSkips = new Map();
const TEMP_HP_CONCENTRATION_SKIP_TTL_MS = 2000;
const SAVE_REPEAT_DAMAGE_ROLL_MODES = ["normal", "advantage", "disadvantage"];
const SAVE_ROLL_MODES = ["normal", "advantage", "disadvantage"];
const INCOMING_ATTACK_CREATURE_TYPES = ["aberration", "celestial", "elemental", "fey", "fiend", "undead", "beast", "dragon", "giant", "humanoid", "monstrosity", "ooze", "plant", "construct"];
const ATTACK_MODE_ATTACK_TYPES = ["weapon", "spell", "melee", "ranged", "mwak", "rwak", "msak", "rsak"];
const TARGET_FILTER_ABILITY_IDS = ["str", "dex", "con", "int", "wis", "cha"];
const CREATURE_TYPE_ALIASES = {
  "aberration": "aberration",
  "celestial": "celestial",
  "celeste": "celestial",
  "céleste": "celestial",
  "elemental": "elemental",
  "elementaire": "elemental",
  "élémentaire": "elemental",
  "fey": "fey",
  "fee": "fey",
  "fée": "fey",
  "fiend": "fiend",
  "fielon": "fiend",
  "fiélon": "fiend",
  "undead": "undead",
  "mort-vivant": "undead",
  "mort vivant": "undead",
  "morts-vivants": "undead",
  "beast": "beast",
  "bete": "beast",
  "bête": "beast",
  "dragon": "dragon",
  "giant": "giant",
  "geant": "giant",
  "géant": "giant",
  "humanoid": "humanoid",
  "humanoide": "humanoid",
  "humanoïde": "humanoid",
  "monstrosity": "monstrosity",
  "monstruosite": "monstrosity",
  "monstruosité": "monstrosity",
  "ooze": "ooze",
  "vase": "ooze",
  "plant": "plant",
  "plante": "plant",
  "construct": "construct",
  "artificiel": "construct",
};

function resolveRollHookActor(config) {
  return config?.subject?.getFlag
    ? config.subject
    : config?.subject?.actor?.getFlag
      ? config.subject.actor
      : config?.actor?.getFlag
        ? config.actor
        : config?.item?.actor?.getFlag
          ? config.item.actor
          : null;
}

function getRollHookConfig(args) {
  return args.find((arg) => arg && typeof arg === "object" && !Array.isArray(arg) && !arg.getFlag && (
    Array.isArray(arg.rolls)
    || arg.parts !== undefined
    || arg.bonus !== undefined
    || arg.subject !== undefined
    || arg.actor !== undefined
    || arg.data !== undefined
    || arg.advantage !== undefined
    || arg.disadvantage !== undefined
  )) ?? null;
}

function summarizeRollHookArgs(args) {
  return args.map((arg, index) => {
    if (Array.isArray(arg)) return `${index}:array(${arg.length})`;
    if (!arg || typeof arg !== "object") return `${index}:${typeof arg}`;
    const ctor = arg.constructor?.name ?? "object";
    const keys = Object.keys(arg).slice(0, 10).join(",");
    const subject = arg.subject?.name ?? arg.subject?.item?.name ?? arg.subject?.constructor?.name ?? "none";
    const actor = arg.actor?.name ?? arg.subject?.actor?.name ?? arg.item?.actor?.name ?? "none";
    const rolls = Array.isArray(arg.rolls) ? arg.rolls.length : "none";
    const firstRoll = Array.isArray(arg.rolls) ? arg.rolls[0] : null;
    return `${index}:${ctor}{keys=${keys}; subject=${subject}; actor=${actor}; rolls=${rolls}; parts=${Array.isArray(arg.parts)}; bonus=${arg.bonus !== undefined}; roll0.parts=${Array.isArray(firstRoll?.parts)}; roll0.bonus=${firstRoll?.bonus !== undefined}}`;
  }).join(" | ");
}


function incomingFilterLog(message, data = null) {
  const prefix = "[" + MODULE_ID + "] BOT incoming filter: " + message;
  if (data === null) debugLog(prefix);
  else debugLog(prefix, data);
}

function summarizeIncomingTarget(token) {
  const resolved = token?.object ?? token;
  const actor = resolved?.actor ?? (resolved?.documentName === "Actor" ? resolved : null);
  return {
    token: resolved?.name ?? resolved?.document?.name ?? null,
    tokenUuid: resolved?.document?.uuid ?? resolved?.uuid ?? null,
    actor: actor?.name ?? null,
    actorUuid: actor?.uuid ?? null,
    hasActiveBuff: Boolean(actor?.getFlag?.(MODULE_ID, "activeBuff")),
  };
}

function summarizeIncomingTargets(targets = []) {
  return [...targets].map((target) => summarizeIncomingTarget(target));
}

function summarizeIncomingWorkflow(workflow) {
  return {
    attacker: workflow?.actor?.name ?? workflow?.item?.actor?.name ?? null,
    attackerUuid: workflow?.actor?.uuid ?? workflow?.item?.actor?.uuid ?? null,
    item: workflow?.item?.name ?? null,
    targets: summarizeIncomingTargets(workflow?.targets ?? []),
    hitTargets: summarizeIncomingTargets(workflow?.hitTargets ?? []),
    preSelectedTargets: summarizeIncomingTargets(workflow?.preSelectedTargets ?? []),
    rollOptionTargets: summarizeIncomingTargets(workflow?.rollOptions?.targets ?? []),
    workflowOptionTargets: summarizeIncomingTargets(workflow?.workflowOptions?.targets ?? []),
    midiOptionTargets: summarizeIncomingTargets(workflow?.midiOptions?.targets ?? []),
    targetUuids: [...(workflow?.targetUuids ?? [])],
    workflowKeys: Object.keys(workflow ?? {}).slice(0, 40),
    workflowOptions: {
      advantage: workflow?.workflowOptions?.advantage,
      disadvantage: workflow?.workflowOptions?.disadvantage,
    },
    rollOptions: {
      advantage: workflow?.rollOptions?.advantage,
      disadvantage: workflow?.rollOptions?.disadvantage,
    },
  };
}

function summarizeIncomingRollConfig(process, rollConfig) {
  return {
    processKeys: Object.keys(process ?? {}).slice(0, 40),
    processSubject: process?.subject?.name ?? process?.subject?.actor?.name ?? null,
    configKeys: Object.keys(rollConfig ?? {}).slice(0, 40),
    subject: rollConfig?.subject?.name ?? rollConfig?.subject?.actor?.name ?? null,
    advantage: rollConfig?.advantage,
    disadvantage: rollConfig?.disadvantage,
    options: {
      advantage: rollConfig?.options?.advantage,
      disadvantage: rollConfig?.options?.disadvantage,
      advantageMode: rollConfig?.options?.advantageMode,
    },
    processTargets: summarizeIncomingTargets(process?.targets ?? process?.config?.targets ?? []),
    targets: summarizeIncomingTargets(rollConfig?.targets ?? []),
    rolls: (rollConfig?.rolls ?? []).map((roll, index) => ({
      index,
      rollType: roll?.constructor?.name ?? typeof roll,
      advantage: roll?.options?.advantage,
      disadvantage: roll?.options?.disadvantage,
      advantageMode: roll?.options?.advantageMode,
      optionKeys: Object.keys(roll?.options ?? {}).slice(0, 40),
    })),
  };
}
function normalizeCreatureTypeText(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function extractCreatureTypeTokens(value) {
  const normalized = normalizeCreatureTypeText(value);
  if (!normalized) return [];
  return normalized
    .split(/[^a-z0-9-]+/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeCreatureTypeValue(value) {
  const normalized = normalizeCreatureTypeText(value);
  const tokens = [normalized, ...extractCreatureTypeTokens(value)];
  const results = [];
  for (const token of tokens) {
    const canonical = CREATURE_TYPE_ALIASES[token] ?? token;
    if (INCOMING_ATTACK_CREATURE_TYPES.includes(canonical)) results.push(canonical);
  }
  return results;
}

function normalizeIncomingAttackCreatureTypes(types = []) {
  return [...new Set((Array.isArray(types) ? types : [types])
    .flatMap((type) => normalizeCreatureTypeValue(type)))];
}

function normalizeAttackModeAttackTypes(types = []) {
  const values = Array.isArray(types) ? types : [types];
  return [...new Set(values.map((type) => String(type ?? "").trim()).filter((type) => ATTACK_MODE_ATTACK_TYPES.includes(type)))];
}

function flattenCreatureTypeValues(value) {
  if (!value) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap((entry) => flattenCreatureTypeValues(entry));
  if (typeof value === "object") return Object.values(value).flatMap((entry) => flattenCreatureTypeValues(entry));
  return [String(value)];
}

function getActorCreatureTypeValues(actor) {
  const midiTypeOrRace = globalThis.MidiQOL?.typeOrRace?.(actor);
  const midiRaceOrType = globalThis.MidiQOL?.raceOrType?.(actor);
  return [...new Set([
    midiTypeOrRace,
    midiRaceOrType,
    actor?.system?.details?.type,
    actor?.system?.details?.type?.value,
    actor?.system?.details?.type?.subtype,
    actor?.system?.details?.type?.custom,
    actor?.system?.details?.race,
    actor?.raceOrType,
  ]
    .flatMap((value) => flattenCreatureTypeValues(value))
    .flatMap((value) => normalizeCreatureTypeValue(value))
    .filter(Boolean))];
}

function getTargetFilterDebugData(actor) {
  return {
    actorName: actor?.name ?? null,
    detailsType: actor?.system?.details?.type ?? null,
    detailsTypeValue: actor?.system?.details?.type?.value ?? null,
    detailsTypeSubtype: actor?.system?.details?.type?.subtype ?? null,
    detailsTypeCustom: actor?.system?.details?.type?.custom ?? null,
    detailsRace: actor?.system?.details?.race ?? null,
    raceOrType: actor?.raceOrType ?? null,
    midiTypeOrRace: globalThis.MidiQOL?.typeOrRace?.(actor) ?? null,
    midiRaceOrType: globalThis.MidiQOL?.raceOrType?.(actor) ?? null,
  };
}

function getTargetFilterCreatureTypes(flag) {
  return normalizeIncomingAttackCreatureTypes(flag?.targetFilters?.creatureTypes ?? []);
}

function getExcludedTargetFilterCreatureTypes(flag) {
  return normalizeIncomingAttackCreatureTypes(flag?.targetFilters?.excludedCreatureTypes ?? []);
}

function parseTargetFilterNumber(value, label) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    debugLog(`[${MODULE_ID}] Restriction cible ignoree : valeur non numerique pour ${label} (${value})`);
    return null;
  }
  return parsed;
}

function targetFilterHasAbilityRestrictions(abilityScores = {}) {
  return TARGET_FILTER_ABILITY_IDS.some((ability) => {
    const restriction = abilityScores?.[ability] ?? {};
    return parseTargetFilterNumber(restriction.min, `${ability}.min`) !== null
      || parseTargetFilterNumber(restriction.max, `${ability}.max`) !== null;
  });
}

function actorMatchesAbilityScoreFilters(actor, abilityScores = {}) {
  for (const ability of TARGET_FILTER_ABILITY_IDS) {
    const restriction = abilityScores?.[ability] ?? {};
    const min = parseTargetFilterNumber(restriction.min, `${ability}.min`);
    const max = parseTargetFilterNumber(restriction.max, `${ability}.max`);
    if (min === null && max === null) continue;

    const score = Number(actor?.system?.abilities?.[ability]?.value);
    if (!Number.isFinite(score)) {
      debugLog(`[${MODULE_ID}] Filtre cible activation : score ${ability} indisponible pour ${actor?.name ?? "inconnu"}`);
      return false;
    }
    if (min !== null && score < min) return false;
    if (max !== null && score > max) return false;
  }
  return true;
}

function actorMatchesCreatureTypeFilter(actor, creatureTypes = []) {
  const expectedTypes = normalizeIncomingAttackCreatureTypes(creatureTypes);
  if (!expectedTypes.length) return true;

  const detectedTypes = getActorCreatureTypeValues(actor);
  const match = detectedTypes.some((type) => expectedTypes.includes(type));
  debugLog(`[${MODULE_ID}] Restriction cible : target=${actor?.name ?? "inconnu"}, rawType=${JSON.stringify(actor?.system?.details?.type ?? null)}, race=${JSON.stringify(actor?.system?.details?.race ?? null)}, raceOrType=${JSON.stringify(actor?.raceOrType ?? null)}, detectedTypes=${JSON.stringify(detectedTypes)}, allowed=${JSON.stringify(expectedTypes)}, match=${match}`);
  return match;
}

function evaluateTargetFilters(flag, targetToken) {
  const creatureTypes = getTargetFilterCreatureTypes(flag);
  const excludedCreatureTypes = getExcludedTargetFilterCreatureTypes(flag);
  const abilityScores = flag?.targetFilters?.abilityScores ?? {};
  const hasAbilityRestrictions = targetFilterHasAbilityRestrictions(abilityScores);
  const actor = targetToken?.actor;
  const detectedTypes = getActorCreatureTypeValues(actor);
  const result = {
    ok: true,
    reason: null,
    targetName: actor?.name ?? targetToken?.name ?? "inconnue",
    detectedTypes,
    allowedTypes: creatureTypes,
    excludedTypes: excludedCreatureTypes,
    ability: null,
    detectedScore: null,
    min: null,
    max: null,
    debug: getTargetFilterDebugData(actor),
  };

  if (!creatureTypes.length && !excludedCreatureTypes.length && !hasAbilityRestrictions) return result;

  if (!actor) {
    return { ...result, ok: false, reason: "noActor" };
  }

  if (creatureTypes.length && !detectedTypes.some((type) => creatureTypes.includes(type))) {
    return { ...result, ok: false, reason: "allowedTypes" };
  }

  if (excludedCreatureTypes.length && detectedTypes.some((type) => excludedCreatureTypes.includes(type))) {
    return { ...result, ok: false, reason: "excludedTypes" };
  }

  if (hasAbilityRestrictions) {
    for (const ability of TARGET_FILTER_ABILITY_IDS) {
      const restriction = abilityScores?.[ability] ?? {};
      const min = parseTargetFilterNumber(restriction.min, `${ability}.min`);
      const max = parseTargetFilterNumber(restriction.max, `${ability}.max`);
      if (min === null && max === null) continue;

      const score = Number(actor?.system?.abilities?.[ability]?.value);
      if (!Number.isFinite(score)) {
        return { ...result, ok: false, reason: "abilityScore", ability, detectedScore: null, min, max };
      }
      if ((min !== null && score < min) || (max !== null && score > max)) {
        return { ...result, ok: false, reason: "abilityScore", ability, detectedScore: score, min, max };
      }
    }
  }

  return result;
}

function formatTargetRestrictionFailure(result) {
  const base = game.i18n.format("BOT.notifications.targetRestrictionsMismatchDetailed", {
    target: result?.targetName ?? game.i18n.localize("BOT.ui.summary.notConfigured"),
  });
  const details = [];
  const detectedTypes = result?.detectedTypes?.length ? result.detectedTypes.join(", ") : "";
  details.push(detectedTypes
    ? game.i18n.format("BOT.notifications.targetRestrictionDetectedTypes", { types: detectedTypes })
    : game.i18n.localize("BOT.notifications.targetRestrictionNoDetectedTypes"));
  if (result?.allowedTypes?.length) {
    details.push(game.i18n.format("BOT.notifications.targetRestrictionAllowedTypes", { types: result.allowedTypes.join(", ") }));
  }
  if (result?.excludedTypes?.length) {
    details.push(game.i18n.format("BOT.notifications.targetRestrictionExcludedTypes", { types: result.excludedTypes.join(", ") }));
  }
  if (result?.reason === "abilityScore" && result.ability) {
    const abilityLabel = game.i18n.localize(`BOT.abilities.${result.ability}`);
    details.push(game.i18n.format("BOT.notifications.targetRestrictionAbilityDetected", {
      ability: abilityLabel,
      score: result.detectedScore ?? game.i18n.localize("BOT.ui.summary.notConfigured"),
    }));
    if (result.min !== null && result.max !== null) {
      details.push(game.i18n.format("BOT.notifications.targetRestrictionAbilityRequiredRange", { ability: abilityLabel, min: result.min, max: result.max }));
    } else if (result.min !== null) {
      details.push(game.i18n.format("BOT.notifications.targetRestrictionAbilityRequiredMin", { ability: abilityLabel, min: result.min }));
    } else if (result.max !== null) {
      details.push(game.i18n.format("BOT.notifications.targetRestrictionAbilityRequiredMax", { ability: abilityLabel, max: result.max }));
    }
  }
  return [base, ...details].filter(Boolean).join(" ");
}

function addIncomingAttackTarget(targets, token) {
  const resolved = token?.object ?? token;
  if (!resolved?.actor) return;
  const key = resolved.document?.uuid ?? resolved.uuid ?? resolved.id ?? resolved.actor.uuid ?? resolved.actor.id;
  if (key) targets.set(key, resolved);
}

function addIncomingAttackTargetUuid(targets, uuid) {
  const doc = uuid ? fromUuidSync(uuid) : null;
  addIncomingAttackTarget(targets, doc?.object ?? doc);
}

function getIncomingAttackWorkflowTargets(workflow) {
  const targets = new Map();
  for (const token of workflow?.targets ?? []) addIncomingAttackTarget(targets, token);
  for (const token of workflow?.hitTargets ?? []) addIncomingAttackTarget(targets, token);
  for (const token of workflow?.preSelectedTargets ?? []) addIncomingAttackTarget(targets, token);
  for (const token of workflow?.rollOptions?.targets ?? []) addIncomingAttackTarget(targets, token);
  for (const token of workflow?.workflowOptions?.targets ?? []) addIncomingAttackTarget(targets, token);
  for (const token of workflow?.midiOptions?.targets ?? []) addIncomingAttackTarget(targets, token);
  for (const uuid of workflow?.targetUuids ?? []) addIncomingAttackTargetUuid(targets, uuid);
  for (const uuid of workflow?.rollOptions?.targetUuids ?? []) addIncomingAttackTargetUuid(targets, uuid);
  for (const uuid of workflow?.midiOptions?.targetUuids ?? []) addIncomingAttackTargetUuid(targets, uuid);
  if (!targets.size) {
    for (const token of game.user?.targets ?? []) addIncomingAttackTarget(targets, token);
  }
  return [...targets.values()];
}

function getIncomingAttackAttributionLabel(match) {
  return match?.activeBuff?.label
    ?? match?.activeBuff?.name
    ?? match?.activeBuff?.itemName
    ?? match?.activeBuff?.sourceName
    ?? game.i18n?.localize?.("BOT.ui.defense.incomingAttackMode")
    ?? MODULE_ID;
}

function applyIncomingAttackModeToMidiWorkflow(workflow, mode, attributionLabel = MODULE_ID) {
  const tracker = workflow?.attackRollModifierTracker;
  const source = "bot.incomingAttack";
  if (mode === "advantage") {
    tracker?.advantage?.setOverride?.(source, attributionLabel);
  } else {
    tracker?.disadvantage?.setOverride?.(source, attributionLabel);
  }
  incomingFilterLog("applied to midi workflow", {
    mode,
    attributionLabel,
    tracker: {
      hasAdvantage: tracker?.hasAdvantage,
      hasDisadvantage: tracker?.hasDisadvantage,
      advantageMode: tracker?.advantageMode,
    },
  });
}

function applyIncomingAttackModeToRollConfig(rollConfig, mode) {
  if (!rollConfig) return;
  const advantageMode = mode === "advantage"
    ? CONFIG?.Dice?.D20Roll?.ADV_MODE?.ADVANTAGE ?? 1
    : CONFIG?.Dice?.D20Roll?.ADV_MODE?.DISADVANTAGE ?? -1;
  const opposite = mode === "advantage" ? "disadvantage" : "advantage";
  rollConfig.options ??= {};
  rollConfig[mode] = true;
  rollConfig[opposite] = false;
  rollConfig.options[mode] = true;
  rollConfig.options[opposite] = false;
  rollConfig.options.advantageMode = advantageMode;
  for (const roll of rollConfig.rolls ?? []) {
    roll.options ??= {};
    roll.options[mode] = true;
    roll.options[opposite] = false;
    roll.options.advantageMode = advantageMode;
    roll.configureModifiers?.();
  }
  incomingFilterLog("applied to rollConfig", summarizeIncomingRollConfig(null, rollConfig));
}

function getAttackModeAttributionLabel(activeBuff) {
  return activeBuff?.label
    ?? activeBuff?.name
    ?? activeBuff?.itemName
    ?? activeBuff?.sourceName
    ?? game.i18n?.localize?.("BOT.ui.combat.attackRolls")
    ?? MODULE_ID;
}

function applyFilteredAttackModeToMidiWorkflow(workflow, mode, attributionLabel = MODULE_ID) {
  const tracker = workflow?.attackRollModifierTracker;
  const source = "bot.attackMode";
  if (mode === "advantage") {
    tracker?.advantage?.setOverride?.(source, attributionLabel);
  } else {
    tracker?.disadvantage?.setOverride?.(source, attributionLabel);
  }
}

function applyFilteredAttackModeToRollConfig(rollConfig, mode) {
  if (!rollConfig) return;
  const advantageMode = mode === "advantage"
    ? CONFIG?.Dice?.D20Roll?.ADV_MODE?.ADVANTAGE ?? 1
    : CONFIG?.Dice?.D20Roll?.ADV_MODE?.DISADVANTAGE ?? -1;
  const opposite = mode === "advantage" ? "disadvantage" : "advantage";
  rollConfig.options ??= {};
  rollConfig[mode] = true;
  rollConfig[opposite] = false;
  rollConfig.options[mode] = true;
  rollConfig.options[opposite] = false;
  rollConfig.options.advantageMode = advantageMode;
  for (const roll of rollConfig.rolls ?? []) {
    roll.options ??= {};
    roll.options[mode] = true;
    roll.options[opposite] = false;
    roll.options.advantageMode = advantageMode;
    roll.configureModifiers?.();
  }
}

function addAttackBonusFormulaToRollConfig(rollConfig, formula) {
  if (!rollConfig || !formula) return false;
  const value = String(formula).trim();
  if (!value) return false;
  const appendToConfig = (config) => {
    if (!config || typeof config !== "object") return false;
    if (!Array.isArray(config.parts)) config.parts = [];
    config.parts.push(value);
    return true;
  };
  if (Array.isArray(rollConfig.rolls)) {
    const targetRoll = rollConfig.rolls.find((roll) => roll && typeof roll === "object");
    if (appendToConfig(targetRoll)) return true;
  }
  return appendToConfig(rollConfig);
}

function getAttackActionCategories(actionType) {
  const categories = new Set();
  if (actionType === "mwak") {
    categories.add("melee");
    categories.add("weapon");
    categories.add("mwak");
  }
  if (actionType === "rwak") {
    categories.add("ranged");
    categories.add("weapon");
    categories.add("rwak");
  }
  if (actionType === "msak") {
    categories.add("melee");
    categories.add("spell");
    categories.add("msak");
  }
  if (actionType === "rsak") {
    categories.add("ranged");
    categories.add("spell");
    categories.add("rsak");
  }
  return categories;
}

function resolveAttackActionType(workflow = null, process = null, rollConfig = null) {
  const activity = workflow?.activity ?? process?.activity ?? rollConfig?.activity ?? process?.subject ?? null;
  const attackMode = workflow?.attackMode
    ?? workflow?.rollConfig?.attackMode
    ?? workflow?.attackRoll?.options?.attackMode
    ?? rollConfig?.attackMode
    ?? rollConfig?.options?.attackMode
    ?? "";
  const activityActionType = typeof activity?.getActionType === "function"
    ? activity.getActionType(attackMode)
    : null;
  return activityActionType
    ?? activity?.actionType
    ?? workflow?.item?.system?.actionType
    ?? process?.item?.system?.actionType
    ?? process?.subject?.item?.system?.actionType
    ?? activity?.item?.system?.actionType
    ?? activity?.system?.actionType
    ?? workflow?.item?.system?.activities?.getByType?.("attack")?.[0]?.actionType
    ?? process?.item?.system?.activities?.getByType?.("attack")?.[0]?.actionType
    ?? process?.subject?.item?.system?.activities?.getByType?.("attack")?.[0]?.actionType
    ?? null;
}

function applyFilteredBearerAttackMode(workflow = null, rollConfig = null, process = null) {
  const attacker = workflow?.actor ?? workflow?.item?.actor ?? resolveRollHookActor(process) ?? resolveRollHookActor(rollConfig) ?? null;
  const activeBuff = attacker?.getFlag?.(MODULE_ID, "activeBuff");
  const mode = activeBuff?.buffs?.attackMode;
  const filters = normalizeAttackModeAttackTypes(activeBuff?.buffs?.attackModeAttackTypes ?? []);
  if (!["advantage", "disadvantage"].includes(mode)) return false;

  const actionType = resolveAttackActionType(workflow, process, rollConfig);
  const categories = getAttackActionCategories(actionType);
  const match = filters.length ? filters.some((type) => categories.has(type)) : true;
  debugLog(`[${MODULE_ID}] Filtre jets d'attaque : attacker=${attacker?.name ?? "inconnu"}, actionType=${actionType ?? "none"}, categories=${JSON.stringify([...categories])}, expected=${JSON.stringify(filters)}, match=${match}, mode=${mode}`);
  if (!match) return false;

  if (workflow) applyFilteredAttackModeToMidiWorkflow(workflow, mode, getAttackModeAttributionLabel(activeBuff));
  applyFilteredAttackModeToRollConfig(rollConfig, mode);
  return true;
}

function applyFilteredAttackBonus(workflow = null, rollConfig = null, process = null) {
  const attacker = workflow?.actor ?? workflow?.item?.actor ?? resolveRollHookActor(process) ?? resolveRollHookActor(rollConfig) ?? null;
  const activeBuff = attacker?.getFlag?.(MODULE_ID, "activeBuff");
  const formula = String(activeBuff?.buffs?.attackBonus ?? "").trim();
  const filters = normalizeAttackModeAttackTypes(activeBuff?.buffs?.attackBonusAttackTypes ?? []);
  if (!formula) return false;

  const actionType = resolveAttackActionType(workflow, process, rollConfig);
  const categories = getAttackActionCategories(actionType);
  const match = filters.length ? filters.some((type) => categories.has(type)) : true;
  debugLog(`[${MODULE_ID}] Filtre modificateur attaques : attacker=${attacker?.name ?? "inconnu"}, actionType=${actionType ?? "none"}, categories=${JSON.stringify([...categories])}, expected=${JSON.stringify(filters)}, match=${match}, formula=${formula}`);
  if (!match) return false;

  return addAttackBonusFormulaToRollConfig(rollConfig, formula);
}

function getFilteredIncomingAttackMatches(attacker, targets, workflow = null, rollConfig = null, process = null) {
  const midiTypeOrRace = globalThis.MidiQOL?.typeOrRace?.(attacker);
  const midiRaceOrType = globalThis.MidiQOL?.raceOrType?.(attacker);
  const attackerTypes = getActorCreatureTypeValues(attacker);
  const matches = [];
  for (const target of targets) {
    const activeBuff = target.actor?.getFlag?.(MODULE_ID, "activeBuff");
    const mode = activeBuff?.buffs?.incomingAttackMode;
    const rawExpected = activeBuff?.buffs?.incomingAttackCreatureTypes;
    const rawAttackTypes = activeBuff?.buffs?.incomingAttackAttackTypes;
    incomingFilterLog("target inspected", {
      target: summarizeIncomingTarget(target),
      activeBuff: Boolean(activeBuff),
      incomingAttackMode: mode ?? null,
      incomingAttackCreatureTypes: rawExpected ?? [],
      incomingAttackAttackTypes: rawAttackTypes ?? [],
    });
    if (!["advantage", "disadvantage"].includes(mode)) continue;
    const expectedTypes = normalizeIncomingAttackCreatureTypes(rawExpected);
    const expectedAttackTypes = normalizeAttackModeAttackTypes(rawAttackTypes);
    if (!expectedTypes.length && !expectedAttackTypes.length) continue;
    const actionType = resolveAttackActionType(workflow, process, rollConfig);
    const attackCategories = getAttackActionCategories(actionType);
    const creatureMatch = expectedTypes.length ? attackerTypes.some((type) => expectedTypes.includes(type)) : true;
    const attackMatch = expectedAttackTypes.length ? expectedAttackTypes.some((type) => attackCategories.has(type)) : true;
    const match = creatureMatch && attackMatch;
    incomingFilterLog("type evaluated", {
      attacker: attacker.name ?? null,
      midiTypeOrRace,
      midiRaceOrType,
      detailsType: attacker.system?.details?.type ?? null,
      detailsTypeValue: attacker.system?.details?.type?.value ?? null,
      detailsTypeSubtype: attacker.system?.details?.type?.subtype ?? null,
      detailsRace: attacker.system?.details?.race ?? null,
      detectedTypes: attackerTypes,
      expectedTypes,
      actionType,
      attackCategories: [...attackCategories],
      expectedAttackTypes,
      creatureMatch,
      attackMatch,
      match,
      mode,
    });
    if (match) matches.push({ mode, target, activeBuff, expectedTypes, attackerTypes, expectedAttackTypes, attackCategories: [...attackCategories] });
  }
  return matches;
}

function applyFilteredIncomingAttackMode(workflow, rollConfig = null, process = null) {
  const attacker = workflow?.actor ?? workflow?.item?.actor ?? null;
  if (!attacker) {
    incomingFilterLog("ignored: no attacker", summarizeIncomingWorkflow(workflow));
    return false;
  }
  const targets = getIncomingAttackWorkflowTargets(workflow);
  if (!targets.length) {
    incomingFilterLog("ignored: no targets available in this hook", summarizeIncomingWorkflow(workflow));
    return false;
  }
  let applied = false;
  for (const match of getFilteredIncomingAttackMatches(attacker, targets, workflow, rollConfig, process)) {
    if (workflow) applyIncomingAttackModeToMidiWorkflow(workflow, match.mode, getIncomingAttackAttributionLabel(match));
    applyIncomingAttackModeToRollConfig(rollConfig, match.mode);
    incomingFilterLog("matched and applied", {
      mode: match.mode,
      target: summarizeIncomingTarget(match.target),
      expectedTypes: match.expectedTypes,
      detectedTypes: match.attackerTypes,
      expectedAttackTypes: match.expectedAttackTypes,
      attackCategories: match.attackCategories,
      appliedToMidiWorkflow: Boolean(workflow),
      appliedToRollConfig: Boolean(rollConfig),
    });
    applied = true;
  }
  if (!applied) {
    incomingFilterLog("no matching filtered buff", {
      attacker: attacker.name ?? null,
      detectedTypes: getActorCreatureTypeValues(attacker),
      targets: summarizeIncomingTargets(targets),
    });
  }
  return applied;
}

async function handleRollModifierHook(hookName, rollType, ...args) {
  const config = getRollHookConfig(args);
  const actor = resolveRollHookActor(config) ?? args.find((arg) => arg?.getFlag) ?? null;
  if (!actor?.getFlag || !config) {
    console.warn(`[${MODULE_ID}] Modificateur de jet non appliqu\u00e9 : configuration dnd5e incompatible (${hookName})`);
    debugLog(`[${MODULE_ID}] Debug ${hookName} : ${summarizeRollHookArgs(args)}`);
    return;
  }
  debugLog(`[${MODULE_ID}] Debug ${hookName} : acteur=${actor.name}, subject=${config.subject?.constructor?.name ?? "none"}, rolls=${config.rolls?.length ?? 0}, roll0.parts=${Array.isArray(config.rolls?.[0]?.parts)}, roll0.bonus=${config.rolls?.[0]?.bonus !== undefined}, config.parts=${Array.isArray(config.parts)}, config.bonus=${config.bonus !== undefined}`);
  if (rollType === "ability" && (config.skill || config.tool)) {
    debugLog(`[${MODULE_ID}] Modificateur de jet ignor\u00e9 : type non compatible`);
    return;
  }
  await applyRollModifierToConfig(actor, rollType, config);
}

function handleRollModifierBuildHook(hookName, rollType, process, rollConfig) {
  const actor = resolveRollHookActor(process);
  if (!actor?.getFlag || !rollConfig) {
    console.warn(`[${MODULE_ID}] Modificateur de jet non appliqué : configuration dnd5e incompatible (${hookName})`);
    debugLog(`[${MODULE_ID}] Debug ${hookName} : processKeys=${Object.keys(process ?? {}).join(",")}, rollKeys=${Object.keys(rollConfig ?? {}).join(",")}`);
    return;
  }
  debugLog(`[${MODULE_ID}] Debug ${hookName} : acteur=${actor.name}, processSubject=${process?.subject?.constructor?.name ?? "none"}, rollKeys=${Object.keys(rollConfig ?? {}).join(",")}, parts=${Array.isArray(rollConfig.parts)}, bonus=${rollConfig.bonus !== undefined}, formula=${rollConfig.formula ?? "none"}, options=${Object.keys(rollConfig.options ?? {}).join(",")}`);
  if (rollType === "ability" && (process.skill || process.tool)) {
    debugLog(`[${MODULE_ID}] Modificateur de jet ignoré : type non compatible`);
    return;
  }
  const applied = applyRollModifierToConfig(actor, rollType, rollConfig, { consume: false });
  if (applied) process._botRollModifier = rollConfig._botRollModifier;
}

async function handleRollModifierFinalHook(hookName, rollType, rolls, process) {
  const actor = resolveRollHookActor(process);
  const metadata = process?._botRollModifier;
  if (!actor?.getFlag || !metadata) return;
  await finalizeRollModifierApplication(actor, rollType, metadata, rolls);
}

function getReceivedAttackCategories(workflow, item) {
  const actionType = workflow?.activity?.actionType
    ?? item?.system?.actionType
    ?? workflow?.item?.system?.actionType
    ?? null;

  const categories = new Set();
  if (actionType === "mwak") {
    categories.add("melee");
    categories.add("weapon");
    categories.add("mwak");
  }
  if (actionType === "rwak") {
    categories.add("ranged");
    categories.add("weapon");
    categories.add("rwak");
  }
  if (actionType === "msak") {
    categories.add("melee");
    categories.add("spell");
    categories.add("msak");
  }
  if (actionType === "rsak") {
    categories.add("ranged");
    categories.add("spell");
    categories.add("rsak");
  }
  return categories;
}

function doesAttackTriggerMatch(triggerType, actionType) {
  if (triggerType === actionType) return true;
  if (triggerType === "anyAttack") return ATTACK_ACTION_TYPES.includes(actionType);
  if (triggerType === "weaponAttack") return ["mwak", "rwak"].includes(actionType);
  if (triggerType === "spellAttack") return ["msak", "rsak"].includes(actionType);
  return false;
}

function getWorkflowAttackActionType(workflow) {
  const activity = workflow?.activity ?? null;
  const attackMode = workflow?.attackMode
    ?? workflow?.rollConfig?.attackMode
    ?? workflow?.attackRoll?.options?.attackMode
    ?? "";
  const activityActionType = typeof activity?.getActionType === "function"
    ? activity.getActionType(attackMode)
    : null;
  return activityActionType
    ?? activity?.actionType
    ?? workflow?.item?.system?.actionType
    ?? activity?.system?.actionType
    ?? workflow?.item?.system?.activities?.getByType?.("attack")?.[0]?.actionType
    ?? null;
}

function resolveWorkflowBuffCarrier(workflow) {
  const candidates = [];
  const addCandidate = (actor, token = null, source = "unknown") => {
    if (!actor?.getFlag) return;
    const key = actor.uuid ?? actor.id ?? source;
    if (candidates.some((candidate) => candidate.key === key || candidate.actor === actor)) return;
    candidates.push({ actor, token, source, key });
  };

  addCandidate(workflow?.actor, workflow?.token ?? null, "workflow.actor");
  addCandidate(workflow?.token?.actor, workflow?.token, "workflow.token.actor");
  addCandidate(workflow?.attackingToken?.actor, workflow?.attackingToken, "workflow.attackingToken.actor");
  addCandidate(workflow?.attackerToken?.actor, workflow?.attackerToken, "workflow.attackerToken.actor");
  addCandidate(workflow?.item?.actor, workflow?.token ?? null, "workflow.item.actor");

  return candidates.find(({ actor }) => actor.getFlag(MODULE_ID, "activeBuff")) ?? null;
}

function resolveAttackBuffCarrier(workflow) {
  return resolveWorkflowBuffCarrier(workflow);
}

function isSpellCastWorkflow(workflow) {
  return workflow?.item?.type === "spell";
}

function getNumericDamageValue(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function workflowHasDamageDealt(workflow) {
  const hasDamageTarget = (workflow?.damageList?.length ?? 0) > 0
    || (workflow?.hitTargets?.size ?? 0) > 0
    || (workflow?.targets?.size ?? 0) > 0;
  const directDamage = getNumericDamageValue(workflow?.damageTotal)
    ?? getNumericDamageValue(workflow?.damageItem?.totalDamage)
    ?? getNumericDamageValue(workflow?.damageItem?.appliedDamage)
    ?? getNumericDamageValue(workflow?.damageItem?.hpDamage);
  if (directDamage !== null) return hasDamageTarget && directDamage > 0;

  const damageEntries = Array.isArray(workflow?.damageList) ? workflow.damageList : [];
  return damageEntries.some((entry) => {
    const entryDamage = getNumericDamageValue(entry?.appliedDamage)
      ?? getNumericDamageValue(entry?.hpDamage)
      ?? getNumericDamageValue(entry?.totalDamage)
      ?? getNumericDamageValue(entry?.damage);
    return entryDamage !== null && entryDamage > 0;
  });
}

function getDamageTakenAmount(damageItem, workflow) {
  const directDamage = getNumericDamageValue(damageItem?.appliedDamage)
    ?? getNumericDamageValue(damageItem?.hpDamage)
    ?? getNumericDamageValue(damageItem?.totalDamage)
    ?? getNumericDamageValue(damageItem?.damage)
    ?? getNumericDamageValue(workflow?.damageTotal);
  if (directDamage !== null) return directDamage;

  const entries = Array.isArray(workflow?.damageList) ? workflow.damageList : [];
  return entries.reduce((total, entry) => {
    const entryDamage = getNumericDamageValue(entry?.appliedDamage)
      ?? getNumericDamageValue(entry?.hpDamage)
      ?? getNumericDamageValue(entry?.totalDamage)
      ?? getNumericDamageValue(entry?.damage)
      ?? 0;
    return total + Math.max(0, entryDamage);
  }, 0);
}

function shouldProcessDamagedRepeatedSave(actor, workflow, damageItem) {
  const now = Date.now();
  for (const [key, timestamp] of recentDamagedRepeatedSaves.entries()) {
    if (now - timestamp > 1000) recentDamagedRepeatedSaves.delete(key);
  }

  const key = [
    actor?.uuid ?? "actor",
    workflow?.uuid ?? workflow?.id ?? workflow?._id ?? "workflow",
    workflow?.item?.uuid ?? "item",
    damageItem?.tokenId ?? damageItem?.tokenUuid ?? damageItem?.actorUuid ?? "damage",
  ].join("|");
  const previous = recentDamagedRepeatedSaves.get(key);
  if (previous && now - previous <= 1000) return false;
  recentDamagedRepeatedSaves.set(key, now);
  return true;
}

function shouldProcessDamageTakenEndCondition(actor, workflow, damageItem) {
  const now = Date.now();
  for (const [key, timestamp] of recentDamageTakenEndChecks.entries()) {
    if (now - timestamp > 1000) recentDamageTakenEndChecks.delete(key);
  }

  const key = [
    actor?.uuid ?? "actor",
    workflow?.uuid ?? workflow?.id ?? workflow?._id ?? "workflow",
    workflow?.item?.uuid ?? "item",
    damageItem?.tokenId ?? damageItem?.tokenUuid ?? damageItem?.actorUuid ?? "damage",
  ].join("|");
  const previous = recentDamageTakenEndChecks.get(key);
  if (previous && now - previous <= 1000) return false;
  recentDamageTakenEndChecks.set(key, now);
  return true;
}

function getDamagedTriggerKey(flag) {
  return flag?.buffId ?? flag?.itemUuid ?? flag?.originItemUuid ?? "legacy";
}

function getLastDamagedTriggerTimestamp(actor, flag) {
  const value = actor?.getFlag?.(MODULE_ID, "_lastDamagedTrigger");
  const key = getDamagedTriggerKey(flag);
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Number(value[key] ?? 0) || 0;
  }
  return Number(value ?? 0) || 0;
}

async function markDamagedTriggerTimestamp(actor, flag, timestamp) {
  if (!actor?.setFlag) return;
  const value = actor.getFlag(MODULE_ID, "_lastDamagedTrigger");
  const timestamps = value && typeof value === "object" && !Array.isArray(value)
    ? { ...value }
    : {};
  timestamps[getDamagedTriggerKey(flag)] = timestamp;
  await actor.setFlag(MODULE_ID, "_lastDamagedTrigger", timestamps);
}

function normalizeDamageTypeFilter(types = []) {
  const values = Array.isArray(types) ? types : [types];
  return [...new Set(values
    .map((type) => String(type ?? "").trim().toLowerCase())
    .filter((type) => DAMAGE_TYPES.includes(type)))];
}

function getAutomaticEndReasons(activeBuff, workflow, actionType) {
  const conditions = activeBuff?.endConditions;
  if (!conditions) return [];

  const reasons = [];
  if (conditions.onAttack && ATTACK_ACTION_TYPES.includes(actionType)) reasons.push("attack");
  if (conditions.onSpellCast && isSpellCastWorkflow(workflow)) reasons.push("spellCast");
  if (conditions.onDamageDealt && workflowHasDamageDealt(workflow)) reasons.push("damageDealt");
  return reasons;
}

async function maybeEndActiveBuffForWorkflowAction(workflow, actionType) {
  const carrier = resolveWorkflowBuffCarrier(workflow);
  const activeBuff = carrier?.actor?.getFlag(MODULE_ID, "activeBuff") ?? null;
  const reasons = getAutomaticEndReasons(activeBuff, workflow, actionType);
  if (!reasons.length) return false;

  await endActiveBuff(carrier.actor, activeBuff);
  debugLog(`[${MODULE_ID}] Buff ended automatically on ${carrier.actor.name}: ${reasons.join(", ")}`);
  return true;
}

function collectDamageTypes(value, types = new Set()) {
  if (!value) return types;
  if (Array.isArray(value)) {
    for (const entry of value) collectDamageTypes(entry, types);
    return types;
  }
  if (typeof value === "object") {
    const candidate = value.type ?? value.damageType ?? value.damage?.type ?? null;
    if (typeof candidate === "string" && candidate.trim()) types.add(candidate);
    for (const nested of Object.values(value)) collectDamageTypes(nested, types);
  }
  return types;
}

function getReceivedDamageTypes(damageItem, workflow) {
  const types = new Set();
  collectDamageTypes(damageItem, types);
  collectDamageTypes(workflow?.damageItem, types);
  collectDamageTypes(workflow?.damageDetail, types);
  collectDamageTypes(workflow?.damageList, types);
  return normalizeDamageTypeFilter([...types]);
}

function getActorTemporaryHp(actor) {
  const value = Number(actor?.system?.attributes?.hp?.temp ?? 0);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function tempHpEndDebug(message, data = null) {
  if (data === null || data === undefined) debugLog(`[${MODULE_ID}] Fin PV temporaires : ${message}`);
  else debugLog(`[${MODULE_ID}] Fin PV temporaires : ${message}`, data);
}

function tempHpConcentrationDebug(message, data = null) {
  if (data === null || data === undefined) debugLog(`[${MODULE_ID}] Concentration PV temporaires : ${message}`);
  else debugLog(`[${MODULE_ID}] Concentration PV temporaires : ${message}`, data);
}

function readNestedValue(source, path) {
  if (Object.prototype.hasOwnProperty.call(source ?? {}, path)) return source[path];
  return path.split(".").reduce((value, key) => value?.[key], source);
}

function normalizeTemporaryHpCandidate(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

function findTemporaryHpCandidate(source, paths, sourceLabel) {
  if (!source) return null;
  for (const path of paths) {
    const value = normalizeTemporaryHpCandidate(readNestedValue(source, path));
    if (value !== null) return { value, source: `${sourceLabel}.${path}` };
  }
  return null;
}

function damageEntryMatchesActor(entry, actor) {
  const identities = new Set([
    actor?.uuid,
    actor?.id,
    ...(actor?.getActiveTokens?.() ?? []).flatMap((token) => [
      token?.id,
      token?.document?.uuid,
      token?.document?.id,
    ]),
  ].filter(Boolean));
  const entryIds = [
    entry?.actorUuid,
    entry?.actor?.uuid,
    entry?.actor?.id,
    entry?.tokenUuid,
    entry?.tokenId,
    entry?.token?.document?.uuid,
    entry?.token?.id,
  ].filter(Boolean);
  return entryIds.length ? entryIds.some((id) => identities.has(id)) : false;
}

function getPreDamageTemporaryHp(actor, damageItem, workflow) {
  const paths = [
    "oldTempHP", "oldTempHp", "oldTemporaryHp", "tempHPBefore", "tempHpBefore", "temporaryHpBefore", "tempHP", "tempHp",
    "oldHP.temp", "oldHp.temp", "oldHitPoints.temp", "hp.temp.old", "hp.temp.before"
  ];
  const candidates = [
    [damageItem, "damageItem"],
    [workflow?.damageItem, "workflow.damageItem"],
    [workflow?._botOriginalDamageItem, "workflow._botOriginalDamageItem"],
  ];
  for (const [source, label] of candidates) {
    const candidate = findTemporaryHpCandidate(source, paths, label);
    if (candidate) return candidate;
  }

  const damageList = workflow?.damageList ?? workflow?._botOriginalWorkflow?.damageList;
  if (Array.isArray(damageList)) {
    const matchingEntries = damageList.filter((entry) => damageEntryMatchesActor(entry, actor));
    const entries = matchingEntries.length ? matchingEntries : (damageList.length === 1 ? damageList : []);
    for (const entry of entries) {
      const candidate = findTemporaryHpCandidate(entry, paths, "workflow.damageList");
      if (candidate) return candidate;
    }
  }

  const current = getActorTemporaryHp(actor);
  return current > 0 ? { value: current, source: "actor.system.attributes.hp.temp (hook)" } : { value: 0, source: "unavailable" };
}

function getChangedTemporaryHp(changed) {
  const value = readNestedValue(changed, "system.attributes.hp.temp");
  return normalizeTemporaryHpCandidate(value);
}

function actorHasTemporaryHpLostEndCondition(actor) {
  return actor?.getFlag?.(MODULE_ID, "activeBuff")?.endConditions?.onTemporaryHpLost === true;
}

function sameActiveBuff(original, current) {
  if (!original || !current) return false;
  const originalItem = original.originItemUuid ?? original.itemUuid ?? null;
  const currentItem = current.originItemUuid ?? current.itemUuid ?? null;
  return originalItem === currentItem
    && (original.originActorUuid ?? null) === (current.originActorUuid ?? null)
    && (original.itemName ?? null) === (current.itemName ?? null);
}

function prunePendingTemporaryHpEndConcentrationSkips(now = Date.now()) {
  for (const [key, marker] of pendingTemporaryHpEndConcentrationSkips.entries()) {
    if (now - (marker?.timestamp ?? 0) > TEMP_HP_CONCENTRATION_SKIP_TTL_MS) {
      pendingTemporaryHpEndConcentrationSkips.delete(key);
    }
  }
}

function getActorConcentrationEffects(actor) {
  const concentration = actor?.concentration?.effects;
  if (concentration instanceof Set) return [...concentration];
  if (Array.isArray(concentration)) return concentration;
  return actor?.effects?.filter((effect) =>
    effect.statuses?.has("concentrating") || effect.statuses?.has("concentration")
  ) ?? [];
}

function concentrationEffectMatchesMarker(effect, marker) {
  const markerItemUuid = marker?.originItemUuid ?? null;
  if (!markerItemUuid || !effect) return null;
  const dnd5eItem = effect.getFlag?.("dnd5e", "item") ?? null;
  const itemCandidates = [
    effect.origin,
    dnd5eItem?.uuid,
    dnd5eItem?.id,
    dnd5eItem?._id,
    dnd5eItem?.data?.uuid,
    effect.flags?.dnd5e?.item?.uuid,
    effect.flags?.dnd5e?.item?.id,
    effect.flags?.dnd5e?.item?._id,
  ].filter(Boolean);
  if (!itemCandidates.length) return null;
  return itemCandidates.includes(markerItemUuid);
}

function createTemporaryHpEndConcentrationSkip(actor, activeBuff, preTemp, predictedTemp, source = "unknown") {
  if (!actor?.uuid || activeBuff?.endConditions?.onTemporaryHpLost !== true) return null;
  const now = Date.now();
  prunePendingTemporaryHpEndConcentrationSkips(now);
  const concentrationEffects = getActorConcentrationEffects(actor);
  const marker = {
    actorUuid: actor.uuid,
    itemName: activeBuff.itemName ?? null,
    originItemUuid: activeBuff.originItemUuid ?? activeBuff.itemUuid ?? null,
    originActorUuid: activeBuff.originActorUuid ?? null,
    preTemp,
    predictedTemp,
    source,
    timestamp: now,
    buffSnapshot: foundry.utils.deepClone(activeBuff),
    concentrationEffectCount: concentrationEffects.length,
  };
  pendingTemporaryHpEndConcentrationSkips.set(actor.uuid, marker);
  tempHpConcentrationDebug("pending marker created", {
    actor: actor.name,
    buff: marker.itemName,
    preTemp,
    predictedTemp,
    source,
    concentrationEffectCount: marker.concentrationEffectCount,
  });
  return marker;
}

function getTemporaryHpEndConcentrationSkip(actor) {
  if (!actor?.uuid) return null;
  const now = Date.now();
  prunePendingTemporaryHpEndConcentrationSkips(now);
  const marker = pendingTemporaryHpEndConcentrationSkips.get(actor.uuid);
  if (!marker) return null;
  if (now - (marker.timestamp ?? 0) > TEMP_HP_CONCENTRATION_SKIP_TTL_MS) {
    pendingTemporaryHpEndConcentrationSkips.delete(actor.uuid);
    return null;
  }
  return marker;
}

function shouldSkipTemporaryHpEndConcentration(actor, marker) {
  if (!actor?.getFlag || !marker) return { ok: false, reason: "missing actor or marker" };
  const activeBuff = actor.getFlag(MODULE_ID, "activeBuff");
  if (!activeBuff) return { ok: false, reason: "no active buff" };
  if (activeBuff.endConditions?.onTemporaryHpLost !== true) return { ok: false, reason: "active buff has no onTemporaryHpLost" };
  if (!sameActiveBuff(marker.buffSnapshot, activeBuff)) return { ok: false, reason: "active buff no longer matches marker" };
  const concentrationEffects = getActorConcentrationEffects(actor);
  if (concentrationEffects.length > 1) return { ok: false, reason: `multiple concentration effects (${concentrationEffects.length})` };
  if (concentrationEffects.length === 1) {
    const concentrationMatch = concentrationEffectMatchesMarker(concentrationEffects[0], marker);
    if (concentrationMatch === false) return { ok: false, reason: "concentration effect origin does not match marker" };
  }
  return { ok: true, reason: "matched temporary HP ending buff", activeBuff, concentrationEffects };
}

function getAutomaticEndReasonsForDamageTaken(activeBuff, actor, damageItem, workflow) {
  const conditions = activeBuff?.endConditions;
  if (!conditions) return [];

  const reasons = [];
  if (conditions.onDamageTaken) {
    const expectedTypes = normalizeDamageTypeFilter(conditions.onDamageTakenTypes);
    const receivedTypes = getReceivedDamageTypes(damageItem, workflow);
    const damageTypeMatch = expectedTypes.length
      ? receivedTypes.some((type) => expectedTypes.includes(type))
      : true;
    debugLog(`[${MODULE_ID}] Fin automatique dégâts subis : expected=${JSON.stringify(expectedTypes)}, received=${JSON.stringify(receivedTypes)}, match=${damageTypeMatch}`);
    if (damageTypeMatch) reasons.push("damageTaken");
  }
  return reasons;
}

function scheduleTemporaryHpLostEndCheck(actor, activeBuff, damageItem, workflow, damageTaken, preTempOverride = null) {
  if (activeBuff?.endConditions?.onTemporaryHpLost !== true) return false;
  const preTemp = preTempOverride ?? getPreDamageTemporaryHp(actor, damageItem, workflow);
  if (preTemp.value <= 0) {
    return false;
  }

  const actorUuid = actor.uuid;
  const buffSnapshot = foundry.utils.deepClone(activeBuff);
  const check = async (delay) => {
    try {
      const delayedActor = fromUuidSync(actorUuid);
      const delayedBuff = delayedActor?.getFlag?.(MODULE_ID, "activeBuff");
      if (!delayedActor || !delayedBuff || !sameActiveBuff(buffSnapshot, delayedBuff)) return;
      if (delayedBuff.endConditions?.onTemporaryHpLost !== true) return;
      const currentTemp = getActorTemporaryHp(delayedActor);
      const remove = currentTemp <= 0;
      if (!remove) return;
      tempHpEndDebug("calling endActiveBuff", {
        actor: delayedActor.name,
        buff: delayedBuff.itemName ?? "buff",
      });
      pendingTemporaryHpEndConcentrationSkips.delete(actorUuid);
      await endActiveBuff(delayedActor, delayedBuff);
    } catch (error) {
      console.error(`[${MODULE_ID}] Erreur dans la fin automatique PV temporaires :`, error);
    }
  };
  for (const delay of [250, 750]) window.setTimeout(() => check(delay), delay);
  return true;
}

async function maybeEndActiveBuffForDamageTaken(actor, activeBuff, damageItem, workflow) {
  const reasons = getAutomaticEndReasonsForDamageTaken(activeBuff, actor, damageItem, workflow);
  if (!reasons.length) return false;

  await endActiveBuff(actor, activeBuff);
  debugLog(`[${MODULE_ID}] Buff ended automatically on ${actor.name}: ${reasons.join(", ")}`);
  return true;
}

function getExactlyOneSelectedTarget() {
  const selectedTargets = [...(game.user?.targets ?? [])];
  return selectedTargets.length === 1 ? selectedTargets[0] ?? null : null;
}

function tokenMatchesStoredTarget(token, flag) {
  if (!token || !flag) return false;

  const tokenUuid = token.document?.uuid ?? token.uuid ?? null;
  const actorUuid = token.actor?.uuid ?? null;
  if (flag.storedTargetTokenUuid && tokenUuid && tokenUuid === flag.storedTargetTokenUuid) return true;
  if (flag.storedTargetActorUuid && actorUuid && actorUuid === flag.storedTargetActorUuid) return true;
  if (flag.targetTokenId && token.id && token.id === flag.targetTokenId) return true;
  return false;
}

function isWorkflowCriticalHit(workflow) {
  return Boolean(
    workflow?.isCritical
    || workflow?.critical
    || workflow?.attackRoll?.isCritical
    || workflow?.attackRoll?.options?.critical
  );
}

function getMissedAttackTargets(workflow) {
  if (workflow?.missedTargets?.size) return [...workflow.missedTargets];
  const hitIds = new Set([...(workflow?.hitTargets ?? [])].map((token) => token.id));
  return [...(workflow?.targets ?? [])].filter((token) => !hitIds.has(token.id));
}

function getStoredTargetCandidates(workflow, flag) {
  if (flag.type === "damaged") {
    const attackerToken = workflow.attackerToken
      ?? [...(workflow.hitTargets ?? [])][0]
      ?? [...(workflow.targets ?? [])][0]
      ?? null;
    return attackerToken ? [attackerToken] : [];
  }

  if (ATTACK_TRIGGER_TYPES.includes(flag.type)) {
    const condition = flag.condition ?? "hit";
    if (condition === "hit") return [...(workflow.hitTargets ?? [])];
    if (condition === "miss") return getMissedAttackTargets(workflow);
    if (condition === "critical") return isWorkflowCriticalHit(workflow) ? [...(workflow.hitTargets ?? [])] : [];

    const candidates = new Map();
    for (const token of [...(workflow.targets ?? []), ...(workflow.hitTargets ?? []), ...getMissedAttackTargets(workflow)]) {
      const key = token?.document?.uuid ?? token?.uuid ?? token?.id ?? null;
      if (key) candidates.set(key, token);
    }
    return [...candidates.values()];
  }

  const candidates = new Map();
  for (const token of [...(workflow.hitTargets ?? []), ...(workflow.targets ?? [])]) {
    const key = token?.document?.uuid ?? token?.uuid ?? token?.id ?? null;
    if (key) candidates.set(key, token);
  }
  return [...candidates.values()];
}

function workflowMatchesStoredTarget(workflow, flag) {
  if (!flag.requireStoredTargetMatch) return true;

  const candidates = getStoredTargetCandidates(workflow, flag);
  if (!candidates.length) {
    debugLog(`[${MODULE_ID}] Déclenchement ignoré : cible mémorisée non correspondante`);
    return false;
  }

  if (!candidates.some((token) => tokenMatchesStoredTarget(token, flag))) {
    debugLog(`[${MODULE_ID}] Déclenchement ignoré : cible mémorisée non correspondante`);
    return false;
  }

  return true;
}

function doesAttackConditionMatch(workflow, flag) {
  const condition = flag.condition ?? "hit";
  if (condition === "always") return true;

  const hitTargets = [...(workflow.hitTargets ?? [])];
  if (condition === "hit") {
    if (hitTargets.length > 0) return true;
    debugLog(`[${MODULE_ID}] Déclenchement ignoré : attaque non touchée`);
    return false;
  }

  if (condition === "miss") {
    if (getMissedAttackTargets(workflow).length > 0) return true;
    debugLog(`[${MODULE_ID}] Déclenchement ignoré : condition d’attaque non remplie`);
    return false;
  }

  if (condition === "critical") {
    if (isWorkflowCriticalHit(workflow) && hitTargets.length > 0) return true;
    debugLog(`[${MODULE_ID}] Déclenchement ignoré : condition d’attaque non remplie`);
    return false;
  }

  debugLog(`[${MODULE_ID}] Déclenchement ignoré : condition d’attaque non remplie`);
  return false;
}

function collectBuffCarrierEntries() {
  const carrierEntries = new Map();
  const addCarrier = (actor, tokenDocument = null) => {
    if (!actor?.getFlag) return;
    const key = actor.uuid
      ?? tokenDocument?.uuid
      ?? (tokenDocument?.id && tokenDocument?.parent?.id ? `${tokenDocument.parent.id}.${tokenDocument.id}` : null)
      ?? actor.id
      ?? null;
    if (!key || carrierEntries.has(key)) return;
    carrierEntries.set(key, { actor, tokenDocument });
  };

  for (const actor of game.actors.contents) addCarrier(actor);

  if (canvas?.tokens?.placeables) {
    for (const token of canvas.tokens.placeables) addCarrier(token.actor ?? null, token.document ?? null);
  }

  if (canvas?.scene?.tokens) {
    for (const tokenDocument of canvas.scene.tokens) addCarrier(tokenDocument.actor ?? null, tokenDocument);
  }

  if (game?.scenes?.contents) {
    for (const scene of game.scenes.contents) {
      for (const tokenDocument of scene.tokens ?? []) addCarrier(tokenDocument.actor ?? null, tokenDocument);
    }
  }

  return [...carrierEntries.values()];
}

function getBuffItemUuid(flag) {
  return flag?.originItemUuid ?? flag?.itemUuid ?? null;
}

function doesBuffMatchSameOriginAndItem(existingFlag, newFlag) {
  const newOriginActorUuid = newFlag?.originActorUuid ?? null;
  const newItemUuid = getBuffItemUuid(newFlag);
  return !!newOriginActorUuid
    && !!newItemUuid
    && existingFlag?.originActorUuid === newOriginActorUuid
    && getBuffItemUuid(existingFlag) === newItemUuid;
}

function findExistingBuffInstances(newFlag) {
  return collectBuffCarrierEntries()
    .flatMap(({ actor }) =>
      Object.entries(getActiveBuffs(actor))
        .map(([buffId, activeBuff]) => ({ actor, buffId, activeBuff }))
    )
    .filter(({ activeBuff }) => doesBuffMatchSameOriginAndItem(activeBuff, newFlag));
}

function getActiveBuffsForTrigger(actor, predicate = null) {
  return Object.entries(getActiveBuffs(actor))
    .filter(([, activeBuff]) => !!activeBuff)
    .map(([buffId, activeBuff]) => ({
      ...(activeBuff ?? {}),
      buffId: activeBuff?.buffId ?? buffId,
    }))
    .filter((activeBuff) => !predicate || predicate(activeBuff));
}

function getStoredTargetName(flag) {
  const token = flag?.storedTargetTokenUuid && typeof fromUuidSync === "function"
    ? fromUuidSync(flag.storedTargetTokenUuid)?.object
    : null;
  const actor = token?.actor
    ?? (flag?.storedTargetActorUuid && typeof fromUuidSync === "function" ? fromUuidSync(flag.storedTargetActorUuid) : null);
  return token?.name ?? actor?.name ?? game.i18n.localize("BOT.ui.summary.notConfigured");
}

function indicatorNameMatchesBuff(effectName, activeBuff) {
  const itemName = String(activeBuff?.itemName ?? "").trim();
  const visibleName = String(effectName ?? "").trim();
  if (!itemName || !visibleName) return false;
  return visibleName === itemName
    || visibleName.startsWith(`${itemName} `)
    || visibleName.startsWith(`${itemName} -`);
}

function resolveActiveBuffFromIndicatorEffect(actor, effect) {
  const effectBuffId = effect?.flags?.[MODULE_ID]?.buffId ?? null;
  if (effectBuffId) {
    const byId = getActiveBuff(actor, effectBuffId);
    if (byId) return { activeBuff: byId, buffId: effectBuffId };
  }

  const activeBuffs = getActiveBuffs(actor);
  const matched = Object.entries(activeBuffs).find(([, activeBuff]) => indicatorNameMatchesBuff(effect?.name, activeBuff));
  if (matched) return { activeBuff: matched[1], buffId: matched[0] };

  const legacy = actor?.getFlag?.(MODULE_ID, "activeBuff") ?? null;
  if (legacy && indicatorNameMatchesBuff(effect?.name, legacy)) {
    return { activeBuff: legacy, buffId: legacy.buffId ?? null };
  }

  return { activeBuff: null, buffId: effectBuffId };
}

function isActiveBuffIndicatorEffect(effect) {
  return effect?.flags?.[MODULE_ID]?.indicator === true
    || effect?.statuses?.has?.("bot-active") === true;
}

function getControlledToken() {
  const controlled = canvas?.tokens?.controlled ?? [];
  if (!controlled.length) {
    ui.notifications.warn(game.i18n.localize("BOT.notifications.changeStoredTargetSelectOwner"));
    return null;
  }
  if (controlled.length > 1) {
    ui.notifications.warn(game.i18n.localize("BOT.notifications.changeStoredTargetSelectSingleOwner"));
    return null;
  }
  return controlled[0] ?? null;
}

function getSingleUserTarget() {
  const targetSet = game.user?.targets ?? new Set();
  const targets = typeof targetSet.first === "function" ? [targetSet.first()].filter(Boolean) : [...targetSet];
  if (!targets.length) {
    ui.notifications.warn(game.i18n.localize("BOT.notifications.changeStoredTargetTargetNew"));
    return null;
  }
  if (targets.length > 1) {
    ui.notifications.warn(game.i18n.localize("BOT.notifications.changeStoredTargetTargetSingle"));
    return null;
  }
  return targets[0] ?? null;
}

async function applyActivationTemporaryHp(carrierActor, carrierToken, activeFlag, sourceWorkflow) {
  if (!activeFlag?.temporaryHp?.formula) return;
  if (!["activation", "both"].includes(activeFlag.temporaryHp?.timing ?? "trigger")) return;

  const token = carrierToken
    ?? sourceWorkflow?.token
    ?? carrierActor?.getActiveTokens?.()?.[0]
    ?? null;
  const targets = token ? new Set([token]) : new Set();
  const workflow = {
    actor: carrierActor,
    token,
    item: sourceWorkflow?.item ?? null,
    activity: sourceWorkflow?.activity ?? null,
    castData: sourceWorkflow?.castData ?? null,
    castLevel: sourceWorkflow?.castLevel ?? null,
    targets,
    hitTargets: targets,
    missedTargets: new Set(),
  };
  await applyTemporaryHp(workflow, activeFlag, { skipConsume: true });
}

function getTokenResolutionKey(token) {
  return token?.document?.uuid ?? token?.uuid ?? token?.id ?? null;
}

async function applyActivationStatus(carrierActor, carrierToken, activeFlag, sourceWorkflow, activationSaveResults) {
  if (!activeFlag?.status?.id) return;
  if (!["activation", "both"].includes(activeFlag.status?.timing ?? "trigger")) return;

  const token = carrierToken
    ?? sourceWorkflow?.token
    ?? carrierActor?.getActiveTokens?.()?.[0]
    ?? null;
  if (!token?.actor) {
    debugLog(`[${MODULE_ID}] Statut d'activation ignoré : aucune cible claire`);
    return;
  }

  const workflow = {
    ...sourceWorkflow,
    actor: carrierActor,
    token,
    targets: new Set([token]),
    hitTargets: new Set([token]),
    missedTargets: new Set(),
    _botSaveResults: activationSaveResults ?? null,
  };
  await applyStatusEffect(workflow, activeFlag, { skipConsume: true });
}

async function refreshStackAfterBuffRemoval(actor, previousFlag) {
  const stackingKey = getStackingKey(previousFlag);
  if (!stackingKey) return;
  await refreshStackingMechanicalEffects(actor, stackingKey, previousFlag);
}

async function clearExistingBuffInstance(actor, activeBuff) {
  if (!actor?.unsetFlag || !activeBuff) return;
  const itemName = activeBuff.itemName;
  await showBuffReminder(actor, activeBuff, "buffEnd");
  await removeActiveBuff(actor, activeBuff);
  await actor.unsetFlag(MODULE_ID, "_lastDamagedTrigger");
  await refreshBuffIndicator(actor, itemName, [], activeBuff);
  await refreshStackAfterBuffRemoval(actor, activeBuff);
}

async function endActiveBuff(actor, activeBuff) {
  if (!actor?.unsetFlag || !activeBuff) return;
  const itemName = activeBuff.itemName;
  await showBuffReminder(actor, activeBuff, "buffEnd");
  await removeActiveBuff(actor, activeBuff);
  await actor.unsetFlag(MODULE_ID, "_lastDamagedTrigger");
  const concentrationEffect = actor.effects?.find(
    (e) => e.statuses?.has("concentrating") || e.statuses?.has("concentration")
  );
  if (concentrationEffect) {
    allowConcentrationDeletion(concentrationEffect);
    await concentrationEffect.delete({ [MODULE_ID]: { allowConcentrationDeletion: true } });
  }
  await refreshBuffIndicator(actor, itemName, [], activeBuff);
  await refreshStackAfterBuffRemoval(actor, activeBuff);
}

function shouldRollRepeatedSave(flag, timing) {
  return !!flag?.save?.ability
    && flag.save?.repeat?.enabled === true
    && (
      timing === "damaged"
        ? flag.save.repeat?.onDamaged === true
        : (flag.save.repeat?.timing ?? "endTurn") === timing
    );
}

function normalizeDamagedRepeatedSaveRollMode(value) {
  return SAVE_REPEAT_DAMAGE_ROLL_MODES.includes(value) ? value : "normal";
}

function normalizeSaveRollMode(value) {
  return SAVE_ROLL_MODES.includes(value) ? value : "normal";
}

function applySaveRollModeToConfig(config, rollMode) {
  const normalized = normalizeSaveRollMode(rollMode);
  if (normalized === "advantage") {
    config.advantage = true;
    config.disadvantage = false;
  } else if (normalized === "disadvantage") {
    config.advantage = false;
    config.disadvantage = true;
  }
  return config;
}

function buildConfiguredSaveRollConfig(save, saveDc) {
  return applySaveRollModeToConfig({
    ability: save.ability,
    target: saveDc,
    targetValue: saveDc,
    dc: saveDc,
  }, save.rollMode);
}

function buildRepeatedSaveRollConfig(flag, saveDc, timing) {
  const config = {
    ability: flag.save.ability,
    target: saveDc,
    targetValue: saveDc,
    dc: saveDc,
  };
  const rollMode = timing === "damaged"
    ? flag.save.repeat?.onDamagedRollMode
    : flag.save.repeat?.rollMode;
  return applySaveRollModeToConfig(config, rollMode);
}

function resolveActorUuid(uuid) {
  if (!uuid) return null;
  try {
    if (typeof fromUuidSync === "function") return fromUuidSync(uuid);
  } catch {
    return null;
  }
  return null;
}

function buildRepeatedSaveSupportBuffId(ownerActor, flag, statusId = null) {
  return [
    ownerActor?.uuid ?? null,
    flag?.originActorUuid ?? null,
    flag?.originItemUuid ?? flag?.itemUuid ?? null,
    flag?.itemName ?? null,
    statusId,
  ].filter(Boolean).join("|");
}

function activeBuffMatchesLinkedStatus(activeBuff, ownerActor, linkedFlag) {
  if (!activeBuff || !linkedFlag?.buffId) return false;
  if (activeBuff.buffId && linkedFlag.buffId === activeBuff.buffId) return true;
  const groupedBuffId = buildRepeatedSaveSupportBuffId(ownerActor, activeBuff);
  const legacyBuffId = buildRepeatedSaveSupportBuffId(ownerActor, activeBuff, linkedFlag.statusId ?? null);
  return linkedFlag.buffId === groupedBuffId || linkedFlag.buffId === legacyBuffId;
}

function isAllowedLinkedStatusDeletion(options = {}) {
  return options?.[MODULE_ID]?.allowLinkedStatusDeletion === true || options?.botAllowLinkedStatusDeletion === true;
}

async function maybeEndBuffWhenLinkedStatusRemoved(effect, options = {}) {
  const linkedFlag = effect?.flags?.[MODULE_ID];
  if (linkedFlag?.linkedStatus !== true || !linkedFlag.statusId) return false;
  if (isAllowedLinkedStatusDeletion(options)) return false;

  const ownerActor = resolveActorUuid(linkedFlag.ownerActorUuid);
  if (!ownerActor?.getFlag) return false;
  const activeBuff = ownerActor.getFlag(MODULE_ID, "activeBuff");
  if (activeBuff?.status?.endBuffWhenRemoved !== true) return false;
  if (!activeBuffMatchesLinkedStatus(activeBuff, ownerActor, linkedFlag)) return false;

  debugLog(`[${MODULE_ID}] Statut lie ${linkedFlag.statusId} retire hors cleanup - fin du buff ${activeBuff.itemName ?? "buff"}`);
  await endActiveBuff(ownerActor, activeBuff);
  return true;
}

function getLinkedStatusRepeatedSaveEffects(actor, timing) {
  const effects = actor?.effects?.filter((effect) => {
    const linkedFlag = effect.flags?.[MODULE_ID];
    return linkedFlag?.linkedStatus === true
      && linkedFlag.saveRepeat?.enabled === true
      && (
        timing === "damaged"
          ? linkedFlag.saveRepeat?.onDamaged === true
          : (linkedFlag.saveRepeat?.timing ?? "endTurn") === timing
      )
      && !!linkedFlag.saveAbility;
  }) ?? [];
  debugLog(`[${MODULE_ID}] Sauvegardes répétées liées inspectées sur ${actor?.name ?? "inconnu"} : ${effects.length}`);
  return effects;
}

function buildRepeatedSaveFlagFromLinkedStatus(linkedFlag, linkedEffects = []) {
  const statusIds = linkedEffects
    .map((effect) => effect.flags?.[MODULE_ID]?.statusId)
    .filter(Boolean);
  const uniqueStatusIds = [...new Set(statusIds.length ? statusIds : [linkedFlag.statusId].filter(Boolean))];
  return {
    buffId: linkedFlag.buffId ?? null,
    itemUuid: linkedFlag.originItemUuid ?? null,
    originItemUuid: linkedFlag.originItemUuid ?? null,
    originActorUuid: linkedFlag.originActorUuid ?? null,
    save: {
      ability: linkedFlag.saveAbility,
      dcSource: linkedFlag.saveDcSource ?? "fixed",
      dc: linkedFlag.saveDc ?? null,
      repeat: linkedFlag.saveRepeat ?? null,
    },
    status: {
      id: uniqueStatusIds[0] ?? null,
      ids: uniqueStatusIds,
      removeWhenBuffEnds: true,
    },
  };
}

async function createRepeatedSaveMessage(actor, success, shouldEnd) {
  const key = success
    ? "BOT.chat.repeatSave.success"
    : "BOT.chat.repeatSave.failure";
  const content = game.i18n.format(key, {
    actor: actor?.name ?? game.i18n.localize("BOT.fallback.effectName"),
    result: shouldEnd ? "end" : "continue",
  });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
  });
}

async function handleRepeatedSave(actor, flag, timing) {
  if (!shouldRollRepeatedSave(flag, timing)) return false;

  const workflow = {
    actor,
    item: null,
    targets: new Set(),
    hitTargets: new Set(),
    missedTargets: new Set(),
  };
  const saveDc = await resolveSaveDC(workflow, flag);
  if (saveDc === null) {
    debugLog(`[${MODULE_ID}] Sauvegarde répétée ignorée : DD indisponible`);
    return false;
  }

  const saveRolls = await actor.rollSavingThrow(
    buildRepeatedSaveRollConfig(flag, saveDc, timing),
    { configure: false },
    { create: true }
  );
  const saveRoll = saveRolls?.[0] ?? null;
  if (!saveRoll) {
    debugLog(`[${MODULE_ID}] Sauvegarde répétée ignorée : jet indisponible`);
    return false;
  }

  const success = saveRoll.total >= saveDc;
  const endsOn = flag.save.repeat?.endsBuffOn ?? "success";
  const shouldEnd = endsOn === "failure" ? !success : success;
  debugLog(`[${MODULE_ID}] Sauvegarde répétée ${flag.save.ability} ${saveRoll.total} vs DD ${saveDc} — ${success ? "réussite" : "échec"} — buff ${shouldEnd ? "terminé" : "maintenu"}`);
  await createRepeatedSaveMessage(actor, success, shouldEnd);
  if (shouldEnd) await endActiveBuff(actor, flag);
  return shouldEnd;
}

async function cleanupLinkedStatusSupportBuff(linkedFlag) {
  const ownerActor = resolveActorUuid(linkedFlag?.ownerActorUuid);
  if (!ownerActor?.getFlag) return;
  const activeBuff = ownerActor.getFlag(MODULE_ID, "activeBuff");
  if (!activeBuffMatchesLinkedStatus(activeBuff, ownerActor, linkedFlag)) return;
  await endActiveBuff(ownerActor, activeBuff);
}

async function handleLinkedStatusRepeatedSaves(actor, timing) {
  const effects = getLinkedStatusRepeatedSaveEffects(actor, timing);
  const groups = new Map();
  for (const effect of effects) {
    const linkedFlag = effect.flags?.[MODULE_ID];
    const key = [
      linkedFlag?.buffId ?? effect.id,
      linkedFlag?.saveAbility ?? "",
      linkedFlag?.saveDcSource ?? "fixed",
      linkedFlag?.saveDc ?? "",
      linkedFlag?.saveRepeat?.endsBuffOn ?? "success",
      timing === "damaged"
        ? normalizeDamagedRepeatedSaveRollMode(linkedFlag?.saveRepeat?.onDamagedRollMode)
        : normalizeSaveRollMode(linkedFlag?.saveRepeat?.rollMode),
    ].join("|");
    const group = groups.get(key) ?? { linkedFlag, effects: [] };
    group.effects.push(effect);
    groups.set(key, group);
  }

  for (const group of groups.values()) {
    const linkedFlag = group.linkedFlag;
    const flag = buildRepeatedSaveFlagFromLinkedStatus(linkedFlag, group.effects);
    const statusList = group.effects.map((effect) => effect.flags?.[MODULE_ID]?.statusId).filter(Boolean).join(", ");
    debugLog(`[${MODULE_ID}] JS repete lie aux statuts ${statusList || "inconnus"} lance pour ${actor.name}`);

    const workflow = {
      actor,
      item: null,
      targets: new Set(),
      hitTargets: new Set(),
      missedTargets: new Set(),
    };
    const saveDc = await resolveSaveDC(workflow, flag);
    if (saveDc === null) {
      debugLog(`[${MODULE_ID}] Sauvegarde repetee liee ignoree : DD indisponible`);
      continue;
    }

    const saveRolls = await actor.rollSavingThrow(
      buildRepeatedSaveRollConfig(flag, saveDc, timing),
      { configure: false },
      { create: true }
    );
    const saveRoll = saveRolls?.[0] ?? null;
    if (!saveRoll) {
      debugLog(`[${MODULE_ID}] Sauvegarde repetee liee ignoree : jet indisponible`);
      continue;
    }

    const success = saveRoll.total >= saveDc;
    const endsOn = flag.save.repeat?.endsBuffOn ?? "success";
    const shouldEnd = endsOn === "failure" ? !success : success;
    debugLog(`[${MODULE_ID}] Sauvegarde repetee liee ${flag.save.ability} ${saveRoll.total} vs DD ${saveDc} - ${success ? "reussite" : "echec"} - statuts ${shouldEnd ? "retires" : "conserves"}`);
    await createRepeatedSaveMessage(actor, success, shouldEnd);
    if (shouldEnd) {
      for (const effect of group.effects) await effect.delete({ [MODULE_ID]: { allowLinkedStatusDeletion: true } });
      await cleanupLinkedStatusSupportBuff(linkedFlag);
    }
  }
}
async function moveStoredTarget(actor, activeBuff, newTargetToken) {
  if (!actor?.setFlag || !activeBuff?.rememberTargetOnActivation || !newTargetToken?.actor) {
    ui.notifications.warn(game.i18n.localize("BOT.notifications.changeStoredTargetInvalidContext"));
    return false;
  }
  const previousFlag = foundry.utils.deepClone(activeBuff);
  const previousName = getStoredTargetName(previousFlag);
  const nextName = newTargetToken.name ?? newTargetToken.actor.name;
  if (tokenMatchesStoredTarget(newTargetToken, previousFlag)) {
    ui.notifications.warn(game.i18n.format("BOT.notifications.changeStoredTargetSameTarget", { target: nextName }));
    return false;
  }
  const updatedFlag = {
    ...activeBuff,
    targetTokenId: newTargetToken.id ?? null,
    storedTargetTokenUuid: newTargetToken.document?.uuid ?? newTargetToken.uuid ?? null,
    storedTargetActorUuid: newTargetToken.actor.uuid ?? null,
  };

  await upsertActiveBuff(actor, updatedFlag);
  const nextFlag = actor.getFlag(MODULE_ID, "activeBuff") ?? updatedFlag;
  await refreshStoredTargetIndicator(actor, previousFlag);
  const originName = nextFlag.originActorUuid && typeof fromUuidSync === "function"
    ? fromUuidSync(nextFlag.originActorUuid)?.name ?? actor.name
    : actor.name;
  const buffName = nextFlag.itemName ?? activeBuff.itemName ?? game.i18n.localize("BOT.fallback.effectName");
  ui.notifications.info(game.i18n.format("BOT.notifications.changeStoredTargetSuccessForBuff", { buff: buffName, target: nextName }));
  debugLog(`[${MODULE_ID}] Cible mémorisée changée : ${previousName} -> ${nextName}`);
  debugLog(`[${MODULE_ID}] Indicateur de marque ajouté sur ${nextName}, origine ${originName}`);
  return true;
}

export async function changeStoredTarget() {
  const ownerToken = getControlledToken();
  if (!ownerToken) return false;
  if (!ownerToken.actor) {
    ui.notifications.warn(game.i18n.localize("BOT.notifications.changeStoredTargetInvalidContext"));
    return false;
  }

  const newTargetToken = getSingleUserTarget();
  if (!newTargetToken) return false;
  if (!newTargetToken.actor) {
    ui.notifications.warn(game.i18n.localize("BOT.notifications.changeStoredTargetInvalidContext"));
    return false;
  }

  const activeBuff = ownerToken.actor.getFlag(MODULE_ID, "activeBuff");
  if (!activeBuff) {
    ui.notifications.warn(game.i18n.localize("BOT.notifications.changeStoredTargetNoActiveBuff"));
    return false;
  }
  if (!activeBuff.rememberTargetOnActivation) {
    ui.notifications.warn(game.i18n.localize("BOT.notifications.changeStoredTargetNoStoredTarget"));
    return false;
  }

  return moveStoredTarget(ownerToken.actor, activeBuff, newTargetToken);
}

async function clearConcentrationLinkedBuffs(sourceActor) {
  const sourceActorUuid = sourceActor?.uuid ?? null;
  const sourceActorId = sourceActor?.id ?? null;
  if (!sourceActorUuid && !sourceActorId) return;

  const carrierEntries = new Map();
  const addCarrier = (actor, tokenDocument = null) => {
    if (!actor?.getFlag) return;
    const key = tokenDocument?.uuid
      ?? actor.uuid
      ?? (tokenDocument?.id && tokenDocument?.parent?.id ? `${tokenDocument.parent.id}.${tokenDocument.id}` : null)
      ?? actor.id
      ?? null;
    if (!key || carrierEntries.has(key)) return;
    carrierEntries.set(key, { actor, tokenDocument });
  };

  for (const actor of game.actors.contents) addCarrier(actor);

  if (canvas?.tokens?.placeables) {
    for (const token of canvas.tokens.placeables) {
      addCarrier(token.actor ?? null, token.document ?? null);
    }
  }

  if (canvas?.scene?.tokens) {
    for (const tokenDocument of canvas.scene.tokens) {
      addCarrier(tokenDocument.actor ?? null, tokenDocument);
    }
  }

  if (game?.scenes?.contents) {
    for (const scene of game.scenes.contents) {
      for (const tokenDocument of scene.tokens ?? []) {
        addCarrier(tokenDocument.actor ?? null, tokenDocument);
      }
    }
  }

  debugLog(`[${MODULE_ID}] Nettoyage concentration — porteurs inspectés : ${carrierEntries.size}`);

  let removedCount = 0;
  for (const { actor } of carrierEntries.values()) {
    const activeBuffEntries = Object.entries(getActiveBuffs(actor));
    if (!activeBuffEntries.length) continue;

    for (const [buffId, activeBuff] of activeBuffEntries) {
      if (!activeBuff) continue;
      debugLog(`[${MODULE_ID}] Buff actif inspecté sur ${actor.name} — buffId=${buffId}, originActorUuid=${activeBuff.originActorUuid ?? "aucun"}`);

      const matchesOrigin = (sourceActorUuid && activeBuff.originActorUuid === sourceActorUuid)
        || (!activeBuff.originActorUuid && sourceActorId && actor.id === sourceActorId);
      if (!matchesOrigin) continue;

      const itemName = activeBuff.itemName;
      await showBuffReminder(actor, activeBuff, "buffEnd");
      await removeActiveBuff(actor, buffId);
      await actor.unsetFlag(MODULE_ID, "_lastDamagedTrigger");
      await refreshBuffIndicator(actor, itemName, [], activeBuff);
      await refreshStackAfterBuffRemoval(actor, activeBuff);
      removedCount += 1;
      debugLog(`[${MODULE_ID}] Concentration brisée — buff distant supprimé sur ${actor.name}`);
    }
  }

  debugLog(`[${MODULE_ID}] Nettoyage concentration — buffs supprimés : ${removedCount}`);
}

function shouldRollActivationSave(flag) {
  const timing = flag?.save?.timing ?? "trigger";
  return !!flag?.save?.ability && (timing === "activation" || timing === "both");
}

async function shouldApplyBuffAfterActivationSave(workflow, activeFlag, targetToken) {
  if (!shouldRollActivationSave(activeFlag)) return { shouldApply: true, saveResults: null };

  if (!targetToken?.actor) {
    debugLog(`[${MODULE_ID}] JS d'activation ignoré : aucune cible claire`);
    return { shouldApply: true, saveResults: null };
  }

  const saveDc = await resolveSaveDC(workflow, activeFlag);
  if (saveDc === null) {
    debugLog(`[${MODULE_ID}] JS d'activation ignoré : DD indisponible`);
    return { shouldApply: true, saveResults: null };
  }

  const saveRolls = await targetToken.actor.rollSavingThrow(
    buildConfiguredSaveRollConfig(activeFlag.save, saveDc),
    { configure: false },
    { create: true }
  );
  const saveRoll = saveRolls?.[0] ?? null;
  if (!saveRoll) {
    debugLog(`[${MODULE_ID}] Buff non appliqué : JS d'activation indisponible`);
    return { shouldApply: false, saveResults: null };
  }

  const success = saveRoll.total >= saveDc;
  const applyOn = activeFlag.save.activationApplyOn ?? "failure";
  const shouldApply = applyOn === "success" ? success : !success;
  const tokenKey = getTokenResolutionKey(targetToken);
  const saveResults = {
    successes: new Set(),
    failures: new Set(),
    resolvedCount: tokenKey ? 1 : 0,
    dc: saveDc,
  };
  if (tokenKey) {
    if (success) saveResults.successes.add(tokenKey);
    else saveResults.failures.add(tokenKey);
  }
  debugLog(`[${MODULE_ID}] JS d'activation ${activeFlag.save.ability} ${saveRoll.total} vs DD ${saveDc} — ${success ? "réussite" : "échec"} — buff ${shouldApply ? "appliqué" : "ignoré"}`);
  return { shouldApply, saveResults };
}

function normalizeMultiTargetLimit(flag) {
  const limit = flag?.multiTargetLimit;
  if (flag?.allowMultipleTargets !== true || limit?.enabled !== true) return null;
  const toNumber = (value, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  return {
    baseTargets: Math.max(1, Math.floor(toNumber(limit.baseTargets, 1))),
    baseSpellLevel: Math.max(0, Math.floor(toNumber(limit.baseSpellLevel, 1))),
    targetsPerLevelAbove: Math.max(0, Math.floor(toNumber(limit.targetsPerLevelAbove, 0))),
  };
}

function resolveActivationSpellLevel(workflow, flag, limit) {
  const candidates = [
    workflow?.castData?.castLevel,
    workflow?.castData?.level,
    workflow?.castLevel,
    workflow?.activity?.castLevel,
    workflow?.activity?.spellLevel,
    flag?.originSpellLevel,
    workflow?.item?.system?.level,
    limit?.baseSpellLevel,
  ];
  for (const candidate of candidates) {
    const parsed = Number(candidate);
    if (Number.isFinite(parsed)) return parsed;
  }
  return limit?.baseSpellLevel ?? 0;
}

function getMultiTargetMaximum(workflow, flag) {
  const limit = normalizeMultiTargetLimit(flag);
  if (!limit) return null;
  const spellLevel = resolveActivationSpellLevel(workflow, flag, limit);
  return limit.baseTargets + Math.max(0, spellLevel - limit.baseSpellLevel) * limit.targetsPerLevelAbove;
}

function getActivationTargetName(tokenOrActor) {
  return tokenOrActor?.name ?? tokenOrActor?.actor?.name ?? game.i18n.localize("BOT.ui.summary.notConfigured");
}

function countActivationResults(results, status) {
  return results.filter((result) => result.status === status).length;
}

function formatMultiTargetActivationCount(status, count) {
  const pluralKey = count === 1 ? "one" : "many";
  return game.i18n.format(`BOT.chat.multiTargetActivation.${status}.${pluralKey}`, { count });
}

function buildMultiTargetActivationSummaryText(itemName, counts) {
  const parts = [];
  if (counts.affected > 0) parts.push(formatMultiTargetActivationCount("affected", counts.affected));
  if (counts.resisted > 0) parts.push(formatMultiTargetActivationCount("resisted", counts.resisted));
  if (counts.invalid > 0) parts.push(formatMultiTargetActivationCount("invalid", counts.invalid));
  if (counts.failed > 0) parts.push(formatMultiTargetActivationCount("failed", counts.failed));
  if (!counts.affected && parts.length) parts.unshift(game.i18n.localize("BOT.chat.multiTargetActivation.noneAffected"));
  return game.i18n.format("BOT.chat.multiTargetActivation.summary", { item: itemName, details: parts.join(", ") });
}

function escapeMultiTargetSummaryText(value) {
  const text = String(value ?? "");
  if (foundry.utils.escapeHTML) return foundry.utils.escapeHTML(text);
  return text.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char]));
}

function joinMultiTargetNames(results, status) {
  return results
    .filter((result) => result.status === status)
    .map((result) => escapeMultiTargetSummaryText(result.name))
    .filter(Boolean)
    .join(", ");
}

function formatTargetRestrictionBrief(result) {
  if (!result) return game.i18n.localize("BOT.chat.multiTargetActivation.invalidReason.generic");
  if (result.reason === "noActor") return game.i18n.localize("BOT.chat.multiTargetActivation.invalidReason.noActor");
  if (result.reason === "allowedTypes") return game.i18n.localize("BOT.chat.multiTargetActivation.invalidReason.allowedTypes");
  if (result.reason === "excludedTypes") return game.i18n.localize("BOT.chat.multiTargetActivation.invalidReason.excludedTypes");
  if (result.reason === "abilityScore" && result.ability) {
    const ability = game.i18n.localize(`BOT.abilities.${result.ability}`);
    const score = result.detectedScore ?? game.i18n.localize("BOT.ui.summary.notConfigured");
    if (result.min !== null && result.max !== null) {
      return game.i18n.format("BOT.chat.multiTargetActivation.invalidReason.abilityRange", { ability, score, min: result.min, max: result.max });
    }
    if (result.min !== null) {
      return game.i18n.format("BOT.chat.multiTargetActivation.invalidReason.abilityMin", { ability, score, min: result.min });
    }
    if (result.max !== null) {
      return game.i18n.format("BOT.chat.multiTargetActivation.invalidReason.abilityMax", { ability, score, max: result.max });
    }
    return game.i18n.format("BOT.chat.multiTargetActivation.invalidReason.abilityUnavailable", { ability });
  }
  return game.i18n.localize("BOT.chat.multiTargetActivation.invalidReason.generic");
}

function buildInvalidTargetDetails(results) {
  return results
    .filter((result) => result.status === "invalid")
    .map((result) => game.i18n.format("BOT.chat.multiTargetActivation.targetReason", {
      target: escapeMultiTargetSummaryText(result.name),
      reason: escapeMultiTargetSummaryText(formatTargetRestrictionBrief(result.restriction)),
    }))
    .filter(Boolean)
    .join(", ");
}

async function reportMultiTargetActivation(workflow, activeFlag, results) {
  if (!activeFlag?.allowMultipleTargets || results.length <= 1) return;
  const itemName = activeFlag.itemName ?? workflow.item?.name ?? game.i18n.localize("BOT.fallback.effectName");
  const counts = {
    affected: countActivationResults(results, "affected"),
    resisted: countActivationResults(results, "resisted"),
    invalid: countActivationResults(results, "invalid"),
    failed: countActivationResults(results, "failed"),
  };
  const hasOnlyAffected = counts.affected === results.length;
  const summary = buildMultiTargetActivationSummaryText(itemName, counts);
  if (hasOnlyAffected) {
    ui.notifications.info(summary);
    return;
  }

  const affectedNames = joinMultiTargetNames(results, "affected");
  const resistedNames = joinMultiTargetNames(results, "resisted");
  const invalidDetails = buildInvalidTargetDetails(results);
  const failedNames = joinMultiTargetNames(results, "failed");
  const details = [
    affectedNames ? game.i18n.format("BOT.chat.multiTargetActivation.affectedList", { targets: affectedNames }) : null,
    resistedNames ? game.i18n.format("BOT.chat.multiTargetActivation.resistedList", { targets: resistedNames }) : null,
    invalidDetails ? game.i18n.format("BOT.chat.multiTargetActivation.invalidList", { targets: invalidDetails }) : null,
    failedNames ? game.i18n.format("BOT.chat.multiTargetActivation.failedList", { targets: failedNames }) : null,
  ].filter(Boolean);

  const detailHtml = details.length ? "<br>" + details.join("<br>") : "";
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: workflow.actor }),
    content: `<div class="dnd5e-buff-on-trigger-summary">${summary}${detailHtml}</div>`,
  });
}

function buildActivationTargetFlag(baseFlag, targetToken) {
  const flag = foundry.utils.deepClone(baseFlag);
  flag.targetTokenId = targetToken?.id ?? null;
  flag.storedTargetTokenUuid = targetToken?.document?.uuid ?? targetToken?.uuid ?? null;
  flag.storedTargetActorUuid = targetToken?.actor?.uuid ?? null;
  return flag;
}

async function applyActivatedBuffInstance(targetActor, targetToken, activeFlag, workflow, activationSave, hasMechBuffs, sourceActorName) {
  if (!targetActor?.setFlag) return false;
  activeFlag = await upsertActiveBuff(targetActor, activeFlag);
  debugLog(`[${MODULE_ID}] Buff active sur ${targetActor.name} via ${workflow.item?.name ?? activeFlag.itemName}, origine : ${sourceActorName}`);
  if (hasMechBuffs) {
    await refreshBuffIndicator(targetActor);
    await refreshStackingMechanicalEffects(targetActor, getStackingKey(activeFlag));
  } else {
    await refreshBuffIndicator(targetActor);
  }
  await applyActivationTemporaryHp(targetActor, targetToken, activeFlag, workflow);
  await applyActivationStatus(targetActor, targetToken, activeFlag, workflow, activationSave?.saveResults ?? null);
  await showBuffReminder(targetActor, activeFlag, "activation");
  return activeFlag;
}

export function registerTriggers() {
  registerLinkedStatusProtection();
  game.actors.forEach((actor) => {
    refreshBuffIndicator(actor);
    const stackKeys = [...new Set(Object.values(getActiveBuffs(actor)).map((activeBuff) => getStackingKey(activeBuff)).filter(Boolean))];
    for (const stackingKey of stackKeys) refreshStackingMechanicalEffects(actor, stackingKey);
  });

  Hooks.on("preUpdateActor", (actor, changed, options = {}, userId) => {
    try {
      const newTemp = getChangedTemporaryHp(changed);
      if (newTemp === null) return true;
      const activeBuff = actor?.getFlag?.(MODULE_ID, "activeBuff");
      const currentTemp = getActorTemporaryHp(actor);
      if (activeBuff?.endConditions?.onTemporaryHpLost !== true) return true;
      temporaryHpBeforeActorUpdate.set(actor.uuid ?? actor.id, {
        value: currentTemp,
        source: "preUpdateActor actor.system.attributes.hp.temp",
        timestamp: Date.now(),
      });
      const willLoseTemporaryHp = currentTemp > 0 && newTemp <= 0;
      if (!willLoseTemporaryHp) return true;
      createTemporaryHpEndConcentrationSkip(actor, activeBuff, currentTemp, newTemp, "preUpdateActor");
      options.noConcentrationCheck = true;
      foundry.utils.setProperty(options, "dnd5e.concentrationCheck", false);
      tempHpConcentrationDebug("concentration options disabled before temp HP cleanup", {
        actor: actor?.name ?? null,
        buff: activeBuff?.itemName ?? null,
        noConcentrationCheck: options.noConcentrationCheck,
        dnd5eConcentrationCheck: options.dnd5e?.concentrationCheck,
      });
      return true;
    } catch (error) {
      console.error(`[${MODULE_ID}] Erreur dans preUpdateActor PV temporaires :`, error);
      return true;
    }
  });

  Hooks.on("updateActor", async (actor, changed) => {
    try {
      const newTemp = getChangedTemporaryHp(changed);
      if (newTemp === null) return;
      const key = actor.uuid ?? actor.id;
      const preTemp = temporaryHpBeforeActorUpdate.get(key) ?? { value: 0, source: "preUpdateActor unavailable" };
      temporaryHpBeforeActorUpdate.delete(key);
      const activeBuff = actor?.getFlag?.(MODULE_ID, "activeBuff");
      if (activeBuff?.endConditions?.onTemporaryHpLost !== true) return;
      scheduleTemporaryHpLostEndCheck(actor, activeBuff, null, null, null, preTemp);
    } catch (error) {
      console.error(`[${MODULE_ID}] Erreur dans updateActor PV temporaires :`, error);
    }
  });

  Hooks.on("midi-qol.RollComplete", async (workflow) => {
    try {
      if (!workflow.actor) return;
      if (!workflow.activity && !workflow.item) return;

      const actionType = getWorkflowAttackActionType(workflow);
      await maybeEndActiveBuffForWorkflowAction(workflow, actionType);

      // Phase 1 : l'item utilisé est un buff non-attaque → pose le marqueur sur l'acteur
      const buffConfig = workflow.item?.getFlag(MODULE_ID, "buffTrigger");
      const actorFlag = workflow.actor.getFlag(MODULE_ID, "activeBuff");
      if (buffConfig || actorFlag) debugLog(`[${MODULE_ID}] RollComplete déclenché, actionType = ${actionType}`);
      if (buffConfig && !ATTACK_ACTION_TYPES.includes(actionType)) {
        const targetMode = buffConfig.targetMode === "ally" ? "target" : (buffConfig.targetMode ?? "self");
        const activeFlag = {
          ...buffConfig,
          itemName: workflow.item?.name,
          itemImg: workflow.item?.img,
          itemUuid: workflow.item?.uuid ?? null,
          originItemUuid: workflow.item?.uuid ?? null,
          originItemIdentifier: workflow.item?.system?.identifier
            ?? workflow.item?.system?.source?.identifier
            ?? workflow.item?.system?.slug
            ?? workflow.item?.identifier
            ?? null,
          originActorUuid: workflow.actor?.uuid ?? null,
          originTokenName: workflow.token?.name
            ?? workflow.token?.document?.name
            ?? workflow.actor?.name
            ?? null,
          originSpellLevel: workflow.castData?.castLevel
            ?? workflow.castData?.level
            ?? workflow.castLevel
            ?? workflow.activity?.castLevel
            ?? workflow.activity?.spellLevel
            ?? workflow.item?.system?.level
            ?? null,
          duration: buildItemDurationData(workflow.item) ?? buffConfig.duration,
          chargesRemaining: buffConfig.charges ?? null
        };
        const hasMechBuffs = activeFlag.buffs && Object.values(activeFlag.buffs).some((v) => v !== null);
        const sourceActorName = workflow.actor.name;
        const selectedTargets = [...(game.user?.targets ?? [])].filter((token) => token?.actor);
        const allowMultipleTargets = targetMode === "target"
          && activeFlag.allowMultipleTargets === true
          && activeFlag.rememberTargetOnActivation !== true;
        const selectedTargetToken = selectedTargets.length === 1 ? selectedTargets[0] ?? null : null;
        const canFallbackToSelf = targetMode === "target"
          && activeFlag.fallbackToSelfIfNoTarget === true
          && activeFlag.rememberTargetOnActivation !== true;
        const shouldRequireTarget = targetMode === "target" || activeFlag.rememberTargetOnActivation === true;
        const shouldFallbackToSelf = canFallbackToSelf && selectedTargets.length === 0;
        const effectiveTargetMode = shouldFallbackToSelf ? "self" : targetMode;

        if (shouldRequireTarget && !shouldFallbackToSelf && !allowMultipleTargets && !selectedTargetToken?.actor) {
          ui.notifications.warn(game.i18n.localize("BOT.notifications.selectExactlyOneTarget"));
          debugLog(`[${MODULE_ID}] Activation annulee - il faut exactement une cible`);
          return;
        }

        if (allowMultipleTargets && selectedTargets.length === 0 && !shouldFallbackToSelf) {
          ui.notifications.warn(game.i18n.localize("BOT.notifications.noTargetSelected"));
          debugLog(`[${MODULE_ID}] Activation annulee - aucune cible pour activation multi-cible`);
          return;
        }

        const multiTargetMaximum = allowMultipleTargets ? getMultiTargetMaximum(workflow, activeFlag) : null;
        if (multiTargetMaximum !== null && selectedTargets.length > multiTargetMaximum) {
          ui.notifications.warn(game.i18n.format("BOT.notifications.tooManyTargetsSelected", { max: multiTargetMaximum }));
          debugLog(`[${MODULE_ID}] Activation annulee - trop de cibles (${selectedTargets.length}/${multiTargetMaximum})`);
          return;
        }

        const selfToken = workflow.token ?? workflow.actor?.getActiveTokens?.()?.[0] ?? { actor: workflow.actor };
        const targetsToApply = effectiveTargetMode === "target"
          ? (allowMultipleTargets ? selectedTargets : [selectedTargetToken].filter(Boolean))
          : [selfToken].filter(Boolean);
        const pendingApplications = [];
        const activationResults = [];

        for (const targetToken of targetsToApply) {
          const targetFilterResult = evaluateTargetFilters(activeFlag, targetToken);
          debugLog(`[${MODULE_ID}] Restriction cible : ${JSON.stringify(targetFilterResult)}`);
          if (!targetFilterResult.ok) {
            ui.notifications.warn(formatTargetRestrictionFailure(targetFilterResult));
            activationResults.push({ status: "invalid", name: getActivationTargetName(targetToken), restriction: targetFilterResult });
            debugLog(`[${MODULE_ID}] Cible ignoree : hors restrictions`);
            continue;
          }

          const activationSaveTarget = effectiveTargetMode === "target" ? targetToken : (shouldFallbackToSelf ? selfToken : null);
          const activationSave = await shouldApplyBuffAfterActivationSave(workflow, activeFlag, activationSaveTarget);
          if (!activationSave.shouldApply) {
            activationResults.push({ status: "resisted", name: getActivationTargetName(targetToken) });
            debugLog(`[${MODULE_ID}] Cible ignoree - JS d'activation non satisfait : ${targetToken?.actor?.name ?? "inconnue"}`);
            continue;
          }

          const targetFlag = effectiveTargetMode === "target"
            ? buildActivationTargetFlag(activeFlag, targetToken)
            : foundry.utils.deepClone(activeFlag);
          if (effectiveTargetMode !== "target") {
            if (selectedTargetToken?.actor) {
              targetFlag.targetTokenId = selectedTargetToken.id;
              targetFlag.storedTargetTokenUuid = selectedTargetToken.document?.uuid ?? selectedTargetToken.uuid ?? null;
              targetFlag.storedTargetActorUuid = selectedTargetToken.actor.uuid ?? null;
            } else if (shouldFallbackToSelf) {
              targetFlag.targetTokenId = null;
              targetFlag.storedTargetTokenUuid = null;
              targetFlag.storedTargetActorUuid = null;
            }
          }
          const targetActor = effectiveTargetMode === "target" ? targetToken.actor : workflow.actor;
          const carrierToken = effectiveTargetMode === "target" ? targetToken : (workflow.token ?? workflow.actor?.getActiveTokens?.()?.[0] ?? null);
          pendingApplications.push({ targetActor, carrierToken, targetFlag, activationSave });
        }

        if (!pendingApplications.length) {
          await reportMultiTargetActivation(workflow, activeFlag, activationResults);
          debugLog(`[${MODULE_ID}] Activation annulee - aucune cible n'a recu le buff`);
          return;
        }

        const existingBuffs = findExistingBuffInstances(activeFlag);
        if (existingBuffs.length) {
          for (const existing of existingBuffs) {
            await clearExistingBuffInstance(existing.actor, existing.activeBuff);
          }
          debugLog(`[${MODULE_ID}] Ancien buff remplace : ${workflow.item.name}`);
        }

        for (const application of pendingApplications) {
          try {
            const appliedFlag = await applyActivatedBuffInstance(
              application.targetActor,
              application.carrierToken,
              application.targetFlag,
              workflow,
              application.activationSave,
              hasMechBuffs,
              sourceActorName
            );
            if (appliedFlag) application.targetFlag = appliedFlag;
            activationResults.push({ status: appliedFlag ? "affected" : "failed", name: application.targetActor?.name ?? getActivationTargetName(application.carrierToken) });
          } catch (error) {
            activationResults.push({ status: "failed", name: application.targetActor?.name ?? getActivationTargetName(application.carrierToken) });
            console.error(`[${MODULE_ID}] Erreur application multi-cible :`, error);
          }
        }

        await reportMultiTargetActivation(workflow, activeFlag, activationResults);

        if (effectiveTargetMode !== "target" && !hasMechBuffs) {
          for (const token of game.user.targets) {
            if (token.actor) await applyTargetIndicator(token.actor, pendingApplications[0].targetFlag);
          }
        }
        return;
      }

      // Phase 2 : attaque → lit le marqueur sur le porteur réel du buff et déclenche l'effet
      const carrier = resolveAttackBuffCarrier(workflow);
      const flag = carrier?.actor?.getFlag(MODULE_ID, "activeBuff") ?? null;
      debugLog(`[${MODULE_ID}] Trigger attaque inspecté : attaquant=${workflow.actor?.name ?? "inconnu"}, porteur=${carrier?.actor?.name ?? "aucun"}, source=${carrier?.source ?? "aucune"}, activeBuff=${Boolean(flag)}, trigger=${flag?.type ?? "aucun"}, actionType=${actionType ?? "aucun"}, match=${flag ? doesAttackTriggerMatch(flag.type, actionType) : false}, hitTargets=${workflow.hitTargets?.size ?? 0}, damageTargetMode=${flag?.damage?.targetMode ?? "aucun"}`);
      if (!flag) return;
      await ensureLinkedStatusesForActiveBuff(carrier.actor, flag);
      if (flag.type === "passive") return;

      if (doesAttackTriggerMatch(flag.type, actionType)) {
        const triggerWorkflow = carrier?.actor && carrier.actor !== workflow.actor
          ? {
              ...workflow,
              actor: carrier.actor,
              token: carrier.token ?? workflow.token ?? carrier.actor.getActiveTokens?.()?.[0] ?? null,
            }
          : workflow;
        handleAttackTrigger(triggerWorkflow, flag);
      }
    } catch (error) {
      console.error(`[${MODULE_ID}] Erreur dans midi-qol.RollComplete :`, error);
    }
  });

  Hooks.on("updateCombat", async (combat, changed, options, userId) => {
    try {
      if (changed.turn === undefined) return;

      // turnStart : acteur dont c'est maintenant le tour
      const currentCombatant = combat.combatant;
      const currentActor = currentCombatant?.actor;
      if (currentActor) {
        const flag = currentActor.getFlag(MODULE_ID, "activeBuff");
        await showBuffReminder(currentActor, flag, "turnStart");
        const repeatedSaveHandled = shouldRollRepeatedSave(flag, "startTurn");
        const endedByRepeatedSave = await handleRepeatedSave(currentActor, flag, "startTurn");
        if (!repeatedSaveHandled) await handleLinkedStatusRepeatedSaves(currentActor, "startTurn");
        if (!endedByRepeatedSave && flag?.type === "turnStart") {
          await handleTurnTrigger(currentActor, flag, "turnStart");
        }
      }

      // targetTurnStart : cherche un lanceur dont le buff se déclenche sur le combattant qui commence son tour
      const currentToken = canvas.tokens.get(currentCombatant?.tokenId);
      if (currentToken) {
        const isHostile = currentToken.document.disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE;
        const isUserTarget = game.user.targets.has(currentToken);
        if (isHostile || isUserTarget) {
          const sceneActors = new Map();
          for (const token of canvas.tokens.placeables) {
            if (token.actor && !sceneActors.has(token.actor.id)) {
              sceneActors.set(token.actor.id, token.actor);
            }
          }
          for (const sceneActor of sceneActors.values()) {
            const flag = sceneActor.getFlag(MODULE_ID, "activeBuff");
            if (flag?.type === "targetTurnStart") {
              await handleTurnTrigger(sceneActor, flag, "targetTurnStart", [currentToken]);
            }
          }
        }
      }

      // turnEnd et targetTurnEnd : acteur dont le tour vient de se terminer
      if (combat.turn === 0 && !changed.round) return;
      const prevTurnIndex = (combat.turn - 1 + combat.turns.length) % combat.turns.length;
      const prevCombatant = combat.turns[prevTurnIndex];
      const prevActor = prevCombatant?.actor;

      if (prevActor) {
        const flag = prevActor.getFlag(MODULE_ID, "activeBuff");
        await showBuffReminder(prevActor, flag, "turnEnd");
        const repeatedSaveHandled = shouldRollRepeatedSave(flag, "endTurn");
        const endedByRepeatedSave = await handleRepeatedSave(prevActor, flag, "endTurn");
        if (!repeatedSaveHandled) await handleLinkedStatusRepeatedSaves(prevActor, "endTurn");
        if (!endedByRepeatedSave && flag?.type === "turnEnd") {
          await handleTurnTrigger(prevActor, flag, "turnEnd");
        }
      }

      // targetTurnEnd : cherche un lanceur dans la scène dont le buff se déclenche sur la cible qui vient de finir son tour
      const prevToken = canvas.tokens.get(prevCombatant?.tokenId);
      if (prevToken) {
        const isHostile = prevToken.document.disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE;
        const isUserTarget = game.user.targets.has(prevToken);
        if (isHostile || isUserTarget) {
          const sceneActors = new Map();
          for (const token of canvas.tokens.placeables) {
            if (token.actor && !sceneActors.has(token.actor.id)) {
              sceneActors.set(token.actor.id, token.actor);
            }
          }
          for (const sceneActor of sceneActors.values()) {
            const flag = sceneActor.getFlag(MODULE_ID, "activeBuff");
            if (flag?.type === "targetTurnEnd") {
              await handleTurnTrigger(sceneActor, flag, "targetTurnEnd", [prevToken]);
            }
          }
        }
      }
    } catch (error) {
      console.error(`[${MODULE_ID}] Erreur dans updateCombat :`, error);
    }
  });

  Hooks.on("midi-qol.isDamaged", async (token, { item, workflow, damageItem }) => {
    try {
      const actor = token.actor;
      if (!actor) return;
      if (token.actor.id !== actor.id) return;
      const damageTaken = getDamageTakenAmount(damageItem, workflow);
      const initialActiveFlags = getActiveBuffsForTrigger(actor);
      if (damageTaken > 0 && shouldProcessDamagedRepeatedSave(actor, workflow, damageItem)) {
        const repeatedSaveFlags = initialActiveFlags.filter((activeFlag) => shouldRollRepeatedSave(activeFlag, "damaged"));
        const repeatedSaveHandled = repeatedSaveFlags.length > 0;
        let endedByRepeatedSave = false;
        for (const activeFlag of repeatedSaveFlags) {
          endedByRepeatedSave = await handleRepeatedSave(actor, activeFlag, "damaged") || endedByRepeatedSave;
        }
        if (!repeatedSaveHandled) await handleLinkedStatusRepeatedSaves(actor, "damaged");
        if (endedByRepeatedSave) debugLog(`[${MODULE_ID}] Sauvegarde répétée sur dégâts traitée pour ${actor.name}`);
      }

      if (damageTaken > 0 && shouldProcessDamageTakenEndCondition(actor, workflow, damageItem)) {
        for (const flag of getActiveBuffsForTrigger(actor)) {
          scheduleTemporaryHpLostEndCheck(actor, flag, damageItem, workflow, damageTaken);
          await maybeEndActiveBuffForDamageTaken(actor, flag, damageItem, workflow);
        }
      }

      const damagedFlags = getActiveBuffsForTrigger(actor, (activeFlag) => activeFlag.type === "damaged");
      if (!damagedFlags.length) {
        debugLog(`[${MODULE_ID}] midi-qol.isDamaged : aucun buff actif trouvé sur ${actor.name}`);
        return;
      }

      const actorUuid = actor.uuid;
      const attackerTokenUuid = workflow?.token?.document?.uuid
        ?? workflow?.attackingToken?.document?.uuid
        ?? null;
      const itemUuid = item?.uuid ?? null;
      const now = Date.now();

      for (const flag of damagedFlags) {
        debugLog(`[${MODULE_ID}] Déclencheur damaged sur ${actor.name} (${flag.itemName ?? flag.buffId ?? "buff"})`);

        const expectedAttackType = typeof flag.receivedAttackType === "string" ? flag.receivedAttackType : "any";
        if (expectedAttackType !== "any") {
          const receivedAttackTypes = getReceivedAttackCategories(workflow, item);
          if (!receivedAttackTypes.has(expectedAttackType)) {
            debugLog(`[${MODULE_ID}] damaged bloqué par type d’attaque`);
            continue;
          }
        }

        const expectedDamageTypes = Array.isArray(flag.receivedDamageTypes) ? flag.receivedDamageTypes.filter(Boolean) : [];
        if (expectedDamageTypes.length > 0) {
          const receivedDamageTypes = getReceivedDamageTypes(damageItem, workflow);
          if (!receivedDamageTypes.length) {
            debugLog(`[${MODULE_ID}] Types de dégâts reçus indisponibles pour le filtre damaged`);
          } else if (!receivedDamageTypes.some(type => expectedDamageTypes.includes(type))) {
            debugLog(`[${MODULE_ID}] damaged bloqué par type de dégâts`);
            continue;
          }
        }

        debugLog(`[${MODULE_ID}] damaged autorisé`);

        const lastTriggered = getLastDamagedTriggerTimestamp(actor, flag);
        if (now - lastTriggered < 1000) continue;
        await markDamagedTriggerTimestamp(actor, flag, now);
        const buffId = flag.buffId ?? null;
        debugLog(`[${MODULE_ID}] Déclencheur damaged différé pour éviter conflit concentration`);
        window.setTimeout(async () => {
          try {
            const delayedActor = fromUuidSync(actorUuid);
            if (!delayedActor?.getFlag) return;
            const delayedFlag = buffId
              ? getActiveBuff(delayedActor, buffId)
              : delayedActor.getFlag(MODULE_ID, "activeBuff");
            if (!delayedFlag || delayedFlag.type !== "damaged") return;
            const attackerToken = attackerTokenUuid
              ? (fromUuidSync(attackerTokenUuid)?.object ?? null)
              : null;
            const delayedItem = itemUuid ? fromUuidSync(itemUuid) : null;
            const fakeWorkflow = {
              actor: delayedActor,
              item: delayedItem ?? null,
              attackerToken: attackerToken ?? null,
              attackerTokenUuid: attackerTokenUuid,
              targets: attackerToken ? new Set([attackerToken]) : new Set(),
              hitTargets: attackerToken ? new Set([attackerToken]) : new Set(),
              missedTargets: new Set(),
              damageItem,
              damageList: workflow?.damageList ?? null,
              _botOriginalWorkflow: workflow ?? null,
              _botOriginalDamageItem: damageItem ?? null,
            };
            handleAttackTrigger(fakeWorkflow, delayedFlag);
          } catch (error) {
            console.error(`[${MODULE_ID}] Erreur dans midi-qol.isDamaged (différé) :`, error);
          }
        }, 100);
      }
    } catch (error) {
      console.error(`[${MODULE_ID}] Erreur dans midi-qol.isDamaged :`, error);
    }
  });

  Hooks.on("midi-qol.isHealed", async (token, { item, workflow, damageItem }) => {
    try {
      const actor = token.actor;
      const flag = actor?.getFlag(MODULE_ID, "activeBuff");
      if (!flag || flag.type !== "healed") return;
      debugLog(`[${MODULE_ID}] Déclencheur healed sur ${actor.name}`);
      const fakeWorkflow = {
        actor,
        item: item ?? null,
        targets: new Set(),
        hitTargets: new Set([token]),
        missedTargets: new Set(),
        damageItem,
      };
      handleAttackTrigger(fakeWorkflow, flag);
    } catch (error) {
      console.error(`[${MODULE_ID}] Erreur dans midi-qol.isHealed :`, error);
    }
  });

  Hooks.on("dnd5e.preRollSkill", async (config, skillId) => {
    const actor = config.subject ?? config.actor ?? null;
    if (!actor?.getFlag) return;
    const activeBuff = actor.getFlag(MODULE_ID, "activeBuff");
    const skills = activeBuff?.buffs?.skills;
    if (skills?.length && (skills.includes("all") || skills.includes(skillId))) {
      config.advantage = true;
      debugLog(`[${MODULE_ID}] Avantage compétence ${skillId} appliqué sur ${actor.name}`);
    }
  });

  Hooks.on("dnd5e.preRollAbility", async (actor, config, abilityId) => {
    const activeBuff = actor.getFlag(MODULE_ID, "activeBuff");
    if (activeBuff?.buffs?.skillMode === "advantage") {
      config.advantage = true;
      debugLog(`[${MODULE_ID}] Avantage caractéristique appliqué sur ${actor.name}`);
    } else if (activeBuff?.buffs?.skillMode === "disadvantage") {
      config.disadvantage = true;
      debugLog(`[${MODULE_ID}] Désavantage caractéristique appliqué sur ${actor.name}`);
    }
  });


  Hooks.on("dnd5e.preRollAttack", async (...args) => {
    debugLog(`[${MODULE_ID}] Debug dnd5e.preRollAttack : ${summarizeRollHookArgs(args)}`);
  });

  Hooks.on("midi-qol.preAttackRoll", async (workflow) => {
    try {
      incomingFilterLog("preAttackRoll called", summarizeIncomingWorkflow(workflow));
      const bearerAttackApplied = applyFilteredBearerAttackMode(workflow);
      const applied = applyFilteredIncomingAttackMode(workflow);
      incomingFilterLog("preAttackRoll result", {
        applied,
        bearerAttackApplied,
        workflowOptions: {
          advantage: workflow?.workflowOptions?.advantage,
          disadvantage: workflow?.workflowOptions?.disadvantage,
        },
        rollOptions: {
          advantage: workflow?.rollOptions?.advantage,
          disadvantage: workflow?.rollOptions?.disadvantage,
        },
      });
      return true;
    } catch (error) {
      console.error("[" + MODULE_ID + "] Erreur dans midi-qol.preAttackRoll :", error);
      return true;
    }
  });

  Hooks.on("dnd5e.preRollSavingThrow", async (...args) => {
    debugLog(`[${MODULE_ID}] Debug dnd5e.preRollSavingThrow : ${summarizeRollHookArgs(args)}`);
  });

  Hooks.on("dnd5e.preRollAbilitySave", async (...args) => {
    debugLog(`[${MODULE_ID}] Debug dnd5e.preRollAbilitySave : ${summarizeRollHookArgs(args)}`);
  });

  Hooks.on("dnd5e.preRollAbilityCheck", async (...args) => {
    debugLog(`[${MODULE_ID}] Debug dnd5e.preRollAbilityCheck : ${summarizeRollHookArgs(args)}`);
  });

  Hooks.on("dnd5e.postBuildAttackRollConfig", async (process, rollConfig) => {
    incomingFilterLog("postBuildAttackRollConfig called", summarizeIncomingRollConfig(process, rollConfig));
    const workflow = process?.workflow ?? process?.midiOptions?.workflow ?? process?.subject?.workflow ?? rollConfig?.workflow ?? rollConfig?.midiOptions?.workflow ?? null;
    const attacker = resolveRollHookActor(process) ?? resolveRollHookActor(rollConfig) ?? null;
    const fallbackTargets = rollConfig?.targets ?? process?.targets ?? process?.config?.targets ?? game.user?.targets ?? new Set();
    const fallbackWorkflow = workflow ?? (attacker ? { actor: attacker, targets: fallbackTargets, rollOptions: rollConfig?.midiOptions ?? {}, midiOptions: rollConfig?.midiOptions ?? {} } : null);
    const bearerAttackApplied = applyFilteredBearerAttackMode(fallbackWorkflow, rollConfig, process);
    const attackBonusApplied = applyFilteredAttackBonus(fallbackWorkflow, rollConfig, process);
    const applied = fallbackWorkflow ? applyFilteredIncomingAttackMode(fallbackWorkflow, rollConfig, process) : false;
    incomingFilterLog("postBuildAttackRollConfig result", {
      applied,
      bearerAttackApplied,
      attackBonusApplied,
      rollConfig: summarizeIncomingRollConfig(process, rollConfig),
    });
    handleRollModifierBuildHook("dnd5e.postBuildAttackRollConfig", "attack", process, rollConfig);
  });

  Hooks.on("dnd5e.postBuildSavingThrowRollConfig", async (process, rollConfig) => {
    handleRollModifierBuildHook("dnd5e.postBuildSavingThrowRollConfig", "save", process, rollConfig);
  });

  Hooks.on("dnd5e.postBuildAbilityCheckRollConfig", async (process, rollConfig) => {
    handleRollModifierBuildHook("dnd5e.postBuildAbilityCheckRollConfig", "ability", process, rollConfig);
  });

  Hooks.on("dnd5e.postBuildSkillRollConfig", async (process, rollConfig) => {
    handleRollModifierBuildHook("dnd5e.postBuildSkillRollConfig", "skill", process, rollConfig);
  });

  Hooks.on("dnd5e.postAttackRollConfiguration", async (rolls, process) => {
    await handleRollModifierFinalHook("dnd5e.postAttackRollConfiguration", "attack", rolls, process);
  });

  Hooks.on("dnd5e.postSavingThrowRollConfiguration", async (rolls, process) => {
    await handleRollModifierFinalHook("dnd5e.postSavingThrowRollConfiguration", "save", rolls, process);
  });

  Hooks.on("dnd5e.postAbilityCheckRollConfiguration", async (rolls, process) => {
    await handleRollModifierFinalHook("dnd5e.postAbilityCheckRollConfiguration", "ability", rolls, process);
  });

  Hooks.on("dnd5e.postSkillRollConfiguration", async (rolls, process) => {
    await handleRollModifierFinalHook("dnd5e.postSkillRollConfiguration", "skill", rolls, process);
  });
  Hooks.on("dnd5e.preRollConcentration", (rollConfig, dialogConfig, messageConfig) => {
    try {
      const actor = rollConfig?.subject ?? null;
      if (!actor?.uuid) return true;
      const marker = getTemporaryHpEndConcentrationSkip(actor);
      const skipDecision = shouldSkipTemporaryHpEndConcentration(actor, marker);
      if (marker) {
        tempHpConcentrationDebug("preRollConcentration marker evaluated", {
          actor: actor.name,
          markerBuff: marker.itemName ?? null,
          preTemp: marker.preTemp ?? null,
          predictedTemp: marker.predictedTemp ?? null,
          concentrationEffectCount: getActorConcentrationEffects(actor).length,
          skip: skipDecision.ok,
          reason: skipDecision.reason,
        });
      }
      if (skipDecision.ok) {
        foundry.utils.setProperty(rollConfig, "workflowOptions.noConcentrationCheck", true);
        pendingTemporaryHpEndConcentrationSkips.delete(actor.uuid);
        tempHpConcentrationDebug("concentration roll blocked", {
          actor: actor.name,
          buff: marker?.itemName ?? skipDecision.activeBuff?.itemName ?? null,
          preTemp: marker?.preTemp ?? null,
          predictedTemp: marker?.predictedTemp ?? null,
        });
        return false;
      }

      const now = Date.now();
      for (const [oldKey, oldTimestamp] of recentConcentrationRolls.entries()) {
        if (now - oldTimestamp > 5000) recentConcentrationRolls.delete(oldKey);
      }
      const dc = Number(rollConfig?.target ?? 0);
      const ability = rollConfig?.ability ?? "con";
      const key = `${actor.uuid}|${ability}|${dc}`;
      const lastTriggered = recentConcentrationRolls.get(key) ?? 0;
      if (now - lastTriggered < 500) {
        debugLog(`[${MODULE_ID}] Jet de concentration doublon ignoré`);
        return false;
      }
      recentConcentrationRolls.set(key, now);
      return true;
    } catch (error) {
      console.error(`[${MODULE_ID}] Erreur dans preRollConcentration PV temporaires :`, error);
      return true;
    }
  });

  Hooks.on("deleteActiveEffect", async (effect, options, userId) => {
    try {
      if (await maybeEndBuffWhenLinkedStatusRemoved(effect, options)) return;

      if (isActiveBuffIndicatorEffect(effect)) {
        if (options?.[MODULE_ID]?.allowActiveBuffIndicatorDeletion === true || consumeAllowedActiveBuffIndicatorDeletion(effect)) return;
        const actor = effect.parent;
        if (!actor) return;
        const { activeBuff, buffId } = resolveActiveBuffFromIndicatorEffect(actor, effect);
        if (!activeBuff) {
          debugLog(`[${MODULE_ID}] Suppression manuelle ignoree : buff actif introuvable pour ${effect.name}`);
          if (buffId) await removeActiveBuff(actor, buffId, { clearLegacy: false });
          return;
        }
        const itemName = effect.name;
        await showBuffReminder(actor, activeBuff, "buffEnd");
        await removeActiveBuff(actor, buffId ?? activeBuff);
        await refreshBuffIndicator(actor, itemName, [], activeBuff);
        await refreshStackAfterBuffRemoval(actor, activeBuff);
        debugLog(`[${MODULE_ID}] Buff supprimé manuellement sur ${actor.name}`);
        if (activeBuff?.duration?.concentration) {
          const concentrationEffect = actor.effects.find(
            (e) => e.statuses?.has("concentrating") || e.statuses?.has("concentration")
          );
          if (concentrationEffect) {
            allowConcentrationDeletion(concentrationEffect);
            await concentrationEffect.delete({ [MODULE_ID]: { allowConcentrationDeletion: true } });
            debugLog(`[${MODULE_ID}] Concentration retirée sur ${actor.name}`);
          }
        }
        return;
      }

      if (effect.statuses?.has("concentrating") || effect.statuses?.has("concentration")) {
        if (options?.[MODULE_ID]?.allowConcentrationDeletion === true || consumeAllowedConcentrationDeletion(effect)) return;
        const actor = effect.parent;
        if (!actor) return;
        await clearConcentrationLinkedBuffs(actor);
        return;
      }
    } catch (error) {
      console.error(`[${MODULE_ID}] Erreur dans deleteActiveEffect :`, error);
    }
  });
}

function handleAttackTrigger(workflow, flag) {
  if (flag.type === "passive") return;
  const triggerType = getWorkflowAttackActionType(workflow) ?? flag.type;
  debugLog(`[${MODULE_ID}] Déclencheur ${triggerType} détecté sur ${workflow.actor?.name ?? "inconnu"} : trigger configuré=${flag.type}, condition=${flag.condition ?? "hit"}, hitTargets=${workflow.hitTargets?.size ?? 0}, damageTargetMode=${flag.damage?.targetMode ?? "aucun"}`);
  if (!doesAttackConditionMatch(workflow, flag)) return;
  if (!workflowMatchesStoredTarget(workflow, flag)) return;
  applyEffect(workflow, flag);
}

async function handleTurnTrigger(actor, flag, triggerType, overrideTargets = null) {
  debugLog(`[${MODULE_ID}] Déclencheur ${triggerType} pour ${actor.name}`);

  let cibles;
  if (overrideTargets !== null) {
    cibles = overrideTargets;
  } else {
    cibles = [];
    debugLog(`[${MODULE_ID}] Trigger de tour : aucune cible de déclenchement implicite`);
  }
  if (overrideTargets !== null) {
    debugLog(`[${MODULE_ID}] Cibles explicites pour ${triggerType} : ${cibles.length}`);
  }

  const targetsSet = new Set(cibles);
  const workflow = {
    actor,
    item: null,
    targets: targetsSet,
    hitTargets: new Set(cibles),
    missedTargets: new Set(),
  };
  if (!workflowMatchesStoredTarget(workflow, flag)) return;
  const applied = await applyEffect(workflow, flag);
  if (applied && flag.consumeOnTrigger === true) {
    const itemName = flag.itemName;
    await showBuffReminder(actor, flag, "buffEnd");
    await removeActiveBuff(actor, flag);
    await refreshBuffIndicator(actor, itemName, [], flag);
    await refreshStackAfterBuffRemoval(actor, flag);
  }
}

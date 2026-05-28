import { MODULE_ID, ATTACK_ACTION_TYPES, ATTACK_TRIGGER_TYPES, debugLog } from "./constants.js";
import { buildItemDurationData } from "./duration.js";
import { applyEffect, applyMechanicalBuffs, buildMechanicalChanges, refreshBuffIndicator, refreshStoredTargetIndicator, applyTargetIndicator, applyRollModifierToConfig, finalizeRollModifierApplication, resolveSaveDC, applyTemporaryHp, applyStatusEffect, ensureLinkedStatusesForActiveBuff, registerLinkedStatusProtection } from "./effects.js";

const recentConcentrationRolls = new Map();
const recentDamagedRepeatedSaves = new Map();
const INCOMING_ATTACK_CREATURE_TYPES = ["aberration", "celestial", "elemental", "fey", "fiend", "undead", "beast", "dragon", "giant", "humanoid", "monstrosity", "ooze", "plant", "construct"];

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
function normalizeIncomingAttackCreatureTypes(types = []) {
  return [...new Set((types ?? [])
    .map((type) => String(type ?? "").trim().toLowerCase())
    .filter((type) => INCOMING_ATTACK_CREATURE_TYPES.includes(type)))];
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
  return [
    midiTypeOrRace,
    midiRaceOrType,
    actor?.system?.details?.type?.value,
    actor?.system?.details?.type?.subtype,
    actor?.system?.details?.race,
    actor?.raceOrType,
  ]
    .flatMap((value) => flattenCreatureTypeValues(value))
    .map((value) => String(value ?? "").trim().toLowerCase())
    .filter(Boolean);
}

function getTargetFilterCreatureTypes(flag) {
  return normalizeIncomingAttackCreatureTypes(flag?.targetFilters?.creatureTypes ?? []);
}

function actorMatchesCreatureTypeFilter(actor, creatureTypes = []) {
  const expectedTypes = normalizeIncomingAttackCreatureTypes(creatureTypes);
  if (!expectedTypes.length) return true;

  const detectedTypes = getActorCreatureTypeValues(actor);
  const match = detectedTypes.some((type) => expectedTypes.includes(type));
  debugLog(`[${MODULE_ID}] Filtre cible activation : actor=${actor?.name ?? "inconnu"}, detected=${JSON.stringify(detectedTypes)}, expected=${JSON.stringify(expectedTypes)}, match=${match}`);
  return match;
}

function activationTargetMatchesFilters(flag, targetToken) {
  const creatureTypes = getTargetFilterCreatureTypes(flag);
  if (!creatureTypes.length) return true;
  return actorMatchesCreatureTypeFilter(targetToken?.actor, creatureTypes);
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
    ?? game.i18n?.localize?.("BOT.ui.defense.incomingAttack")
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

function getFilteredIncomingAttackMatches(attacker, targets) {
  const midiTypeOrRace = globalThis.MidiQOL?.typeOrRace?.(attacker);
  const midiRaceOrType = globalThis.MidiQOL?.raceOrType?.(attacker);
  const attackerTypes = getActorCreatureTypeValues(attacker);
  const matches = [];
  for (const target of targets) {
    const activeBuff = target.actor?.getFlag?.(MODULE_ID, "activeBuff");
    const mode = activeBuff?.buffs?.incomingAttackMode;
    const rawExpected = activeBuff?.buffs?.incomingAttackCreatureTypes;
    incomingFilterLog("target inspected", {
      target: summarizeIncomingTarget(target),
      activeBuff: Boolean(activeBuff),
      incomingAttackMode: mode ?? null,
      incomingAttackCreatureTypes: rawExpected ?? [],
    });
    if (!["advantage", "disadvantage"].includes(mode)) continue;
    const expectedTypes = normalizeIncomingAttackCreatureTypes(rawExpected);
    if (!expectedTypes.length) continue;
    const match = attackerTypes.some((type) => expectedTypes.includes(type));
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
      match,
      mode,
    });
    if (match) matches.push({ mode, target, activeBuff, expectedTypes, attackerTypes });
  }
  return matches;
}

function applyFilteredIncomingAttackMode(workflow, rollConfig = null) {
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
  for (const match of getFilteredIncomingAttackMatches(attacker, targets)) {
    if (workflow) applyIncomingAttackModeToMidiWorkflow(workflow, match.mode, getIncomingAttackAttributionLabel(match));
    applyIncomingAttackModeToRollConfig(rollConfig, match.mode);
    incomingFilterLog("matched and applied", {
      mode: match.mode,
      target: summarizeIncomingTarget(match.target),
      expectedTypes: match.expectedTypes,
      detectedTypes: match.attackerTypes,
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
  return [...types];
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
    .map(({ actor }) => ({ actor, activeBuff: actor.getFlag(MODULE_ID, "activeBuff") }))
    .filter(({ activeBuff }) => doesBuffMatchSameOriginAndItem(activeBuff, newFlag));
}

function getStoredTargetName(flag) {
  const token = flag?.storedTargetTokenUuid && typeof fromUuidSync === "function"
    ? fromUuidSync(flag.storedTargetTokenUuid)?.object
    : null;
  const actor = token?.actor
    ?? (flag?.storedTargetActorUuid && typeof fromUuidSync === "function" ? fromUuidSync(flag.storedTargetActorUuid) : null);
  return token?.name ?? actor?.name ?? game.i18n.localize("BOT.ui.summary.notConfigured");
}

function getControlledToken() {
  const controlled = canvas?.tokens?.controlled ?? [];
  if (!controlled.length) {
    ui.notifications.warn(game.i18n.localize("BOT.notifications.selectMarkOwner"));
    return null;
  }
  if (controlled.length > 1) {
    ui.notifications.warn(game.i18n.localize("BOT.notifications.selectSingleMarkOwner"));
    return null;
  }
  return controlled[0] ?? null;
}

function getSingleUserTarget() {
  const targetSet = game.user?.targets ?? new Set();
  const targets = typeof targetSet.first === "function" ? [targetSet.first()].filter(Boolean) : [...targetSet];
  if (!targets.length) {
    ui.notifications.warn(game.i18n.localize("BOT.notifications.targetNewCreature"));
    return null;
  }
  if (targets.length > 1) {
    ui.notifications.warn(game.i18n.localize("BOT.notifications.targetSingleCreature"));
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
async function clearExistingBuffInstance(actor, activeBuff) {
  if (!actor?.unsetFlag || !activeBuff) return;
  const itemName = activeBuff.itemName;
  await actor.unsetFlag(MODULE_ID, "activeBuff");
  await actor.unsetFlag(MODULE_ID, "_lastDamagedTrigger");
  const mechEffects = actor.effects?.filter((e) => e.flags?.[MODULE_ID]?.mechanicalBuff === true) ?? [];
  for (const effect of mechEffects) await effect.delete();
  await refreshBuffIndicator(actor, itemName, [], activeBuff);
}

async function endActiveBuff(actor, activeBuff) {
  if (!actor?.unsetFlag || !activeBuff) return;
  const itemName = activeBuff.itemName;
  await actor.unsetFlag(MODULE_ID, "activeBuff");
  await actor.unsetFlag(MODULE_ID, "_lastDamagedTrigger");
  const mechEffects = actor.effects?.filter((e) => e.flags?.[MODULE_ID]?.mechanicalBuff === true) ?? [];
  for (const effect of mechEffects) await effect.delete();
  const concentrationEffect = actor.effects?.find(
    (e) => e.statuses?.has("concentrating") || e.statuses?.has("concentration")
  );
  if (concentrationEffect) await concentrationEffect.delete();
  await refreshBuffIndicator(actor, itemName, [], activeBuff);
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
  const groupedBuffId = buildRepeatedSaveSupportBuffId(ownerActor, activeBuff);
  const legacyBuffId = buildRepeatedSaveSupportBuffId(ownerActor, activeBuff, linkedFlag.statusId ?? null);
  return linkedFlag.buffId === groupedBuffId || linkedFlag.buffId === legacyBuffId;
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
    {
      ability: flag.save.ability,
      target: saveDc,
      targetValue: saveDc,
      dc: saveDc,
    },
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
      {
        ability: flag.save.ability,
        target: saveDc,
        targetValue: saveDc,
        dc: saveDc,
      },
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
  if (!actor?.setFlag || !activeBuff?.rememberTargetOnActivation || !newTargetToken?.actor) return false;
  const previousFlag = foundry.utils.deepClone(activeBuff);
  const previousName = getStoredTargetName(previousFlag);
  const nextName = newTargetToken.name ?? newTargetToken.actor.name;
  const updatedFlag = {
    ...activeBuff,
    targetTokenId: newTargetToken.id ?? null,
    storedTargetTokenUuid: newTargetToken.document?.uuid ?? newTargetToken.uuid ?? null,
    storedTargetActorUuid: newTargetToken.actor.uuid ?? null,
  };

  await actor.setFlag(MODULE_ID, "activeBuff", updatedFlag);
  const nextFlag = actor.getFlag(MODULE_ID, "activeBuff") ?? updatedFlag;
  await refreshStoredTargetIndicator(actor, previousFlag);
  const originName = nextFlag.originActorUuid && typeof fromUuidSync === "function"
    ? fromUuidSync(nextFlag.originActorUuid)?.name ?? actor.name
    : actor.name;
  debugLog(`[${MODULE_ID}] Cible mÃ©morisÃ©e changÃ©e : ${previousName} â†’ ${nextName}`);
  debugLog(`[${MODULE_ID}] Indicateur de marque ajoutÃ© sur ${nextName}, origine ${originName}`);
  return true;
}

export async function changeStoredTarget() {
  const ownerToken = getControlledToken();
  if (!ownerToken?.actor) return false;

  const newTargetToken = getSingleUserTarget();
  if (!newTargetToken?.actor) return false;

  const activeBuff = ownerToken.actor.getFlag(MODULE_ID, "activeBuff");
  if (!activeBuff?.rememberTargetOnActivation) {
    ui.notifications.warn(game.i18n.localize("BOT.notifications.noActiveMarkFound"));
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
    const activeBuff = actor.getFlag(MODULE_ID, "activeBuff");
    if (!activeBuff) continue;

    debugLog(`[${MODULE_ID}] Buff actif inspecté sur ${actor.name} — originActorUuid=${activeBuff.originActorUuid ?? "aucun"}`);

    const matchesOrigin = (sourceActorUuid && activeBuff.originActorUuid === sourceActorUuid)
      || (!activeBuff.originActorUuid && sourceActorId && actor.id === sourceActorId);
    if (!matchesOrigin) continue;

    const itemName = activeBuff.itemName;
    await actor.unsetFlag(MODULE_ID, "activeBuff");
    await actor.unsetFlag(MODULE_ID, "_lastDamagedTrigger");
    await refreshBuffIndicator(actor, itemName, [], activeBuff);
    removedCount += 1;
    debugLog(`[${MODULE_ID}] Concentration brisée — buff distant supprimé sur ${actor.name}`);
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
    {
      ability: activeFlag.save.ability,
      target: saveDc,
      targetValue: saveDc,
      dc: saveDc,
    },
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

export function registerTriggers() {
  registerLinkedStatusProtection();
  game.actors.forEach((actor) => refreshBuffIndicator(actor));

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
          originActorUuid: workflow.actor?.uuid ?? null,
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
        const selectedTargets = [...(game.user?.targets ?? [])];
        const selectedTargetToken = selectedTargets.length === 1 ? selectedTargets[0] ?? null : null;
        const canFallbackToSelf = targetMode === "target"
          && activeFlag.fallbackToSelfIfNoTarget === true
          && activeFlag.rememberTargetOnActivation !== true;
        const shouldRequireTarget = targetMode === "target" || activeFlag.rememberTargetOnActivation === true;
        const shouldFallbackToSelf = canFallbackToSelf && selectedTargets.length === 0;
        const effectiveTargetMode = shouldFallbackToSelf ? "self" : targetMode;
        const existingBuffs = findExistingBuffInstances(activeFlag);

        if (shouldRequireTarget && !shouldFallbackToSelf && !selectedTargetToken?.actor) {
          ui.notifications.warn(game.i18n.localize("BOT.notifications.selectExactlyOneTarget"));
          debugLog(`[${MODULE_ID}] Activation annulée — il faut exactement une cible mémorisée`);
          return;
        }

        const selfToken = workflow.token ?? workflow.actor?.getActiveTokens?.()?.[0] ?? { actor: workflow.actor };
        const activationFilterTarget = effectiveTargetMode === "target" ? selectedTargetToken : selfToken;
        if (!activationTargetMatchesFilters(activeFlag, activationFilterTarget)) {
          ui.notifications.warn(game.i18n.localize("BOT.notifications.targetRestrictionsMismatch"));
          debugLog(`[${MODULE_ID}] Activation annulée : cible hors restrictions`);
          return;
        }

        const activationSaveTarget = effectiveTargetMode === "target" ? selectedTargetToken : (shouldFallbackToSelf ? selfToken : null);
        const activationSave = await shouldApplyBuffAfterActivationSave(workflow, activeFlag, activationSaveTarget);
        if (!activationSave.shouldApply) {
          debugLog(`[${MODULE_ID}] Activation annulée — JS d'activation non satisfait`);
          return;
        }

        if (existingBuffs.length) {
          for (const existing of existingBuffs) {
            await clearExistingBuffInstance(existing.actor, existing.activeBuff);
          }
          debugLog(`[${MODULE_ID}] Ancien buff remplacÃ© : ${workflow.item.name}`);
        }

        if (effectiveTargetMode === "target") {
          activeFlag.targetTokenId = selectedTargetToken.id;
          activeFlag.storedTargetTokenUuid = selectedTargetToken.document?.uuid ?? selectedTargetToken.uuid ?? null;
          activeFlag.storedTargetActorUuid = selectedTargetToken.actor.uuid ?? null;
          await selectedTargetToken.actor.setFlag(MODULE_ID, "activeBuff", activeFlag);
          debugLog(`[${MODULE_ID}] Buff activé sur ${selectedTargetToken.actor.name} via ${workflow.item.name}, origine : ${sourceActorName}`);
          if (hasMechBuffs) {
            const changes = buildMechanicalChanges(activeFlag, selectedTargetToken.actor);
            await refreshBuffIndicator(selectedTargetToken.actor, null, changes);
          } else {
            await refreshBuffIndicator(selectedTargetToken.actor);
          }
          await applyActivationTemporaryHp(selectedTargetToken.actor, selectedTargetToken, activeFlag, workflow);
          await applyActivationStatus(selectedTargetToken.actor, selectedTargetToken, activeFlag, workflow, activationSave.saveResults);
        } else {
          if (selectedTargetToken?.actor) {
            activeFlag.targetTokenId = selectedTargetToken.id;
            activeFlag.storedTargetTokenUuid = selectedTargetToken.document?.uuid ?? selectedTargetToken.uuid ?? null;
            activeFlag.storedTargetActorUuid = selectedTargetToken.actor.uuid ?? null;
          } else if (shouldFallbackToSelf) {
            activeFlag.targetTokenId = null;
            activeFlag.storedTargetTokenUuid = null;
            activeFlag.storedTargetActorUuid = null;
          }
          await workflow.actor.setFlag(MODULE_ID, "activeBuff", activeFlag);
          debugLog(`[${MODULE_ID}] Buff activé sur ${workflow.actor.name} via ${workflow.item.name}`);
          if (hasMechBuffs) {
            const changes = buildMechanicalChanges(activeFlag, workflow.actor);
            await refreshBuffIndicator(workflow.actor, null, changes);
          } else {
            await refreshBuffIndicator(workflow.actor);
            for (const token of game.user.targets) {
              if (token.actor) await applyTargetIndicator(token.actor, activeFlag);
            }
          }
          await applyActivationTemporaryHp(workflow.actor, workflow.token ?? workflow.actor?.getActiveTokens?.()?.[0] ?? null, activeFlag, workflow);
          await applyActivationStatus(workflow.actor, workflow.token ?? workflow.actor?.getActiveTokens?.()?.[0] ?? null, activeFlag, workflow, activationSave.saveResults);
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
      if (damageTaken > 0 && shouldProcessDamagedRepeatedSave(actor, workflow, damageItem)) {
        const activeFlag = actor?.getFlag(MODULE_ID, "activeBuff");
        const repeatedSaveHandled = shouldRollRepeatedSave(activeFlag, "damaged");
        const endedByRepeatedSave = await handleRepeatedSave(actor, activeFlag, "damaged");
        if (!repeatedSaveHandled) await handleLinkedStatusRepeatedSaves(actor, "damaged");
        if (endedByRepeatedSave) return;
      }

      const flag = actor?.getFlag(MODULE_ID, "activeBuff");
      if (!flag) {
        debugLog(`[${MODULE_ID}] midi-qol.isDamaged : aucun buff actif trouvé sur ${actor.name}`);
        return;
      }
      if (flag.type !== "damaged") {
        debugLog(`[${MODULE_ID}] midi-qol.isDamaged : buff actif trouvé mais type différent de damaged (${flag.type})`);
        return;
      }

      debugLog(`[${MODULE_ID}] Déclencheur damaged sur ${actor.name}`);

      const expectedAttackType = typeof flag.receivedAttackType === "string" ? flag.receivedAttackType : "any";
      if (expectedAttackType !== "any") {
        const receivedAttackTypes = getReceivedAttackCategories(workflow, item);
        if (!receivedAttackTypes.has(expectedAttackType)) {
          debugLog(`[${MODULE_ID}] damaged bloqué par type d’attaque`);
          return;
        }
      }

      const expectedDamageTypes = Array.isArray(flag.receivedDamageTypes) ? flag.receivedDamageTypes.filter(Boolean) : [];
      if (expectedDamageTypes.length > 0) {
        const receivedDamageTypes = getReceivedDamageTypes(damageItem, workflow);
        if (!receivedDamageTypes.length) {
          debugLog(`[${MODULE_ID}] Types de dégâts reçus indisponibles pour le filtre damaged`);
        } else if (!receivedDamageTypes.some(type => expectedDamageTypes.includes(type))) {
          debugLog(`[${MODULE_ID}] damaged bloqué par type de dégâts`);
          return;
        }
      }

      debugLog(`[${MODULE_ID}] damaged autorisé`);

      const now = Date.now();
      const lastTriggered = actor.getFlag(MODULE_ID, "_lastDamagedTrigger") ?? 0;
      if (now - lastTriggered < 1000) return;
      await actor.setFlag(MODULE_ID, "_lastDamagedTrigger", now);
      const actorUuid = actor.uuid;
      const attackerTokenUuid = workflow?.token?.document?.uuid
        ?? workflow?.attackingToken?.document?.uuid
        ?? null;
      const itemUuid = item?.uuid ?? null;
      debugLog(`[${MODULE_ID}] Déclencheur damaged différé pour éviter conflit concentration`);
      window.setTimeout(async () => {
        try {
          const delayedActor = fromUuidSync(actorUuid);
          if (!delayedActor?.getFlag) return;
          const delayedFlag = delayedActor.getFlag(MODULE_ID, "activeBuff");
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
      const applied = applyFilteredIncomingAttackMode(workflow);
      incomingFilterLog("preAttackRoll result", {
        applied,
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
    const applied = fallbackWorkflow ? applyFilteredIncomingAttackMode(fallbackWorkflow, rollConfig) : false;
    incomingFilterLog("postBuildAttackRollConfig result", {
      applied,
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
    const actor = rollConfig?.subject ?? null;
    if (!actor?.uuid) return true;
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
  });

  Hooks.on("deleteActiveEffect", async (effect, options, userId) => {
    try {
      if (effect.statuses?.has("bot-active")) {
        const actor = effect.parent;
        if (!actor) return;
        const activeBuff = actor.getFlag(MODULE_ID, "activeBuff");
        const itemName = effect.name;
        await actor.unsetFlag(MODULE_ID, "activeBuff");
        await refreshBuffIndicator(actor, itemName, [], activeBuff);
        debugLog(`[${MODULE_ID}] Buff supprimé manuellement sur ${actor.name}`);
        if (activeBuff?.duration?.concentration) {
          const concentrationEffect = actor.effects.find(
            (e) => e.statuses?.has("concentrating") || e.statuses?.has("concentration")
          );
          if (concentrationEffect) {
            await concentrationEffect.delete();
            debugLog(`[${MODULE_ID}] Concentration retirée sur ${actor.name}`);
          }
        }
        return;
      }

      if (effect.statuses?.has("concentrating") || effect.statuses?.has("concentration")) {
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
    await actor.unsetFlag(MODULE_ID, "activeBuff");
    await refreshBuffIndicator(actor, flag.itemName, [], flag);
  }
}

import { MODULE_ID, BUFF_ICON, STORED_TARGET_ICON, SKILL_IDS, debugLog } from "./constants.js";
import { getFlagDurationInRounds } from "./duration.js";

const DAMAGE_LABEL_KEYS = {
  acid: "BOT.damageTypes.acid",
  bludgeoning: "BOT.damageTypes.bludgeoning",
  cold: "BOT.damageTypes.cold",
  fire: "BOT.damageTypes.fire",
  force: "BOT.damageTypes.force",
  lightning: "BOT.damageTypes.lightning",
  necrotic: "BOT.damageTypes.necrotic",
  piercing: "BOT.damageTypes.piercing",
  poison: "BOT.damageTypes.poison",
  psychic: "BOT.damageTypes.psychic",
  radiant: "BOT.damageTypes.radiant",
  slashing: "BOT.damageTypes.slashing",
  thunder: "BOT.damageTypes.thunder"
};

function localize(key) {
  return game.i18n.localize(key);
}

function localizeDamageType(type) {
  return game.i18n.localize(DAMAGE_LABEL_KEYS[type] ?? type);
}

function hasConfiguredCharges(flag) {
  const charges = Number(flag?.charges);
  return Number.isFinite(charges) && charges > 0;
}

const finalizedRollModifierRolls = new WeakSet();
const finalizedRollModifierMetadata = new WeakSet();
const finalizedRollModifierKeys = new Map();
const recentRollModifierConsumptions = new Map();

function pruneFinalizedRollModifierKeys(now = Date.now()) {
  for (const [key, timestamp] of finalizedRollModifierKeys.entries()) {
    if (now - timestamp > 1000) finalizedRollModifierKeys.delete(key);
  }
}

function pruneRecentRollModifierConsumptions(now = Date.now()) {
  for (const [key, timestamp] of recentRollModifierConsumptions.entries()) {
    if (now - timestamp > 500) recentRollModifierConsumptions.delete(key);
  }
}

function getBuffItemUuid(flag) {
  return flag?.originItemUuid ?? flag?.itemUuid ?? null;
}

function isSameActiveBuff(currentFlag, expectedFlag) {
  if (!currentFlag || !expectedFlag) return false;
  return currentFlag.originActorUuid === expectedFlag.originActorUuid
    && getBuffItemUuid(currentFlag) === getBuffItemUuid(expectedFlag)
    && currentFlag.itemName === expectedFlag.itemName;
}

function getRollModifierFinalizationKey(actor, metadata, rolls) {
  const formulas = (Array.isArray(rolls) ? rolls : [])
    .map((roll) => roll?.id ?? roll?._id ?? roll?.formula ?? roll?._formula ?? roll?.total ?? "roll")
    .join("|");
  return [
    actor?.uuid ?? "actor",
    metadata?.rollType ?? "rollType",
    metadata?.formula ?? "formula",
    formulas,
  ].join("::");
}

function getRollModifierConsumptionKey(actor, flag, metadata) {
  return [
    actor?.uuid ?? "actor",
    flag?.originActorUuid ?? "origin",
    getBuffItemUuid(flag) ?? "item",
    flag?.itemName ?? "buff",
    metadata?.formula ?? flag?.rollModifier?.formula ?? "formula",
  ].join("::");
}

function reserveRollModifierConsumption(actor, flag, metadata) {
  const now = Date.now();
  pruneRecentRollModifierConsumptions(now);
  const key = getRollModifierConsumptionKey(actor, flag, metadata);
  const previous = recentRollModifierConsumptions.get(key);
  if (previous && now - previous <= 500) return false;
  recentRollModifierConsumptions.set(key, now);
  return true;
}

async function deleteDocumentIfExists(document, context = "document") {
  if (!document || document.deleted) return false;
  try {
    await document.delete();
    return true;
  } catch (error) {
    const message = String(error?.message ?? error ?? "");
    if (message.includes("does not exist")) {
      debugLog(`[${MODULE_ID}] Suppression ignorÈe : ${context} dÈj‡ supprimÈ`, error);
      return false;
    }
    throw error;
  }
}

function hasFinalizedRollModifier(actor, metadata, rolls) {
  const rollList = Array.isArray(rolls) ? rolls : [];
  if (metadata && finalizedRollModifierMetadata.has(metadata)) return true;
  if (rollList.some((roll) => roll && typeof roll === "object" && finalizedRollModifierRolls.has(roll))) return true;

  const now = Date.now();
  pruneFinalizedRollModifierKeys(now);
  const key = getRollModifierFinalizationKey(actor, metadata, rollList);
  return finalizedRollModifierKeys.has(key);
}

function markFinalizedRollModifier(actor, metadata, rolls) {
  const rollList = Array.isArray(rolls) ? rolls : [];
  if (metadata && typeof metadata === "object") finalizedRollModifierMetadata.add(metadata);
  for (const roll of rollList) {
    if (roll && typeof roll === "object") finalizedRollModifierRolls.add(roll);
  }
  finalizedRollModifierKeys.set(getRollModifierFinalizationKey(actor, metadata, rollList), Date.now());
}
function getRemainingCharges(flag) {
  if (!hasConfiguredCharges(flag)) return null;
  const remaining = Number(flag.chargesRemaining ?? flag.charges);
  return Number.isFinite(remaining) ? Math.max(remaining, 0) : null;
}

function getChargeCountLabel(count) {
  return game.i18n.format(count === 1 ? "BOT.chat.chargeRemaining" : "BOT.chat.chargesRemaining", { count });
}

function getActiveBuffIndicatorName(activeBuff) {
  const baseName = activeBuff.itemName ?? localize("BOT.fallback.effectName");
  const remaining = getRemainingCharges(activeBuff);
  if (remaining !== null) return `${baseName} ó ${getChargeCountLabel(remaining)}`;
  return `${baseName} \u26A1`;
}

async function updateActiveBuffIndicatorName(actor, activeBuff) {
  const existing = actor?.effects?.find?.((e) => e.statuses?.has("bot-active"));
  if (!existing || existing.deleted) return;
  try {
    await existing.update({ name: getActiveBuffIndicatorName(activeBuff) });
  } catch (error) {
    debugLog(`[${MODULE_ID}] Mise ‡ jour de l'indicateur actif ignorÈe : effet dÈj‡ supprimÈ`, error);
  }
}

async function createChargeConsumptionMessage(actor, flag, remainingCharges) {
  const itemName = flag.itemName ?? localize("BOT.fallback.effectName");
  const content = remainingCharges <= 0
    ? game.i18n.format("BOT.chat.lastChargeConsumed", { name: itemName })
    : game.i18n.format("BOT.chat.chargeRemainingMessage", {
      name: itemName,
      count: remainingCharges,
      label: getChargeCountLabel(remainingCharges),
    });
  await ChatMessage.create({
    content,
    speaker: ChatMessage.getSpeaker({ actor }),
  });
}
function normalizeSaveDC(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function readNumericSaveDCFromItem(item) {
  if (!item) return null;

  const directDc = normalizeSaveDC(item.system?.save?.dc);
  if (directDc !== null) return directDc;

  const activities = item.system?.activities;
  if (activities && typeof activities === "object") {
    for (const activity of Object.values(activities)) {
      const activityDc = normalizeSaveDC(activity?.save?.dc);
      if (activityDc !== null) return activityDc;
    }
  }

  return null;
}

function readNumericSaveDCFromActor(actor) {
  if (!actor) return null;
  return normalizeSaveDC(
    actor.system?.attributes?.spell?.dc
    ?? actor.system?.attributes?.spelldc
  );
}

async function resolveActorFromUuid(uuid) {
  if (!uuid) return null;
  try {
    if (typeof fromUuidSync === "function") {
      return fromUuidSync(uuid);
    }
    if (typeof fromUuid === "function") {
      return await fromUuid(uuid);
    }
  } catch {
    return null;
  }
  return null;
}

async function resolveDocumentFromUuid(uuid) {
  if (!uuid) return null;
  try {
    if (typeof fromUuidSync === "function") {
      return fromUuidSync(uuid);
    }
    if (typeof fromUuid === "function") {
      return await fromUuid(uuid);
    }
  } catch {
    return null;
  }
  return null;
}

function resolveStoredTargetToken(flag) {
  if (!flag) return null;
  return (flag.targetTokenId ? canvas?.tokens?.get?.(flag.targetTokenId) ?? null : null)
    ?? (flag.storedTargetTokenUuid && typeof fromUuidSync === "function"
      ? fromUuidSync(flag.storedTargetTokenUuid)?.object ?? null
      : null)
    ?? null;
}

function resolveStoredTargetActor(flag) {
  const storedToken = resolveStoredTargetToken(flag);
  return storedToken?.actor
    ?? (flag.storedTargetActorUuid && typeof fromUuidSync === "function"
      ? fromUuidSync(flag.storedTargetActorUuid)
      : null)
    ?? null;
}

function shouldUseStoredTargetIndicator(ownerActor, flag) {
  if (!ownerActor || !flag?.rememberTargetOnActivation) return false;
  const storedTargetActor = resolveStoredTargetToken(flag)?.actor ?? resolveStoredTargetActor(flag);
  if (!storedTargetActor) return false;
  return storedTargetActor.uuid !== ownerActor.uuid;
}

function resolveOriginActor(flag, ownerActor = null) {
  return (flag?.originActorUuid && typeof fromUuidSync === "function"
    ? fromUuidSync(flag.originActorUuid)
    : null)
    ?? ownerActor
    ?? null;
}

function buildStoredTargetIndicatorKey(ownerActor, flag) {
  return [
    flag?.originActorUuid ?? "",
    ownerActor?.uuid ?? "",
    flag?.itemUuid ?? flag?.originItemUuid ?? "",
    flag?.storedTargetTokenUuid ?? flag?.targetTokenId ?? "",
    flag?.storedTargetActorUuid ?? "",
  ].join("|");
}

function getStoredTargetIndicatorMetadata(ownerActor, flag) {
  if (!shouldUseStoredTargetIndicator(ownerActor, flag)) return null;

  const targetToken = resolveStoredTargetToken(flag);
  const targetActor = targetToken?.actor ?? resolveStoredTargetActor(flag);
  if (!targetActor) return null;

  const originActor = resolveOriginActor(flag, ownerActor);
  const originName = originActor?.name ?? ownerActor?.name ?? localize("BOT.fallback.effectName");
  const effectName = game.i18n.format("BOT.status.markedBy", { name: originName });
  const effectImg = originActor?.prototypeToken?.texture?.src
    ?? originActor?.img
    ?? ownerActor?.prototypeToken?.texture?.src
    ?? ownerActor?.img
    ?? STORED_TARGET_ICON;

  return {
    key: buildStoredTargetIndicatorKey(ownerActor, flag),
    targetActor,
    originName,
    effectName,
    effectImg,
    effectFlags: {
      storedTargetIndicator: true,
      storedTargetIndicatorKey: buildStoredTargetIndicatorKey(ownerActor, flag),
      originActorUuid: flag?.originActorUuid ?? null,
      ownerActorUuid: ownerActor?.uuid ?? null,
      itemUuid: flag?.itemUuid ?? flag?.originItemUuid ?? null,
      storedTargetActorUuid: flag?.storedTargetActorUuid ?? null,
      storedTargetTokenUuid: flag?.storedTargetTokenUuid ?? null,
    },
  };
}

async function removeStoredTargetIndicator(ownerActor, flag) {
  const metadata = getStoredTargetIndicatorMetadata(ownerActor, flag);
  if (!metadata) return;

  const existing = metadata.targetActor.effects.filter(
    (effect) => effect.flags?.[MODULE_ID]?.storedTargetIndicator === true
      && effect.flags?.[MODULE_ID]?.storedTargetIndicatorKey === metadata.key
  );
  if (!existing.length) return;

  for (const effect of existing) {
    await effect.delete();
  }
  debugLog(`[${MODULE_ID}] Indicateur de marque retirÈ sur ${metadata.targetActor.name}, origine ${metadata.originName}`);
}

export async function refreshStoredTargetIndicator(ownerActor, previousFlag = null) {
  if (previousFlag) {
    await removeStoredTargetIndicator(ownerActor, previousFlag);
  }

  const activeBuff = ownerActor?.getFlag?.(MODULE_ID, "activeBuff") ?? null;
  const metadata = getStoredTargetIndicatorMetadata(ownerActor, activeBuff);
  if (!metadata) return;

  const legacyIndicators = metadata.targetActor.effects.filter(
    (effect) => effect.flags?.[MODULE_ID]?.storedTargetIndicator === true
      && !effect.flags?.[MODULE_ID]?.storedTargetIndicatorKey
  );
  for (const legacyEffect of legacyIndicators) {
    await legacyEffect.delete();
  }

  const existing = metadata.targetActor.effects.find(
    (effect) => effect.flags?.[MODULE_ID]?.storedTargetIndicator === true
      && effect.flags?.[MODULE_ID]?.storedTargetIndicatorKey === metadata.key
  );
  if (existing) return;

  await metadata.targetActor.createEmbeddedDocuments("ActiveEffect", [{
    name: metadata.effectName,
    img: metadata.effectImg,
    statuses: ["bot-stored-target"],
    flags: { [MODULE_ID]: metadata.effectFlags },
    duration: {},
  }]);
  debugLog(`[${MODULE_ID}] Indicateur de marque ajoutÈ sur ${metadata.targetActor.name}, origine ${metadata.originName}`);
}

async function resolveSaveDC(workflow, flag) {
  const source = flag.save?.dcSource ?? "fixed";
  const fixedDc = normalizeSaveDC(flag.save?.dc);

  if (source === "fixed") {
    if (fixedDc !== null) {
      debugLog(`[${MODULE_ID}] DD de sauvegarde rÈsolu : ${fixedDc} via fixed`);
    }
    return fixedDc;
  }

  if (source === "origin") {
    const originItem = await resolveDocumentFromUuid(flag.itemUuid) ?? workflow.item ?? null;
    const itemDc = readNumericSaveDCFromItem(originItem);
    if (itemDc !== null) {
      debugLog(`[${MODULE_ID}] DD de sauvegarde rÈsolu : ${itemDc} via origin-item`);
      return itemDc;
    }

    const originActor = await resolveActorFromUuid(flag.originActorUuid)
      ?? originItem?.actor
      ?? workflow.item?.actor
      ?? null;
    const actorDc = readNumericSaveDCFromActor(originActor);
    if (actorDc !== null) {
      debugLog(`[${MODULE_ID}] DD de sauvegarde rÈsolu : ${actorDc} via origin-actor`);
      return actorDc;
    }

    if (fixedDc !== null) {
      debugLog(`[${MODULE_ID}] DD de sauvegarde rÈsolu : ${fixedDc} via fixed-fallback`);
    }
    return fixedDc;
  }

  if (source === "owner") {
    const ownerDc = readNumericSaveDCFromActor(workflow.actor);
    if (ownerDc !== null) {
      debugLog(`[${MODULE_ID}] DD de sauvegarde rÈsolu : ${ownerDc} via owner`);
      return ownerDc;
    }

    if (fixedDc !== null) {
      debugLog(`[${MODULE_ID}] DD de sauvegarde rÈsolu : ${fixedDc} via fixed-fallback`);
    }
    return fixedDc;
  }

  if (fixedDc !== null) {
    debugLog(`[${MODULE_ID}] DD de sauvegarde rÈsolu : ${fixedDc} via fixed-fallback`);
  }
  return fixedDc;
}

function normalizeFormulaNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function readAbilityModifier(actor, ability) {
  return normalizeFormulaNumber(actor?.system?.abilities?.[ability]?.mod, 0);
}

function readProfBonus(actor) {
  return normalizeFormulaNumber(
    actor?.system?.attributes?.prof
    ?? actor?.system?.attributes?.proficiency
    ?? actor?.getRollData?.()?.prof,
    0
  );
}

function readItemBaseSpellLevel(item) {
  if (!item) return null;
  const level = normalizeFormulaNumber(
    item.system?.level
    ?? item.system?.spellLevel
    ?? item.system?.details?.level,
    NaN
  );
  return Number.isFinite(level) && level >= 0 ? level : null;
}

function buildActorFormulaSource(actor) {
  return {
    prof: readProfBonus(actor),
    str: { mod: readAbilityModifier(actor, "str") },
    dex: { mod: readAbilityModifier(actor, "dex") },
    con: { mod: readAbilityModifier(actor, "con") },
    int: { mod: readAbilityModifier(actor, "int") },
    wis: { mod: readAbilityModifier(actor, "wis") },
    cha: { mod: readAbilityModifier(actor, "cha") }
  };
}

function assignSafeRollModifierData(target, safeData) {
  target.data ??= {};
  target.data.spellLevel = safeData.spellLevel;
  target.data.prof = safeData.prof;
  target.data.str = safeData.str;
  target.data.dex = safeData.dex;
  target.data.con = safeData.con;
  target.data.int = safeData.int;
  target.data.wis = safeData.wis;
  target.data.cha = safeData.cha;
  target.data.origin = safeData.origin;
  target.data.owner = safeData.owner;
  target.data.target = safeData.target;
  target.data.attacker = safeData.attacker;
  target.data.stored = safeData.stored;
}

function buildSafeRollModifierData(actor, flag) {
  const originActor = flag.originActorUuid ? fromUuidSync(flag.originActorUuid) : null;
  const ownerActor = actor ?? null;
  const storedActor = resolveStoredTargetActor(flag);
  const sourceItem = (flag.originItemUuid ?? flag.itemUuid) ? fromUuidSync(flag.originItemUuid ?? flag.itemUuid) : null;
  const originData = buildActorFormulaSource(originActor ?? ownerActor ?? null);
  const ownerData = buildActorFormulaSource(ownerActor);
  const emptyData = buildActorFormulaSource(null);
  const storedData = buildActorFormulaSource(storedActor);
  const rawSpellLevel = flag.originSpellLevel ?? readItemBaseSpellLevel(sourceItem);
  const spellLevel = Math.max(1, normalizeFormulaNumber(rawSpellLevel, 1));

  return {
    spellLevel,
    prof: originData.prof,
    str: { mod: originData.str.mod },
    dex: { mod: originData.dex.mod },
    con: { mod: originData.con.mod },
    int: { mod: originData.int.mod },
    wis: { mod: originData.wis.mod },
    cha: { mod: originData.cha.mod },
    origin: originData,
    owner: ownerData,
    target: emptyData,
    attacker: emptyData,
    stored: storedData
  };
}


function getFirstResolvedTargetToken(workflow, flag) {
  // Multi-target workflows currently expose only the first resolved trigger target to @target.* variables.
  return [...resolveTriggerTargetTokens(workflow, flag, "formule")][0] ?? null;
}

export async function buildFormulaRollData(workflow, flag) {
  const originActor = await resolveActorFromUuid(flag.originActorUuid);
  const ownerActor = workflow.actor ?? null;
  const targetActor = getFirstResolvedTargetToken(workflow, flag)?.actor ?? null;
  const attackerActor = inferAttackerToken(workflow, ownerActor, flag.type)?.actor ?? null;
  const storedActor = resolveStoredTargetActor(flag);
  const sourceActor = originActor ?? ownerActor;
  const sourceItem = await resolveDocumentFromUuid(flag.originItemUuid ?? flag.itemUuid) ?? workflow.item ?? null;

  const baseRollData = sourceActor?.getRollData?.() ?? {};
  const rawSpellLevel = flag.originSpellLevel
    ?? workflow.castData?.castLevel
    ?? workflow.castData?.level
    ?? workflow.castLevel
    ?? workflow.activity?.castLevel
    ?? workflow.activity?.spellLevel
    ?? readItemBaseSpellLevel(sourceItem);
  const spellLevel = Math.max(1, normalizeFormulaNumber(rawSpellLevel, 1));
  const originData = buildActorFormulaSource(originActor ?? ownerActor ?? null);
  const ownerData = buildActorFormulaSource(ownerActor);
  const targetData = buildActorFormulaSource(targetActor);
  const attackerData = buildActorFormulaSource(attackerActor);
  const storedData = buildActorFormulaSource(storedActor);

  const aliasRollData = {
    spellLevel,
    prof: originData.prof,
    str: { mod: originData.str.mod },
    dex: { mod: originData.dex.mod },
    con: { mod: originData.con.mod },
    int: { mod: originData.int.mod },
    wis: { mod: originData.wis.mod },
    cha: { mod: originData.cha.mod },
    origin: originData,
    owner: ownerData,
    target: targetData,
    attacker: attackerData,
    stored: storedData
  };

  debugLog(`[${MODULE_ID}] DonnÈes de formule : spellLevel=${aliasRollData.spellLevel}, prof=${aliasRollData.prof}`);
  if (attackerActor) {
    debugLog(`[${MODULE_ID}] Source formule attacker : ${attackerActor.name}`);
  }
  return foundry.utils.mergeObject(foundry.utils.deepClone(baseRollData), aliasRollData);
}

function isWorkflowCritical(workflow) {
  return Boolean(
    workflow?.isCritical
    || workflow?.critical
    || workflow?.attackRoll?.isCritical
    || workflow?.attackRoll?.options?.critical
  );
}

function parseAdditiveFormulaTerms(formula) {
  const matches = String(formula).match(/[+-]?\s*[^+-]+/g) ?? [];
  return matches.map((term) => {
    const trimmed = term.trim();
    const sign = trimmed.startsWith("-") ? -1 : 1;
    const body = trimmed.replace(/^[+-]\s*/, "").trim();
    return { sign, body };
  }).filter((term) => term.body);
}

function formatAdditiveFormulaTerms(parts) {
  return parts.map((part, index) => {
    const value = String(part).trim();
    if (index === 0) return value.startsWith("-") ? `-${value.slice(1).trim()}` : value;
    return value.startsWith("-") ? `- ${value.slice(1).trim()}` : `+ ${value}`;
  }).join(" ");
}

function doubleDiceFormula(formula) {
  return String(formula).replace(/(^|[^0-9])(\d*)d(\d+)/gi, (match, prefix, count, faces) => {
    const diceCount = count ? Number(count) : 1;
    return `${prefix}${diceCount * 2}d${faces}`;
  });
}

function applyModifierMultiplication(formula) {
  const parts = [];
  for (const term of parseAdditiveFormulaTerms(formula)) {
    if (/^\d+(\.\d+)?$/.test(term.body)) {
      parts.push(`${term.sign < 0 ? "-" : ""}${Number(term.body) * 2}`);
    } else {
      parts.push(`${term.sign < 0 ? "-" : ""}${term.body}`);
    }
  }
  return formatAdditiveFormulaTerms(parts);
}

function maximizeBaseDiceFormula(formula, multiplyModifiers = false) {
  const parts = [];
  for (const term of parseAdditiveFormulaTerms(formula)) {
    const diceMatch = term.body.match(/^(\d*)d(\d+)$/i);
    if (diceMatch) {
      const count = diceMatch[1] ? Number(diceMatch[1]) : 1;
      const faces = Number(diceMatch[2]);
      const maxValue = count * faces;
      const reroll = `${count}d${faces}`;
      parts.push(`${term.sign < 0 ? "-" : ""}${maxValue}`);
      parts.push(`${term.sign < 0 ? "-" : ""}${reroll}`);
      continue;
    }
    if (/^\d+(\.\d+)?$/.test(term.body)) {
      const value = multiplyModifiers ? Number(term.body) * 2 : Number(term.body);
      parts.push(`${term.sign < 0 ? "-" : ""}${value}`);
      continue;
    }
    parts.push(`${term.sign < 0 ? "-" : ""}${term.body}`);
  }
  return formatAdditiveFormulaTerms(parts);
}

function getDnd5eCriticalSettings() {
  let maximizeDice = null;
  let multiplyModifiers = null;
  const detected = [];
  const settingsRegistry = game.settings?.settings;
  const hasSetting = (key) => settingsRegistry?.has?.(`dnd5e.${key}`);
  const readBooleanSetting = (key) => {
    if (!hasSetting(key)) return null;
    try {
      const value = game.settings.get("dnd5e", key);
      return typeof value === "boolean" ? value : null;
    } catch {
      return null;
    }
  };

  for (const key of ["criticalDamageMaxDice", "criticalDamageMaximizeDice", "criticalDamageMaximized"]) {
    const value = readBooleanSetting(key);
    if (value !== null) {
      maximizeDice = value;
      detected.push(`${key}=${value}`);
      break;
    }
  }

  const modifierValue = readBooleanSetting("criticalDamageModifiers");
  if (modifierValue !== null) {
    multiplyModifiers = modifierValue;
    detected.push(`criticalDamageModifiers=${modifierValue}`);
  }

  const candidates = [...(settingsRegistry?.values?.() ?? [])]
    .filter((setting) => setting.namespace === "dnd5e")
    .filter((setting) => /critical|crit|maximi[sz]e|maxdice|max-dice|maximum|max|modifier|multiply/i.test(
      `${setting.key} ${setting.name ?? ""} ${setting.hint ?? ""}`
    ));

  for (const setting of candidates) {
    try {
      const value = game.settings.get("dnd5e", setting.key);
      if (typeof value !== "boolean") continue;
      const haystack = `${setting.key} ${setting.name ?? ""} ${setting.hint ?? ""}`.toLowerCase();
      if (maximizeDice === null && /maximi[sz]e|maxdice|max-dice|maximum|max/.test(haystack)) {
        maximizeDice = value;
        detected.push(`${setting.key}=${value}`);
      }
      if (multiplyModifiers === null && /multiply.*modifier|modifier.*multiply/.test(haystack)) {
        multiplyModifiers = value;
        detected.push(`${setting.key}=${value}`);
      }
    } catch {
      // Ignore unreadable settings and keep fallback behavior.
    }
  }

  return {
    maximizeDice,
    multiplyModifiers,
    detected,
    reliable: maximizeDice !== null || multiplyModifiers !== null,
  };
}

async function sendRollMessage(actor, roll, flavor, type) {
  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor,
    flags: { [MODULE_ID]: { type } },
  });
}

function getBonusDamageApplicationMode() {
  const configuredMode = game.settings?.get?.(MODULE_ID, "bonusDamageApplicationMode");
  return ["automatic", "midiWorkflow"].includes(configuredMode)
    ? configuredMode
    : "automatic";
}

async function applyDamageWithMidiWorkflow(workflow, flag, damageType, damageTotal, targets, roll) {
  if (!targets?.size) return true;

  const DamageOnlyWorkflow = globalThis.MidiQOL?.DamageOnlyWorkflow;
  if (typeof DamageOnlyWorkflow !== "function") {
    console.warn(`[${MODULE_ID}] Workflow de dÈg‚ts Midi-QOL indisponible, retour au mode automatique`);
    return false;
  }

  const sourceActor = workflow.actor ?? workflow.item?.actor ?? [...targets][0]?.actor ?? null;
  const sourceToken = workflow.token ?? sourceActor?.getActiveTokens?.()?.[0] ?? null;

  try {
    new DamageOnlyWorkflow(
      sourceActor,
      sourceToken,
      damageTotal,
      damageType,
      targets,
      roll,
      {
        flavor: flag.itemName ?? localize("BOT.fallback.effectName"),
        isCritical: isWorkflowCritical(workflow),
      }
    );
    return true;
  } catch (error) {
    console.warn(`[${MODULE_ID}] Workflow de dÈg‚ts Midi-QOL indisponible, retour au mode automatique`, error);
    return false;
  }
}

async function createBonusDamageSummaryMessage(workflow, flag, damageType, appliedResults) {
  if (!appliedResults.length) return;

  const summaryParts = appliedResults.map((result) => {
    const typeLabel = localizeDamageType(damageType);
    if (result.outcome === "half") {
      return game.i18n.format("BOT.chat.bonusDamageSummary.half", {
        target: result.name,
        amount: result.amount,
        type: typeLabel,
      });
    }
    if (result.outcome === "none") {
      return game.i18n.format("BOT.chat.bonusDamageSummary.none", {
        target: result.name,
        type: typeLabel,
      });
    }
    return game.i18n.format("BOT.chat.bonusDamageSummary.full", {
      target: result.name,
      amount: result.amount,
      type: typeLabel,
    });
  });

  await ChatMessage.create({
    content: `<div style="border-left: 3px solid #f0a500; padding: 4px 8px;">
      <strong>${flag.itemName ?? localize("BOT.fallback.effectName")}</strong> ó ${localize("BOT.chat.bonusDamageSummary.heading")} : ${summaryParts.join(" ")}
    </div>`,
    speaker: ChatMessage.getSpeaker({ actor: workflow.actor }),
  });
}

function getWorkflowConditionTargets(workflow, condition = "hit") {
  const hitIds = new Set((workflow.hitTargets ?? []).map((t) => t.id));

  if (condition === "miss") {
    return new Set([...(workflow.targets ?? [])].filter((t) => !hitIds.has(t.id)));
  }
  if (condition === "always") {
    return workflow.targets ?? new Set();
  }
  return workflow.hitTargets ?? new Set();
}

function isTurnTriggerType(type) {
  return ["turnStart", "turnEnd", "targetTurnStart", "targetTurnEnd"].includes(type);
}

function resolveTriggerTargetTokens(workflow, flag, effectType = "effet") {
  if (isTurnTriggerType(flag.type)) {
    debugLog(`[${MODULE_ID}] Cible du dÈclenchement indisponible pour ce trigger de tour`);
    if ((flag.condition ?? "hit") !== "hit") {
      debugLog(`[${MODULE_ID}] Condition ignorÈe pour le trigger de tour (${effectType})`);
    }
    return new Set();
  }
  return getWorkflowConditionTargets(workflow, flag.condition ?? "hit");
}

function getTokenResolutionKey(token) {
  return token?.document?.uuid ?? token?.uuid ?? token?.id ?? null;
}

function collectSavingThrowTargets(workflow, flag) {
  const targets = new Map();
  const addTargets = (tokens) => {
    for (const token of tokens ?? []) {
      const key = getTokenResolutionKey(token);
      if (key) targets.set(key, token);
    }
  };

  if (flag.damage) {
    addTargets(resolveBonusDamageTargets(workflow, flag));
  }

  if (flag.status && (flag.status?.applyCondition ?? "always") !== "always") {
    addTargets(resolveStatusTargets(workflow, flag));
  }

  return new Set(targets.values());
}

async function resolveConfiguredSavingThrows(workflow, flag) {
  if (workflow._botSaveResults) return workflow._botSaveResults;

  workflow._botSaveResults = null;
  if (!flag.save?.ability) return null;

  const targets = collectSavingThrowTargets(workflow, flag);
  if (!targets.size) return null;

  const saveDc = await resolveSaveDC(workflow, flag);
  const saveResults = {
    successes: new Set(),
    failures: new Set(),
    resolvedCount: 0,
    dc: saveDc,
  };

  for (const token of targets) {
    const targetActor = token.actor;
    if (!targetActor) continue;

    if (saveDc === null) {
      const tokenKey = getTokenResolutionKey(token);
      if (tokenKey) saveResults.failures.add(tokenKey);
      continue;
    }

    const saveRolls = await targetActor.rollSavingThrow(
      {
        ability: flag.save.ability,
        // Provide DC context to dnd5e so the native save card can display target information when supported.
        target: saveDc,
        targetValue: saveDc,
        dc: saveDc
      },
      { configure: false },
      { create: true }
    );

    const tokenKey = getTokenResolutionKey(token);
    if (!saveRolls || saveRolls.length === 0 || !tokenKey) {
      if (tokenKey) saveResults.failures.add(tokenKey);
      continue;
    }

    const saveRoll = saveRolls[0];
    const success = saveRoll.total >= saveDc;
    debugLog(`[${MODULE_ID}] JS ${flag.save.ability} ${saveRoll.total} vs DD ${saveDc} √¢‚Ç¨‚Äù ${success ? "r√É¬©ussite" : "√É¬©chec"}`);
    if (success) saveResults.successes.add(tokenKey);
    else saveResults.failures.add(tokenKey);
    saveResults.resolvedCount += 1;
  }

  workflow._botSaveResults = saveResults;
  return saveResults;
}

function getCurrentTriggerUsage() {
  if (!game.combat?.id) return null;
  return {
    combatId: game.combat.id,
    round: game.combat.round ?? null,
    turn: game.combat.turn ?? null,
  };
}

export function shouldBlockTriggerFrequency(actor, flag) {
  const frequency = flag.triggerFrequency ?? "none";
  if (frequency === "none") return false;

  const currentUsage = getCurrentTriggerUsage();
  if (!currentUsage) return false;

  const lastTrigger = flag.runtime?.lastTrigger ?? null;
  if (!lastTrigger || lastTrigger.combatId !== currentUsage.combatId) return false;

  if (frequency === "turn") {
    return lastTrigger.round === currentUsage.round && lastTrigger.turn === currentUsage.turn;
  }

  if (frequency === "round") {
    return lastTrigger.round === currentUsage.round;
  }

  return false;
}

export async function markTriggerFrequencyUsage(actor) {
  const currentUsage = getCurrentTriggerUsage();
  if (!currentUsage || !actor?.setFlag) return;

  const activeBuff = actor.getFlag(MODULE_ID, "activeBuff");
  if (!activeBuff) return;

  await actor.setFlag(MODULE_ID, "activeBuff", {
    ...activeBuff,
    runtime: {
      ...(activeBuff.runtime ?? {}),
      lastTrigger: currentUsage,
    },
  });
}

export async function refreshBuffIndicator(actor, itemName = null, extraChanges = [], previousFlag = null) {
  try {
    const existing = actor.effects.find((e) => e.statuses?.has("bot-active"));
    const activeBuff = actor.getFlag(MODULE_ID, "activeBuff");

    if (existing) await deleteDocumentIfExists(existing, "indicateur actif");

    if (!activeBuff && itemName) {
      for (const token of canvas.tokens.placeables) {
        if (token.actor) await removeTargetIndicator(token.actor, itemName);
      }
    }

    if (activeBuff) {
      const durationRounds = getFlagDurationInRounds(activeBuff);
      await actor.createEmbeddedDocuments("ActiveEffect", [{
        name: getActiveBuffIndicatorName(activeBuff),
        img: activeBuff.itemImg ?? BUFF_ICON,
        statuses: ["bot-active"],
        changes: extraChanges,
        duration: durationRounds ? { rounds: durationRounds, startRound: game.combat?.round ?? 0 } : {},
        flags: { [MODULE_ID]: { indicator: true } },
      }]);
    }

    await refreshStoredTargetIndicator(actor, previousFlag);
  } catch (error) {
    console.error(`[${MODULE_ID}] Erreur dans refreshBuffIndicator :`, error);
  }
}

export async function applyTargetIndicator(targetActor, flag) {
  if (!targetActor) return;
  const itemName = flag.itemName ?? localize("BOT.fallback.effectName");
  const itemImg = flag.itemImg ?? BUFF_ICON;
  const existing = targetActor.effects.find(
    (e) => e.flags?.[MODULE_ID]?.targetIndicator === true && e.name === itemName
  );
  if (existing) return;
  await targetActor.createEmbeddedDocuments("ActiveEffect", [{
    name: itemName,
    img: itemImg,
    statuses: ["bot-target-" + (flag.itemName ?? "buff").slugify()],
    flags: { [MODULE_ID]: { targetIndicator: true } },
    duration: {},
  }]);
  debugLog(`[${MODULE_ID}] Indicateur pos√É¬© sur ${targetActor.name}`);
}

export async function removeTargetIndicator(targetActor, itemName) {
  if (!targetActor) return;
  const existing = targetActor.effects.find(
    (e) => e.flags?.[MODULE_ID]?.targetIndicator && e.name === itemName
  );
  if (existing) await deleteDocumentIfExists(existing, "indicateur actif");
}

function resolveTargets(workflow, flag) {
  const targetMode = flag.targetMode ?? "self";
  const condition = flag.condition ?? "hit";
  const hitIds = new Set((workflow.hitTargets ?? []).map((t) => t.id));

  if (targetMode === "target") {
    const token = canvas.tokens.get(flag.targetTokenId);
    if (!token) return new Set();
    const targetIds = new Set((workflow.targets ?? []).map((t) => t.id));
    if (!targetIds.has(token.id)) {
      debugLog(`[${MODULE_ID}] Mode target √¢‚Ç¨‚Äù cible fixe non vis√É¬©e, pas de d√É¬©clenchement`);
      return new Set();
    }
    if (condition === "hit" && !hitIds.has(token.id)) return new Set();
    if (condition === "miss" && hitIds.has(token.id)) return new Set();
    return new Set([token]);
  }

  // "self" et "ally" : m√É¬™me logique, les cibles viennent du workflow
  if (isTurnTriggerType(flag.type)) {
    debugLog(`[${MODULE_ID}] Cible du dÈclenchement indisponible pour ce trigger de tour`);
    if (condition !== "hit") {
      debugLog(`[${MODULE_ID}] Condition ignorÈe pour le trigger de tour (ciblage par dÈfaut)`);
    }
    return new Set();
  }
  return getWorkflowConditionTargets(workflow, condition);
}

function resolveBonusDamageTargets(workflow, flag) {
  const targetMode = flag.damage?.targetMode;
  if (!targetMode) return resolveTargets(workflow, flag);

  if (targetMode === "triggerTarget") {
    return resolveTriggerTargetTokens(workflow, flag, "dÈg‚ts bonus");
  }

  if (targetMode === "self") {
    const ownerToken = workflow.token
      ?? workflow.actor?.getActiveTokens?.()?.[0]
      ?? null;
    return ownerToken ? new Set([ownerToken]) : new Set();
  }

  if (targetMode === "attacker") {
    const attackerToken = workflow.attackerToken
      ?? (flag.type === "damaged"
        ? ([...(workflow.hitTargets ?? workflow.targets ?? [])].find((token) => token?.actor?.id !== workflow.actor?.id) ?? null)
        : null);
    if (!attackerToken && flag.type === "damaged") {
      debugLog(`[${MODULE_ID}] Attaquant introuvable pour le trigger damaged`);
      return new Set();
    }
    if (attackerToken) {
      debugLog(`[${MODULE_ID}] Cibles dÈg‚ts bonus rÈsolues : mode=attacker, cibles=${attackerToken.name}`);
    }
    return attackerToken ? new Set([attackerToken]) : new Set();
  }

  if (targetMode === "storedTarget") {
    const token = canvas.tokens.get(flag.targetTokenId);
    return token ? new Set([token]) : new Set();
  }

  return resolveTargets(workflow, flag);
}

function resolveStatusTargets(workflow, flag) {
  const targetMode = flag.status?.targetMode;
  if (!targetMode) return resolveTargets(workflow, flag);

  if (targetMode === "triggerTarget") {
    return resolveTriggerTargetTokens(workflow, flag, "statut");
  }

  if (targetMode === "self") {
    const ownerToken = workflow.token
      ?? workflow.actor?.getActiveTokens?.()?.[0]
      ?? null;
    return ownerToken ? new Set([ownerToken]) : new Set();
  }

  if (targetMode === "attacker") {
    const attackerToken = workflow.attackerToken
      ?? (flag.type === "damaged"
        ? ([...(workflow.hitTargets ?? workflow.targets ?? [])].find((token) => token?.actor?.id !== workflow.actor?.id) ?? null)
        : null);
    return attackerToken ? new Set([attackerToken]) : new Set();
  }

  if (targetMode === "storedTarget") {
    const token = canvas.tokens.get(flag.targetTokenId);
    return token ? new Set([token]) : new Set();
  }

  return resolveTargets(workflow, flag);
}

function inferAttackerToken(workflow, actor, type) {
  return workflow.attackerToken
    ?? (type === "damaged"
      ? ([...(workflow.hitTargets ?? workflow.targets ?? [])].find((token) => token?.actor?.id !== actor?.id) ?? null)
      : null);
}

function resolveHealingTargets(workflow, flag) {
  const targetMode = flag.healing?.targetMode === "target"
    ? "triggerTarget"
    : (flag.healing?.targetMode ?? "self");

  if (targetMode === "self") {
    const actorToken = workflow.token
      ?? workflow.actor?.getActiveTokens?.()?.[0]
      ?? null;
    return actorToken ? new Set([actorToken]) : new Set();
  }

  if (targetMode === "triggerTarget") {
    return resolveTriggerTargetTokens(workflow, flag, "soin bonus");
  }

  if (targetMode === "attacker") {
    const attackerToken = inferAttackerToken(workflow, workflow.actor, flag.type);
    return attackerToken ? new Set([attackerToken]) : new Set();
  }

  if (targetMode === "storedTarget") {
    const token = canvas.tokens.get(flag.targetTokenId);
    return token ? new Set([token]) : new Set();
  }

  return new Set();
}

function resolveTemporaryHpTargets(workflow, flag) {
  const targetMode = flag.temporaryHp?.targetMode === "target"
    ? "triggerTarget"
    : (flag.temporaryHp?.targetMode ?? "self");

  if (targetMode === "self") {
    const actorToken = workflow.token
      ?? workflow.actor?.getActiveTokens?.()?.[0]
      ?? null;
    return actorToken ? new Set([actorToken]) : new Set();
  }

  if (targetMode === "triggerTarget") {
    return resolveTriggerTargetTokens(workflow, flag, "PV temporaires");
  }

  if (targetMode === "attacker") {
    const attackerToken = inferAttackerToken(workflow, workflow.actor, flag.type);
    return attackerToken ? new Set([attackerToken]) : new Set();
  }

  if (targetMode === "storedTarget") {
    const token = canvas.tokens.get(flag.targetTokenId);
    return token ? new Set([token]) : new Set();
  }

  return new Set();
}

async function consumeOrDecrementCharges(workflow, flag, targets, options = {}) {
  try {
    if (flag.chargesRemaining !== null) {
      const actor = workflow.actor;
      const currentFlag = actor?.getFlag?.(MODULE_ID, "activeBuff");
      if (!isSameActiveBuff(currentFlag, flag)) {
        debugLog(`[${MODULE_ID}] Consommation ignorÈe : buff actif dÈj‡ modifiÈ ou supprimÈ`);
        return;
      }
      const currentCharges = Number(currentFlag.chargesRemaining);
      if (!Number.isFinite(currentCharges) || currentCharges <= 0) {
        debugLog(`[${MODULE_ID}] Consommation ignorÈe : charges dÈj‡ consommÈes`);
        return;
      }
      const newCharges = currentCharges - 1;
      await createChargeConsumptionMessage(actor, currentFlag, newCharges);
      debugLog(`[${MODULE_ID}] Charges restantes : ${newCharges}`);
      if (newCharges <= 0) {
        await actor?.unsetFlag(MODULE_ID, "activeBuff");
        await actor?.unsetFlag(MODULE_ID, "_lastDamagedTrigger");
        debugLog(`[${MODULE_ID}] Buff ÈpuisÈ ó toutes les charges consommÈes`);
        const mechEffects = actor?.effects.filter((e) => e.flags?.[MODULE_ID]?.mechanicalBuff === true);
        for (const e of mechEffects ?? []) await deleteDocumentIfExists(e, "effet mÈcanique");
        const concentrationEffect = actor?.effects.find(
          (e) => e.statuses?.has("concentrating") || e.statuses?.has("concentration")
        );
        if (concentrationEffect) {
          await deleteDocumentIfExists(concentrationEffect, "concentration");
          debugLog(`[${MODULE_ID}] Concentration retirÈe (charges ÈpuisÈes) sur ${actor.name}`);
        }
        await refreshBuffIndicator(actor, currentFlag.itemName, [], currentFlag);
        for (const token of targets) {
          if (token.actor) await removeTargetIndicator(token.actor, currentFlag.itemName);
        }
      } else {
        const updatedFlag = { ...currentFlag, chargesRemaining: newCharges };
        await workflow.actor?.setFlag(MODULE_ID, "activeBuff", updatedFlag);
        await updateActiveBuffIndicatorName(workflow.actor, updatedFlag);
        debugLog(`[${MODULE_ID}] ${newCharges} charge(s) restante(s) sur ${workflow.actor.name}`);
      }
    } else if ((options.forceConsume || workflow.item !== null) && flag.consumeOnTrigger !== false) {
      const actor = workflow.actor;
      const currentFlag = actor?.getFlag?.(MODULE_ID, "activeBuff");
      if (!isSameActiveBuff(currentFlag, flag)) {
        debugLog(`[${MODULE_ID}] Consommation ignorÈe : buff actif dÈj‡ modifiÈ ou supprimÈ`);
        return;
      }
      await actor?.unsetFlag(MODULE_ID, "activeBuff");
      await actor?.unsetFlag(MODULE_ID, "_lastDamagedTrigger");
      debugLog(`[${MODULE_ID}] Buff consommÈ sur ${actor?.name}`);
      const mechEffects = actor?.effects.filter((e) => e.flags?.[MODULE_ID]?.mechanicalBuff === true);
      for (const e of mechEffects ?? []) await deleteDocumentIfExists(e, "effet mÈcanique");
      const concentrationEffect = actor?.effects.find(
        (e) => e.statuses?.has("concentrating") || e.statuses?.has("concentration")
      );
      if (concentrationEffect) {
        await deleteDocumentIfExists(concentrationEffect, "concentration");
        debugLog(`[${MODULE_ID}] Concentration retirÈe sur ${actor?.name}`);
      }
      await refreshBuffIndicator(actor, currentFlag.itemName, [], currentFlag);
      for (const token of targets) {
        if (token.actor) await removeTargetIndicator(token.actor, currentFlag.itemName);
      }
    }

  } catch (error) {
    console.error(`[${MODULE_ID}] Erreur dans consumeOrDecrementCharges :`, error);
  }
}

function appendRollModifierPart(config, formula, safeData) {
  if (!config || typeof config !== "object") return false;

  const appendToRollConfig = (rollConfig) => {
    if (!rollConfig || typeof rollConfig !== "object") return false;

    if (!Array.isArray(rollConfig.parts)) rollConfig.parts = [];
    rollConfig.parts.push(formula);
    assignSafeRollModifierData(rollConfig, safeData);
    return true;
  };

  if (Array.isArray(config.rolls)) {
    const targetRoll = config.rolls.find((rollConfig) => rollConfig && typeof rollConfig === "object");
    if (appendToRollConfig(targetRoll)) return true;
  }

  return appendToRollConfig(config);
}

function getRollModifierTargets(actor, flag) {
  const targets = new Set();
  const storedTarget = flag?.targetTokenId ? canvas?.tokens?.get?.(flag.targetTokenId) : null;
  if (storedTarget) targets.add(storedTarget);
  for (const token of actor?.getActiveTokens?.() ?? []) targets.add(token);
  return targets;
}

export function applyRollModifierToConfig(actor, rollType, config, options = {}) {
  try {
    if (!actor?.getFlag) return false;
    const flag = actor.getFlag(MODULE_ID, "activeBuff");
    const rollModifier = flag?.rollModifier;
    if (!rollModifier?.enabled || !rollModifier.formula) return false;

    const rollTypes = Array.isArray(rollModifier.rollTypes) ? rollModifier.rollTypes : [];
    if (!rollTypes.includes(rollType)) {
      debugLog(`[${MODULE_ID}] Modificateur de jet ignor\u00e9 : type non compatible`);
      return false;
    }

    if (shouldBlockTriggerFrequency(actor, flag)) {
      debugLog(`[${MODULE_ID}] Modificateur de jet ignor\u00e9 : fr\u00e9quence d\u00e9j\u00e0 utilis\u00e9e`);
      return false;
    }

    const workflow = {
      actor,
      item: null,
      token: actor.getActiveTokens?.()[0] ?? null,
      targets: new Set(),
      hitTargets: new Set(),
      missedTargets: new Set(),
    };
    const safeData = buildSafeRollModifierData(actor, flag);
    if (!appendRollModifierPart(config, rollModifier.formula, safeData)) {
      console.warn(`[${MODULE_ID}] Modificateur de jet non appliqu\u00e9 : configuration dnd5e incompatible`);
      return false;
    }

    config._botRollModifier = { actorUuid: actor.uuid, rollType, formula: rollModifier.formula };
    if (options.consume !== false) {
      finalizeRollModifierApplication(actor, rollType, config._botRollModifier, [config]);
    }
    return true;
  } catch (error) {
    console.error(`[${MODULE_ID}] Erreur dans applyRollModifierToConfig :`, error);
    return false;
  }
}

function rollContainsModifierFormula(roll, formula) {
  const expected = String(formula ?? "").replace(/\s+/g, "");
  if (!expected) return false;
  const candidates = [
    roll?.formula,
    roll?._formula,
    roll?.terms?.map?.((term) => term.formula ?? term.expression ?? term.total ?? term.number)?.join("+"),
    roll?.parts?.join?.("+")
  ].filter(Boolean).map((value) => String(value).replace(/\s+/g, ""));
  return candidates.some((value) => value.includes(expected));
}

export async function finalizeRollModifierApplication(actor, rollType, metadata, rolls = []) {
  try {
    if (!actor?.getFlag || !metadata?.formula || metadata.consumed) return false;
    const rollList = Array.isArray(rolls) ? rolls : [];
    if (hasFinalizedRollModifier(actor, metadata, rollList)) {
      metadata.consumed = true;
      debugLog(`[${MODULE_ID}] Consommation roll modifier ignorÈe : dÈj‡ traitÈe`);
      return false;
    }
    if (!rollList.some((roll) => rollContainsModifierFormula(roll, metadata.formula))) {
      console.warn(`[${MODULE_ID}] Modificateur de jet non appliqu\u00e9 : configuration dnd5e incompatible`);
      return false;
    }

    markFinalizedRollModifier(actor, metadata, rollList);
    metadata.consumed = true;

    const flag = actor.getFlag(MODULE_ID, "activeBuff");
    if (!flag?.rollModifier?.enabled) return false;
    if (!reserveRollModifierConsumption(actor, flag, metadata)) {
      debugLog(`[${MODULE_ID}] Consommation roll modifier ignorÈe : dÈj‡ traitÈe`);
      return false;
    }

    const workflow = {
      actor,
      item: null,
      token: actor.getActiveTokens?.()[0] ?? null,
      targets: new Set(),
      hitTargets: new Set(),
      missedTargets: new Set(),
    };
    await markTriggerFrequencyUsage(actor);
    await consumeOrDecrementCharges(workflow, flag, getRollModifierTargets(actor, flag), { forceConsume: true });
    debugLog(`[${MODULE_ID}] Modificateur de jet appliqu\u00e9 : ${metadata.formula} sur ${rollType}`);
    return true;
  } catch (error) {
    console.error(`[${MODULE_ID}] Erreur dans finalizeRollModifierApplication :`, error);
    return false;
  }
}
export function buildMechanicalChanges(flag) {
  if (!flag.buffs) return [];
  const {
    ac,
    attackMode,
    saveMode,
    skillMode,
    skills,
    skillBonus,
    skillBonusSkills,
    skillBonusAll,
    saveBonus,
    attackBonus,
    speed,
    resistances,
    vulnerabilities,
    immunities,
    weaponProfs,
    armorProfs,
    languages,
    darkvision,
    blindsight,
    tremorsense,
    truesight,
    sensesSpecial,
    passivePerception
  } = flag.buffs;
  const changes = [];
  if (ac) changes.push({ key: "system.attributes.ac.bonus", mode: 2, value: String(ac), priority: 20 });
  if (attackMode) {
    const key = attackMode === "advantage" ? "flags.midi-qol.advantage.attack.all" : "flags.midi-qol.disadvantage.attack.all";
    changes.push({ key, mode: 5, value: "1", priority: 20 });
  }
  if (saveMode) {
    const key = saveMode === "advantage" ? "flags.midi-qol.advantage.save.all" : "flags.midi-qol.disadvantage.save.all";
    changes.push({ key, mode: 5, value: "1", priority: 20 });
  }
  if (skillMode) {
    const key = skillMode === "advantage" ? "flags.midi-qol.advantage.check.all" : "flags.midi-qol.disadvantage.check.all";
    changes.push({ key, mode: 5, value: "1", priority: 20 });
  }
  // Avantage sur les comp√É¬©tences s√É¬©lectionn√É¬©es
  if (skills?.length) {
    for (const id of skills) {
      changes.push({ key: `flags.midi-qol.advantage.skill.${id}`, mode: 5, value: "1", priority: 20 });
    }
  }
  // Bonus sur les comp√É¬©tences s√É¬©lectionn√É¬©es
  if (skillBonusSkills?.length && skillBonus) {
    for (const id of skillBonusSkills) {
      changes.push({ key: `system.skills.${id}.bonuses.check`, mode: 2, value: String(skillBonus), priority: 20 });
    }
  }
  // Bonus sur TOUTES les comp√É¬©tences
  if (skillBonusAll) {
    for (const id of SKILL_IDS) {
      changes.push({ key: `system.skills.${id}.bonuses.check`, mode: 2, value: String(skillBonusAll), priority: 20 });
    }
  }
  if (saveBonus) changes.push({ key: "system.bonuses.abilities.save", mode: 2, value: String(saveBonus), priority: 20 });
  if (attackBonus) {
    changes.push({ key: "system.bonuses.mwak.attack", mode: 2, value: String(attackBonus), priority: 20 });
    changes.push({ key: "system.bonuses.rwak.attack", mode: 2, value: String(attackBonus), priority: 20 });
  }
  if (speed?.value) changes.push({ key: `system.attributes.movement.${speed.type ?? "walk"}`, mode: 2, value: String(speed.value), priority: 20 });
  if (resistances?.length) {
    for (const type of resistances) changes.push({ key: "system.traits.dr.value", mode: 2, value: type, priority: 20 });
  }
  if (vulnerabilities?.length) {
    for (const type of vulnerabilities) changes.push({ key: "system.traits.dv.value", mode: 2, value: type, priority: 20 });
  }
  if (immunities?.length) {
    for (const type of immunities) changes.push({ key: "system.traits.di.value", mode: 2, value: type, priority: 20 });
  }
  for (const id of weaponProfs ?? []) {
    changes.push({ key: "system.traits.weaponProf.value", mode: 0, value: id, priority: 20 });
  }
  for (const id of armorProfs ?? []) {
    changes.push({ key: "system.traits.armorProf.value", mode: 0, value: id, priority: 20 });
  }
  for (const id of languages ?? []) {
    changes.push({ key: "system.traits.languages.value", mode: 0, value: id, priority: 20 });
  }
  if (darkvision) {
    changes.push({ key: "system.attributes.senses.darkvision", mode: 2, value: String(darkvision), priority: 20 });
  }
  if (blindsight) {
    changes.push({ key: "system.attributes.senses.blindsight", mode: 2, value: String(blindsight), priority: 20 });
  }
  if (tremorsense) {
    changes.push({ key: "system.attributes.senses.tremorsense", mode: 2, value: String(tremorsense), priority: 20 });
  }
  if (truesight) {
    changes.push({ key: "system.attributes.senses.truesight", mode: 2, value: String(truesight), priority: 20 });
  }
  if (sensesSpecial) {
    changes.push({ key: "system.attributes.senses.special", mode: 0, value: sensesSpecial, priority: 20 });
  }
  if (passivePerception) {
    changes.push({ key: "system.skills.prc.bonuses.passive", mode: 2, value: String(passivePerception), priority: 20 });
  }
  return changes;
}

export async function applyMechanicalBuffs(actor, flag, durationRounds) {
  try {
    const changes = buildMechanicalChanges(flag);
    if (!changes.length) return;
    const resolvedDurationRounds = getFlagDurationInRounds(flag) ?? durationRounds ?? null;
    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: flag.itemName ?? localize("BOT.fallback.effectName"),
      img: flag.itemImg ?? BUFF_ICON,
      changes,
      duration: resolvedDurationRounds ? { rounds: resolvedDurationRounds, startRound: game.combat?.round ?? 0 } : {},
      flags: { [MODULE_ID]: { mechanicalBuff: true } },
    }]);
    debugLog(`[${MODULE_ID}] Buffs mÈcaniques appliquÈs sur ${actor.name}`);
  } catch (error) {
    console.error(`[${MODULE_ID}] Erreur dans applyMechanicalBuffs :`, error);
  }
}

export async function applyBonusDamage(workflow, flag) {
  try {
    const targets = resolveBonusDamageTargets(workflow, flag);

    if (!targets?.size) {
      console.warn(`[${MODULE_ID}] applyBonusDamage : aucune cible valide (mode "${flag.damage?.targetMode ?? flag.targetMode ?? "self"}", condition "${flag.condition ?? "hit"}")`);
      return;
    }

    debugLog(`[${MODULE_ID}] Condition : ${flag.condition ?? "hit"} √¢‚Ç¨‚Äù cibles : ${targets.size}`);

    const configuredCriticalMode = game.settings.get(MODULE_ID, "bonusDamageCriticalMode");
    const criticalMode = ["system", "doubleDice", "maxBaseDice", "neverDouble"].includes(configuredCriticalMode)
      ? configuredCriticalMode
      : "system";
    const critical = isWorkflowCritical(workflow);
    let formula = flag.damage.formula;
    const damageType = flag.damage.type;
    const systemCriticalSettings = critical && criticalMode === "system"
      ? getDnd5eCriticalSettings()
      : null;
    if (systemCriticalSettings?.detected?.length) {
      debugLog(`[${MODULE_ID}] RÈglages critiques dnd5e dÈtectÈs : maximizeDice=${systemCriticalSettings.maximizeDice}, multiplyModifiers=${systemCriticalSettings.multiplyModifiers}`);
    }
    if (critical && (criticalMode === "system" || criticalMode === "doubleDice" || criticalMode === "maxBaseDice")) {
      // Bonus damage is rolled separately from native dnd5e/Midi-QOL damage resolution,
      // so "system" falls back to the standard 5e behavior: double only the dice on critical hits.
      if (criticalMode === "doubleDice") {
        formula = doubleDiceFormula(formula);
      } else if (criticalMode === "maxBaseDice") {
        formula = maximizeBaseDiceFormula(formula, false);
      } else if (systemCriticalSettings?.maximizeDice === true) {
        formula = maximizeBaseDiceFormula(formula, systemCriticalSettings.multiplyModifiers === true);
      } else if (systemCriticalSettings?.reliable) {
        formula = doubleDiceFormula(formula);
        if (systemCriticalSettings.multiplyModifiers === true) {
          formula = applyModifierMultiplication(formula);
        }
      } else {
        // Fallback if no reliable dnd5e critical setting is detectable in this system version.
        formula = doubleDiceFormula(formula);
      }
      if (formula !== flag.damage.formula) {
        debugLog(`[${MODULE_ID}] Critique : formule des d√É¬©g√É¬¢ts bonus ajust√É¬©e`);
      }
    }
    let fullTargets = targets;
    let halfTargets = new Set();
    let noDamageTargets = new Set();

    if (flag.save?.ability) {
      const saveResults = workflow._botSaveResults ?? await resolveConfiguredSavingThrows(workflow, flag);
      const saveDc = saveResults?.dc ?? null;
      fullTargets = new Set();
      halfTargets = new Set();
      noDamageTargets = new Set();
      for (const token of targets) {
        const tokenKey = getTokenResolutionKey(token);
        if (saveDc === null || !saveResults || !tokenKey) {
          fullTargets.add(token);
          continue;
        }
        if (saveResults.successes.has(tokenKey)) {
          if (flag.save.effect === "none") {
            noDamageTargets.add(token);
            continue;
          }
          if (flag.save.effect === "half") { halfTargets.add(token); continue; }
        }
        fullTargets.add(token);
      }
    }

    const bonusDamageApplicationMode = getBonusDamageApplicationMode();
    const rollData = await buildFormulaRollData(workflow, flag);
    const roll = await new Roll(formula, rollData).evaluate();

    debugLog(`[${MODULE_ID}] D√É¬©g√É¬¢ts bonus : ${roll.total} ${damageType}`);

    const halfDamage = Math.floor(roll.total / 2);
    const appliedResults = [
      ...[...fullTargets].map((token) => ({ name: token.name, amount: roll.total, outcome: "full" })),
      ...[...halfTargets].map((token) => ({ name: token.name, amount: halfDamage, outcome: "half" })),
      ...[...noDamageTargets].map((token) => ({ name: token.name, amount: 0, outcome: "none" })),
    ];

    let handledFullByMidiWorkflow = false;
    let handledHalfByMidiWorkflow = false;
    if (bonusDamageApplicationMode === "midiWorkflow") {
      handledFullByMidiWorkflow = await applyDamageWithMidiWorkflow(workflow, flag, damageType, roll.total, fullTargets, roll);
      if (halfTargets.size) {
        const halfRoll = await new Roll(String(halfDamage)).evaluate();
        handledHalfByMidiWorkflow = await applyDamageWithMidiWorkflow(workflow, flag, damageType, halfDamage, halfTargets, halfRoll);
      } else {
        handledHalfByMidiWorkflow = true;
      }
    }

    const usingAutomaticApplication = bonusDamageApplicationMode === "automatic";
    const needsAutomaticFallback = !handledFullByMidiWorkflow || !handledHalfByMidiWorkflow;
    const shouldShowModuleRoll = usingAutomaticApplication || needsAutomaticFallback;
    const shouldShowSummaryMessage = usingAutomaticApplication || needsAutomaticFallback;

    if (shouldShowModuleRoll) {
      await sendRollMessage(
        workflow.actor,
        roll,
        `${localize("BOT.chat.bonusDamageRoll")} √¢‚Ç¨‚Äù ${flag.itemName ?? localize("BOT.fallback.effectName")} (${localizeDamageType(damageType)})`,
        "bonus-damage"
      );
    }

    if (flag.type === "damaged" && needsAutomaticFallback) {
      if (!handledFullByMidiWorkflow) {
        for (const token of fullTargets) {
          if (!token.actor) continue;
          await token.actor.applyDamage(
            [{ value: roll.total, type: damageType }],
            { noConcentrationCheck: true }
          );
        }
      }
      if (!handledHalfByMidiWorkflow) {
        for (const token of halfTargets) {
          if (!token.actor) continue;
          await token.actor.applyDamage(
            [{ value: halfDamage, type: damageType }],
            { noConcentrationCheck: true }
          );
        }
      }
    } else if (needsAutomaticFallback) {
      if (typeof MidiQOL?.applyTokenDamage === "function" && fullTargets.size && !handledFullByMidiWorkflow) {
        await MidiQOL.applyTokenDamage(
          [{ damage: roll.total, type: damageType }],
          roll.total,
          fullTargets,
          workflow.item ?? null,
          new Set(),
          {
            flavor: flag.itemName ?? localize("BOT.fallback.effectName"),
            noConcentrationCheck: true
          }
        );
      }
      if (typeof MidiQOL?.applyTokenDamage === "function" && halfTargets.size && !handledHalfByMidiWorkflow) {
        await MidiQOL.applyTokenDamage(
          [{ damage: halfDamage, type: damageType }],
          halfDamage,
          halfTargets,
          workflow.item ?? null,
          new Set(),
          {
            flavor: flag.itemName ?? localize("BOT.fallback.effectName"),
            noConcentrationCheck: true
          }
        );
      } else if (typeof MidiQOL?.applyTokenDamage !== "function") {
        if (!handledFullByMidiWorkflow) {
          for (const token of fullTargets) {
            await token.actor?.applyDamage([{ value: roll.total, type: damageType }]);
          }
        }
        if (!handledHalfByMidiWorkflow) {
          for (const token of halfTargets) {
            await token.actor?.applyDamage([{ value: halfDamage, type: damageType }]);
          }
        }
      }
    }

    if (shouldShowSummaryMessage) {
      await createBonusDamageSummaryMessage(workflow, flag, damageType, appliedResults);
    }
    await consumeOrDecrementCharges(workflow, flag, targets);
  } catch (error) {
    console.error(`[${MODULE_ID}] Erreur dans applyBonusDamage :`, error);
  }
}

export async function applyStatusEffect(workflow, flag) {
  try {
    let targets = resolveStatusTargets(workflow, flag);

    if (!targets?.size) {
      console.warn(`[${MODULE_ID}] applyStatusEffect : aucune cible valide (mode "${flag.status?.targetMode ?? flag.targetMode ?? "self"}", condition "${flag.condition ?? "hit"}")`);
      return;
    }

    const statusId = flag.status.id;
    const applyCondition = flag.status?.applyCondition ?? "always";
    if (applyCondition !== "always") {
      const saveResults = workflow._botSaveResults;
      if (!saveResults || saveResults.resolvedCount <= 0) {
        debugLog(`[${MODULE_ID}] Statut ignorÈ : aucun rÈsultat de sauvegarde disponible`);
        return;
      }

      targets = new Set(
        [...targets].filter((token) => {
          const tokenKey = getTokenResolutionKey(token);
          if (!tokenKey) return false;
          if (applyCondition === "saveFailure") return saveResults.failures.has(tokenKey);
          if (applyCondition === "saveSuccess") return saveResults.successes.has(tokenKey);
          return true;
        })
      );

      if (!targets.size) return;
    }

    for (const token of targets) {
      const targetActor = token.actor;
      if (!targetActor) continue;

      await targetActor.toggleStatusEffect(statusId, { active: true });
      debugLog(`[${MODULE_ID}] Statut ${statusId} appliqu√É¬© sur ${targetActor.name}`);
    }

    if (!flag.damage) await consumeOrDecrementCharges(workflow, flag, targets);
  } catch (error) {
    console.error(`[${MODULE_ID}] Erreur dans applyStatusEffect :`, error);
  }
}

export async function applyBonusHealing(workflow, flag) {
  try {
    const targets = resolveHealingTargets(workflow, flag);

    if (!targets?.size) {
      console.warn(`[${MODULE_ID}] applyBonusHealing : aucune cible valide (mode "${flag.healing?.targetMode ?? "self"}")`);
      return;
    }

    const formula = flag.healing?.formula;
    if (!formula) return;

    const rollData = await buildFormulaRollData(workflow, flag);
    const roll = await new Roll(formula, rollData).evaluate();
    await sendRollMessage(
      workflow.actor,
      roll,
      `${localize("BOT.chat.bonusHealingRoll")} √¢‚Ç¨‚Äù ${flag.itemName ?? localize("BOT.fallback.effectName")}`,
      "bonus-healing"
    );
    const healAmount = Math.max(0, roll.total ?? 0);
    const healedTargets = [];

    for (const token of targets) {
      const targetActor = token.actor;
      if (!targetActor) continue;

      const currentHp = Number(targetActor.system.attributes.hp.value ?? 0);
      const maxHp = Number(targetActor.system.attributes.hp.max ?? 0);
      if (maxHp <= 0 || healAmount <= 0) continue;

      const newHp = Math.min(maxHp, currentHp + healAmount);
      const appliedHeal = Math.max(0, newHp - currentHp);
      if (appliedHeal <= 0) continue;

      await targetActor.update({ "system.attributes.hp.value": newHp });
      healedTargets.push({ name: targetActor.name, amount: appliedHeal });
      debugLog(`[${MODULE_ID}] Soin bonus : ${appliedHeal} PV vers ${targetActor.name}`);
    }

    if (!healedTargets.length) return;

    await ChatMessage.create({
      content: `<div style="border-left: 3px solid #2f9e44; padding: 4px 8px;">
        <strong>${flag.itemName ?? localize("BOT.fallback.effectName")}</strong> : ${healedTargets.map((target) => `${target.amount} PV vers ${target.name}`).join(", ")}
      </div>`,
      speaker: ChatMessage.getSpeaker({ actor: workflow.actor }),
    });

    if (!flag.damage && !flag.status) await consumeOrDecrementCharges(workflow, flag, targets);
  } catch (error) {
    console.error(`[${MODULE_ID}] Erreur dans applyBonusHealing :`, error);
  }
}

export async function applyTemporaryHp(workflow, flag) {
  try {
    const targets = resolveTemporaryHpTargets(workflow, flag);
    if (!targets?.size) {
      console.warn(`[${MODULE_ID}] applyTemporaryHp : aucune cible valide (mode "${flag.temporaryHp?.targetMode ?? "self"}")`);
      return;
    }

    const formula = flag.temporaryHp?.formula;
    if (!formula) return;

    const rollData = await buildFormulaRollData(workflow, flag);
    const roll = await new Roll(formula, rollData).evaluate();
    await sendRollMessage(
      workflow.actor,
      roll,
      `${localize("BOT.chat.temporaryHpRoll")} √¢‚Ç¨‚Äù ${flag.itemName ?? localize("BOT.fallback.effectName")}`,
      "temporary-hp"
    );
    const tempHpAmount = Math.max(0, roll.total ?? 0);
    if (tempHpAmount <= 0) return;

    const mode = flag.temporaryHp?.mode ?? "keepHighest";
    const updatedTargets = [];

    for (const token of targets) {
      const targetActor = token.actor;
      if (!targetActor) continue;

      const currentTemp = Number(targetActor.system.attributes.hp.temp ?? 0);
      let newTempHp = currentTemp;

      if (mode === "replace") newTempHp = tempHpAmount;
      else if (mode === "add") newTempHp = currentTemp + tempHpAmount;
      else newTempHp = Math.max(currentTemp, tempHpAmount);

      if (newTempHp === currentTemp) continue;

      await targetActor.update({ "system.attributes.hp.temp": newTempHp });
      updatedTargets.push({ name: targetActor.name, amount: newTempHp });
      debugLog(`[${MODULE_ID}] PV temporaires : ${newTempHp} vers ${targetActor.name}`);
    }

    if (!updatedTargets.length) return;

    await ChatMessage.create({
      content: `<div style="border-left: 3px solid #4c6ef5; padding: 4px 8px;">
        <strong>${flag.itemName ?? localize("BOT.fallback.effectName")}</strong> : ${updatedTargets.map((target) => `${target.amount} PV temporaires vers ${target.name}`).join(", ")}
      </div>`,
      speaker: ChatMessage.getSpeaker({ actor: workflow.actor }),
    });

    if (!flag.damage && !flag.status && !flag.healing) await consumeOrDecrementCharges(workflow, flag, targets);
  } catch (error) {
    console.error(`[${MODULE_ID}] Erreur dans applyTemporaryHp :`, error);
  }
}

export async function applyEffect(workflow, flag) {
  if (!flag.damage && !flag.status && !flag.healing && !flag.temporaryHp) {
    debugLog(`[${MODULE_ID}] Aucun effet configur√É¬© dans le flag`);
    return;
  }

  if (await shouldBlockTriggerFrequency(workflow.actor, flag)) {
    debugLog(`[${MODULE_ID}] D√É¬©clenchement ignor√É¬© : fr√É¬©quence d√É¬©j√É¬† utilis√É¬©e`);
    return;
  }

  await markTriggerFrequencyUsage(workflow.actor);
  workflow._botSaveResults = null;

  const shouldResolveSaveBeforeEffects = !!flag.save?.ability
    && (!!flag.damage || (flag.status && (flag.status?.applyCondition ?? "always") !== "always"));
  if (shouldResolveSaveBeforeEffects) {
    await resolveConfiguredSavingThrows(workflow, flag);
  }

  if (flag.damage) await applyBonusDamage(workflow, flag);
  if (flag.status) await applyStatusEffect(workflow, flag);
  if (flag.healing) await applyBonusHealing(workflow, flag);
  if (flag.temporaryHp) await applyTemporaryHp(workflow, flag);
}


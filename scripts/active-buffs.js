import { MODULE_ID, debugLog } from "./constants.js";

function clone(value) {
  return foundry.utils.deepClone(value);
}

function generateBuffId() {
  const random = foundry.utils.randomID?.(16)
    ?? globalThis.crypto?.randomUUID?.()
    ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `bot-${random}`;
}

function normalizeStackingKeyValue(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function getConfiguredStackingKey(activeFlag) {
  const explicit = normalizeStackingKeyValue(activeFlag?.stackingKey);
  if (explicit) return explicit;

  const presetId = normalizeStackingKeyValue(activeFlag?.presetMeta?.presetId);
  if (presetId) return presetId;

  const itemIdentifier = normalizeStackingKeyValue(
    activeFlag?.originItemIdentifier
      ?? activeFlag?.itemIdentifier
      ?? activeFlag?.itemSystemIdentifier
  );
  if (itemIdentifier) return itemIdentifier;

  const itemName = normalizeStackingKeyValue(activeFlag?.itemName);
  if (itemName) return itemName;

  return normalizeStackingKeyValue(activeFlag?.originItemUuid ?? activeFlag?.itemUuid);
}

export function getStackingKey(activeFlag) {
  return getConfiguredStackingKey(activeFlag);
}

export function getStackingMode(activeFlag) {
  const mode = String(activeFlag?.stackingMode ?? "").trim();
  return ["normal", "sameEffect", "noStack", "alwaysStack"].includes(mode) ? mode : "normal";
}

export function getBuffAppliedAt(activeFlag) {
  const appliedAt = Number(activeFlag?.appliedAt);
  return Number.isFinite(appliedAt) ? appliedAt : 0;
}

export function compareBuffDominance(a, b) {
  const aLevel = Number(a?.originSpellLevel ?? 0);
  const bLevel = Number(b?.originSpellLevel ?? 0);
  if (Number.isFinite(aLevel) && Number.isFinite(bLevel) && aLevel !== bLevel) return aLevel - bLevel;
  return getBuffAppliedAt(a) - getBuffAppliedAt(b);
}

export function getDominantBuffForStack(actor, stackingKey) {
  const key = normalizeStackingKeyValue(stackingKey);
  if (!key) return null;
  return Object.values(getActiveBuffs(actor))
    .filter((activeBuff) => getStackingKey(activeBuff) === key)
    .sort(compareBuffDominance)
    .at(-1) ?? null;
}

export function isDominantBuff(actor, activeFlag) {
  const key = getStackingKey(activeFlag);
  if (!key) return true;
  const dominant = getDominantBuffForStack(actor, key);
  if (!dominant) return true;
  if (activeFlag?.buffId && dominant.buffId) return activeFlag.buffId === dominant.buffId;
  return dominant === activeFlag;
}

export function getBuffStackingFlags(activeFlag) {
  return {
    stackingKey: getStackingKey(activeFlag) || null,
    stackingMode: getStackingMode(activeFlag),
    appliedAt: getBuffAppliedAt(activeFlag) || null,
  };
}

export function ensureActiveBuffId(activeFlag) {
  if (!activeFlag) return null;
  return {
    ...activeFlag,
    buffId: activeFlag.buffId ?? generateBuffId(),
    stackingKey: getStackingKey(activeFlag) || null,
    stackingMode: getStackingMode(activeFlag),
    appliedAt: getBuffAppliedAt(activeFlag) || Date.now(),
  };
}

export function getLegacyActiveBuff(actor) {
  return actor?.getFlag?.(MODULE_ID, "activeBuff") ?? null;
}

export function getActiveBuffs(actor) {
  const activeBuffs = actor?.getFlag?.(MODULE_ID, "activeBuffs");
  if (activeBuffs && typeof activeBuffs === "object" && !Array.isArray(activeBuffs)) {
    return activeBuffs;
  }

  const legacy = getLegacyActiveBuff(actor);
  if (!legacy) return {};
  const legacyWithId = legacy.buffId ? legacy : { ...legacy, buffId: "legacy-activeBuff" };
  return legacyWithId?.buffId ? { [legacyWithId.buffId]: legacyWithId } : {};
}

export function getActiveBuff(actor, buffId) {
  if (!buffId) return null;
  return getActiveBuffs(actor)?.[buffId] ?? null;
}

function indicatorNameMatchesBuff(effectName, activeBuff) {
  const itemName = String(activeBuff?.itemName ?? "").trim();
  const visibleName = String(effectName ?? "").trim();
  if (!itemName || !visibleName) return false;
  return visibleName === itemName
    || visibleName.startsWith(`${itemName} `)
    || visibleName.startsWith(`${itemName} -`);
}

function hasActiveBuffIndicator(actor, buffId, activeBuff) {
  const effects = actor?.effects ?? [];
  return effects.some((effect) => {
    if (!effect?.statuses?.has?.("bot-active")) return false;
    const effectBuffId = effect.flags?.[MODULE_ID]?.buffId ?? null;
    if (buffId && effectBuffId) return effectBuffId === buffId;
    return indicatorNameMatchesBuff(effect.name, activeBuff);
  });
}

function pruneActiveBuffsWithoutIndicators(actor, activeBuffs) {
  const entries = Object.entries(activeBuffs ?? {});
  const pruned = Object.fromEntries(entries.filter(([buffId, activeBuff]) => hasActiveBuffIndicator(actor, buffId, activeBuff)));
  return pruned;
}

function getFallbackLegacyBuff(actor, activeBuffs) {
  const remaining = Object.values(activeBuffs ?? {}).filter(Boolean);
  return remaining.length ? remaining[remaining.length - 1] : null;
}

export async function upsertActiveBuff(actor, activeFlag, { writeLegacy = true } = {}) {
  if (!actor?.setFlag || !activeFlag) return null;
  const flagWithId = ensureActiveBuffId(activeFlag);
  const activeBuffs = clone(getActiveBuffs(actor));
  activeBuffs[flagWithId.buffId] = flagWithId;
  await actor.setFlag(MODULE_ID, "activeBuffs", activeBuffs);

  // Compatibility bridge: activeBuff remains the legacy "last active buff" until dispatchers migrate.
  if (writeLegacy) await actor.setFlag(MODULE_ID, "activeBuff", flagWithId);
  debugLog(`[${MODULE_ID}] Buff actif indexe : ${flagWithId.buffId}`);
  return flagWithId;
}

export async function removeActiveBuff(actor, activeFlagOrId, { clearLegacy = true } = {}) {
  if (!actor?.unsetFlag) return;
  const buffId = typeof activeFlagOrId === "string"
    ? activeFlagOrId
    : (activeFlagOrId?.buffId ?? (activeFlagOrId ? "legacy-activeBuff" : null));
  const legacy = getLegacyActiveBuff(actor);
  const legacyBuffId = legacy?.buffId ?? (legacy ? "legacy-activeBuff" : null);
  let remainingActiveBuffs = clone(getActiveBuffs(actor));
  if (buffId) {
    if (remainingActiveBuffs[buffId]) {
      delete remainingActiveBuffs[buffId];
      remainingActiveBuffs = pruneActiveBuffsWithoutIndicators(actor, remainingActiveBuffs);
      if (Object.keys(remainingActiveBuffs).length) await actor.setFlag(MODULE_ID, "activeBuffs", remainingActiveBuffs);
      else await actor.unsetFlag(MODULE_ID, "activeBuffs");
    }
  }

  // Legacy cleanup is kept for current single-buff dispatchers.
  if (clearLegacy) {
    if (!buffId || !legacyBuffId || legacyBuffId === buffId) {
      const fallback = getFallbackLegacyBuff(actor, remainingActiveBuffs);
      if (fallback) {
        await actor.setFlag(MODULE_ID, "activeBuff", fallback);
        debugLog(`[${MODULE_ID}] Buff actif legacy promu : ${fallback.buffId ?? "sans-id"}`);
      } else {
        await actor.unsetFlag(MODULE_ID, "activeBuff");
      }
    }
  }
}

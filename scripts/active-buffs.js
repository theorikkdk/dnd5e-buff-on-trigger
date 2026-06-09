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

export function ensureActiveBuffId(activeFlag) {
  if (!activeFlag) return null;
  if (activeFlag.buffId) return activeFlag;
  return { ...activeFlag, buffId: generateBuffId() };
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

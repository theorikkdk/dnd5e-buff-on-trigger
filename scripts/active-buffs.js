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

const ACTIVE_BUFF_REMOVAL_TTL_MS = 10000;
const pendingActiveBuffRemovals = new Map();
const pendingLegacyActiveBuffMigrations = new Map();

function getActorRemovalKey(actor) {
  return actor?.uuid ?? actor?.id ?? "unknown-actor";
}

function getPendingRemovalKey(actor, buffId) {
  return `${getActorRemovalKey(actor)}:${buffId}`;
}

function getActiveBuffId(activeFlagOrId) {
  return typeof activeFlagOrId === "string"
    ? activeFlagOrId
    : (activeFlagOrId?.buffId ?? (activeFlagOrId ? "legacy-activeBuff" : null));
}

export function markActiveBuffRemoval(actor, activeFlagOrId, { ttlMs = ACTIVE_BUFF_REMOVAL_TTL_MS } = {}) {
  const buffId = getActiveBuffId(activeFlagOrId);
  if (!actor || !buffId) return null;
  const key = getPendingRemovalKey(actor, buffId);
  pendingActiveBuffRemovals.set(key, {
    buffId,
    actorKey: getActorRemovalKey(actor),
    createdAt: Date.now(),
    expiresAt: Date.now() + ttlMs,
  });
  debugLog(`[${MODULE_ID}] Buff marque en suppression : ${buffId}`);
  return buffId;
}

export function isActiveBuffRemovalPending(actor, buffId) {
  if (!actor || !buffId) return false;
  const key = getPendingRemovalKey(actor, buffId);
  const entry = pendingActiveBuffRemovals.get(key);
  if (!entry) return false;

  const rawActiveBuffs = getRawActiveBuffs(actor);
  if (rawActiveBuffs?.[buffId]) return true;

  if (Date.now() <= entry.expiresAt) return true;
  pendingActiveBuffRemovals.delete(key);
  return false;
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

export function getDamagedTriggerCooldownKey(activeFlag) {
  return activeFlag?.buffId ?? activeFlag?.itemUuid ?? activeFlag?.originItemUuid ?? "legacy";
}

export async function clearDamagedTriggerCooldown(actor, activeFlag) {
  if (!actor?.getFlag || !actor?.setFlag || !actor?.unsetFlag) return;
  const value = actor.getFlag(MODULE_ID, "_lastDamagedTrigger");
  if (value === undefined || value === null) return;

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    await actor.unsetFlag(MODULE_ID, "_lastDamagedTrigger");
    return;
  }

  const key = getDamagedTriggerCooldownKey(activeFlag);
  if (!(key in value)) return;
  const remaining = { ...value };
  delete remaining[key];
  if (Object.keys(remaining).length) {
    await actor.setFlag(MODULE_ID, "_lastDamagedTrigger", remaining);
  } else {
    await actor.unsetFlag(MODULE_ID, "_lastDamagedTrigger");
  }
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

async function runLegacyActiveBuffMigration(actor) {
  if (!actor?.getFlag || !actor?.setFlag) return null;

  const existingActiveBuffs = actor.getFlag(MODULE_ID, "activeBuffs");
  if (existingActiveBuffs !== undefined && existingActiveBuffs !== null) {
    const isActiveBuffMap = typeof existingActiveBuffs === "object" && !Array.isArray(existingActiveBuffs);
    if (!isActiveBuffMap || Object.keys(existingActiveBuffs).length) return null;
  }

  const legacy = getLegacyActiveBuff(actor);
  if (!legacy || typeof legacy !== "object" || Array.isArray(legacy)) return null;

  const buffId = String(legacy.buffId ?? "").trim() || "legacy-activeBuff";
  const migratedBuff = {
    ...clone(legacy),
    buffId,
  };
  await actor.setFlag(MODULE_ID, "activeBuffs", { [buffId]: migratedBuff });
  debugLog(`[${MODULE_ID}] Buff legacy migre vers activeBuffs : ${buffId} sur ${actor.name ?? actor.uuid ?? "acteur inconnu"}`);
  return migratedBuff;
}

export async function migrateLegacyActiveBuff(actor) {
  if (!actor?.getFlag || !actor?.setFlag) return null;
  const actorKey = actor.uuid ?? actor.id ?? null;
  if (!actorKey) return runLegacyActiveBuffMigration(actor);

  const pending = pendingLegacyActiveBuffMigrations.get(actorKey);
  if (pending) return pending;

  const migration = runLegacyActiveBuffMigration(actor);
  pendingLegacyActiveBuffMigrations.set(actorKey, migration);
  try {
    return await migration;
  } finally {
    if (pendingLegacyActiveBuffMigrations.get(actorKey) === migration) {
      pendingLegacyActiveBuffMigrations.delete(actorKey);
    }
  }
}

function getRawActiveBuffs(actor) {
  const activeBuffs = actor?.getFlag?.(MODULE_ID, "activeBuffs");
  if (activeBuffs && typeof activeBuffs === "object" && !Array.isArray(activeBuffs)) {
    return activeBuffs;
  }

  const legacy = getLegacyActiveBuff(actor);
  if (!legacy) return {};
  const legacyWithId = legacy.buffId ? legacy : { ...legacy, buffId: "legacy-activeBuff" };
  return legacyWithId?.buffId ? { [legacyWithId.buffId]: legacyWithId } : {};
}

export function getActiveBuffs(actor) {
  return Object.fromEntries(
    Object.entries(getRawActiveBuffs(actor))
      .filter(([buffId]) => !isActiveBuffRemovalPending(actor, buffId))
  );
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
  if (isActiveBuffRemovalPending(actor, buffId)) return false;
  const effects = actor?.effects ?? [];
  const activeBuffId = activeBuff?.buffId
    ?? (buffId && buffId !== "legacy-activeBuff" ? buffId : null);
  return effects.some((effect) => {
    const effectFlag = effect?.flags?.[MODULE_ID] ?? {};
    if (effectFlag.indicator !== true && !effect?.statuses?.has?.("bot-active")) return false;
    const effectBuffId = effectFlag.buffId ?? null;
    if (activeBuffId) return effectBuffId === activeBuffId;
    return !effectBuffId && indicatorNameMatchesBuff(effect.name, activeBuff);
  });
}

function shouldRetainActiveBuffEntry(actor, buffId, activeBuff, keep = new Set()) {
  if (isActiveBuffRemovalPending(actor, buffId)) return false;
  if (keep.has(buffId)) return true;
  if (activeBuff?.buffId || (buffId && buffId !== "legacy-activeBuff")) return true;
  return hasActiveBuffIndicator(actor, buffId, activeBuff);
}

function pruneActiveBuffsWithoutIndicators(actor, activeBuffs) {
  const entries = Object.entries(activeBuffs ?? {});
  const pruned = Object.fromEntries(
    entries.filter(([buffId, activeBuff]) => shouldRetainActiveBuffEntry(actor, buffId, activeBuff))
  );
  return pruned;
}

export async function pruneStaleActiveBuffs(actor, { keepBuffIds = [] } = {}) {
  if (!actor?.getFlag) return {};
  const activeBuffs = clone(getRawActiveBuffs(actor));
  const keep = new Set(keepBuffIds.filter(Boolean));
  const pruned = Object.fromEntries(
    Object.entries(activeBuffs).filter(([buffId, activeBuff]) =>
      shouldRetainActiveBuffEntry(actor, buffId, activeBuff, keep)
    )
  );

  if (Object.keys(pruned).length === Object.keys(activeBuffs).length) return activeBuffs;
  if (!actor?.setFlag || !actor?.unsetFlag) return pruned;

  if (Object.keys(pruned).length) await actor.setFlag(MODULE_ID, "activeBuffs", pruned);
  else await actor.unsetFlag(MODULE_ID, "activeBuffs");

  const legacy = getLegacyActiveBuff(actor);
  const legacyBuffId = legacy?.buffId ?? (legacy ? "legacy-activeBuff" : null);
  if (legacyBuffId && !pruned[legacyBuffId]) {
    await actor.unsetFlag(MODULE_ID, "activeBuff");
  }

  const removed = Object.keys(activeBuffs).filter((buffId) => !pruned[buffId]);
  debugLog(`[${MODULE_ID}] Entrees activeBuffs fantomes nettoyees : ${removed.join(", ") || "aucune"}`);
  return pruned;
}

export async function upsertActiveBuff(actor, activeFlag, { writeLegacy = false } = {}) {
  if (!actor?.setFlag || !activeFlag) return null;
  const flagWithId = ensureActiveBuffId(activeFlag);
  if (isActiveBuffRemovalPending(actor, flagWithId.buffId)) {
    debugLog(`[${MODULE_ID}] Upsert ignore : buff en suppression ${JSON.stringify({
      actor: actor?.name ?? null,
      actorUuid: actor?.uuid ?? null,
      buffId: flagWithId.buffId,
      stackingKey: getStackingKey(flagWithId) ?? null,
      itemName: flagWithId.itemName ?? null,
    })}`);
    return null;
  }
  const activeBuffs = clone(await pruneStaleActiveBuffs(actor));
  activeBuffs[flagWithId.buffId] = flagWithId;
  await actor.setFlag(MODULE_ID, "activeBuffs", activeBuffs);

  // Explicit compatibility escape hatch for callers that still need to seed the legacy flag.
  if (writeLegacy) await actor.setFlag(MODULE_ID, "activeBuff", flagWithId);
  debugLog(`[${MODULE_ID}] Buff actif indexe : ${flagWithId.buffId}`);
  return flagWithId;
}

export async function removeActiveBuff(actor, activeFlagOrId, { clearLegacy = true } = {}) {
  if (!actor?.unsetFlag) return;
  const buffId = markActiveBuffRemoval(actor, activeFlagOrId);
  const previousFlag = typeof activeFlagOrId === "string"
    ? getRawActiveBuffs(actor)?.[activeFlagOrId]
    : activeFlagOrId;
  const legacy = getLegacyActiveBuff(actor);
  const legacyBuffId = legacy?.buffId ?? (legacy ? "legacy-activeBuff" : null);
  let remainingActiveBuffs = clone(getRawActiveBuffs(actor));
  if (buffId) {
    if (remainingActiveBuffs[buffId]) {
      delete remainingActiveBuffs[buffId];
      remainingActiveBuffs = pruneActiveBuffsWithoutIndicators(actor, remainingActiveBuffs);
      if (Object.keys(remainingActiveBuffs).length) await actor.setFlag(MODULE_ID, "activeBuffs", remainingActiveBuffs);
      else await actor.unsetFlag(MODULE_ID, "activeBuffs");
    }
  }

  // Legacy cleanup only removes the exact legacy entry; remaining modern buffs are never promoted.
  if (clearLegacy && legacyBuffId && legacyBuffId === buffId) {
    await actor.unsetFlag(MODULE_ID, "activeBuff");
  }
}

import { MODULE_ID } from "./constants.js";

export function buildDeletedTokenBuffSnapshot({ tokenUuid = null, actorUuid = null, activeBuffs = {} } = {}) {
  const buffMap = activeBuffs && typeof activeBuffs === "object" && !Array.isArray(activeBuffs)
    ? activeBuffs
    : {};
  const buffIds = Object.entries(buffMap)
    .map(([buffId, activeBuff]) => activeBuff?.buffId ?? buffId)
    .filter(Boolean);
  return {
    tokenUuid,
    actorUuid,
    activeBuffs: buffMap,
    buffIds: [...new Set(buffIds)],
  };
}

export async function cleanupExternalBuffArtifacts(snapshot, actors, deleteArtifact) {
  const ownerActorUuid = snapshot?.actorUuid ?? null;
  const buffIds = new Set((snapshot?.buffIds ?? []).filter(Boolean));
  const removed = {
    storedTargetIndicators: 0,
    linkedStatuses: 0,
    targetIndicators: 0,
  };
  if ((!ownerActorUuid && !buffIds.size) || typeof deleteArtifact !== "function") return removed;

  for (const actor of actors ?? []) {
    if (ownerActorUuid && actor?.uuid === ownerActorUuid) continue;
    for (const effect of [...(actor?.effects ?? [])]) {
      const effectFlag = effect?.flags?.[MODULE_ID] ?? {};
      let artifactType = null;
      if (ownerActorUuid && effectFlag.storedTargetIndicator === true && effectFlag.ownerActorUuid === ownerActorUuid) {
        artifactType = "storedTargetIndicators";
      } else if (ownerActorUuid && effectFlag.linkedStatus === true && effectFlag.ownerActorUuid === ownerActorUuid) {
        artifactType = "linkedStatuses";
      } else if (effectFlag.targetIndicator === true && effectFlag.buffId && buffIds.has(effectFlag.buffId)) {
        artifactType = "targetIndicators";
      }
      if (!artifactType) continue;
      if (await deleteArtifact(effect, artifactType)) removed[artifactType] += 1;
    }
  }

  return removed;
}

function getItemPropertyValues(item) {
  const properties = item?.system?.properties;
  if (properties instanceof Set) return [...properties];
  if (Array.isArray(properties)) return properties;
  if (properties && typeof properties[Symbol.iterator] === "function") return [...properties];
  if (properties && typeof properties === "object") {
    return Object.entries(properties)
      .filter(([, enabled]) => enabled === true)
      .map(([key]) => key);
  }
  return [];
}

export function itemRequiresConcentration(item) {
  if (!item) return false;
  if (item.requiresConcentration === true) return true;
  if (item.system?.properties?.has?.("concentration")) return true;
  const properties = getItemPropertyValues(item).map((value) => String(value ?? "").toLowerCase());
  return properties.includes("concentration")
    || item.system?.components?.concentration === true
    || item.system?.concentration === true;
}

function resolveUuid(uuid) {
  if (!uuid || typeof fromUuidSync !== "function") return null;
  try {
    return fromUuidSync(uuid);
  } catch {
    return null;
  }
}

export function getConcentrationSourceActor(activeBuff, fallbackActor = null) {
  return resolveUuid(activeBuff?.originActorUuid) ?? fallbackActor ?? null;
}

export function getConcentrationOriginItem(activeBuff) {
  return resolveUuid(activeBuff?.originItemUuid ?? activeBuff?.itemUuid) ?? null;
}

export function isConcentrationBuff(activeBuff) {
  if (activeBuff?.duration?.concentration === true) return true;
  return itemRequiresConcentration(getConcentrationOriginItem(activeBuff));
}

export function getActorConcentrationEffects(actor) {
  const concentration = actor?.concentration?.effects;
  if (concentration instanceof Set) return [...concentration];
  if (Array.isArray(concentration)) return concentration;
  return actor?.effects?.filter((effect) =>
    effect.statuses?.has?.("concentrating") || effect.statuses?.has?.("concentration")
  ) ?? [];
}

function addItemReferences(references, value) {
  if (!value) return;
  if (typeof value === "string") {
    references.add(value);
    return;
  }
  for (const candidate of [
    value.uuid,
    value.id,
    value._id,
    value.data?.uuid,
    value.data?.id,
    value.data?._id,
  ]) {
    if (candidate) references.add(candidate);
  }
}

export function getConcentrationEffectItemReferences(effect) {
  const references = new Set();
  addItemReferences(references, effect?.origin);
  addItemReferences(references, effect?.getFlag?.("dnd5e", "item"));
  addItemReferences(references, effect?.flags?.dnd5e?.item);
  return references;
}

function getActiveBuffItemReferences(activeBuff) {
  const references = new Set();
  addItemReferences(references, activeBuff?.originItemUuid ?? activeBuff?.itemUuid);
  addItemReferences(references, getConcentrationOriginItem(activeBuff));
  return references;
}

function referencesMatch(left, right) {
  for (const value of left) {
    for (const other of right) {
      if (value === other) return true;
      if (value.startsWith(`${other}.`) || other.startsWith(`${value}.`)) return true;
    }
  }
  return false;
}

export function concentrationEffectMatchesBuff(effect, activeBuff, fallbackActor = null) {
  if (!effect || !activeBuff || !isConcentrationBuff(activeBuff)) return false;
  const sourceActor = getConcentrationSourceActor(activeBuff, fallbackActor);
  if (sourceActor && effect.parent && effect.parent !== sourceActor && effect.parent?.uuid !== sourceActor.uuid) {
    return false;
  }

  const effectReferences = getConcentrationEffectItemReferences(effect);
  const buffReferences = getActiveBuffItemReferences(activeBuff);
  if (!effectReferences.size || !buffReferences.size) return null;
  return referencesMatch(effectReferences, buffReferences);
}

export function findConcentrationEffectForBuff(activeBuff, fallbackActor = null) {
  if (!isConcentrationBuff(activeBuff)) return null;
  const sourceActor = getConcentrationSourceActor(activeBuff, fallbackActor);
  if (!sourceActor) return null;
  return getActorConcentrationEffects(sourceActor)
    .find((effect) => concentrationEffectMatchesBuff(effect, activeBuff, sourceActor) === true)
    ?? null;
}

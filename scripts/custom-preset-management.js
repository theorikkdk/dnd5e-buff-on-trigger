function clone(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

export function removeCustomPresetsByIds(customPresets, presetIds) {
  const remainingPresets = clone(customPresets ?? {});
  const requestedIds = [...new Set((presetIds ?? []).filter((id) => typeof id === "string" && id))];
  const removedIds = [];

  for (const id of requestedIds) {
    if (!Object.hasOwn(remainingPresets, id)) continue;
    delete remainingPresets[id];
    removedIds.push(id);
  }

  return {
    customPresets: remainingPresets,
    removedIds,
    removedCount: removedIds.length,
  };
}

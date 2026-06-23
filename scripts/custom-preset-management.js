function clone(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

export function removeCustomPresetsByIds(customPresets, presetIds) {
  const remainingPresets = clone(customPresets ?? {});
  const requestedIds = [...new Set((presetIds ?? []).filter((id) => typeof id === "string" && id))];
  const removedIds = [];

  for (const id of requestedIds) {
    const settingKey = Object.entries(remainingPresets)
      .find(([key, preset]) => key === id || preset?.id === id)?.[0];
    if (!settingKey) continue;
    delete remainingPresets[settingKey];
    removedIds.push(id);
  }

  return {
    customPresets: remainingPresets,
    removedIds,
    removedCount: removedIds.length,
  };
}

export function selectCustomPresetsForExport(customPresets, visiblePresetIds, selectedPresetIds = null) {
  const entries = Object.entries(customPresets ?? {});
  const byId = new Map();
  for (const [settingKey, preset] of entries) {
    byId.set(settingKey, preset);
    if (preset?.id) byId.set(preset.id, preset);
  }

  const visibleIds = [...new Set((visiblePresetIds ?? []).filter((id) => typeof id === "string" && id))];
  const selectedSet = selectedPresetIds === null
    ? null
    : new Set((selectedPresetIds ?? []).filter((id) => typeof id === "string" && id));
  const presets = [];
  const exportedIds = [];

  for (const id of visibleIds) {
    if (selectedSet && !selectedSet.has(id)) continue;
    const preset = byId.get(id);
    if (!preset || typeof preset !== "object" || Array.isArray(preset)) continue;
    presets.push(clone(preset));
    exportedIds.push(id);
  }

  return {
    presets,
    exportedIds,
    exportedCount: presets.length,
  };
}

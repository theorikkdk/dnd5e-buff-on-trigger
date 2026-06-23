export const PRESET_GROUP_ORDER = Object.freeze(["builtIn", "custom", "test"]);

function normalizeSearchText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase()
    .trim();
}

export function getPresetGroupKey(preset) {
  if (preset?.isTestPreset === true || preset?.presetType === "test") return "test";
  if (preset?.source === "custom" || preset?.presetType === "custom") return "custom";
  return "builtIn";
}

export function buildPresetSearchView(presets, {
  query = "",
  showTestPresets = true,
} = {}) {
  const available = (Array.isArray(presets) ? presets : [])
    .filter((preset) => preset?.id && preset?.label)
    .filter((preset) => showTestPresets || getPresetGroupKey(preset) !== "test");
  const normalizedQuery = normalizeSearchText(query);
  const visible = normalizedQuery
    ? available.filter((preset) => normalizeSearchText([
      preset.label,
      preset.description,
      preset.searchText,
      preset.triggerType,
      preset.presetType,
      preset.source,
    ].join(" ")).includes(normalizedQuery))
    : available;
  const groups = PRESET_GROUP_ORDER
    .map((key) => ({
      key,
      presets: visible.filter((preset) => getPresetGroupKey(preset) === key),
    }))
    .filter((group) => group.presets.length > 0);

  return {
    groups,
    totalCount: available.length,
    visibleCount: visible.length,
    hiddenCount: available.length - visible.length,
  };
}

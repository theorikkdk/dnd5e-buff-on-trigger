import { MODULE_ID } from "./constants.js";

const ROUND_UNIT_MULTIPLIERS = {
  round: 1,
  rounds: 1,
  r: 1,
  rd: 1,
  turn: 1,
  turns: 1,
  minute: 10,
  minutes: 10,
  m: 10,
  hour: 600,
  hours: 600,
  h: 600,
  day: 14400,
  days: 14400,
  d: 14400,
};

export function getItemDurationInRounds(item) {
  const value = Number(item?.system?.duration?.value ?? 0);
  const units = String(item?.system?.duration?.units ?? "").toLowerCase();

  if (!value || !Number.isFinite(value)) return null;
  if (!units || ["inst", "instant", "permanent", "perm", "special", "spec"].includes(units)) return null;

  const multiplier = ROUND_UNIT_MULTIPLIERS[units];
  if (!multiplier) return null;

  return Math.max(0, Math.round(value * multiplier)) || null;
}

export function buildItemDurationData(item) {
  const rounds = getItemDurationInRounds(item);
  return rounds !== null ? { rounds, source: "item" } : null;
}

export function getFlagDurationInRounds(flag, item = null) {
  const itemRounds = getItemDurationInRounds(item);
  if (itemRounds !== null) return itemRounds;

  if (flag?.itemUuid) {
    const linkedItem = fromUuidSync(flag.itemUuid);
    const linkedRounds = getItemDurationInRounds(linkedItem);
    if (linkedRounds !== null) return linkedRounds;
  }

  if (flag?.duration?.source === "item") return null;

  return flag?.duration?.rounds ?? null;
}

export async function syncItemDurationFlag(item, options = {}) {
  if (options?.dnd5eBuffOnTriggerDurationSync) return;

  const config = item?.getFlag(MODULE_ID, "buffTrigger");
  if (!config) return;

  const nextConfig = foundry.utils.deepClone(config);
  const duration = buildItemDurationData(item);

  if (duration) {
    nextConfig.duration = duration;
    await item.update({
      [`flags.${MODULE_ID}.buffTrigger`]: nextConfig,
    }, {
      dnd5eBuffOnTriggerDurationSync: true,
    });
    return;
  }

  delete nextConfig.duration;
  await item.update({
    [`flags.${MODULE_ID}.buffTrigger`]: nextConfig,
    [`flags.${MODULE_ID}.buffTrigger.-=duration`]: null,
  }, {
    dnd5eBuffOnTriggerDurationSync: true,
  });
}

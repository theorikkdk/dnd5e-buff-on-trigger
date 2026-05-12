import { MODULE_ID, ABILITY_IDS, SKILL_IDS, DAMAGE_TYPES, CONDITION_IDS, ARMOR_PROF_IDS, WEAPON_PROF_IDS, LANGUAGE_IDS, ATTACK_TRIGGER_TYPES, debugLog } from "./constants.js";

import { buildItemDurationData, getItemDurationInRounds } from "./duration.js";
import { BUFF_PRESETS } from "./presets.js";

const getSkillLabels = () => ({
  acr: game.i18n.localize("BOT.skills.acr"),
  ani: game.i18n.localize("BOT.skills.ani"),
  arc: game.i18n.localize("BOT.skills.arc"),
  ath: game.i18n.localize("BOT.skills.ath"),
  dec: game.i18n.localize("BOT.skills.dec"),
  his: game.i18n.localize("BOT.skills.his"),
  ins: game.i18n.localize("BOT.skills.ins"),
  itm: game.i18n.localize("BOT.skills.itm"),
  inv: game.i18n.localize("BOT.skills.inv"),
  med: game.i18n.localize("BOT.skills.med"),
  nat: game.i18n.localize("BOT.skills.nat"),
  prc: game.i18n.localize("BOT.skills.prc"),
  prf: game.i18n.localize("BOT.skills.prf"),
  per: game.i18n.localize("BOT.skills.per"),
  rel: game.i18n.localize("BOT.skills.rel"),
  slt: game.i18n.localize("BOT.skills.slt"),
  ste: game.i18n.localize("BOT.skills.ste"),
  sur: game.i18n.localize("BOT.skills.sur")
});

const getDamageLabels = () => ({
  acid: game.i18n.localize("BOT.damageTypes.acid"),
  bludgeoning: game.i18n.localize("BOT.damageTypes.bludgeoning"),
  cold: game.i18n.localize("BOT.damageTypes.cold"),
  fire: game.i18n.localize("BOT.damageTypes.fire"),
  force: game.i18n.localize("BOT.damageTypes.force"),
  lightning: game.i18n.localize("BOT.damageTypes.lightning"),
  necrotic: game.i18n.localize("BOT.damageTypes.necrotic"),
  piercing: game.i18n.localize("BOT.damageTypes.piercing"),
  poison: game.i18n.localize("BOT.damageTypes.poison"),
  psychic: game.i18n.localize("BOT.damageTypes.psychic"),
  radiant: game.i18n.localize("BOT.damageTypes.radiant"),
  slashing: game.i18n.localize("BOT.damageTypes.slashing"),
  thunder: game.i18n.localize("BOT.damageTypes.thunder")
});

const getWeaponProfLabels = () => ({
  sim: game.i18n.localize("BOT.weaponProficiencies.sim"),
  mar: game.i18n.localize("BOT.weaponProficiencies.mar"),
  longsword: game.i18n.localize("BOT.weaponProficiencies.longsword"),
  shortsword: game.i18n.localize("BOT.weaponProficiencies.shortsword"),
  dagger: game.i18n.localize("BOT.weaponProficiencies.dagger"),
  handaxe: game.i18n.localize("BOT.weaponProficiencies.handaxe"),
  greataxe: game.i18n.localize("BOT.weaponProficiencies.greataxe"),
  battleaxe: game.i18n.localize("BOT.weaponProficiencies.battleaxe"),
  mace: game.i18n.localize("BOT.weaponProficiencies.mace"),
  warhammer: game.i18n.localize("BOT.weaponProficiencies.warhammer"),
  spear: game.i18n.localize("BOT.weaponProficiencies.spear"),
  quarterstaff: game.i18n.localize("BOT.weaponProficiencies.quarterstaff"),
  bow: game.i18n.localize("BOT.weaponProficiencies.bow"),
  crossbow: game.i18n.localize("BOT.weaponProficiencies.crossbow")
});

const getArmorProfLabels = () => ({
  lgt: game.i18n.localize("BOT.armorProficiencies.lgt"),
  med: game.i18n.localize("BOT.armorProficiencies.med"),
  hvy: game.i18n.localize("BOT.armorProficiencies.hvy"),
  shl: game.i18n.localize("BOT.armorProficiencies.shl")
});

const getLanguageLabels = () => ({
  common: game.i18n.localize("BOT.languages.common"),
  elvish: game.i18n.localize("BOT.languages.elvish"),
  dwarvish: game.i18n.localize("BOT.languages.dwarvish"),
  orcish: game.i18n.localize("BOT.languages.orcish"),
  draconic: game.i18n.localize("BOT.languages.draconic"),
  infernal: game.i18n.localize("BOT.languages.infernal"),
  celestial: game.i18n.localize("BOT.languages.celestial"),
  abyssal: game.i18n.localize("BOT.languages.abyssal"),
  undercommon: game.i18n.localize("BOT.languages.undercommon"),
  gnomish: game.i18n.localize("BOT.languages.gnomish"),
  halfling: game.i18n.localize("BOT.languages.halfling"),
  goblin: game.i18n.localize("BOT.languages.goblin"),
  sylvan: game.i18n.localize("BOT.languages.sylvan"),
  primordial: game.i18n.localize("BOT.languages.primordial"),
  deep: game.i18n.localize("BOT.languages.deep")
});

const isFilled = value => {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.trim() !== "";
  return value !== null && value !== undefined && value !== "";
};

const listSelectedLabels = (values, labels) => (values ?? [])
  .map(value => labels[value] ?? value)
  .filter(Boolean)
  .join(", ");

function getTriggerLabel(type) {
  if (!type) return game.i18n.localize("BOT.ui.summary.notConfigured");
  return game.i18n.localize(`BOT.ui.trigger.${type}`);
}

function normalizeGlobalTargetMode(targetMode) {
  if (targetMode === "ally") return "target";
  return targetMode ?? "self";
}

function getTargetModeLabel(targetMode) {
  const normalizedTargetMode = normalizeGlobalTargetMode(targetMode);
  return game.i18n.localize(`BOT.ui.targetMode.${normalizedTargetMode === "target" ? "target" : "self"}`);
}

function getConditionLabel(condition) {
  return game.i18n.localize(`BOT.ui.condition.${condition ?? "hit"}`);
}

function getHealingTargetModeLabel(targetMode) {
  return game.i18n.localize(`BOT.ui.healing.targetMode.${normalizeHealingTargetMode(targetMode)}`);
}

function getTemporaryHpTargetModeLabel(targetMode) {
  return game.i18n.localize(`BOT.ui.temporaryHp.targetMode.${normalizeTemporaryHpTargetMode(targetMode)}`);
}

function getTemporaryHpModeLabel(mode) {
  return game.i18n.localize(`BOT.ui.temporaryHp.mode.${mode ?? "keepHighest"}`);
}

function getTemporaryHpTimingLabel(timing) {
  return game.i18n.localize(`BOT.ui.temporaryHp.timing.${timing ?? "trigger"}`);
}


function getRollModifierTypeLabel(type) {
  return game.i18n.localize(`BOT.ui.rollModifier.rollTypes.${type}`);
}

function getRollModifierTypesLabel(types = []) {
  return types.map(getRollModifierTypeLabel).filter(Boolean).join(", ");
}

function getTriggerFrequencyLabel(frequency) {
  return game.i18n.localize(`BOT.ui.triggerFrequency.${frequency ?? "none"}`);
}

function getChargesSummary(charges) {
  if (!isFilled(charges) || Number(charges) <= 0) return game.i18n.localize("BOT.ui.chargeSummary.none");
  const count = Number(charges);
  return game.i18n.format(count === 1 ? "BOT.ui.chargeSummary.one" : "BOT.ui.chargeSummary.many", { count });
}

function getDamageTargetModeLabel(targetMode) {
  return game.i18n.localize(`BOT.ui.damage.targetMode.${targetMode ?? "legacy"}`);
}

function getStatusTargetModeLabel(targetMode) {
  return game.i18n.localize(`BOT.ui.status.targetMode.${targetMode ?? "legacy"}`);
}

function getStatusApplyConditionLabel(condition) {
  return game.i18n.localize(`BOT.ui.status.applyCondition.${condition ?? "always"}`);
}

function getSaveDcSourceLabel(source) {
  return game.i18n.localize(`BOT.ui.saveDcSource.${source ?? "fixed"}`);
}

function getSaveTimingLabel(timing) {
  return game.i18n.localize(`BOT.ui.saveTiming.${timing ?? "trigger"}`);
}

function getActivationApplyOnLabel(value) {
  return game.i18n.localize(`BOT.ui.activationApplyOn.${value ?? "failure"}`);
}
function getAbilityLabel(ability) {
  return ability ? game.i18n.localize(`BOT.abilities.${ability}`) : game.i18n.localize("BOT.ui.none");
}

function getAbilityLabels() {
  return Object.fromEntries(ABILITY_IDS.map((id) => [id, getAbilityLabel(id)]));
}

function getAbilityOptions(selected = []) {
  const selectedSet = new Set(selected ?? []);
  return ABILITY_IDS.map((id) => ({ value: id, label: getAbilityLabel(id), selected: selectedSet.has(id) }));
}

function normalizeHealingTargetMode(targetMode) {
  return targetMode === "target" ? "triggerTarget" : (targetMode ?? "self");
}

function normalizeTemporaryHpTargetMode(targetMode) {
  return targetMode === "target" ? "triggerTarget" : (targetMode ?? "self");
}

function getReceivedAttackTypeLabel(type) {
  return game.i18n.localize(`BOT.ui.receivedAttackType.${type ?? "any"}`);
}

function getStatusOptions(currentStatusId = null) {
  const options = (CONFIG.statusEffects ?? [])
    .map((status) => {
      const id = status.id ?? status.statuses?.[0] ?? null;
      if (!id || id === "bot-active" || id === "bot-stored-target") return null;
      const rawLabel = status.name ?? status.label ?? id;
      const label = game.i18n.localize(rawLabel);
      return {
        value: id,
        label,
        icon: status.img ?? status.icon ?? null,
        selected: id === currentStatusId,
      };
    })
    .filter(Boolean);

  if (currentStatusId && !options.some((option) => option.value === currentStatusId)) {
    options.unshift({
      value: currentStatusId,
      label: game.i18n.format("BOT.ui.status.unknown", { id: currentStatusId }),
      icon: null,
      selected: true,
    });
  }

  return options;
}

function getConditionImmunityOptions(selected = []) {
  const selectedSet = new Set(selected ?? []);
  const byId = new Map();
  for (const id of CONDITION_IDS) {
    byId.set(id, { value: id, label: game.i18n.localize(`BOT.condition.${id}`), selected: selectedSet.has(id) });
  }
  for (const status of CONFIG.statusEffects ?? []) {
    const id = status.id ?? status.statuses?.[0] ?? null;
    if (!id || id === "bot-active" || id === "bot-stored-target") continue;
    if (!CONDITION_IDS.includes(id)) continue;
    const rawLabel = status.name ?? status.label ?? id;
    byId.set(id, { value: id, label: game.i18n.localize(rawLabel), selected: selectedSet.has(id) });
  }
  return [...byId.values()].sort((a, b) => a.label.localeCompare(b.label));
}
function formatItemDurationSummary(rounds, fallbackRounds = null) {
  const syncedRounds = rounds ?? fallbackRounds;
  if (syncedRounds === null || syncedRounds === undefined) {
    return game.i18n.localize("BOT.ui.duration.none");
  }
  return game.i18n.format("BOT.ui.duration.syncedValue", { rounds: syncedRounds });
}

function getLegacyDurationFallback(raw, itemDurationRounds) {
  if (itemDurationRounds !== null) return null;
  if (raw.duration?.source === "item") return null;
  return raw.duration?.rounds ?? null;
}

function hasMechanicalChanges(buffs = {}) {
  return [
    buffs.ac,
    buffs.attackMode,
    buffs.saveMode,
    buffs.skillMode,
    buffs.skillBonus,
    buffs.skillBonusAll,
    buffs.saveBonus,
    buffs.attackBonus,
    buffs.speed?.value,
    buffs.darkvision,
    buffs.blindsight,
    buffs.tremorsense,
    buffs.truesight,
    buffs.sensesSpecial,
    buffs.passivePerception,
  ].some(isFilled)
    || (buffs.abilityCheckAdvantages ?? []).length > 0
    || (buffs.abilityCheckDisadvantages ?? []).length > 0
    || (buffs.savingThrowAdvantages ?? []).length > 0
    || (buffs.savingThrowDisadvantages ?? []).length > 0
    || (buffs.skills ?? []).length > 0
    || (buffs.skillBonusSkills ?? []).length > 0
    || (buffs.resistances ?? []).length > 0
    || (buffs.vulnerabilities ?? []).length > 0
    || (buffs.immunities ?? []).length > 0
    || (buffs.conditionImmunities ?? []).length > 0
    || (buffs.weaponProfs ?? []).length > 0
    || (buffs.armorProfs ?? []).length > 0
    || (buffs.languages ?? []).length > 0;
}

function buildMechanicalSummary(raw, labels) {
  const buffs = raw.buffs ?? {};
  const entries = [];
  const addEntry = (text) => {
    if (text) entries.push(text);
  };

  if (isFilled(buffs.ac)) addEntry(`${game.i18n.localize("BOT.ui.combat.acBonus")} ${buffs.ac}`);
  if (isFilled(buffs.attackMode)) addEntry(`${game.i18n.localize("BOT.ui.combat.attackRolls")} : ${game.i18n.localize(`BOT.ui.common.${buffs.attackMode}`)}`);
  if (isFilled(buffs.saveMode)) addEntry(`${game.i18n.localize("BOT.ui.combat.saveRolls")} : ${game.i18n.localize(`BOT.ui.common.${buffs.saveMode}`)}`);
  if (isFilled(buffs.skillMode)) addEntry(`${game.i18n.localize("BOT.ui.combat.abilityRolls")} : ${game.i18n.localize(`BOT.ui.common.${buffs.skillMode}`)}`);
  if ((buffs.abilityCheckAdvantages ?? []).length) addEntry(`${game.i18n.localize("BOT.ui.abilities.checkAdvantage")} : ${listSelectedLabels(buffs.abilityCheckAdvantages, labels.abilities)}`);
  if ((buffs.abilityCheckDisadvantages ?? []).length) addEntry(`${game.i18n.localize("BOT.ui.abilities.checkDisadvantage")} : ${listSelectedLabels(buffs.abilityCheckDisadvantages, labels.abilities)}`);
  if ((buffs.savingThrowAdvantages ?? []).length) addEntry(`${game.i18n.localize("BOT.ui.abilities.saveAdvantage")} : ${listSelectedLabels(buffs.savingThrowAdvantages, labels.abilities)}`);
  if ((buffs.savingThrowDisadvantages ?? []).length) addEntry(`${game.i18n.localize("BOT.ui.abilities.saveDisadvantage")} : ${listSelectedLabels(buffs.savingThrowDisadvantages, labels.abilities)}`);
  if ((buffs.skills ?? []).length) addEntry(`${game.i18n.localize("BOT.ui.skills.advantage")} : ${listSelectedLabels(buffs.skills, labels.skills)}`);
  if ((buffs.skillBonusSkills ?? []).length && isFilled(buffs.skillBonus)) {
    addEntry(`${game.i18n.localize("BOT.ui.skills.bonus")} : ${listSelectedLabels(buffs.skillBonusSkills, labels.skills)} (${buffs.skillBonus})`);
  }
  if (isFilled(buffs.skillBonusAll)) addEntry(`${game.i18n.localize("BOT.ui.skills.bonusAll")} : ${buffs.skillBonusAll}`);
  if (isFilled(buffs.attackBonus)) addEntry(`${game.i18n.localize("BOT.ui.combat.attackBonus")} : ${buffs.attackBonus}`);
  if (isFilled(buffs.saveBonus)) addEntry(`${game.i18n.localize("BOT.ui.combat.saveBonus")} : ${buffs.saveBonus}`);
  if (isFilled(buffs.speed?.value)) {
    addEntry(`${game.i18n.localize("BOT.ui.capacities.speed")} : ${buffs.speed.value} ${game.i18n.localize("BOT.ui.units.feet")} (${game.i18n.localize(`BOT.ui.capacities.speedTypes.${buffs.speed.type ?? "walk"}`)})`);
  }
  if ((buffs.resistances ?? []).length) addEntry(`${game.i18n.localize("BOT.ui.defense.resistances")} : ${listSelectedLabels(buffs.resistances, labels.damageTypes)}`);
  if ((buffs.vulnerabilities ?? []).length) addEntry(`${game.i18n.localize("BOT.ui.defense.vulnerabilities")} : ${listSelectedLabels(buffs.vulnerabilities, labels.damageTypes)}`);
  if ((buffs.immunities ?? []).length) addEntry(`${game.i18n.localize("BOT.ui.defense.immunities")} : ${listSelectedLabels(buffs.immunities, labels.damageTypes)}`);
  if ((buffs.conditionImmunities ?? []).length) addEntry(`${game.i18n.localize("BOT.ui.defense.conditionImmunities")} : ${listSelectedLabels(buffs.conditionImmunities, labels.conditions)}`);
  if ((buffs.weaponProfs ?? []).length) addEntry(`${game.i18n.localize("BOT.ui.capacities.weaponProficiencies")} : ${listSelectedLabels(buffs.weaponProfs, labels.weaponProfs)}`);
  if ((buffs.armorProfs ?? []).length) addEntry(`${game.i18n.localize("BOT.ui.capacities.armorProficiencies")} : ${listSelectedLabels(buffs.armorProfs, labels.armorProfs)}`);
  if ((buffs.languages ?? []).length) addEntry(`${game.i18n.localize("BOT.ui.capacities.languages")} : ${listSelectedLabels(buffs.languages, labels.languages)}`);
  if (isFilled(buffs.darkvision)) addEntry(`${game.i18n.localize("BOT.ui.capacities.senses.darkvision")} : ${buffs.darkvision} ${game.i18n.localize("BOT.ui.units.feet")}`);
  if (isFilled(buffs.blindsight)) addEntry(`${game.i18n.localize("BOT.ui.capacities.senses.blindsight")} : ${buffs.blindsight} ${game.i18n.localize("BOT.ui.units.feet")}`);
  if (isFilled(buffs.tremorsense)) addEntry(`${game.i18n.localize("BOT.ui.capacities.senses.tremorsense")} : ${buffs.tremorsense} ${game.i18n.localize("BOT.ui.units.feet")}`);
  if (isFilled(buffs.truesight)) addEntry(`${game.i18n.localize("BOT.ui.capacities.senses.truesight")} : ${buffs.truesight} ${game.i18n.localize("BOT.ui.units.feet")}`);
  if (isFilled(buffs.sensesSpecial)) addEntry(`${game.i18n.localize("BOT.ui.capacities.senses.special")} : ${buffs.sensesSpecial}`);
  if (isFilled(buffs.passivePerception)) addEntry(`${game.i18n.localize("BOT.ui.capacities.passivePerception")} : ${buffs.passivePerception}`);

  return entries;
}

function buildConfigSummary(raw, labels, itemDurationRounds) {
  const legacyDurationFallback = getLegacyDurationFallback(raw, itemDurationRounds);
  const healingTargetMode = normalizeHealingTargetMode(raw.healing?.targetMode);
  const temporaryHpTargetMode = normalizeTemporaryHpTargetMode(raw.temporaryHp?.targetMode);
  const summary = [
    { label: game.i18n.localize("BOT.ui.summary.trigger"), value: getTriggerLabel(raw.type) },
    { label: game.i18n.localize("BOT.ui.summary.targetMode"), value: getTargetModeLabel(raw.targetMode) },
    { label: game.i18n.localize("BOT.ui.summary.rememberTargetOnActivation"), value: game.i18n.localize(raw.rememberTargetOnActivation ? "BOT.ui.common.yes" : "BOT.ui.common.no") },
    { label: game.i18n.localize("BOT.ui.summary.requireStoredTargetMatch"), value: game.i18n.localize(raw.requireStoredTargetMatch ? "BOT.ui.common.yes" : "BOT.ui.common.no") },
  ];
  if (raw.requireBearerTemporaryHp) summary.push({ label: game.i18n.localize("BOT.ui.summary.temporaryHpCondition"), value: game.i18n.localize("BOT.ui.summary.temporaryHpConditionBearer") });

  if (ATTACK_TRIGGER_TYPES.includes(raw.type)) {
    summary.push({ label: game.i18n.localize("BOT.ui.summary.condition"), value: getConditionLabel(raw.condition) });
  }

  if (raw.type === "damaged") {
    if ((raw.receivedAttackType ?? "any") !== "any") {
      summary.push({
        label: game.i18n.localize("BOT.ui.summary.receivedAttackType"),
        value: getReceivedAttackTypeLabel(raw.receivedAttackType)
      });
    }
    if ((raw.receivedDamageTypes ?? []).length) {
      summary.push({
        label: game.i18n.localize("BOT.ui.summary.receivedDamageTypes"),
        value: listSelectedLabels(raw.receivedDamageTypes, labels.damageTypes)
      });
    }
  }

  if (raw.damage) {
    summary.push({
      label: game.i18n.localize("BOT.ui.summary.damage"),
      value: `${raw.damage.formula ?? game.i18n.localize("BOT.ui.summary.notConfigured")} ${raw.damage.type ? `(${labels.damageTypes[raw.damage.type] ?? raw.damage.type})` : ""}`.trim()
    });
    summary.push({
      label: game.i18n.localize("BOT.ui.summary.damageTarget"),
      value: getDamageTargetModeLabel(raw.damage.targetMode)
    });
  }

  if (raw.healing?.formula) {
    summary.push({
      label: game.i18n.localize("BOT.ui.summary.healing"),
      value: `${raw.healing.formula} (${getHealingTargetModeLabel(healingTargetMode)})`
    });
  }

  if (raw.temporaryHp?.formula) {
    summary.push({
      label: game.i18n.localize("BOT.ui.summary.temporaryHp"),
      value: `${raw.temporaryHp.formula} (${getTemporaryHpTargetModeLabel(temporaryHpTargetMode)} - ${getTemporaryHpModeLabel(raw.temporaryHp.mode)} - ${getTemporaryHpTimingLabel(raw.temporaryHp.timing)})`
    });
  }

  if (raw.rollModifier?.enabled && raw.rollModifier?.formula) {
    summary.push({
      label: game.i18n.localize("BOT.ui.summary.rollModifier"),
      value: raw.rollModifier.formula
    });
    summary.push({
      label: game.i18n.localize("BOT.ui.summary.rollModifierTypes"),
      value: getRollModifierTypesLabel(raw.rollModifier.rollTypes ?? []) || game.i18n.localize("BOT.ui.summary.notConfigured")
    });
  }

  if (raw.save?.ability) {
    const saveDcSource = raw.save.dcSource ?? "fixed";
    const saveTiming = raw.save.timing ?? "trigger";
    const parts = [
      game.i18n.localize(`BOT.abilities.${raw.save.ability}`),
      saveDcSource === "fixed" ? `${getSaveDcSourceLabel("fixed")} ${raw.save.dc ?? game.i18n.localize("BOT.ui.summary.notConfigured")}` : getSaveDcSourceLabel(saveDcSource),
      getSaveTimingLabel(saveTiming),
    ];
    if (saveTiming === "activation" || saveTiming === "both") parts.push(`${game.i18n.localize("BOT.ui.activationApplyOn.summary")} ${getActivationApplyOnLabel(raw.save.activationApplyOn)}`);
    if (saveTiming === "trigger" || saveTiming === "both") parts.push(`${game.i18n.localize("BOT.ui.success.label")} ${game.i18n.localize(`BOT.ui.saveEffect.${raw.save.effect ?? "half"}`)}`);
    summary.push({
      label: game.i18n.localize("BOT.ui.summary.save"),
      value: parts.join(" • ")
    });
  } else {
    summary.push({
      label: game.i18n.localize("BOT.ui.summary.save"),
      value: game.i18n.localize("BOT.ui.none")
    });
  }

  if (raw.status?.id) {
    summary.push({
      label: game.i18n.localize("BOT.ui.summary.status"),
      value: labels.statuses?.[raw.status.id] ?? raw.status.id
    });
    summary.push({
      label: game.i18n.localize("BOT.ui.summary.statusTarget"),
      value: getStatusTargetModeLabel(raw.status.targetMode)
    });
    summary.push({
      label: game.i18n.localize("BOT.ui.summary.statusApplyCondition"),
      value: getStatusApplyConditionLabel(raw.status.applyCondition)
    });
  }

  const mechanicalSummary = buildMechanicalSummary(raw, labels);
  if (mechanicalSummary.length) {
    summary.push({
      label: game.i18n.localize("BOT.ui.summary.mechanical"),
      value: mechanicalSummary.join(" • ")
    });
  }

  summary.push({
    label: game.i18n.localize("BOT.ui.summary.consumeOnTrigger"),
    value: game.i18n.localize(raw.consumeOnTrigger ?? true ? "BOT.ui.common.yes" : "BOT.ui.common.no")
  });

  summary.push({
    label: game.i18n.localize("BOT.ui.summary.triggerFrequency"),
    value: getTriggerFrequencyLabel(raw.triggerFrequency)
  });

  summary.push({
    label: game.i18n.localize("BOT.ui.summary.charges"),
    value: getChargesSummary(raw.charges)
  });

  summary.push({
    label: game.i18n.localize("BOT.ui.summary.durationRounds"),
    value: formatItemDurationSummary(itemDurationRounds, legacyDurationFallback)
  });

  return summary;
}

class BuffTriggerConfig extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {
  static DEFAULT_OPTIONS = {
    tag: "form",
    form: {
      handler: BuffTriggerConfig.#onSubmit,
      closeOnSubmit: true,
    },
    window: {
      title: "BOT.ui.configTitle",
      contentClasses: ["standard-form"],
    },
    position: {
      width: 560,
      height: "auto",
    },
    resizable: true,
  };

  static PARTS = {
    form: {
      template: "modules/dnd5e-buff-on-trigger/templates/buff-config.html",
    },
  };

  constructor(item, options = {}) {
    super(options);
    this.item = item;
  }

  resizeToContent() {
    this.setPosition({ height: "auto" });
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const form = this.element.matches?.("form") ? this.element : this.element.querySelector?.("form");
    if (form) form.__botApp = this;
    const triggerSelect = this.element.querySelector?.('[name="type"]');
    if (triggerSelect) window.botUpdateTriggerUI(triggerSelect);
    const saveDcSourceSelect = this.element.querySelector?.('[name="saveDcSource"]');
    if (saveDcSourceSelect) window.botUpdateSaveDcUI(saveDcSourceSelect);
    const saveTimingSelect = this.element.querySelector?.('[name="saveTiming"]');
    if (saveTimingSelect) window.botUpdateSaveTimingUI(saveTimingSelect);
    const formulaInputs = this.element.querySelectorAll?.('input[name="damageFormula"], input[name="healingFormula"], input[name="temporaryHpFormula"], input[name="rollModifierFormula"]') ?? [];
    for (const input of formulaInputs) {
      input.addEventListener("focus", () => {
        if (form) form.__botLastFormulaInput = input;
      });
      input.addEventListener("click", () => {
        if (form) form.__botLastFormulaInput = input;
      });
    }
    const healingEnabled = this.element.querySelector?.('[name="healingEnabled"]');
    if (healingEnabled) healingEnabled.addEventListener("change", () => window.botUpdateEffectSectionsUI(form));
    const temporaryHpEnabled = this.element.querySelector?.('[name="temporaryHpEnabled"]');
    if (temporaryHpEnabled) temporaryHpEnabled.addEventListener("change", () => window.botUpdateEffectSectionsUI(form));
    const rollModifierEnabled = this.element.querySelector?.('[name="rollModifierEnabled"]');
    if (rollModifierEnabled) rollModifierEnabled.addEventListener("change", () => window.botUpdateRollModifierUI(form));
    const statusSelect = this.element.querySelector?.('[name="statusId"]');
    if (statusSelect) statusSelect.addEventListener("change", () => window.botUpdateEffectSectionsUI(form));
    const targetModeSelect = this.element.querySelector?.('[name="targetMode"]');
    if (targetModeSelect) window.botUpdateStoredTargetUI(targetModeSelect);
    const presetSelect = this.element.querySelector?.('[name="presetId"]');
    if (presetSelect) window.botUpdatePresetActions(presetSelect);
    this.element.querySelectorAll?.('[data-bot-preset-action]')?.forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const action = button.dataset.botPresetAction;
        if (action === "apply") window.botApplyPreset(button);
        else if (action === "reset") window.botResetBuffConfig(button);
        else if (action === "save") window.botSaveCustomPreset(button);
        else if (action === "export") window.botExportCustomPresets(button);
        else if (action === "import") window.botImportCustomPresets(button);
        else if (action === "delete") window.botDeleteCustomPreset(button);
      });
    });
    this.element.querySelectorAll?.('.bot-collapsible-panel')?.forEach((panel) => {
      panel.addEventListener("toggle", () => this.resizeToContent());
    });
    if (form) {
      window.botUpdateEffectSectionsUI(form);
      window.botUpdateRollModifierUI(form);
    }
  }

  async _prepareContext(options) {
    const raw = this.item.getFlag(MODULE_ID, "buffTrigger") ?? {};
    const itemDurationRounds = getItemDurationInRounds(this.item);
    const legacyDurationFallback = getLegacyDurationFallback(raw, itemDurationRounds);
    const healingTargetMode = normalizeHealingTargetMode(raw.healing?.targetMode);
    const temporaryHpTargetMode = normalizeTemporaryHpTargetMode(raw.temporaryHp?.targetMode);
    const skillLabels = getSkillLabels();
    const damageLabels = getDamageLabels();
    const weaponProfLabels = getWeaponProfLabels();
    const armorProfLabels = getArmorProfLabels();
    const languageLabels = getLanguageLabels();
    const statusOptions = getStatusOptions(raw.status?.id ?? null);
    const presets = getPresetOptions();
    const statusLabels = Object.fromEntries(statusOptions.map((option) => [option.value, option.label]));
    const abilityLabels = getAbilityLabels();
    const conditionImmunityOptions = getConditionImmunityOptions(raw.buffs?.conditionImmunities ?? []);
    const labels = {
      skills: skillLabels,
      abilities: abilityLabels,
      damageTypes: damageLabels,
      weaponProfs: weaponProfLabels,
      armorProfs: armorProfLabels,
      languages: languageLabels,
      conditions: Object.fromEntries(conditionImmunityOptions.map((option) => [option.value, option.label])),
      statuses: statusLabels,
    };
    const abilityCheckAdvantageOptions = getAbilityOptions(raw.buffs?.abilityCheckAdvantages ?? []);
    const abilityCheckDisadvantageOptions = getAbilityOptions(raw.buffs?.abilityCheckDisadvantages ?? []);
    const savingThrowAdvantageOptions = getAbilityOptions(raw.buffs?.savingThrowAdvantages ?? []);
    const savingThrowDisadvantageOptions = getAbilityOptions(raw.buffs?.savingThrowDisadvantages ?? []);
    const skillAdvantageOptions = SKILL_IDS.map(id => ({ value: id, label: skillLabels[id], selected: (raw.buffs?.skills ?? []).includes(id) }));
    const skillBonusOptions     = SKILL_IDS.map(id => ({ value: id, label: skillLabels[id], selected: (raw.buffs?.skillBonusSkills ?? []).includes(id) }));
    const resistanceOptions     = DAMAGE_TYPES.map(t => ({ value: t, label: damageLabels[t], selected: (raw.buffs?.resistances ?? []).includes(t) }));
    const vulnOptions           = DAMAGE_TYPES.map(t => ({ value: t, label: damageLabels[t], selected: (raw.buffs?.vulnerabilities ?? []).includes(t) }));
    const immunityOptions       = DAMAGE_TYPES.map(t => ({ value: t, label: damageLabels[t], selected: (raw.buffs?.immunities ?? []).includes(t) }));
    const receivedDamageTypeOptions = DAMAGE_TYPES.map(t => ({ value: t, label: damageLabels[t], selected: (raw.receivedDamageTypes ?? []).includes(t) }));
    const weaponProfOptions     = WEAPON_PROF_IDS.map(value => ({ value, label: weaponProfLabels[value], selected: (raw.buffs?.weaponProfs ?? []).includes(value) }));
    const armorProfOptions      = ARMOR_PROF_IDS.map(value => ({ value, label: armorProfLabels[value], selected: (raw.buffs?.armorProfs ?? []).includes(value) }));
    const languageOptions       = LANGUAGE_IDS.map(value => ({ value, label: languageLabels[value], selected: (raw.buffs?.languages ?? []).includes(value) }));
    const flag = {
      ...raw,
      targetMode:            normalizeGlobalTargetMode(raw.targetMode),
      targetModeSelf:        normalizeGlobalTargetMode(raw.targetMode) === "self",
      targetModeTarget:      normalizeGlobalTargetMode(raw.targetMode) === "target",
      showStoredTargetSection: normalizeGlobalTargetMode(raw.targetMode) === "self",
      rememberTargetOnActivation: !!raw.rememberTargetOnActivation,
      requireStoredTargetMatch: !!raw.requireStoredTargetMatch,
      requireBearerTemporaryHp: !!raw.requireBearerTemporaryHp,
      typePassive:           raw.type === "passive",
      typeMwak:              raw.type === "mwak",
      typeRwak:              raw.type === "rwak",
      typeMsak:              raw.type === "msak",
      typeRsak:              raw.type === "rsak",
      typeAnyAttack:        raw.type === "anyAttack",
      typeWeaponAttack:     raw.type === "weaponAttack",
      typeSpellAttack:      raw.type === "spellAttack",
      typeDamaged:           raw.type === "damaged",
      typeHealed:            raw.type === "healed",
      typeTurnStart:         raw.type === "turnStart",
      typeTurnEnd:           raw.type === "turnEnd",
      typeTargetTurnStart:   raw.type === "targetTurnStart",
      typeTargetTurnEnd:     raw.type === "targetTurnEnd",
      consumeOnTrigger:      raw.consumeOnTrigger ?? true,
      triggerFrequencyNone:  (raw.triggerFrequency ?? "none") === "none",
      triggerFrequencyTurn:  raw.triggerFrequency === "turn",
      triggerFrequencyRound: raw.triggerFrequency === "round",
      buffAC:                    raw.buffs?.ac ?? "",
      buffAttackMode:            raw.buffs?.attackMode ?? "none",
      buffSaveMode:              raw.buffs?.saveMode ?? "none",
      buffSkillMode:             raw.buffs?.skillMode ?? "none",
      buffSkillBonus:            raw.buffs?.skillBonus ?? "",
      buffSkillBonusAll:         raw.buffs?.skillBonusAll ?? "",
      buffSaveBonus:             raw.buffs?.saveBonus ?? "",
      buffAttackBonus:           raw.buffs?.attackBonus ?? "",
      buffSpeed:                 raw.buffs?.speed?.value ?? "",
      buffSpeedType:             raw.buffs?.speed?.type ?? "walk",
      buffDarkvision:            raw.buffs?.darkvision ?? "",
      buffBlindSight:            raw.buffs?.blindsight ?? "",
      buffTremorSense:           raw.buffs?.tremorsense ?? "",
      buffTrueSight:             raw.buffs?.truesight ?? "",
      buffSensesSpecial:         raw.buffs?.sensesSpecial ?? "",
      buffPassivePerception:     raw.buffs?.passivePerception ?? "",
      healingEnabled:            !!raw.healing,
      healingFormula:            raw.healing?.formula ?? "",
      healingTargetModeTriggerTarget: healingTargetMode === "triggerTarget",
      healingTargetModeSelf:     healingTargetMode === "self",
      healingTargetModeAttacker: healingTargetMode === "attacker",
      healingTargetModeStoredTarget: healingTargetMode === "storedTarget",
      temporaryHpEnabled:        !!raw.temporaryHp,
      temporaryHpFormula:        raw.temporaryHp?.formula ?? "",
      temporaryHpTimingTrigger:    (raw.temporaryHp?.timing ?? "trigger") === "trigger",
      temporaryHpTimingActivation: raw.temporaryHp?.timing === "activation",
      temporaryHpTimingBoth:       raw.temporaryHp?.timing === "both",
      temporaryHpTargetModeTriggerTarget: temporaryHpTargetMode === "triggerTarget",
      temporaryHpTargetModeSelf: temporaryHpTargetMode === "self",
      temporaryHpTargetModeAttacker: temporaryHpTargetMode === "attacker",
      temporaryHpTargetModeStoredTarget: temporaryHpTargetMode === "storedTarget",
      temporaryHpModeKeepHighest: (raw.temporaryHp?.mode ?? "keepHighest") === "keepHighest",
      temporaryHpModeReplace:    raw.temporaryHp?.mode === "replace",
      temporaryHpModeAdd:        raw.temporaryHp?.mode === "add",
      rollModifierEnabled:       !!raw.rollModifier?.enabled,
      rollModifierFormula:       raw.rollModifier?.formula ?? "",
      rollModifierTypeAttack:    (raw.rollModifier?.rollTypes ?? []).includes("attack"),
      rollModifierTypeSave:      (raw.rollModifier?.rollTypes ?? []).includes("save"),
      rollModifierTypeAbility:   (raw.rollModifier?.rollTypes ?? []).includes("ability"),
      rollModifierTypeSkill:     (raw.rollModifier?.rollTypes ?? []).includes("skill"),
      abilityCheckAdvantageOptions,
      abilityCheckDisadvantageOptions,
      savingThrowAdvantageOptions,
      savingThrowDisadvantageOptions,
      skillAdvantageOptions,
      skillBonusOptions,
      resistanceOptions,
      vulnOptions,
      immunityOptions,
      conditionImmunityOptions,
      weaponProfOptions,
      armorProfOptions,
      languageOptions,
      buffAttackModeNone:        (raw.buffs?.attackMode ?? "none") === "none",
      buffAttackModeAdvantage:   raw.buffs?.attackMode === "advantage",
      buffAttackModeDisadvantage: raw.buffs?.attackMode === "disadvantage",
      buffSaveModeNone:          (raw.buffs?.saveMode ?? "none") === "none",
      buffSaveModeAdvantage:     raw.buffs?.saveMode === "advantage",
      buffSaveModeDisadvantage:  raw.buffs?.saveMode === "disadvantage",
      buffSkillModeNone:         (raw.buffs?.skillMode ?? "none") === "none",
      buffSkillModeAdvantage:    raw.buffs?.skillMode === "advantage",
      buffSkillModeDisadvantage: raw.buffs?.skillMode === "disadvantage",
      charges:               raw.charges ?? "",
      itemDurationRounds,
      itemDurationLabel:     formatItemDurationSummary(itemDurationRounds, legacyDurationFallback),
      saveAbility:           raw.save?.ability ?? "",
      saveAbilityLabel:      getAbilityLabel(raw.save?.ability ?? ""),
      saveDC:                raw.save?.dc ?? 15,
      saveDcSourceFixed:     (raw.save?.dcSource ?? "fixed") === "fixed",
      saveDcSourceOrigin:    raw.save?.dcSource === "origin",
      saveDcSourceOwner:     raw.save?.dcSource === "owner",
      saveTimingTrigger:     (raw.save?.timing ?? "trigger") === "trigger",
      saveTimingActivation:  raw.save?.timing === "activation",
      saveTimingBoth:        raw.save?.timing === "both",
      showSaveTriggerEffect: ["trigger", "both"].includes(raw.save?.timing ?? "trigger"),
      showSaveActivationApply: ["activation", "both"].includes(raw.save?.timing ?? "trigger"),
      saveActivationApplyOnFailure: (raw.save?.activationApplyOn ?? "failure") === "failure",
      saveActivationApplyOnSuccess: raw.save?.activationApplyOn === "success",
      saveEffectNone:        (raw.save?.effect ?? "half") === "none",
      saveEffectHalf:        (raw.save?.effect ?? "half") === "half",
      saveEffectFull:        raw.save?.effect === "full",
      showAttackCondition:   ATTACK_TRIGGER_TYPES.includes(raw.type),
      conditionHit:          (raw.condition ?? "hit") === "hit",
      conditionMiss:         raw.condition === "miss",
      conditionAlways:       raw.condition === "always",
      damageTargetModeTriggerTarget: (raw.damage?.targetMode ?? "triggerTarget") === "triggerTarget",
      damageTargetModeSelf: raw.damage?.targetMode === "self",
      damageTargetModeAttacker: raw.damage?.targetMode === "attacker",
      damageTargetModeStoredTarget: raw.damage?.targetMode === "storedTarget",
      statusOptions,
      statusTargetModeTriggerTarget: (raw.status?.targetMode ?? "triggerTarget") === "triggerTarget",
      statusTargetModeSelf: raw.status?.targetMode === "self",
      statusTargetModeAttacker: raw.status?.targetMode === "attacker",
      statusTargetModeStoredTarget: raw.status?.targetMode === "storedTarget",
      statusApplyConditionAlways: (raw.status?.applyCondition ?? "always") === "always",
      statusApplyConditionSaveFailure: raw.status?.applyCondition === "saveFailure",
      statusApplyConditionSaveSuccess: raw.status?.applyCondition === "saveSuccess",
      receivedAttackTypeAny: (raw.receivedAttackType ?? "any") === "any",
      receivedAttackTypeMelee: raw.receivedAttackType === "melee",
      receivedAttackTypeRanged: raw.receivedAttackType === "ranged",
      receivedAttackTypeWeapon: raw.receivedAttackType === "weapon",
      receivedAttackTypeSpell: raw.receivedAttackType === "spell",
      receivedAttackTypeMwak: raw.receivedAttackType === "mwak",
      receivedAttackTypeRwak: raw.receivedAttackType === "rwak",
      receivedAttackTypeMsak: raw.receivedAttackType === "msak",
      receivedAttackTypeRsak: raw.receivedAttackType === "rsak",
      receivedDamageTypeOptions,
      damageTypeAcid:        raw.damage?.type === "acid",
      damageTypeBludgeoning: raw.damage?.type === "bludgeoning",
      damageTypeCold:        raw.damage?.type === "cold",
      damageTypeFire:        raw.damage?.type === "fire",
      damageTypeForce:       raw.damage?.type === "force",
      damageTypeLightning:   raw.damage?.type === "lightning",
      damageTypeNecrotic:    raw.damage?.type === "necrotic",
      damageTypePiercing:    raw.damage?.type === "piercing",
      damageTypePoison:      raw.damage?.type === "poison",
      damageTypePsychic:     raw.damage?.type === "psychic",
      damageTypeRadiant:     raw.damage?.type === "radiant",
      damageTypeSlashing:    raw.damage?.type === "slashing",
      damageTypeThunder:     raw.damage?.type === "thunder",
      configSummary:         buildConfigSummary(raw, labels, itemDurationRounds),
    };
    return {
      ...await super._prepareContext(options),
      flag,
      presets,
    };
  }

  static async #onSubmit(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);
      if (!data.enabled) {
        await this.item.unsetFlag(MODULE_ID, "buffTrigger");
      } else {
        const currentFlag = this.item.getFlag(MODULE_ID, "buffTrigger") ?? {};
        const submittedDamageTargetMode = data.damageTargetMode ?? "triggerTarget";
        const shouldPersistDamageTargetMode = !!currentFlag.damage?.targetMode || submittedDamageTargetMode !== "triggerTarget";
        const submittedStatusTargetMode = data.statusTargetMode ?? "triggerTarget";
        const shouldPersistStatusTargetMode = !!currentFlag.status?.targetMode || submittedStatusTargetMode !== "triggerTarget";
        const flag = {
        targetMode: normalizeGlobalTargetMode(data.targetMode),
        rememberTargetOnActivation: data.rememberTargetOnActivation ?? false,
        requireStoredTargetMatch: data.requireStoredTargetMatch ?? false,
        requireBearerTemporaryHp: data.requireBearerTemporaryHp ?? false,
        type: data.type,
        condition: data.condition,
        receivedAttackType: data.receivedAttackType ?? "any",
        receivedDamageTypes: (() => {
          const toArray = v => v ? v.split(',').filter(Boolean) : [];
          return toArray(data.receivedDamageTypesList);
        })(),
        consumeOnTrigger: data.consumeOnTrigger ?? true,
        triggerFrequency: data.triggerFrequency ?? "none",
        damage: data.damageFormula ? {
          formula: data.damageFormula,
          type: data.damageType || null,
          ...(shouldPersistDamageTargetMode ? { targetMode: submittedDamageTargetMode } : {})
        } : null,
        healing: data.healingEnabled && data.healingFormula ? {
          formula: data.healingFormula,
          targetMode: normalizeHealingTargetMode(data.healingTargetMode),
        } : null,
        temporaryHp: data.temporaryHpEnabled && data.temporaryHpFormula ? {
          formula: data.temporaryHpFormula,
          timing: data.temporaryHpTiming ?? "trigger",
          targetMode: normalizeTemporaryHpTargetMode(data.temporaryHpTargetMode),
          mode: data.temporaryHpMode ?? "keepHighest",
        } : null,
        rollModifier: data.rollModifierEnabled && data.rollModifierFormula ? {
          enabled: true,
          formula: data.rollModifierFormula,
          rollTypes: [
            data.rollModifierAttack ? "attack" : null,
            data.rollModifierSave ? "save" : null,
            data.rollModifierAbility ? "ability" : null,
            data.rollModifierSkill ? "skill" : null,
          ].filter(Boolean),
        } : null,
          save: data.saveAbility ? {
            ability: data.saveAbility,
            dc: Number(data.saveDC),
            dcSource: data.saveDcSource ?? "fixed",
            timing: data.saveTiming ?? "trigger",
            activationApplyOn: data.saveActivationApplyOn ?? "failure",
            effect: data.saveEffect
          } : null,
          status: data.statusId ? {
            id: data.statusId,
            ...(shouldPersistStatusTargetMode ? { targetMode: submittedStatusTargetMode } : {}),
            applyCondition: data.statusApplyCondition ?? "always"
          } : null,
        charges: data.charges ? Number(data.charges) : null,
        buffs: (() => {
          const toArray = v => v ? v.split(',').filter(Boolean) : [];
          return {
            ac: data.buffAC ? Number(data.buffAC) : null,
            attackMode: data.buffAttackMode !== "none" ? data.buffAttackMode : null,
            saveMode: data.buffSaveMode !== "none" ? data.buffSaveMode : null,
            skillMode: data.buffSkillMode !== "none" ? data.buffSkillMode : null,
            abilityCheckAdvantages: toArray(data.buffAbilityCheckAdvantageList),
            abilityCheckDisadvantages: toArray(data.buffAbilityCheckDisadvantageList),
            savingThrowAdvantages: toArray(data.buffSavingThrowAdvantageList),
            savingThrowDisadvantages: toArray(data.buffSavingThrowDisadvantageList),
            skills: toArray(data.buffSkillAdvantageList),
            skillBonusSkills: toArray(data.buffSkillBonusList),
            skillBonus: data.buffSkillBonus || null,
            skillBonusAll: data.buffSkillBonusAll || null,
            saveBonus: data.buffSaveBonus || null,
            attackBonus: data.buffAttackBonus || null,
            speed: data.buffSpeed ? { value: Number(data.buffSpeed), type: data.buffSpeedType ?? "walk" } : null,
            weaponProfs: toArray(data.buffWeaponProfsList),
            armorProfs: toArray(data.buffArmorProfsList),
            languages: toArray(data.buffLanguagesList),
            darkvision: data.buffDarkvision ? Number(data.buffDarkvision) : null,
            blindsight: data.buffBlindSight ? Number(data.buffBlindSight) : null,
            tremorsense: data.buffTremorSense ? Number(data.buffTremorSense) : null,
            truesight: data.buffTrueSight ? Number(data.buffTrueSight) : null,
            sensesSpecial: data.buffSensesSpecial || null,
            passivePerception: data.buffPassivePerception ? Number(data.buffPassivePerception) : null,
            resistances: toArray(data.buffResistancesList),
            vulnerabilities: toArray(data.buffVulnsList),
            immunities: toArray(data.buffImmunitiesList),
            conditionImmunities: toArray(data.buffConditionImmunitiesList),
          };
        })(),
      };
      const itemDuration = buildItemDurationData(this.item);
      if (itemDuration) {
        flag.duration = itemDuration;
        await this.item.update({
          [`flags.${MODULE_ID}.buffTrigger`]: flag,
        });
      } else {
        delete flag.duration;
        await this.item.update({
          [`flags.${MODULE_ID}.buffTrigger`]: flag,
          [`flags.${MODULE_ID}.buffTrigger.-=duration`]: null,
        });
      }
    }
    debugLog(`[${MODULE_ID}] Configuration sauvegardée sur ${this.item.name}`);
  }
}

function getCustomPresets() {
  try {
    const presets = game.settings.get(MODULE_ID, "customPresets") ?? {};
    return isPlainObject(presets) ? presets : {};
  } catch {
    return {};
  }
}

function getBuiltInPresets() {
  return BUFF_PRESETS.map((preset) => ({ ...preset, source: "builtIn" }));
}

function getAllPresets() {
  const customPresets = Object.values(getCustomPresets())
    .filter((preset) => preset?.label && isPlainObject(preset.flag))
    .map((preset) => ({ ...preset, source: "custom" }));
  return [...getBuiltInPresets(), ...customPresets];
}

function getPresetOptions() {
  return getAllPresets().map((preset) => {
    const label = preset.source === "custom"
      ? game.i18n.format("BOT.ui.presets.customPrefix", { label: preset.label })
      : game.i18n.localize(preset.label);
    const description = preset.source === "custom"
      ? (preset.description ?? "")
      : game.i18n.localize(preset.description);
    return {
      id: preset.id,
      label,
      description,
      source: preset.source,
    };
  });
}

function getUniqueCustomPresetId(baseLabel = "preset", existing = getCustomPresets()) {
  const slug = String(baseLabel)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "preset";
  let id = `custom-${slug}`;
  let index = 2;
  while (existing[id] || BUFF_PRESETS.some((preset) => preset.id === id)) {
    id = `custom-${slug}-${index}`;
    index += 1;
  }
  return id;
}

function readFormValue(form, name, fallback = "") {
  const field = form?.querySelector?.(`[name="${name}"]`);
  if (!field) return fallback;
  if (field.type === "checkbox") return field.checked;
  return field.value ?? fallback;
}

function readNumberFormValue(form, name) {
  const value = String(readFormValue(form, name, "")).trim();
  return value ? Number(value) : null;
}

function readCsvFormValue(form, name) {
  return String(readFormValue(form, name, ""))
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function buildBuffConfigFromForm(form) {
  const rollTypes = [
    readFormValue(form, "rollModifierAttack") ? "attack" : null,
    readFormValue(form, "rollModifierSave") ? "save" : null,
    readFormValue(form, "rollModifierAbility") ? "ability" : null,
    readFormValue(form, "rollModifierSkill") ? "skill" : null,
  ].filter(Boolean);
  const damageFormula = String(readFormValue(form, "damageFormula", "")).trim();
  const healingFormula = String(readFormValue(form, "healingFormula", "")).trim();
  const temporaryHpFormula = String(readFormValue(form, "temporaryHpFormula", "")).trim();
  const rollModifierFormula = String(readFormValue(form, "rollModifierFormula", "")).trim();
  const saveAbility = String(readFormValue(form, "saveAbility", "")).trim();
  const statusId = String(readFormValue(form, "statusId", "")).trim();
  const speedValue = readNumberFormValue(form, "buffSpeed");

  return mergeBuffConfig(buildDefaultBuffConfig(), {
    targetMode: normalizeGlobalTargetMode(readFormValue(form, "targetMode", "self")),
    rememberTargetOnActivation: !!readFormValue(form, "rememberTargetOnActivation"),
    requireStoredTargetMatch: !!readFormValue(form, "requireStoredTargetMatch"),
    requireBearerTemporaryHp: !!readFormValue(form, "requireBearerTemporaryHp"),
    type: readFormValue(form, "type", "passive"),
    condition: readFormValue(form, "condition", "hit"),
    receivedAttackType: readFormValue(form, "receivedAttackType", "any"),
    receivedDamageTypes: readCsvFormValue(form, "receivedDamageTypesList"),
    consumeOnTrigger: !!readFormValue(form, "consumeOnTrigger"),
    triggerFrequency: readFormValue(form, "triggerFrequency", "none"),
    charges: readNumberFormValue(form, "charges"),
    damage: damageFormula ? {
      formula: damageFormula,
      type: readFormValue(form, "damageType", "") || null,
      targetMode: readFormValue(form, "damageTargetMode", "triggerTarget"),
    } : null,
    save: saveAbility ? {
      ability: saveAbility,
      dc: Number(readFormValue(form, "saveDC", 15)),
      dcSource: readFormValue(form, "saveDcSource", "fixed"),
      timing: readFormValue(form, "saveTiming", "trigger"),
      activationApplyOn: readFormValue(form, "saveActivationApplyOn", "failure"),
      effect: readFormValue(form, "saveEffect", "half"),
    } : null,
    status: statusId ? {
      id: statusId,
      targetMode: readFormValue(form, "statusTargetMode", "triggerTarget"),
      applyCondition: readFormValue(form, "statusApplyCondition", "always"),
    } : null,
    healing: readFormValue(form, "healingEnabled") && healingFormula ? {
      formula: healingFormula,
      targetMode: normalizeHealingTargetMode(readFormValue(form, "healingTargetMode", "triggerTarget")),
    } : null,
    temporaryHp: readFormValue(form, "temporaryHpEnabled") && temporaryHpFormula ? {
      formula: temporaryHpFormula,
      timing: readFormValue(form, "temporaryHpTiming", "trigger"),
      targetMode: normalizeTemporaryHpTargetMode(readFormValue(form, "temporaryHpTargetMode", "triggerTarget")),
      mode: readFormValue(form, "temporaryHpMode", "keepHighest"),
    } : null,
    rollModifier: readFormValue(form, "rollModifierEnabled") && rollModifierFormula ? {
      enabled: true,
      formula: rollModifierFormula,
      rollTypes,
    } : null,
    buffs: {
      ac: readNumberFormValue(form, "buffAC"),
      attackMode: readFormValue(form, "buffAttackMode", "none") !== "none" ? readFormValue(form, "buffAttackMode") : null,
      saveMode: readFormValue(form, "buffSaveMode", "none") !== "none" ? readFormValue(form, "buffSaveMode") : null,
      skillMode: readFormValue(form, "buffSkillMode", "none") !== "none" ? readFormValue(form, "buffSkillMode") : null,
      abilityCheckAdvantages: readCsvFormValue(form, "buffAbilityCheckAdvantageList"),
      abilityCheckDisadvantages: readCsvFormValue(form, "buffAbilityCheckDisadvantageList"),
      savingThrowAdvantages: readCsvFormValue(form, "buffSavingThrowAdvantageList"),
      savingThrowDisadvantages: readCsvFormValue(form, "buffSavingThrowDisadvantageList"),
      skills: readCsvFormValue(form, "buffSkillAdvantageList"),
      skillBonusSkills: readCsvFormValue(form, "buffSkillBonusList"),
      skillBonus: readFormValue(form, "buffSkillBonus", "") || null,
      skillBonusAll: readFormValue(form, "buffSkillBonusAll", "") || null,
      saveBonus: readFormValue(form, "buffSaveBonus", "") || null,
      attackBonus: readFormValue(form, "buffAttackBonus", "") || null,
      speed: speedValue ? { value: speedValue, type: readFormValue(form, "buffSpeedType", "walk") } : null,
      weaponProfs: readCsvFormValue(form, "buffWeaponProfsList"),
      armorProfs: readCsvFormValue(form, "buffArmorProfsList"),
      languages: readCsvFormValue(form, "buffLanguagesList"),
      darkvision: readNumberFormValue(form, "buffDarkvision"),
      blindsight: readNumberFormValue(form, "buffBlindSight"),
      tremorsense: readNumberFormValue(form, "buffTremorSense"),
      truesight: readNumberFormValue(form, "buffTrueSight"),
      sensesSpecial: readFormValue(form, "buffSensesSpecial", "") || null,
      passivePerception: readNumberFormValue(form, "buffPassivePerception"),
      resistances: readCsvFormValue(form, "buffResistancesList"),
      vulnerabilities: readCsvFormValue(form, "buffVulnsList"),
      immunities: readCsvFormValue(form, "buffImmunitiesList"),
      conditionImmunities: readCsvFormValue(form, "buffConditionImmunitiesList"),
    },
  });
}

function refreshPresetSelect(form, selectedId = "") {
  const select = form?.querySelector?.('[name="presetId"]');
  if (!select) return;
  select.replaceChildren();
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = game.i18n.localize("BOT.ui.presets.none");
  select.appendChild(empty);
  for (const preset of getPresetOptions()) {
    const option = document.createElement("option");
    option.value = preset.id;
    option.dataset.description = preset.description ?? "";
    option.dataset.source = preset.source ?? "builtIn";
    option.textContent = preset.label;
    select.appendChild(option);
  }
  select.value = selectedId;
  window.botUpdatePresetDescription(select);
  window.botUpdatePresetActions(select);
}
function getPresetById(id) {
  return getAllPresets().find((preset) => preset.id === id) ?? null;
}

function clonePresetFlag(preset) {
  return foundry.utils.deepClone(preset.flag ?? {});
}

function buildDefaultBuffConfig() {
  return {
    targetMode: "self",
    rememberTargetOnActivation: false,
    requireStoredTargetMatch: false,
    requireBearerTemporaryHp: false,
    type: "passive",
    condition: "hit",
    receivedAttackType: "any",
    receivedDamageTypes: [],
    consumeOnTrigger: true,
    triggerFrequency: "none",
    charges: null,
    damage: null,
    save: null,
    status: null,
    healing: null,
    temporaryHp: null,
    rollModifier: null,
    buffs: {
      ac: null,
      attackMode: null,
      saveMode: null,
      skillMode: null,
      abilityCheckAdvantages: [],
      abilityCheckDisadvantages: [],
      savingThrowAdvantages: [],
      savingThrowDisadvantages: [],
      skills: [],
      skillBonusSkills: [],
      skillBonus: null,
      skillBonusAll: null,
      saveBonus: null,
      attackBonus: null,
      speed: null,
      weaponProfs: [],
      armorProfs: [],
      languages: [],
      darkvision: null,
      blindsight: null,
      tremorsense: null,
      truesight: null,
      sensesSpecial: null,
      passivePerception: null,
      resistances: [],
      vulnerabilities: [],
      immunities: [],
      conditionImmunities: [],
    },
  };
}

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function mergeBuffConfig(base, override) {
  const result = foundry.utils.deepClone(base);
  for (const [key, value] of Object.entries(override ?? {})) {
    if (isPlainObject(value) && isPlainObject(result[key])) {
      result[key] = mergeBuffConfig(result[key], value);
    } else {
      result[key] = foundry.utils.deepClone(value);
    }
  }
  return result;
}

function buildPresetConfig(preset) {
  return mergeBuffConfig(buildDefaultBuffConfig(), clonePresetFlag(preset));
}

function setFormValue(form, name, value) {
  const field = form?.querySelector?.(`[name="${name}"]`);
  if (!field) return;
  if (field.type === "checkbox") {
    field.checked = !!value;
  } else {
    field.value = value ?? "";
  }
  field.dispatchEvent(new Event("change", { bubbles: true }));
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

function clearTagList(targetId, form = document) {
  const tags = form.querySelector?.(`#tags-${targetId}`) ?? document.getElementById(`tags-${targetId}`);
  const hidden = form.querySelector?.(`#hidden-${targetId}`) ?? document.getElementById(`hidden-${targetId}`);
  if (tags) tags.innerHTML = "";
  if (hidden) hidden.value = "";
}

function setTagList(form, targetId, values = []) {
  clearTagList(targetId, form);
  const tags = form.querySelector?.(`#tags-${targetId}`);
  const select = form.querySelector?.(`#tags-${targetId} + select, select[onchange*="${targetId}"]`);
  const hidden = form.querySelector?.(`#hidden-${targetId}`);
  const cleanValues = values.filter(Boolean);
  if (!tags || !hidden) return;

  for (const value of cleanValues) {
    const label = [...(select?.options ?? [])].find((option) => option.value === value)?.text ?? value;
    const tag = document.createElement("span");
    tag.className = "bot-tag";
    tag.dataset.value = value;
    tag.innerHTML = `${label} <span class="bot-tag-remove" onclick="botRemoveTag(this, '${targetId}')">&times;</span>`;
    tags.appendChild(tag);
  }
  hidden.value = cleanValues.join(",");
}

function formHasDraftConfiguration(form) {
  const app = form?.__botApp;
  if (Object.keys(app?.item?.getFlag?.(MODULE_ID, "buffTrigger") ?? {}).length) return true;
  const relevantFields = [
    "enabled", "rememberTargetOnActivation", "requireStoredTargetMatch", "requireBearerTemporaryHp", "damageFormula", "healingFormula",
    "temporaryHpFormula", "rollModifierEnabled", "rollModifierFormula", "statusId", "saveAbility", "charges",
    "buffAC", "buffAttackBonus", "buffSaveBonus", "buffSkillBonus", "buffSkillBonusAll", "buffSpeed",
    "buffDarkvision", "buffBlindSight", "buffTremorSense", "buffTrueSight", "buffSensesSpecial", "buffPassivePerception",
  ];
  return relevantFields.some((name) => {
    const field = form?.querySelector?.(`[name="${name}"]`);
    if (!field) return false;
    if (field.type === "checkbox") return field.checked;
    return String(field.value ?? "").trim() !== "";
  }) || [
    "receivedDamageTypesList", "buffAbilityCheckAdvantageList", "buffAbilityCheckDisadvantageList", "buffSavingThrowAdvantageList", "buffSavingThrowDisadvantageList", "buffSkillAdvantageList", "buffSkillBonusList", "buffResistancesList",
    "buffVulnsList", "buffImmunitiesList", "buffConditionImmunitiesList", "buffWeaponProfsList", "buffArmorProfsList", "buffLanguagesList",
  ].some((name) => String(form?.querySelector?.(`[name="${name}"]`)?.value ?? "").trim() !== "");
}

function setPanelOpen(form, id, open) {
  const panel = form?.querySelector?.(`#${id}`);
  if (panel) panel.open = !!open;
}

function getSummaryLabels() {
  const statusOptions = getStatusOptions(null);
  return {
    skills: getSkillLabels(),
    damageTypes: getDamageLabels(),
    weaponProfs: getWeaponProfLabels(),
    armorProfs: getArmorProfLabels(),
    languages: getLanguageLabels(),
    conditions: Object.fromEntries(getConditionImmunityOptions().map((option) => [option.value, option.label])),
    statuses: Object.fromEntries(statusOptions.map((option) => [option.value, option.label])),
  };
}

function updateSummaryFromFlag(form, flag) {
  const list = form?.querySelector?.(".bot-summary-list");
  if (!list) return;
  const app = form.__botApp;
  const itemDurationRounds = app?.item ? getItemDurationInRounds(app.item) : null;
  const summary = buildConfigSummary(flag, getSummaryLabels(), itemDurationRounds);
  list.replaceChildren(...summary.map((entry) => {
    const item = document.createElement("div");
    item.className = "bot-summary-item";
    const label = document.createElement("span");
    label.className = "bot-summary-label";
    label.textContent = entry.label;
    const value = document.createElement("span");
    value.className = "bot-summary-value";
    value.textContent = entry.value;
    item.append(label, value);
    return item;
  }));
}

function applyPresetFlagToForm(form, flag) {
  const rollTypes = flag.rollModifier?.rollTypes ?? [];

  setFormValue(form, "enabled", true);
  setFormValue(form, "targetMode", normalizeGlobalTargetMode(flag.targetMode));
  setFormValue(form, "rememberTargetOnActivation", !!flag.rememberTargetOnActivation);
  setFormValue(form, "requireStoredTargetMatch", !!flag.requireStoredTargetMatch);
  setFormValue(form, "requireBearerTemporaryHp", !!flag.requireBearerTemporaryHp);
  setFormValue(form, "type", flag.type ?? "passive");
  setFormValue(form, "condition", flag.condition ?? "hit");
  setFormValue(form, "receivedAttackType", flag.receivedAttackType ?? "any");
  setTagList(form, "receivedDamageTypesList", flag.receivedDamageTypes ?? []);

  setFormValue(form, "rollModifierEnabled", !!flag.rollModifier?.enabled);
  setFormValue(form, "rollModifierFormula", flag.rollModifier?.formula ?? "");
  setFormValue(form, "rollModifierAttack", rollTypes.includes("attack"));
  setFormValue(form, "rollModifierSave", rollTypes.includes("save"));
  setFormValue(form, "rollModifierAbility", rollTypes.includes("ability"));
  setFormValue(form, "rollModifierSkill", rollTypes.includes("skill"));

  setFormValue(form, "damageFormula", flag.damage?.formula ?? "");
  setFormValue(form, "damageType", flag.damage?.type ?? "");
  setFormValue(form, "damageTargetMode", flag.damage?.targetMode ?? "triggerTarget");

  setFormValue(form, "saveAbility", flag.save?.ability ?? "");
  setFormValue(form, "saveDC", flag.save?.dc ?? 15);
  setFormValue(form, "saveDcSource", flag.save?.dcSource ?? "fixed");
  setFormValue(form, "saveTiming", flag.save?.timing ?? "trigger");
  setFormValue(form, "saveActivationApplyOn", flag.save?.activationApplyOn ?? "failure");
  setFormValue(form, "saveEffect", flag.save?.effect ?? "half");

  setFormValue(form, "statusId", flag.status?.id ?? "");
  setFormValue(form, "statusTargetMode", flag.status?.targetMode ?? "triggerTarget");
  setFormValue(form, "statusApplyCondition", flag.status?.applyCondition ?? "always");

  setFormValue(form, "healingEnabled", !!flag.healing?.formula);
  setFormValue(form, "healingFormula", flag.healing?.formula ?? "");
  setFormValue(form, "healingTargetMode", normalizeHealingTargetMode(flag.healing?.targetMode));
  setFormValue(form, "temporaryHpEnabled", !!flag.temporaryHp?.formula);
  setFormValue(form, "temporaryHpFormula", flag.temporaryHp?.formula ?? "");
  setFormValue(form, "temporaryHpTiming", flag.temporaryHp?.timing ?? "trigger");
  setFormValue(form, "temporaryHpTargetMode", normalizeTemporaryHpTargetMode(flag.temporaryHp?.targetMode));
  setFormValue(form, "temporaryHpMode", flag.temporaryHp?.mode ?? "keepHighest");

  setFormValue(form, "consumeOnTrigger", flag.consumeOnTrigger ?? true);
  setFormValue(form, "triggerFrequency", flag.triggerFrequency ?? "none");
  setFormValue(form, "charges", flag.charges ?? "");

  setFormValue(form, "buffAttackMode", flag.buffs?.attackMode ?? "none");
  setFormValue(form, "buffSaveMode", flag.buffs?.saveMode ?? "none");
  setFormValue(form, "buffSkillMode", flag.buffs?.skillMode ?? "none");
  setFormValue(form, "buffAC", flag.buffs?.ac ?? "");
  setFormValue(form, "buffAttackBonus", flag.buffs?.attackBonus ?? "");
  setFormValue(form, "buffSaveBonus", flag.buffs?.saveBonus ?? "");
  setFormValue(form, "buffSkillBonus", flag.buffs?.skillBonus ?? "");
  setFormValue(form, "buffSkillBonusAll", flag.buffs?.skillBonusAll ?? "");
  setFormValue(form, "buffSpeed", flag.buffs?.speed?.value ?? "");
  setFormValue(form, "buffSpeedType", flag.buffs?.speed?.type ?? "walk");
  setFormValue(form, "buffDarkvision", flag.buffs?.darkvision ?? "");
  setFormValue(form, "buffBlindSight", flag.buffs?.blindsight ?? "");
  setFormValue(form, "buffTremorSense", flag.buffs?.tremorsense ?? "");
  setFormValue(form, "buffTrueSight", flag.buffs?.truesight ?? "");
  setFormValue(form, "buffSensesSpecial", flag.buffs?.sensesSpecial ?? "");
  setFormValue(form, "buffPassivePerception", flag.buffs?.passivePerception ?? "");

  setTagList(form, "buffAbilityCheckAdvantageList", flag.buffs?.abilityCheckAdvantages ?? []);
  setTagList(form, "buffAbilityCheckDisadvantageList", flag.buffs?.abilityCheckDisadvantages ?? []);
  setTagList(form, "buffSavingThrowAdvantageList", flag.buffs?.savingThrowAdvantages ?? []);
  setTagList(form, "buffSavingThrowDisadvantageList", flag.buffs?.savingThrowDisadvantages ?? []);
  setTagList(form, "buffSkillAdvantageList", flag.buffs?.skills ?? []);
  setTagList(form, "buffSkillBonusList", flag.buffs?.skillBonusSkills ?? []);
  setTagList(form, "buffResistancesList", flag.buffs?.resistances ?? []);
  setTagList(form, "buffVulnsList", flag.buffs?.vulnerabilities ?? []);
  setTagList(form, "buffImmunitiesList", flag.buffs?.immunities ?? []);
  setTagList(form, "buffConditionImmunitiesList", flag.buffs?.conditionImmunities ?? []);
  setTagList(form, "buffWeaponProfsList", flag.buffs?.weaponProfs ?? []);
  setTagList(form, "buffArmorProfsList", flag.buffs?.armorProfs ?? []);
  setTagList(form, "buffLanguagesList", flag.buffs?.languages ?? []);

  setPanelOpen(form, "bot-roll-modifier-panel", !!flag.rollModifier?.enabled);
  setPanelOpen(form, "bot-damage-panel", !!flag.damage?.formula);
  setPanelOpen(form, "bot-save-panel", !!flag.save?.ability);
  setPanelOpen(form, "bot-status-panel", !!flag.status?.id);

  window.botUpdateStoredTargetUI(form.querySelector('[name="targetMode"]'));
  window.botUpdateTriggerUI(form.querySelector('[name="type"]'));
  window.botUpdateSaveDcUI(form.querySelector('[name="saveDcSource"]'));
  window.botUpdateSaveTimingUI(form.querySelector('[name="saveTiming"]'));
  window.botUpdateEffectSectionsUI(form);
  window.botUpdateRollModifierUI(form);
  updateSummaryFromFlag(form, flag);
}

window.botUpdatePresetDescription = function(selectEl) {
  const form = selectEl.closest("form");
  const description = selectEl.selectedOptions?.[0]?.dataset?.description
    || game.i18n.localize("BOT.ui.presets.selectHint");
  const descriptionEl = form?.querySelector?.("#bot-preset-description");
  if (descriptionEl) descriptionEl.textContent = description;
};

window.botUpdatePresetActions = function(selectEl) {
  const form = selectEl?.closest?.("form");
  const deleteButton = form?.querySelector?.(".bot-delete-preset-btn");
  if (!deleteButton) return;
  deleteButton.disabled = selectEl?.selectedOptions?.[0]?.dataset?.source !== "custom";
};

async function promptCustomPresetData() {
  if (!globalThis.Dialog) {
    const label = window.prompt(game.i18n.localize("BOT.ui.presets.promptName"));
    if (!label?.trim()) return null;
    const description = window.prompt(game.i18n.localize("BOT.ui.presets.promptDescription")) ?? "";
    return { label: label.trim(), description: description.trim() };
  }

  return new Promise((resolve) => {
    let resolved = false;
    const finish = (value) => {
      if (resolved) return;
      resolved = true;
      resolve(value);
    };
    const content = `
      <form class="bot-custom-preset-dialog">
        <div class="form-group">
          <label>${game.i18n.localize("BOT.ui.presets.promptName")}</label>
          <input type="text" name="label" autofocus />
        </div>
        <div class="form-group">
          <label>${game.i18n.localize("BOT.ui.presets.promptDescription")}</label>
          <input type="text" name="description" />
        </div>
      </form>`;
    new Dialog({
      title: game.i18n.localize("BOT.ui.presets.saveDialogTitle"),
      content,
      buttons: {
        save: {
          label: game.i18n.localize("BOT.ui.presets.saveCustom"),
          callback: (html) => {
            const root = html?.[0] ?? html;
            const label = root?.querySelector?.('[name="label"]')?.value?.trim() ?? "";
            if (!label) return finish(null);
            const description = root?.querySelector?.('[name="description"]')?.value?.trim() ?? "";
            finish({ label, description });
          },
        },
        cancel: {
          label: game.i18n.localize("BOT.ui.presets.cancel"),
          callback: () => finish(null),
        },
      },
      default: "save",
      close: () => finish(null),
    }).render(true);
  });
}

window.botSaveCustomPreset = async function(buttonEl) {
  try {
    const form = buttonEl.closest("form");
    if (!form) return;

    const presetData = await promptCustomPresetData();
    if (!presetData) return;

    const customPresets = foundry.utils.deepClone(getCustomPresets());
    const id = getUniqueCustomPresetId(presetData.label, customPresets);
    customPresets[id] = {
      id,
      label: presetData.label,
      description: presetData.description,
      flag: buildBuffConfigFromForm(form),
      source: "custom",
    };
    await game.settings.set(MODULE_ID, "customPresets", customPresets);
    refreshPresetSelect(form, id);
    ui.notifications.info(game.i18n.localize("BOT.notifications.customPresetSaved"));
  } catch (error) {
    console.error(`[${MODULE_ID}] Erreur dans botSaveCustomPreset :`, error);
  }
};
function downloadPresetJson(payload) {
  const filename = "dnd5e-buff-on-trigger-presets.json";
  if (typeof globalThis.saveDataToFile === "function") {
    globalThis.saveDataToFile(payload, "application/json", filename);
    return;
  }

  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

window.botExportCustomPresets = function() {
  try {
    const presets = Object.values(getCustomPresets()).filter((preset) => preset?.label && isPlainObject(preset.flag));
    if (!presets.length) {
      ui.notifications.info(game.i18n.localize("BOT.notifications.noCustomPresetsToExport"));
      return;
    }

    const payload = JSON.stringify({ module: MODULE_ID, version: "1", presets }, null, 2);
    downloadPresetJson(payload);
  } catch (error) {
    console.error(`[${MODULE_ID}] Erreur dans botExportCustomPresets :`, error);
  }
};
function normalizeImportedPreset(preset, existing) {
  if (!preset?.label || !isPlainObject(preset.flag)) return null;
  const id = getUniqueCustomPresetId(preset.id ?? preset.label, existing);
  return {
    id,
    label: String(preset.label),
    description: String(preset.description ?? ""),
    flag: mergeBuffConfig(buildDefaultBuffConfig(), preset.flag),
    source: "custom",
  };
}

function readJsonFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result ?? "")), { once: true });
    reader.addEventListener("error", () => reject(reader.error), { once: true });
    reader.readAsText(file);
  });
}

window.botImportCustomPresets = function(buttonEl) {
  const form = buttonEl.closest("form");
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";
  input.style.display = "none";
  document.body.appendChild(input);
  input.addEventListener("cancel", () => input.remove(), { once: true });
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    input.remove();
    if (!file) return;
    try {
      const text = await readJsonFile(file);
      const data = JSON.parse(text);
      if (data.module && data.module !== MODULE_ID) {
        ui.notifications.warn(game.i18n.localize("BOT.notifications.customPresetImportWrongModule"));
        return;
      }
      if (!Array.isArray(data.presets)) {
        ui.notifications.warn(game.i18n.localize("BOT.notifications.customPresetImportInvalid"));
        return;
      }

      const customPresets = foundry.utils.deepClone(getCustomPresets());
      let importedCount = 0;
      for (const preset of data.presets) {
        const normalized = normalizeImportedPreset(preset, customPresets);
        if (!normalized) continue;
        customPresets[normalized.id] = normalized;
        importedCount += 1;
      }
      await game.settings.set(MODULE_ID, "customPresets", customPresets);
      refreshPresetSelect(form);
      ui.notifications.info(game.i18n.format("BOT.notifications.customPresetImported", { count: importedCount }));
    } catch (error) {
      console.warn(`[${MODULE_ID}] Import de presets invalide`, error);
      ui.notifications.warn(game.i18n.localize("BOT.notifications.customPresetImportInvalid"));
    }
  }, { once: true });
  input.click();
};
window.botDeleteCustomPreset = async function(buttonEl) {
  const form = buttonEl.closest("form");
  const select = form?.querySelector?.('[name="presetId"]');
  const id = select?.value;
  const preset = getPresetById(id);
  if (!preset) return;
  if (preset.source !== "custom") {
    ui.notifications.warn(game.i18n.localize("BOT.notifications.builtInPresetCannotDelete"));
    return;
  }
  const confirmed = window.confirm(game.i18n.format("BOT.ui.presets.confirmDelete", { name: preset.label }));
  if (!confirmed) return;

  const customPresets = foundry.utils.deepClone(getCustomPresets());
  delete customPresets[id];
  await game.settings.set(MODULE_ID, "customPresets", customPresets);
  refreshPresetSelect(form);
  ui.notifications.info(game.i18n.format("BOT.notifications.customPresetDeleted", { name: preset.label }));
};
window.botApplyPreset = function(buttonEl) {
  const form = buttonEl.closest("form");
  const select = form?.querySelector?.('[name="presetId"]');
  const preset = getPresetById(select?.value);
  if (!preset) return;

  if (formHasDraftConfiguration(form)) {
    const confirmed = window.confirm(game.i18n.localize("BOT.ui.presets.confirmReplace"));
    if (!confirmed) return;
  }

  applyPresetFlagToForm(form, buildPresetConfig(preset));
  debugLog(`[${MODULE_ID}] Preset applied: ${preset.id}`);
};

window.botResetBuffConfig = function(buttonEl) {
  const form = buttonEl.closest("form");
  if (!form) return;

  const confirmed = window.confirm(game.i18n.localize("BOT.ui.presets.confirmReset"));
  if (!confirmed) return;

  applyPresetFlagToForm(form, buildDefaultBuffConfig());
  const presetSelect = form.querySelector?.('[name="presetId"]');
  if (presetSelect) {
    presetSelect.value = "";
    window.botUpdatePresetDescription(presetSelect);
    window.botUpdatePresetActions(presetSelect);
  }
  debugLog(`[${MODULE_ID}] Buff configuration reset`);
};
window.botShowTab = function(btn, tabId) {
  const form = btn.closest('form');
  form.querySelectorAll('.bot-tab-panel').forEach(p => p.style.display = 'none');
  btn.closest('.bot-tabs').querySelectorAll('.bot-tab-btn').forEach(b => b.classList.remove('bot-tab-active'));
  form.querySelector('#' + tabId).style.display = '';
  btn.classList.add('bot-tab-active');
  const app = Object.values(ui.windows).find(w => w.constructor.name === "BuffTriggerConfig")
    ?? Object.values(foundry.applications.instances ?? {}).find(w => w.constructor.name === "BuffTriggerConfig");
  if (app) app.resizeToContent();
};

window.botUpdateSaveTimingUI = function(selectEl) {
  const form = selectEl?.closest?.('form');
  if (!form) return;

  const timing = selectEl.value || "trigger";
  const showTriggerControls = timing === "trigger" || timing === "both";
  const showActivationControls = timing === "activation" || timing === "both";

  form.querySelectorAll?.(".bot-save-trigger-control")?.forEach((el) => {
    el.style.display = showTriggerControls ? "" : "none";
  });
  form.querySelectorAll?.(".bot-save-activation-control")?.forEach((el) => {
    el.style.display = showActivationControls ? "" : "none";
  });

  const app = form?.__botApp ?? selectEl.closest?.(".application")?.__botApp;
  if (app) app.resizeToContent();
};

window.botUpdateTriggerUI = function(selectEl) {
  const form = selectEl.closest('form');
  const conditionGroup = form?.querySelector?.("#bot-condition-group");
  const receivedConditionsGroup = form?.querySelector?.("#bot-received-conditions-group");
  const passiveHelp = form?.querySelector?.("#bot-passive-help");

  if (conditionGroup) {
    conditionGroup.style.display = ATTACK_TRIGGER_TYPES.includes(selectEl.value) ? "" : "none";
  }

  if (receivedConditionsGroup) {
    receivedConditionsGroup.style.display = selectEl.value === "damaged" ? "" : "none";
  }

  if (passiveHelp) {
    passiveHelp.style.display = selectEl.value === "passive" ? "" : "none";
  }

  window.botUpdateTargetModeOptions(form, selectEl.value);

  const app = Object.values(ui.windows).find(w => w.constructor.name === "BuffTriggerConfig")
    ?? Object.values(foundry.applications.instances ?? {}).find(w => w.constructor.name === "BuffTriggerConfig");
  if (app) app.resizeToContent();
};

window.botUpdateStoredTargetUI = function(selectEl) {
  const form = selectEl.closest('form');
  const storedTargetGroup = form?.querySelector?.('#bot-stored-target-group');
  if (storedTargetGroup) {
    storedTargetGroup.style.display = selectEl.value === "self" ? "" : "none";
  }
  const app = Object.values(ui.windows).find(w => w.constructor.name === "BuffTriggerConfig")
    ?? Object.values(foundry.applications.instances ?? {}).find(w => w.constructor.name === "BuffTriggerConfig");
  if (app) app.resizeToContent();
};

window.botUpdateSaveDcUI = function(selectEl) {
  const form = selectEl.closest('form');
  const dcGroup = form?.querySelector?.('#bot-save-dc-group');
  if (!dcGroup) return;
  dcGroup.style.display = selectEl.value === "fixed" ? "" : "none";
  const app = Object.values(ui.windows).find(w => w.constructor.name === "BuffTriggerConfig")
    ?? Object.values(foundry.applications.instances ?? {}).find(w => w.constructor.name === "BuffTriggerConfig");
  if (app) app.resizeToContent();
};

window.botShowSubTab = function(btn, tabId) {
  const container = btn.closest('.bot-subtabs-container');
  if (!container) return;
  container.querySelectorAll('.bot-subtab-panel').forEach(p => p.style.display = 'none');
  btn.closest('.bot-tabs').querySelectorAll('.bot-subtab-btn').forEach(b => b.classList.remove('bot-tab-active'));
  container.querySelector('#' + tabId).style.display = '';
  btn.classList.add('bot-tab-active');
  const app = Object.values(ui.windows).find(w => w.constructor.name === "BuffTriggerConfig")
    ?? Object.values(foundry.applications.instances ?? {}).find(w => w.constructor.name === "BuffTriggerConfig");
  if (app) app.resizeToContent();
};

window.botAddTag = function(selectEl, targetId) {
  const value = selectEl.value;
  if (!value) return;
  const label = selectEl.options[selectEl.selectedIndex].text;
  const tagsDiv = document.getElementById('tags-' + targetId);
  if ([...tagsDiv.querySelectorAll('.bot-tag')].some(t => t.dataset.value === value)) {
    selectEl.value = '';
    return;
  }
  const tag = document.createElement('span');
  tag.className = 'bot-tag';
  tag.dataset.value = value;
  tag.innerHTML = label + ' <span class="bot-tag-remove" onclick="botRemoveTag(this, \'' + targetId + '\')">&times;</span>';
  tagsDiv.appendChild(tag);
  botUpdateHidden(targetId);
  selectEl.value = '';
};

window.botRemoveTag = function(removeEl, targetId) {
  removeEl.parentElement.remove();
  botUpdateHidden(targetId);
};

window.botUpdateHidden = function(targetId) {
  const tagsDiv = document.getElementById('tags-' + targetId);
  const hiddenInput = document.getElementById('hidden-' + targetId);
  hiddenInput.value = [...tagsDiv.querySelectorAll('.bot-tag')].map(t => t.dataset.value).join(',');
};

window.botUpdateEffectSectionsUI = function(form) {
  if (!form) return;

  const healingDetails = form.querySelector('#bot-healing-details');
  const healingEnabled = form.querySelector('[name="healingEnabled"]');
  if (healingDetails && healingEnabled) {
    healingDetails.style.display = healingEnabled.checked ? "" : "none";
  }

  const temporaryHpDetails = form.querySelector('#bot-temporary-hp-details');
  const temporaryHpEnabled = form.querySelector('[name="temporaryHpEnabled"]');
  if (temporaryHpDetails && temporaryHpEnabled) {
    temporaryHpDetails.style.display = temporaryHpEnabled.checked ? "" : "none";
  }

  const statusTargetRow = form.querySelector('#bot-status-target-row');
  const statusApplyConditionRow = form.querySelector('#bot-status-apply-condition-row');
  const statusSelect = form.querySelector('[name="statusId"]');
  if (statusTargetRow && statusSelect) {
    statusTargetRow.style.display = statusSelect.value ? "" : "none";
  }
  if (statusApplyConditionRow && statusSelect) {
    statusApplyConditionRow.style.display = statusSelect.value ? "" : "none";
  }

  const app = Object.values(ui.windows).find(w => w.constructor.name === "BuffTriggerConfig")
    ?? Object.values(foundry.applications.instances ?? {}).find(w => w.constructor.name === "BuffTriggerConfig");
  if (app) app.resizeToContent();
};

window.botUpdateRollModifierUI = function(form) {
  if (!form) return;
  const details = form.querySelector('#bot-roll-modifier-details');
  const enabled = form.querySelector('[name="rollModifierEnabled"]');
  if (details && enabled) {
    details.style.display = enabled.checked ? "" : "none";
  }
  const app = Object.values(ui.windows).find(w => w.constructor.name === "BuffTriggerConfig")
    ?? Object.values(foundry.applications.instances ?? {}).find(w => w.constructor.name === "BuffTriggerConfig");
  if (app) app.resizeToContent();
};

window.botUpdateTargetModeOptions = function(form, triggerType) {
  if (!form) return;

  const attackTriggers = ATTACK_TRIGGER_TYPES;
  const turnTriggers = ["turnStart", "turnEnd", "targetTurnStart", "targetTurnEnd"];

  let allowedModes = ["triggerTarget", "self", "attacker", "storedTarget"];
  let fallbackMode = "self";

  if (turnTriggers.includes(triggerType)) {
    allowedModes = ["self", "storedTarget"];
    fallbackMode = "self";
  } else if (triggerType === "damaged") {
    allowedModes = ["self", "attacker", "storedTarget"];
    fallbackMode = "attacker";
  } else if (attackTriggers.includes(triggerType)) {
    allowedModes = ["triggerTarget", "self", "storedTarget"];
    fallbackMode = "triggerTarget";
  } else if (triggerType === "passive") {
    allowedModes = ["self", "storedTarget"];
    fallbackMode = "self";
  }

  const selectNames = ["damageTargetMode", "statusTargetMode", "healingTargetMode", "temporaryHpTargetMode"];
  for (const name of selectNames) {
    const select = form.querySelector(`[name="${name}"]`);
    if (!select) continue;

    for (const option of select.options) {
      const allowed = allowedModes.includes(option.value);
      option.hidden = !allowed;
      option.disabled = !allowed;
    }

    if (!allowedModes.includes(select.value)) {
      select.value = fallbackMode;
    }

    if (!allowedModes.includes(select.value)) {
      select.value = allowedModes[0] ?? "";
    }
  }
};

window.botInsertFormulaVariable = function(buttonEl, variableName) {
  const form = buttonEl.closest('form');
  const input = form?.__botLastFormulaInput
    ?? form?.querySelector?.('input[name="damageFormula"], input[name="healingFormula"], input[name="temporaryHpFormula"], input[name="rollModifierFormula"]');
  if (!input) return;

  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  input.value = `${input.value.slice(0, start)}${variableName}${input.value.slice(end)}`;
  input.focus();
  const cursor = start + variableName.length;
  if (typeof input.setSelectionRange === "function") input.setSelectionRange(cursor, cursor);
  form.__botLastFormulaInput = input;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
};

export function registerItemSheetButton() {
  debugLog(`[${MODULE_ID}] registerItemSheetButton enregistré`);

  Hooks.on("renderItemSheet5e", (app, html) => {
    const item = app?.item ?? app?.document ?? app?.object;

    let root;
    if (app.element instanceof HTMLElement) {
      root = app.element;
    } else if (app.element?.[0] instanceof HTMLElement) {
      root = app.element[0];
    } else if (html instanceof HTMLElement) {
      root = html;
    } else {
      root = html?.[0];
    }
    if (!root) return;

    const applicationRoot = root.matches?.(".application") ? root : root.closest?.(".application") ?? root;
    const header = applicationRoot.querySelector?.(".window-header");
    if (!header) return;

    const closeControl = header.querySelector('[data-action="close"], .header-control.close, .window-control.close, .close');

    header.querySelector(".bot-config-btn")?.remove();

    const buttonTag = closeControl?.tagName?.toLowerCase?.() || "button";
    const button = document.createElement(buttonTag);
    button.classList.add("header-control", "bot-config-btn");
    button.type = "button";
    button.title = game.i18n.localize("BOT.moduleTitle");
    button.setAttribute("aria-label", game.i18n.localize("BOT.moduleTitle"));
    button.innerHTML = '<i class="fas fa-bolt" aria-hidden="true"></i>';

    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      new BuffTriggerConfig(item).render({ force: true });
    });

    if (closeControl) {
      closeControl.parentElement.insertBefore(button, closeControl);
    } else {
      header.append(button);
    }
  });
}

import { MODULE_ID, SKILL_IDS, DAMAGE_TYPES, ARMOR_PROF_IDS, WEAPON_PROF_IDS, LANGUAGE_IDS } from "./constants.js";

import { buildItemDurationData, getItemDurationInRounds } from "./duration.js";

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

function getTargetModeLabel(targetMode) {
  return game.i18n.localize(`BOT.ui.targetMode.${targetMode ?? "self"}`);
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

function getTriggerFrequencyLabel(frequency) {
  return game.i18n.localize(`BOT.ui.triggerFrequency.${frequency ?? "none"}`);
}

function getDamageTargetModeLabel(targetMode) {
  return game.i18n.localize(`BOT.ui.damage.targetMode.${targetMode ?? "legacy"}`);
}

function getStatusTargetModeLabel(targetMode) {
  return game.i18n.localize(`BOT.ui.status.targetMode.${targetMode ?? "legacy"}`);
}

function getSaveDcSourceLabel(source) {
  return game.i18n.localize(`BOT.ui.saveDcSource.${source ?? "fixed"}`);
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
      if (!id || id === "bot-active") return null;
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
    || (buffs.skills ?? []).length > 0
    || (buffs.skillBonusSkills ?? []).length > 0
    || (buffs.resistances ?? []).length > 0
    || (buffs.vulnerabilities ?? []).length > 0
    || (buffs.immunities ?? []).length > 0
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
  ];

  if (["mwak", "rwak", "msak", "rsak"].includes(raw.type)) {
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
      value: `${raw.temporaryHp.formula} (${getTemporaryHpTargetModeLabel(temporaryHpTargetMode)} • ${getTemporaryHpModeLabel(raw.temporaryHp.mode)})`
    });
  }

  if (raw.save?.ability) {
    const saveDcSource = raw.save.dcSource ?? "fixed";
    summary.push({
      label: game.i18n.localize("BOT.ui.summary.save"),
      value: `${game.i18n.localize(`BOT.abilities.${raw.save.ability}`)} • ${saveDcSource === "fixed" ? `${getSaveDcSourceLabel("fixed")} ${raw.save.dc ?? game.i18n.localize("BOT.ui.summary.notConfigured")}` : getSaveDcSourceLabel(saveDcSource)} • ${game.i18n.localize(`BOT.ui.saveEffect.${raw.save.effect ?? "half"}`)}`
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

  if (isFilled(raw.charges)) {
    summary.push({
      label: game.i18n.localize("BOT.ui.summary.charges"),
      value: String(raw.charges)
    });
  }

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
      width: 480,
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
    const formulaInputs = this.element.querySelectorAll?.('input[name="damageFormula"], input[name="healingFormula"], input[name="temporaryHpFormula"]') ?? [];
    for (const input of formulaInputs) {
      input.addEventListener("focus", () => {
        if (form) form.__botLastFormulaInput = input;
      });
      input.addEventListener("click", () => {
        if (form) form.__botLastFormulaInput = input;
      });
      input.addEventListener("input", () => {
        if (form) window.botUpdateEffectSectionsUI(form);
      });
    }
    const healingEnabled = this.element.querySelector?.('[name="healingEnabled"]');
    if (healingEnabled) healingEnabled.addEventListener("change", () => window.botUpdateEffectSectionsUI(form));
    const temporaryHpEnabled = this.element.querySelector?.('[name="temporaryHpEnabled"]');
    if (temporaryHpEnabled) temporaryHpEnabled.addEventListener("change", () => window.botUpdateEffectSectionsUI(form));
    const statusSelect = this.element.querySelector?.('[name="statusId"]');
    if (statusSelect) statusSelect.addEventListener("change", () => window.botUpdateEffectSectionsUI(form));
    this.element.querySelectorAll?.('.bot-collapsible-panel')?.forEach((panel) => {
      panel.addEventListener("toggle", () => this.resizeToContent());
    });
    if (form) window.botUpdateEffectSectionsUI(form);
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
    const statusLabels = Object.fromEntries(statusOptions.map((option) => [option.value, option.label]));
    const labels = {
      skills: skillLabels,
      damageTypes: damageLabels,
      weaponProfs: weaponProfLabels,
      armorProfs: armorProfLabels,
      languages: languageLabels,
      statuses: statusLabels,
    };
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
      targetMode:            raw.targetMode ?? "self",
      targetModeSelf:        (raw.targetMode ?? "self") === "self",
      targetModeTarget:      raw.targetMode === "target",
      targetModeAlly:        raw.targetMode === "ally",
      typeMwak:              raw.type === "mwak",
      typeRwak:              raw.type === "rwak",
      typeMsak:              raw.type === "msak",
      typeRsak:              raw.type === "rsak",
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
      temporaryHpTargetModeTriggerTarget: temporaryHpTargetMode === "triggerTarget",
      temporaryHpTargetModeSelf: temporaryHpTargetMode === "self",
      temporaryHpTargetModeAttacker: temporaryHpTargetMode === "attacker",
      temporaryHpTargetModeStoredTarget: temporaryHpTargetMode === "storedTarget",
      temporaryHpModeKeepHighest: (raw.temporaryHp?.mode ?? "keepHighest") === "keepHighest",
      temporaryHpModeReplace:    raw.temporaryHp?.mode === "replace",
      temporaryHpModeAdd:        raw.temporaryHp?.mode === "add",
      skillAdvantageOptions,
      skillBonusOptions,
      resistanceOptions,
      vulnOptions,
      immunityOptions,
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
      saveDC:                raw.save?.dc ?? 15,
      saveDcSourceFixed:     (raw.save?.dcSource ?? "fixed") === "fixed",
      saveDcSourceOrigin:    raw.save?.dcSource === "origin",
      saveDcSourceOwner:     raw.save?.dcSource === "owner",
      saveEffectNone:        (raw.save?.effect ?? "half") === "none",
      saveEffectHalf:        (raw.save?.effect ?? "half") === "half",
      saveEffectFull:        raw.save?.effect === "full",
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
        targetMode: data.targetMode ?? "self",
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
          type: data.damageType,
          ...(shouldPersistDamageTargetMode ? { targetMode: submittedDamageTargetMode } : {})
        } : null,
        healing: data.healingEnabled && data.healingFormula ? {
          formula: data.healingFormula,
          targetMode: normalizeHealingTargetMode(data.healingTargetMode),
        } : null,
        temporaryHp: data.temporaryHpEnabled && data.temporaryHpFormula ? {
          formula: data.temporaryHpFormula,
          targetMode: normalizeTemporaryHpTargetMode(data.temporaryHpTargetMode),
          mode: data.temporaryHpMode ?? "keepHighest",
        } : null,
          save: data.saveAbility ? {
            ability: data.saveAbility,
            dc: Number(data.saveDC),
            dcSource: data.saveDcSource ?? "fixed",
            effect: data.saveEffect
          } : null,
          status: data.statusId ? {
            id: data.statusId,
            ...(shouldPersistStatusTargetMode ? { targetMode: submittedStatusTargetMode } : {})
          } : null,
        charges: data.charges ? Number(data.charges) : null,
        buffs: (() => {
          const toArray = v => v ? v.split(',').filter(Boolean) : [];
          return {
            ac: data.buffAC ? Number(data.buffAC) : null,
            attackMode: data.buffAttackMode !== "none" ? data.buffAttackMode : null,
            saveMode: data.buffSaveMode !== "none" ? data.buffSaveMode : null,
            skillMode: data.buffSkillMode !== "none" ? data.buffSkillMode : null,
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
    console.log(`[${MODULE_ID}] Configuration sauvegardée sur ${this.item.name}`);
  }
}

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

window.botUpdateTriggerUI = function(selectEl) {
  const form = selectEl.closest('form');
  const conditionGroup = form?.querySelector?.("#bot-condition-group");
  const receivedConditionsGroup = form?.querySelector?.("#bot-received-conditions-group");

  if (conditionGroup) {
    conditionGroup.style.display = ["mwak", "rwak", "msak", "rsak"].includes(selectEl.value) ? "" : "none";
  }

  if (receivedConditionsGroup) {
    receivedConditionsGroup.style.display = selectEl.value === "damaged" ? "" : "none";
  }

  window.botUpdateTargetModeOptions(form, selectEl.value);

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
  tag.innerHTML = label + ' <span class="bot-tag-remove" onclick="botRemoveTag(this, \'' + targetId + '\')">✕</span>';
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
  const statusSelect = form.querySelector('[name="statusId"]');
  if (statusTargetRow && statusSelect) {
    statusTargetRow.style.display = statusSelect.value ? "" : "none";
  }

  const app = Object.values(ui.windows).find(w => w.constructor.name === "BuffTriggerConfig")
    ?? Object.values(foundry.applications.instances ?? {}).find(w => w.constructor.name === "BuffTriggerConfig");
  if (app) app.resizeToContent();
};

window.botUpdateTargetModeOptions = function(form, triggerType) {
  if (!form) return;

  const attackTriggers = ["mwak", "rwak", "msak", "rsak"];
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
    ?? form?.querySelector?.('input[name="damageFormula"], input[name="healingFormula"], input[name="temporaryHpFormula"]');
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
  console.log(`[${MODULE_ID}] registerItemSheetButton enregistré`);

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




const MODULE_ID = "dnd5e-buff-on-trigger";
const SKILL_IDS = ["acr","ani","arc","ath","dec","his","ins","itm","inv","med","nat","prc","prf","per","rel","slt","ste","sur"];
const DAMAGE_TYPES = ["acid","bludgeoning","cold","fire","force","lightning","necrotic","piercing","poison","psychic","radiant","slashing","thunder"];

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

class BuffTriggerConfig extends FormApplication {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      title: game.i18n.localize("BOT.ui.configTitle"),
      template: "modules/dnd5e-buff-on-trigger/templates/buff-config.html",
      width: 400,
      height: "auto",
      resizable: true,
      closeOnSubmit: true,
    });
  }

  constructor(item, options) {
    super(options);
    this.item = item;
  }

  getData() {
    const raw = this.item.getFlag(MODULE_ID, "buffTrigger") ?? {};
    const skillLabels = getSkillLabels();
    const damageLabels = getDamageLabels();
    const weaponProfLabels = getWeaponProfLabels();
    const armorProfLabels = getArmorProfLabels();
    const languageLabels = getLanguageLabels();
    const skillAdvantageOptions = SKILL_IDS.map(id => ({ value: id, label: skillLabels[id], selected: (raw.buffs?.skills ?? []).includes(id) }));
    const skillBonusOptions     = SKILL_IDS.map(id => ({ value: id, label: skillLabels[id], selected: (raw.buffs?.skillBonusSkills ?? []).includes(id) }));
    const resistanceOptions     = DAMAGE_TYPES.map(t => ({ value: t, label: damageLabels[t], selected: (raw.buffs?.resistances ?? []).includes(t) }));
    const vulnOptions           = DAMAGE_TYPES.map(t => ({ value: t, label: damageLabels[t], selected: (raw.buffs?.vulnerabilities ?? []).includes(t) }));
    const immunityOptions       = DAMAGE_TYPES.map(t => ({ value: t, label: damageLabels[t], selected: (raw.buffs?.immunities ?? []).includes(t) }));
    const weaponProfOptions     = Object.entries(weaponProfLabels).map(([value, label]) => ({ value, label, selected: (raw.buffs?.weaponProfs ?? []).includes(value) }));
    const armorProfOptions      = Object.entries(armorProfLabels).map(([value, label]) => ({ value, label, selected: (raw.buffs?.armorProfs ?? []).includes(value) }));
    const languageOptions       = Object.entries(languageLabels).map(([value, label]) => ({ value, label, selected: (raw.buffs?.languages ?? []).includes(value) }));
    const flag = {
      ...raw,
      targetMode:            raw.targetMode ?? "self",
      targetModeSelf:        (raw.targetMode ?? "self") === "self",
      targetModeTarget:      raw.targetMode === "target",
      targetModeAlly:        raw.targetMode === "ally",
      typeMwak:              raw.type === "mwak",
      typeRwak:              raw.type === "rwak",
      typeTurnStart:         raw.type === "turnStart",
      typeTurnEnd:           raw.type === "turnEnd",
      typeTargetTurnStart:   raw.type === "targetTurnStart",
      typeTargetTurnEnd:     raw.type === "targetTurnEnd",
      consumeOnTrigger:      raw.consumeOnTrigger ?? true,
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
      durationRounds:        raw.duration?.rounds ?? "",
      saveAbility:           raw.save?.ability ?? "",
      saveDC:                raw.save?.dc ?? 15,
      saveEffectNone:        (raw.save?.effect ?? "half") === "none",
      saveEffectHalf:        (raw.save?.effect ?? "half") === "half",
      saveEffectFull:        raw.save?.effect === "full",
      conditionHit:          (raw.condition ?? "hit") === "hit",
      conditionMiss:         raw.condition === "miss",
      conditionAlways:       raw.condition === "always",
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
    };
    return { flag };
  }

  async _updateObject(event, formData) {
    if (!formData.enabled) {
      await this.item.unsetFlag(MODULE_ID, "buffTrigger");
    } else {
      const flag = {
        targetMode: formData.targetMode ?? "self",
        type: formData.type,
        condition: formData.condition,
        consumeOnTrigger: formData.consumeOnTrigger ?? true,
        damage: formData.damageFormula ? { formula: formData.damageFormula, type: formData.damageType } : null,
        save: formData.saveAbility ? { ability: formData.saveAbility, dc: Number(formData.saveDC), effect: formData.saveEffect } : null,
        status: formData.statusId ? { id: formData.statusId } : null,
        charges: formData.charges ? Number(formData.charges) : null,
        buffs: (() => {
          const toArray = v => v ? v.split(',').filter(Boolean) : [];
          return {
            ac: formData.buffAC ? Number(formData.buffAC) : null,
            attackMode: formData.buffAttackMode !== "none" ? formData.buffAttackMode : null,
            saveMode: formData.buffSaveMode !== "none" ? formData.buffSaveMode : null,
            skillMode: formData.buffSkillMode !== "none" ? formData.buffSkillMode : null,
            skills: toArray(formData.buffSkillAdvantageList),
            skillBonusSkills: toArray(formData.buffSkillBonusList),
            skillBonus: formData.buffSkillBonus || null,
            skillBonusAll: formData.buffSkillBonusAll || null,
            saveBonus: formData.buffSaveBonus || null,
            attackBonus: formData.buffAttackBonus || null,
            speed: formData.buffSpeed ? { value: Number(formData.buffSpeed), type: formData.buffSpeedType ?? "walk" } : null,
            weaponProfs: toArray(formData.buffWeaponProfsList),
            armorProfs: toArray(formData.buffArmorProfsList),
            languages: toArray(formData.buffLanguagesList),
            darkvision: formData.buffDarkvision ? Number(formData.buffDarkvision) : null,
            blindsight: formData.buffBlindSight ? Number(formData.buffBlindSight) : null,
            tremorsense: formData.buffTremorSense ? Number(formData.buffTremorSense) : null,
            truesight: formData.buffTrueSight ? Number(formData.buffTrueSight) : null,
            sensesSpecial: formData.buffSensesSpecial || null,
            passivePerception: formData.buffPassivePerception ? Number(formData.buffPassivePerception) : null,
            resistances: toArray(formData.buffResistancesList),
            vulnerabilities: toArray(formData.buffVulnsList),
            immunities: toArray(formData.buffImmunitiesList),
          };
        })(),
        duration: {
          rounds: formData.durationRounds ? Number(formData.durationRounds) : null,
        },
      };
      await this.item.setFlag(MODULE_ID, "buffTrigger", flag);
    }
    console.log(`[${MODULE_ID}] Configuration sauvegardée sur ${this.item.name}`);
  }
}

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
      new BuffTriggerConfig(item).render(true);
    });

    if (closeControl) {
      closeControl.parentElement.insertBefore(button, closeControl);
    } else {
      header.append(button);
    }
  });
}

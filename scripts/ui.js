const MODULE_ID = "dnd5e-buff-on-trigger";
const SKILL_IDS = ["acr","ani","arc","ath","dec","his","ins","itm","inv","med","nat","prc","prf","per","rel","slt","ste","sur"];
const DAMAGE_TYPES = ["acid","bludgeoning","cold","fire","force","lightning","necrotic","piercing","poison","psychic","radiant","slashing","thunder"];
const SKILL_LABELS = { acr:"Acrobaties", ani:"Dressage", arc:"Arcanes", ath:"Athlétisme", dec:"Tromperie", his:"Histoire", ins:"Perspicacité", itm:"Intimidation", inv:"Investigation", med:"Médecine", nat:"Nature", prc:"Perception", prf:"Représentation", per:"Persuasion", rel:"Religion", slt:"Escamotage", ste:"Discrétion", sur:"Survie" };
const DAMAGE_LABELS = { acid:"Acide", bludgeoning:"Contondant", cold:"Froid", fire:"Feu", force:"Force", lightning:"Foudre", necrotic:"Nécrotique", piercing:"Perforant", poison:"Poison", psychic:"Psychique", radiant:"Radiant", slashing:"Tranchant", thunder:"Tonnerre" };
const WEAPON_PROF_LABELS = {
  sim: "Armes courantes", mar: "Armes de guerre",
  longsword: "Épée longue", shortsword: "Épée courte",
  dagger: "Dague", handaxe: "Hachette", greataxe: "Grande hache",
  battleaxe: "Hache de bataille", mace: "Masse", warhammer: "Marteau de guerre",
  spear: "Lance", quarterstaff: "Bâton", bow: "Arc", crossbow: "Arbalète"
};
const ARMOR_PROF_LABELS = {
  lgt: "Armures légères", med: "Armures intermédiaires",
  hvy: "Armures lourdes", shl: "Boucliers"
};
const LANGUAGE_LABELS = {
  common: "Commun", elvish: "Elfique", dwarvish: "Nain",
  orcish: "Orque", draconic: "Draconique", infernal: "Infernal",
  celestial: "Céleste", abyssal: "Abyssal", undercommon: "Commun des profondeurs",
  gnomish: "Gnome", halfling: "Halfelin", goblin: "Gobelin",
  sylvan: "Sylvestre", primordial: "Primordial", deep: "Profond"
};

class BuffTriggerConfig extends FormApplication {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      title: "Buff on Trigger — Configuration",
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
    const skillAdvantageOptions = SKILL_IDS.map(id => ({ value: id, label: SKILL_LABELS[id], selected: (raw.buffs?.skills ?? []).includes(id) }));
    const skillBonusOptions     = SKILL_IDS.map(id => ({ value: id, label: SKILL_LABELS[id], selected: (raw.buffs?.skillBonusSkills ?? []).includes(id) }));
    const resistanceOptions     = DAMAGE_TYPES.map(t => ({ value: t, label: DAMAGE_LABELS[t], selected: (raw.buffs?.resistances ?? []).includes(t) }));
    const vulnOptions           = DAMAGE_TYPES.map(t => ({ value: t, label: DAMAGE_LABELS[t], selected: (raw.buffs?.vulnerabilities ?? []).includes(t) }));
    const immunityOptions       = DAMAGE_TYPES.map(t => ({ value: t, label: DAMAGE_LABELS[t], selected: (raw.buffs?.immunities ?? []).includes(t) }));
    const weaponProfOptions     = Object.entries(WEAPON_PROF_LABELS).map(([value, label]) => ({ value, label, selected: (raw.buffs?.weaponProfs ?? []).includes(value) }));
    const armorProfOptions      = Object.entries(ARMOR_PROF_LABELS).map(([value, label]) => ({ value, label, selected: (raw.buffs?.armorProfs ?? []).includes(value) }));
    const languageOptions       = Object.entries(LANGUAGE_LABELS).map(([value, label]) => ({ value, label, selected: (raw.buffs?.languages ?? []).includes(value) }));
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
    button.title = "Buff on Trigger";
    button.setAttribute("aria-label", "Buff on Trigger");
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

const MODULE_ID = "dnd5e-buff-on-trigger";
const SKILL_IDS = ["acr","ani","arc","ath","dec","his","ins","itm","inv","med","nat","prc","prf","per","rel","slt","ste","sur"];

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
      buffSkillAll:              raw.buffs?.skills?.includes("all") ?? false,
      buffSkill_acr:             raw.buffs?.skills?.includes("acr") ?? false,
      buffSkill_ani:             raw.buffs?.skills?.includes("ani") ?? false,
      buffSkill_arc:             raw.buffs?.skills?.includes("arc") ?? false,
      buffSkill_ath:             raw.buffs?.skills?.includes("ath") ?? false,
      buffSkill_dec:             raw.buffs?.skills?.includes("dec") ?? false,
      buffSkill_his:             raw.buffs?.skills?.includes("his") ?? false,
      buffSkill_ins:             raw.buffs?.skills?.includes("ins") ?? false,
      buffSkill_itm:             raw.buffs?.skills?.includes("itm") ?? false,
      buffSkill_inv:             raw.buffs?.skills?.includes("inv") ?? false,
      buffSkill_med:             raw.buffs?.skills?.includes("med") ?? false,
      buffSkill_nat:             raw.buffs?.skills?.includes("nat") ?? false,
      buffSkill_prc:             raw.buffs?.skills?.includes("prc") ?? false,
      buffSkill_prf:             raw.buffs?.skills?.includes("prf") ?? false,
      buffSkill_per:             raw.buffs?.skills?.includes("per") ?? false,
      buffSkill_rel:             raw.buffs?.skills?.includes("rel") ?? false,
      buffSkill_slt:             raw.buffs?.skills?.includes("slt") ?? false,
      buffSkill_ste:             raw.buffs?.skills?.includes("ste") ?? false,
      buffSkill_sur:             raw.buffs?.skills?.includes("sur") ?? false,
      buffSkillBonus:            raw.buffs?.skillBonus ?? "",
      buffSaveBonus:             raw.buffs?.saveBonus ?? "",
      buffAttackBonus:           raw.buffs?.attackBonus ?? "",
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
        buffs: {
          ac: formData.buffAC ? Number(formData.buffAC) : null,
          attackMode: formData.buffAttackMode !== "none" ? formData.buffAttackMode : null,
          saveMode: formData.buffSaveMode !== "none" ? formData.buffSaveMode : null,
          skillMode: formData.buffSkillMode !== "none" ? formData.buffSkillMode : null,
          skills: formData.buffSkillAll
            ? ["all"]
            : SKILL_IDS.filter((id) => formData[`buffSkill_${id}`]),
          skillBonus: formData.buffSkillBonus || null,
          saveBonus: formData.buffSaveBonus || null,
          attackBonus: formData.buffAttackBonus || null,
        },
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

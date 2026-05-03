import { MODULE_ID, BUFF_ICON, SKILL_IDS } from "./constants.js";

const DAMAGE_LABEL_KEYS = {
  acid: "BOT.damageTypes.acid",
  bludgeoning: "BOT.damageTypes.bludgeoning",
  cold: "BOT.damageTypes.cold",
  fire: "BOT.damageTypes.fire",
  force: "BOT.damageTypes.force",
  lightning: "BOT.damageTypes.lightning",
  necrotic: "BOT.damageTypes.necrotic",
  piercing: "BOT.damageTypes.piercing",
  poison: "BOT.damageTypes.poison",
  psychic: "BOT.damageTypes.psychic",
  radiant: "BOT.damageTypes.radiant",
  slashing: "BOT.damageTypes.slashing",
  thunder: "BOT.damageTypes.thunder"
};

function localize(key) {
  return game.i18n.localize(key);
}

function localizeDamageType(type) {
  return game.i18n.localize(DAMAGE_LABEL_KEYS[type] ?? type);
}

export async function refreshBuffIndicator(actor, itemName = null, extraChanges = []) {
  try {
    const existing = actor.effects.find((e) => e.statuses?.has("bot-active"));
    const activeBuff = actor.getFlag(MODULE_ID, "activeBuff");

    if (existing) await existing.delete();

    if (!activeBuff && itemName) {
      for (const token of canvas.tokens.placeables) {
        if (token.actor) await removeTargetIndicator(token.actor, itemName);
      }
    }

    if (activeBuff) {
      const durationRounds = activeBuff.duration?.rounds ?? null;
      await actor.createEmbeddedDocuments("ActiveEffect", [{
        name: (activeBuff.itemName ?? localize("BOT.fallback.effectName")) + " ⚡",
        img: activeBuff.itemImg ?? BUFF_ICON,
        statuses: ["bot-active"],
        changes: extraChanges,
        duration: durationRounds ? { rounds: durationRounds, startRound: game.combat?.round ?? 0 } : {},
        flags: { [MODULE_ID]: { indicator: true } },
      }]);
    }
  } catch (error) {
    console.error(`[${MODULE_ID}] Erreur dans refreshBuffIndicator :`, error);
  }
}

export async function applyTargetIndicator(targetActor, flag) {
  if (!targetActor) return;
  const itemName = flag.itemName ?? localize("BOT.fallback.effectName");
  const itemImg = flag.itemImg ?? BUFF_ICON;
  const existing = targetActor.effects.find(
    (e) => e.flags?.[MODULE_ID]?.targetIndicator === true && e.name === itemName
  );
  if (existing) return;
  await targetActor.createEmbeddedDocuments("ActiveEffect", [{
    name: itemName,
    img: itemImg,
    statuses: ["bot-target-" + (flag.itemName ?? "buff").slugify()],
    flags: { [MODULE_ID]: { targetIndicator: true } },
    duration: {},
  }]);
  console.log(`[${MODULE_ID}] Indicateur posé sur ${targetActor.name}`);
}

export async function removeTargetIndicator(targetActor, itemName) {
  if (!targetActor) return;
  const existing = targetActor.effects.find(
    (e) => e.flags?.[MODULE_ID]?.targetIndicator && e.name === itemName
  );
  if (existing) await existing.delete();
}

function resolveTargets(workflow, flag) {
  const targetMode = flag.targetMode ?? "self";
  const condition = flag.condition ?? "hit";
  const hitIds = new Set((workflow.hitTargets ?? []).map((t) => t.id));

  if (targetMode === "target") {
    const token = canvas.tokens.get(flag.targetTokenId);
    if (!token) return new Set();
    const targetIds = new Set((workflow.targets ?? []).map((t) => t.id));
    if (!targetIds.has(token.id)) {
      console.log(`[${MODULE_ID}] Mode target — cible fixe non visée, pas de déclenchement`);
      return new Set();
    }
    if (condition === "hit" && !hitIds.has(token.id)) return new Set();
    if (condition === "miss" && hitIds.has(token.id)) return new Set();
    return new Set([token]);
  }

  // "self" et "ally" : même logique, les cibles viennent du workflow
  if (condition === "miss") {
    return new Set([...(workflow.targets ?? [])].filter((t) => !hitIds.has(t.id)));
  } else if (condition === "always") {
    return workflow.targets ?? new Set();
  } else {
    return workflow.hitTargets ?? new Set();
  }
}

async function consumeOrDecrementCharges(workflow, flag, targets) {
  try {
    if (flag.chargesRemaining !== null) {
      const newCharges = flag.chargesRemaining - 1;
      console.log(`[${MODULE_ID}] Charges restantes : ${newCharges}`);
      if (newCharges <= 0) {
        const actor = workflow.actor;
        await actor?.unsetFlag(MODULE_ID, "activeBuff");
        console.log(`[${MODULE_ID}] Buff épuisé — toutes les charges consommées`);
        const mechEffects = actor?.effects.filter((e) => e.flags?.[MODULE_ID]?.mechanicalBuff === true);
        for (const e of mechEffects ?? []) await e.delete();
        const concentrationEffect = actor?.effects.find(
          (e) => e.statuses?.has("concentrating") || e.statuses?.has("concentration")
        );
        if (concentrationEffect) {
          await concentrationEffect.delete();
          console.log(`[${MODULE_ID}] Concentration retirée (charges épuisées) sur ${actor.name}`);
        }
        await refreshBuffIndicator(actor, flag.itemName);
        for (const token of targets) {
          if (token.actor) await removeTargetIndicator(token.actor, flag.itemName);
        }
      } else {
        await workflow.actor?.setFlag(MODULE_ID, "activeBuff", { ...flag, chargesRemaining: newCharges });
        console.log(`[${MODULE_ID}] ${newCharges} charge(s) restante(s) sur ${workflow.actor.name}`);
      }
    } else if (workflow.item !== null && flag.consumeOnTrigger !== false) {
      const actor = workflow.actor;
      await actor?.unsetFlag(MODULE_ID, "activeBuff");
      console.log(`[${MODULE_ID}] Buff consommé sur ${actor?.name}`);
      const mechEffects = actor?.effects.filter((e) => e.flags?.[MODULE_ID]?.mechanicalBuff === true);
      for (const e of mechEffects ?? []) await e.delete();
      const concentrationEffect = actor?.effects.find(
        (e) => e.statuses?.has("concentrating") || e.statuses?.has("concentration")
      );
      if (concentrationEffect) {
        await concentrationEffect.delete();
        console.log(`[${MODULE_ID}] Concentration retirée sur ${actor?.name}`);
      }
      await refreshBuffIndicator(actor, flag.itemName);
      for (const token of targets) {
        if (token.actor) await removeTargetIndicator(token.actor, flag.itemName);
      }
    }
  } catch (error) {
    console.error(`[${MODULE_ID}] Erreur dans consumeOrDecrementCharges :`, error);
  }
}

export function buildMechanicalChanges(flag) {
  if (!flag.buffs) return [];
  const {
    ac,
    attackMode,
    saveMode,
    skillMode,
    skills,
    skillBonus,
    skillBonusSkills,
    skillBonusAll,
    saveBonus,
    attackBonus,
    speed,
    resistances,
    vulnerabilities,
    immunities,
    weaponProfs,
    armorProfs,
    languages,
    darkvision,
    blindsight,
    tremorsense,
    truesight,
    sensesSpecial,
    passivePerception
  } = flag.buffs;
  const changes = [];
  if (ac) changes.push({ key: "system.attributes.ac.bonus", mode: 2, value: String(ac), priority: 20 });
  if (attackMode) {
    const key = attackMode === "advantage" ? "flags.midi-qol.advantage.attack.all" : "flags.midi-qol.disadvantage.attack.all";
    changes.push({ key, mode: 5, value: "1", priority: 20 });
  }
  if (saveMode) {
    const key = saveMode === "advantage" ? "flags.midi-qol.advantage.save.all" : "flags.midi-qol.disadvantage.save.all";
    changes.push({ key, mode: 5, value: "1", priority: 20 });
  }
  if (skillMode) {
    const key = skillMode === "advantage" ? "flags.midi-qol.advantage.check.all" : "flags.midi-qol.disadvantage.check.all";
    changes.push({ key, mode: 5, value: "1", priority: 20 });
  }
  // Avantage sur les compétences sélectionnées
  if (skills?.length) {
    for (const id of skills) {
      changes.push({ key: `flags.midi-qol.advantage.skill.${id}`, mode: 5, value: "1", priority: 20 });
    }
  }
  // Bonus sur les compétences sélectionnées
  if (skillBonusSkills?.length && skillBonus) {
    for (const id of skillBonusSkills) {
      changes.push({ key: `system.skills.${id}.bonuses.check`, mode: 2, value: String(skillBonus), priority: 20 });
    }
  }
  // Bonus sur TOUTES les compétences
  if (skillBonusAll) {
    for (const id of SKILL_IDS) {
      changes.push({ key: `system.skills.${id}.bonuses.check`, mode: 2, value: String(skillBonusAll), priority: 20 });
    }
  }
  if (saveBonus) changes.push({ key: "system.bonuses.abilities.save", mode: 2, value: String(saveBonus), priority: 20 });
  if (attackBonus) {
    changes.push({ key: "system.bonuses.mwak.attack", mode: 2, value: String(attackBonus), priority: 20 });
    changes.push({ key: "system.bonuses.rwak.attack", mode: 2, value: String(attackBonus), priority: 20 });
  }
  if (speed?.value) changes.push({ key: `system.attributes.movement.${speed.type ?? "walk"}`, mode: 2, value: String(speed.value), priority: 20 });
  if (resistances?.length) {
    for (const type of resistances) changes.push({ key: "system.traits.dr.value", mode: 2, value: type, priority: 20 });
  }
  if (vulnerabilities?.length) {
    for (const type of vulnerabilities) changes.push({ key: "system.traits.dv.value", mode: 2, value: type, priority: 20 });
  }
  if (immunities?.length) {
    for (const type of immunities) changes.push({ key: "system.traits.di.value", mode: 2, value: type, priority: 20 });
  }
  for (const id of weaponProfs ?? []) {
    changes.push({ key: "system.traits.weaponProf.value", mode: 0, value: id, priority: 20 });
  }
  for (const id of armorProfs ?? []) {
    changes.push({ key: "system.traits.armorProf.value", mode: 0, value: id, priority: 20 });
  }
  for (const id of languages ?? []) {
    changes.push({ key: "system.traits.languages.value", mode: 0, value: id, priority: 20 });
  }
  if (darkvision) {
    changes.push({ key: "system.attributes.senses.darkvision", mode: 2, value: String(darkvision), priority: 20 });
  }
  if (blindsight) {
    changes.push({ key: "system.attributes.senses.blindsight", mode: 2, value: String(blindsight), priority: 20 });
  }
  if (tremorsense) {
    changes.push({ key: "system.attributes.senses.tremorsense", mode: 2, value: String(tremorsense), priority: 20 });
  }
  if (truesight) {
    changes.push({ key: "system.attributes.senses.truesight", mode: 2, value: String(truesight), priority: 20 });
  }
  if (sensesSpecial) {
    changes.push({ key: "system.attributes.senses.special", mode: 0, value: sensesSpecial, priority: 20 });
  }
  if (passivePerception) {
    changes.push({ key: "system.skills.prc.bonuses.passive", mode: 2, value: String(passivePerception), priority: 20 });
  }
  return changes;
}

export async function applyMechanicalBuffs(actor, flag, durationRounds) {
  try {
    const changes = buildMechanicalChanges(flag);
    if (!changes.length) return;
    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: flag.itemName ?? localize("BOT.fallback.effectName"),
      img: flag.itemImg ?? BUFF_ICON,
      changes,
      duration: durationRounds ? { rounds: durationRounds, startRound: game.combat?.round ?? 0 } : {},
      flags: { [MODULE_ID]: { mechanicalBuff: true } },
    }]);
    console.log(`[${MODULE_ID}] Buffs mécaniques appliqués sur ${actor.name}`);
  } catch (error) {
    console.error(`[${MODULE_ID}] Erreur dans applyMechanicalBuffs :`, error);
  }
}

export async function applyBonusDamage(workflow, flag) {
  try {
    const targets = resolveTargets(workflow, flag);

    if (!targets?.size) {
      console.warn(`[${MODULE_ID}] applyBonusDamage : aucune cible (mode "${flag.targetMode ?? "self"}", condition "${flag.condition ?? "hit"}")`);
      return;
    }

    console.log(`[${MODULE_ID}] Condition : ${flag.condition ?? "hit"} — cibles : ${targets.size}`);

    const formula = flag.damage.formula;
    const damageType = flag.damage.type;
    const roll = await new Roll(formula).evaluate();

    console.log(`[${MODULE_ID}] Dégâts bonus : ${roll.total} ${damageType}`);

    await ChatMessage.create({
      content: `<div style="border-left: 3px solid #f0a500; padding: 4px 8px; margin-bottom: 4px;">
        <img src="${flag.itemImg ?? BUFF_ICON}" width="16" height="16" style="vertical-align:middle; margin-right:4px;"/>
        <strong>${flag.itemName ?? localize("BOT.fallback.effectName")}</strong> ${localize("BOT.chat.triggered")}
      </div>`,
      speaker: ChatMessage.getSpeaker({ actor: workflow.actor }),
    });

    let fullTargets = targets;
    let halfTargets = new Set();

    if (flag.save?.ability) {
      fullTargets = new Set();
      halfTargets = new Set();
      for (const token of targets) {
        const targetActor = token.actor;
        if (!targetActor) continue;
        const saveRolls = await targetActor.rollSavingThrow(
          { ability: flag.save.ability },
          { configure: false },
          { create: true }
        );
        if (!saveRolls || saveRolls.length === 0) {
          fullTargets.add(token);
          continue;
        }
        const saveRoll = saveRolls[0];
        const success = saveRoll.total >= flag.save.dc;
        console.log(`[${MODULE_ID}] JS ${flag.save.ability} ${saveRoll.total} vs DD ${flag.save.dc} — ${success ? "réussite" : "échec"}`);
        if (success) {
          if (flag.save.effect === "none") continue;
          if (flag.save.effect === "half") { halfTargets.add(token); continue; }
        }
        fullTargets.add(token);
      }
    }

    if (typeof MidiQOL?.applyTokenDamage === "function") {
      if (fullTargets.size) {
        await MidiQOL.applyTokenDamage(
          [{ damage: roll.total, type: damageType }],
          roll.total,
          fullTargets,
          workflow.item ?? null,
          new Set(),
          { flavor: flag.itemName ?? localize("BOT.fallback.effectName") }
        );
      }
      if (halfTargets.size) {
        const half = Math.floor(roll.total / 2);
        await MidiQOL.applyTokenDamage(
          [{ damage: half, type: damageType }],
          half,
          halfTargets,
          workflow.item ?? null,
          new Set(),
          { flavor: flag.itemName ?? localize("BOT.fallback.effectName") }
        );
      }
    } else {
      for (const token of fullTargets) {
        await token.actor?.applyDamage([{ value: roll.total, type: damageType }]);
      }
      for (const token of halfTargets) {
        await token.actor?.applyDamage([{ value: Math.floor(roll.total / 2), type: damageType }]);
      }
      if (fullTargets.size || halfTargets.size) {
        await ChatMessage.create({
          content: game.i18n.format("BOT.chat.damageResult", {
            name: flag.itemName ?? localize("BOT.fallback.effectName"),
            total: roll.total,
            type: localizeDamageType(damageType)
          }),
          speaker: ChatMessage.getSpeaker({ actor: workflow.actor }),
          rolls: [roll],
        });
      }
    }

    await consumeOrDecrementCharges(workflow, flag, targets);
  } catch (error) {
    console.error(`[${MODULE_ID}] Erreur dans applyBonusDamage :`, error);
  }
}

export async function applyStatusEffect(workflow, flag) {
  try {
    const targets = resolveTargets(workflow, flag);

    if (!targets?.size) {
      console.warn(`[${MODULE_ID}] applyStatusEffect : aucune cible (mode "${flag.targetMode ?? "self"}", condition "${flag.condition ?? "hit"}")`);
      return;
    }

    const statusId = flag.status.id;

    for (const token of targets) {
      const targetActor = token.actor;
      if (!targetActor) continue;

      await targetActor.toggleStatusEffect(statusId, { active: true });
      console.log(`[${MODULE_ID}] Statut ${statusId} appliqué sur ${targetActor.name}`);
    }

    if (!flag.damage) await consumeOrDecrementCharges(workflow, flag, targets);
  } catch (error) {
    console.error(`[${MODULE_ID}] Erreur dans applyStatusEffect :`, error);
  }
}

export async function applyEffect(workflow, flag) {
  if (!flag.damage && !flag.status) {
    console.log(`[${MODULE_ID}] Aucun effet configuré dans le flag`);
    return;
  }

  if (flag.damage) await applyBonusDamage(workflow, flag);
  if (flag.status) await applyStatusEffect(workflow, flag);
}

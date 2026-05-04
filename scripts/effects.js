import { MODULE_ID, BUFF_ICON, SKILL_IDS } from "./constants.js";
import { getFlagDurationInRounds } from "./duration.js";

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

function normalizeSaveDC(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function readNumericSaveDCFromItem(item) {
  if (!item) return null;

  const directDc = normalizeSaveDC(item.system?.save?.dc);
  if (directDc !== null) return directDc;

  const activities = item.system?.activities;
  if (activities && typeof activities === "object") {
    for (const activity of Object.values(activities)) {
      const activityDc = normalizeSaveDC(activity?.save?.dc);
      if (activityDc !== null) return activityDc;
    }
  }

  return null;
}

function readNumericSaveDCFromActor(actor) {
  if (!actor) return null;
  return normalizeSaveDC(
    actor.system?.attributes?.spell?.dc
    ?? actor.system?.attributes?.spelldc
  );
}

async function resolveActorFromUuid(uuid) {
  if (!uuid) return null;
  try {
    if (typeof fromUuidSync === "function") {
      return fromUuidSync(uuid);
    }
    if (typeof fromUuid === "function") {
      return await fromUuid(uuid);
    }
  } catch {
    return null;
  }
  return null;
}

async function resolveDocumentFromUuid(uuid) {
  if (!uuid) return null;
  try {
    if (typeof fromUuidSync === "function") {
      return fromUuidSync(uuid);
    }
    if (typeof fromUuid === "function") {
      return await fromUuid(uuid);
    }
  } catch {
    return null;
  }
  return null;
}

async function resolveSaveDC(workflow, flag) {
  const source = flag.save?.dcSource ?? "fixed";
  const fixedDc = normalizeSaveDC(flag.save?.dc);

  if (source === "fixed") {
    if (fixedDc !== null) {
      console.log(`[${MODULE_ID}] DD de sauvegarde résolu : ${fixedDc} via fixed`);
    }
    return fixedDc;
  }

  if (source === "origin") {
    const originItem = await resolveDocumentFromUuid(flag.itemUuid) ?? workflow.item ?? null;
    const itemDc = readNumericSaveDCFromItem(originItem);
    if (itemDc !== null) {
      console.log(`[${MODULE_ID}] DD de sauvegarde résolu : ${itemDc} via origin-item`);
      return itemDc;
    }

    const originActor = await resolveActorFromUuid(flag.originActorUuid)
      ?? originItem?.actor
      ?? workflow.item?.actor
      ?? null;
    const actorDc = readNumericSaveDCFromActor(originActor);
    if (actorDc !== null) {
      console.log(`[${MODULE_ID}] DD de sauvegarde résolu : ${actorDc} via origin-actor`);
      return actorDc;
    }

    if (fixedDc !== null) {
      console.log(`[${MODULE_ID}] DD de sauvegarde résolu : ${fixedDc} via fixed-fallback`);
    }
    return fixedDc;
  }

  if (source === "owner") {
    const ownerDc = readNumericSaveDCFromActor(workflow.actor);
    if (ownerDc !== null) {
      console.log(`[${MODULE_ID}] DD de sauvegarde résolu : ${ownerDc} via owner`);
      return ownerDc;
    }

    if (fixedDc !== null) {
      console.log(`[${MODULE_ID}] DD de sauvegarde résolu : ${fixedDc} via fixed-fallback`);
    }
    return fixedDc;
  }

  if (fixedDc !== null) {
    console.log(`[${MODULE_ID}] DD de sauvegarde résolu : ${fixedDc} via fixed-fallback`);
  }
  return fixedDc;
}

function isWorkflowCritical(workflow) {
  return Boolean(
    workflow?.isCritical
    || workflow?.critical
    || workflow?.attackRoll?.isCritical
    || workflow?.attackRoll?.options?.critical
  );
}

function parseAdditiveFormulaTerms(formula) {
  const matches = String(formula).match(/[+-]?\s*[^+-]+/g) ?? [];
  return matches.map((term) => {
    const trimmed = term.trim();
    const sign = trimmed.startsWith("-") ? -1 : 1;
    const body = trimmed.replace(/^[+-]\s*/, "").trim();
    return { sign, body };
  }).filter((term) => term.body);
}

function formatAdditiveFormulaTerms(parts) {
  return parts.map((part, index) => {
    const value = String(part).trim();
    if (index === 0) return value.startsWith("-") ? `-${value.slice(1).trim()}` : value;
    return value.startsWith("-") ? `- ${value.slice(1).trim()}` : `+ ${value}`;
  }).join(" ");
}

function doubleDiceFormula(formula) {
  return String(formula).replace(/(^|[^0-9])(\d*)d(\d+)/gi, (match, prefix, count, faces) => {
    const diceCount = count ? Number(count) : 1;
    return `${prefix}${diceCount * 2}d${faces}`;
  });
}

function applyModifierMultiplication(formula) {
  const parts = [];
  for (const term of parseAdditiveFormulaTerms(formula)) {
    if (/^\d+(\.\d+)?$/.test(term.body)) {
      parts.push(`${term.sign < 0 ? "-" : ""}${Number(term.body) * 2}`);
    } else {
      parts.push(`${term.sign < 0 ? "-" : ""}${term.body}`);
    }
  }
  return formatAdditiveFormulaTerms(parts);
}

function maximizeBaseDiceFormula(formula, multiplyModifiers = false) {
  const parts = [];
  for (const term of parseAdditiveFormulaTerms(formula)) {
    const diceMatch = term.body.match(/^(\d*)d(\d+)$/i);
    if (diceMatch) {
      const count = diceMatch[1] ? Number(diceMatch[1]) : 1;
      const faces = Number(diceMatch[2]);
      const maxValue = count * faces;
      const reroll = `${count}d${faces}`;
      parts.push(`${term.sign < 0 ? "-" : ""}${maxValue}`);
      parts.push(`${term.sign < 0 ? "-" : ""}${reroll}`);
      continue;
    }
    if (/^\d+(\.\d+)?$/.test(term.body)) {
      const value = multiplyModifiers ? Number(term.body) * 2 : Number(term.body);
      parts.push(`${term.sign < 0 ? "-" : ""}${value}`);
      continue;
    }
    parts.push(`${term.sign < 0 ? "-" : ""}${term.body}`);
  }
  return formatAdditiveFormulaTerms(parts);
}

function getDnd5eCriticalSettings() {
  let maximizeDice = null;
  let multiplyModifiers = null;
  const detected = [];
  const settingsRegistry = game.settings?.settings;
  const hasSetting = (key) => settingsRegistry?.has?.(`dnd5e.${key}`);
  const readBooleanSetting = (key) => {
    if (!hasSetting(key)) return null;
    try {
      const value = game.settings.get("dnd5e", key);
      return typeof value === "boolean" ? value : null;
    } catch {
      return null;
    }
  };

  for (const key of ["criticalDamageMaxDice", "criticalDamageMaximizeDice", "criticalDamageMaximized"]) {
    const value = readBooleanSetting(key);
    if (value !== null) {
      maximizeDice = value;
      detected.push(`${key}=${value}`);
      break;
    }
  }

  const modifierValue = readBooleanSetting("criticalDamageModifiers");
  if (modifierValue !== null) {
    multiplyModifiers = modifierValue;
    detected.push(`criticalDamageModifiers=${modifierValue}`);
  }

  const candidates = [...(settingsRegistry?.values?.() ?? [])]
    .filter((setting) => setting.namespace === "dnd5e")
    .filter((setting) => /critical|crit|maximi[sz]e|maxdice|max-dice|maximum|max|modifier|multiply/i.test(
      `${setting.key} ${setting.name ?? ""} ${setting.hint ?? ""}`
    ));

  for (const setting of candidates) {
    try {
      const value = game.settings.get("dnd5e", setting.key);
      if (typeof value !== "boolean") continue;
      const haystack = `${setting.key} ${setting.name ?? ""} ${setting.hint ?? ""}`.toLowerCase();
      if (maximizeDice === null && /maximi[sz]e|maxdice|max-dice|maximum|max/.test(haystack)) {
        maximizeDice = value;
        detected.push(`${setting.key}=${value}`);
      }
      if (multiplyModifiers === null && /multiply.*modifier|modifier.*multiply/.test(haystack)) {
        multiplyModifiers = value;
        detected.push(`${setting.key}=${value}`);
      }
    } catch {
      // Ignore unreadable settings and keep fallback behavior.
    }
  }

  return {
    maximizeDice,
    multiplyModifiers,
    detected,
    reliable: maximizeDice !== null || multiplyModifiers !== null,
  };
}

async function sendRollMessage(actor, roll, flavor, type) {
  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor,
    flags: { [MODULE_ID]: { type } },
  });
}

function getWorkflowConditionTargets(workflow, condition = "hit") {
  const hitIds = new Set((workflow.hitTargets ?? []).map((t) => t.id));

  if (condition === "miss") {
    return new Set([...(workflow.targets ?? [])].filter((t) => !hitIds.has(t.id)));
  }
  if (condition === "always") {
    return workflow.targets ?? new Set();
  }
  return workflow.hitTargets ?? new Set();
}

function getCurrentTriggerUsage() {
  if (!game.combat?.id) return null;
  return {
    combatId: game.combat.id,
    round: game.combat.round ?? null,
    turn: game.combat.turn ?? null,
  };
}

async function shouldBlockTriggerFrequency(actor, flag) {
  const frequency = flag.triggerFrequency ?? "none";
  if (frequency === "none") return false;

  const currentUsage = getCurrentTriggerUsage();
  if (!currentUsage) return false;

  const lastTrigger = flag.runtime?.lastTrigger ?? null;
  if (!lastTrigger || lastTrigger.combatId !== currentUsage.combatId) return false;

  if (frequency === "turn") {
    return lastTrigger.round === currentUsage.round && lastTrigger.turn === currentUsage.turn;
  }

  if (frequency === "round") {
    return lastTrigger.round === currentUsage.round;
  }

  return false;
}

async function markTriggerFrequencyUsage(actor) {
  const currentUsage = getCurrentTriggerUsage();
  if (!currentUsage || !actor?.setFlag) return;

  const activeBuff = actor.getFlag(MODULE_ID, "activeBuff");
  if (!activeBuff) return;

  await actor.setFlag(MODULE_ID, "activeBuff", {
    ...activeBuff,
    runtime: {
      ...(activeBuff.runtime ?? {}),
      lastTrigger: currentUsage,
    },
  });
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
      const durationRounds = getFlagDurationInRounds(activeBuff);
      await actor.createEmbeddedDocuments("ActiveEffect", [{
        name: (activeBuff.itemName ?? localize("BOT.fallback.effectName")) + " Ã¢Å¡Â¡",
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
  console.log(`[${MODULE_ID}] Indicateur posÃƒÂ© sur ${targetActor.name}`);
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
      console.log(`[${MODULE_ID}] Mode target Ã¢â‚¬â€ cible fixe non visÃƒÂ©e, pas de dÃƒÂ©clenchement`);
      return new Set();
    }
    if (condition === "hit" && !hitIds.has(token.id)) return new Set();
    if (condition === "miss" && hitIds.has(token.id)) return new Set();
    return new Set([token]);
  }

  // "self" et "ally" : mÃƒÂªme logique, les cibles viennent du workflow
  return getWorkflowConditionTargets(workflow, condition);
}

function resolveBonusDamageTargets(workflow, flag) {
  const targetMode = flag.damage?.targetMode;
  if (!targetMode) return resolveTargets(workflow, flag);

  if (targetMode === "triggerTarget") {
    return getWorkflowConditionTargets(workflow, flag.condition ?? "hit");
  }

  if (targetMode === "self") {
    const ownerToken = workflow.token
      ?? workflow.actor?.getActiveTokens?.()?.[0]
      ?? null;
    return ownerToken ? new Set([ownerToken]) : new Set();
  }

  if (targetMode === "attacker") {
    const attackerToken = workflow.attackerToken
      ?? (flag.type === "damaged"
        ? ([...(workflow.hitTargets ?? workflow.targets ?? [])].find((token) => token?.actor?.id !== workflow.actor?.id) ?? null)
        : null);
    return attackerToken ? new Set([attackerToken]) : new Set();
  }

  if (targetMode === "storedTarget") {
    const token = canvas.tokens.get(flag.targetTokenId);
    return token ? new Set([token]) : new Set();
  }

  return resolveTargets(workflow, flag);
}

function resolveStatusTargets(workflow, flag) {
  const targetMode = flag.status?.targetMode;
  if (!targetMode) return resolveTargets(workflow, flag);

  if (targetMode === "triggerTarget") {
    return getWorkflowConditionTargets(workflow, flag.condition ?? "hit");
  }

  if (targetMode === "self") {
    const ownerToken = workflow.token
      ?? workflow.actor?.getActiveTokens?.()?.[0]
      ?? null;
    return ownerToken ? new Set([ownerToken]) : new Set();
  }

  if (targetMode === "attacker") {
    const attackerToken = workflow.attackerToken
      ?? (flag.type === "damaged"
        ? ([...(workflow.hitTargets ?? workflow.targets ?? [])].find((token) => token?.actor?.id !== workflow.actor?.id) ?? null)
        : null);
    return attackerToken ? new Set([attackerToken]) : new Set();
  }

  if (targetMode === "storedTarget") {
    const token = canvas.tokens.get(flag.targetTokenId);
    return token ? new Set([token]) : new Set();
  }

  return resolveTargets(workflow, flag);
}

function inferAttackerToken(workflow, actor, type) {
  return workflow.attackerToken
    ?? (type === "damaged"
      ? ([...(workflow.hitTargets ?? workflow.targets ?? [])].find((token) => token?.actor?.id !== actor?.id) ?? null)
      : null);
}

function resolveHealingTargets(workflow, flag) {
  const targetMode = flag.healing?.targetMode === "target"
    ? "triggerTarget"
    : (flag.healing?.targetMode ?? "self");

  if (targetMode === "self") {
    const actorToken = workflow.token
      ?? workflow.actor?.getActiveTokens?.()?.[0]
      ?? null;
    return actorToken ? new Set([actorToken]) : new Set();
  }

  if (targetMode === "triggerTarget") {
    return workflow.hitTargets?.size
      ? new Set(workflow.hitTargets)
      : new Set(workflow.targets ?? []);
  }

  if (targetMode === "attacker") {
    const attackerToken = inferAttackerToken(workflow, workflow.actor, flag.type);
    return attackerToken ? new Set([attackerToken]) : new Set();
  }

  if (targetMode === "storedTarget") {
    const token = canvas.tokens.get(flag.targetTokenId);
    return token ? new Set([token]) : new Set();
  }

  return new Set();
}

function resolveTemporaryHpTargets(workflow, flag) {
  const targetMode = flag.temporaryHp?.targetMode === "target"
    ? "triggerTarget"
    : (flag.temporaryHp?.targetMode ?? "self");

  if (targetMode === "self") {
    const actorToken = workflow.token
      ?? workflow.actor?.getActiveTokens?.()?.[0]
      ?? null;
    return actorToken ? new Set([actorToken]) : new Set();
  }

  if (targetMode === "triggerTarget") {
    return workflow.hitTargets?.size
      ? new Set(workflow.hitTargets)
      : new Set(workflow.targets ?? []);
  }

  if (targetMode === "attacker") {
    const attackerToken = inferAttackerToken(workflow, workflow.actor, flag.type);
    return attackerToken ? new Set([attackerToken]) : new Set();
  }

  if (targetMode === "storedTarget") {
    const token = canvas.tokens.get(flag.targetTokenId);
    return token ? new Set([token]) : new Set();
  }

  return new Set();
}

async function consumeOrDecrementCharges(workflow, flag, targets) {
  try {
    if (flag.chargesRemaining !== null) {
      const newCharges = flag.chargesRemaining - 1;
      console.log(`[${MODULE_ID}] Charges restantes : ${newCharges}`);
      if (newCharges <= 0) {
        const actor = workflow.actor;
        await actor?.unsetFlag(MODULE_ID, "activeBuff");
        await actor?.unsetFlag(MODULE_ID, "_lastDamagedTrigger");
        console.log(`[${MODULE_ID}] Buff ÃƒÂ©puisÃƒÂ© Ã¢â‚¬â€ toutes les charges consommÃƒÂ©es`);
        const mechEffects = actor?.effects.filter((e) => e.flags?.[MODULE_ID]?.mechanicalBuff === true);
        for (const e of mechEffects ?? []) await e.delete();
        const concentrationEffect = actor?.effects.find(
          (e) => e.statuses?.has("concentrating") || e.statuses?.has("concentration")
        );
        if (concentrationEffect) {
          await concentrationEffect.delete();
          console.log(`[${MODULE_ID}] Concentration retirÃƒÂ©e (charges ÃƒÂ©puisÃƒÂ©es) sur ${actor.name}`);
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
      await actor?.unsetFlag(MODULE_ID, "_lastDamagedTrigger");
      console.log(`[${MODULE_ID}] Buff consommÃƒÂ© sur ${actor?.name}`);
      const mechEffects = actor?.effects.filter((e) => e.flags?.[MODULE_ID]?.mechanicalBuff === true);
      for (const e of mechEffects ?? []) await e.delete();
      const concentrationEffect = actor?.effects.find(
        (e) => e.statuses?.has("concentrating") || e.statuses?.has("concentration")
      );
      if (concentrationEffect) {
        await concentrationEffect.delete();
        console.log(`[${MODULE_ID}] Concentration retirÃƒÂ©e sur ${actor?.name}`);
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
  // Avantage sur les compÃƒÂ©tences sÃƒÂ©lectionnÃƒÂ©es
  if (skills?.length) {
    for (const id of skills) {
      changes.push({ key: `flags.midi-qol.advantage.skill.${id}`, mode: 5, value: "1", priority: 20 });
    }
  }
  // Bonus sur les compÃƒÂ©tences sÃƒÂ©lectionnÃƒÂ©es
  if (skillBonusSkills?.length && skillBonus) {
    for (const id of skillBonusSkills) {
      changes.push({ key: `system.skills.${id}.bonuses.check`, mode: 2, value: String(skillBonus), priority: 20 });
    }
  }
  // Bonus sur TOUTES les compÃƒÂ©tences
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
    const resolvedDurationRounds = getFlagDurationInRounds(flag) ?? durationRounds ?? null;
    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: flag.itemName ?? localize("BOT.fallback.effectName"),
      img: flag.itemImg ?? BUFF_ICON,
      changes,
      duration: resolvedDurationRounds ? { rounds: resolvedDurationRounds, startRound: game.combat?.round ?? 0 } : {},
      flags: { [MODULE_ID]: { mechanicalBuff: true } },
    }]);
    console.log(`[${MODULE_ID}] Buffs mécaniques appliqués sur ${actor.name}`);
  } catch (error) {
    console.error(`[${MODULE_ID}] Erreur dans applyMechanicalBuffs :`, error);
  }
}

export async function applyBonusDamage(workflow, flag) {
  try {
    const targets = resolveBonusDamageTargets(workflow, flag);

    if (!targets?.size) {
      console.warn(`[${MODULE_ID}] applyBonusDamage : aucune cible valide (mode "${flag.damage?.targetMode ?? flag.targetMode ?? "self"}", condition "${flag.condition ?? "hit"}")`);
      return;
    }

    console.log(`[${MODULE_ID}] Condition : ${flag.condition ?? "hit"} Ã¢â‚¬â€ cibles : ${targets.size}`);

    const configuredCriticalMode = game.settings.get(MODULE_ID, "bonusDamageCriticalMode");
    const criticalMode = ["system", "doubleDice", "maxBaseDice", "neverDouble"].includes(configuredCriticalMode)
      ? configuredCriticalMode
      : "system";
    const critical = isWorkflowCritical(workflow);
    let formula = flag.damage.formula;
    const damageType = flag.damage.type;
    const systemCriticalSettings = critical && criticalMode === "system"
      ? getDnd5eCriticalSettings()
      : null;
    if (systemCriticalSettings?.detected?.length) {
      console.log(`[${MODULE_ID}] Réglages critiques dnd5e détectés : maximizeDice=${systemCriticalSettings.maximizeDice}, multiplyModifiers=${systemCriticalSettings.multiplyModifiers}`);
    }
    if (critical && (criticalMode === "system" || criticalMode === "doubleDice" || criticalMode === "maxBaseDice")) {
      // Bonus damage is rolled separately from native dnd5e/Midi-QOL damage resolution,
      // so "system" falls back to the standard 5e behavior: double only the dice on critical hits.
      if (criticalMode === "doubleDice") {
        formula = doubleDiceFormula(formula);
      } else if (criticalMode === "maxBaseDice") {
        formula = maximizeBaseDiceFormula(formula, false);
      } else if (systemCriticalSettings?.maximizeDice === true) {
        formula = maximizeBaseDiceFormula(formula, systemCriticalSettings.multiplyModifiers === true);
      } else if (systemCriticalSettings?.reliable) {
        formula = doubleDiceFormula(formula);
        if (systemCriticalSettings.multiplyModifiers === true) {
          formula = applyModifierMultiplication(formula);
        }
      } else {
        // Fallback if no reliable dnd5e critical setting is detectable in this system version.
        formula = doubleDiceFormula(formula);
      }
      if (formula !== flag.damage.formula) {
        console.log(`[${MODULE_ID}] Critique : formule des dÃƒÂ©gÃƒÂ¢ts bonus ajustÃƒÂ©e`);
      }
    }
    let fullTargets = targets;
    let halfTargets = new Set();

    if (flag.save?.ability) {
      const saveDc = await resolveSaveDC(workflow, flag);
      if (saveDc === null) {
        console.warn(`[${MODULE_ID}] applyBonusDamage : DD de sauvegarde introuvable, jet ignoré`);
      }
      fullTargets = new Set();
      halfTargets = new Set();
      for (const token of targets) {
        const targetActor = token.actor;
        if (!targetActor) continue;
        if (saveDc === null) {
          fullTargets.add(token);
          continue;
        }
        const saveRolls = await targetActor.rollSavingThrow(
          {
            ability: flag.save.ability,
            // Provide DC context to dnd5e so the native save card can display target information when supported.
            target: saveDc,
            targetValue: saveDc,
            dc: saveDc
          },
          { configure: false },
          { create: true }
        );
        if (!saveRolls || saveRolls.length === 0) {
          fullTargets.add(token);
          continue;
        }
        const saveRoll = saveRolls[0];
        const success = saveRoll.total >= saveDc;
        console.log(`[${MODULE_ID}] JS ${flag.save.ability} ${saveRoll.total} vs DD ${saveDc} Ã¢â‚¬â€ ${success ? "rÃƒÂ©ussite" : "ÃƒÂ©chec"}`);
        if (success) {
          if (flag.save.effect === "none") continue;
          if (flag.save.effect === "half") { halfTargets.add(token); continue; }
        }
        fullTargets.add(token);
      }
    }

    const roll = await new Roll(formula).evaluate();
    await sendRollMessage(
      workflow.actor,
      roll,
      `${localize("BOT.chat.bonusDamageRoll")} Ã¢â‚¬â€ ${flag.itemName ?? localize("BOT.fallback.effectName")} (${localizeDamageType(damageType)})`,
      "bonus-damage"
    );

    console.log(`[${MODULE_ID}] DÃƒÂ©gÃƒÂ¢ts bonus : ${roll.total} ${damageType}`);

    if (flag.type === "damaged") {
      for (const token of fullTargets) {
        if (!token.actor) continue;
        await token.actor.applyDamage(
          [{ value: roll.total, type: damageType }],
          { noConcentrationCheck: true }
        );
      }
      for (const token of halfTargets) {
        if (!token.actor) continue;
        await token.actor.applyDamage(
          [{ value: Math.floor(roll.total / 2), type: damageType }],
          { noConcentrationCheck: true }
        );
      }
      await ChatMessage.create({
        content: `<div style="border-left: 3px solid #f0a500; padding: 4px 8px;">
          <strong>${flag.itemName ?? localize("BOT.fallback.effectName")}</strong> : ${roll.total} dÃƒÂ©gÃƒÂ¢ts ${damageType}
        </div>`,
        speaker: ChatMessage.getSpeaker({ actor: workflow.actor }),
      });
    } else if (typeof MidiQOL?.applyTokenDamage === "function") {
      if (fullTargets.size) {
        await MidiQOL.applyTokenDamage(
          [{ damage: roll.total, type: damageType }],
          roll.total,
          fullTargets,
          workflow.item ?? null,
          new Set(),
          {
            flavor: flag.itemName ?? localize("BOT.fallback.effectName"),
            noConcentrationCheck: true
          }
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
          {
            flavor: flag.itemName ?? localize("BOT.fallback.effectName"),
            noConcentrationCheck: true
          }
        );
      }
    } else {
      for (const token of fullTargets) {
        await token.actor?.applyDamage([{ value: roll.total, type: damageType }]);
      }
      for (const token of halfTargets) {
        await token.actor?.applyDamage([{ value: Math.floor(roll.total / 2), type: damageType }]);
      }
    }

    await consumeOrDecrementCharges(workflow, flag, targets);
  } catch (error) {
    console.error(`[${MODULE_ID}] Erreur dans applyBonusDamage :`, error);
  }
}

export async function applyStatusEffect(workflow, flag) {
  try {
    const targets = resolveStatusTargets(workflow, flag);

    if (!targets?.size) {
      console.warn(`[${MODULE_ID}] applyStatusEffect : aucune cible valide (mode "${flag.status?.targetMode ?? flag.targetMode ?? "self"}", condition "${flag.condition ?? "hit"}")`);
      return;
    }

    const statusId = flag.status.id;

    for (const token of targets) {
      const targetActor = token.actor;
      if (!targetActor) continue;

      await targetActor.toggleStatusEffect(statusId, { active: true });
      console.log(`[${MODULE_ID}] Statut ${statusId} appliquÃƒÂ© sur ${targetActor.name}`);
    }

    if (!flag.damage) await consumeOrDecrementCharges(workflow, flag, targets);
  } catch (error) {
    console.error(`[${MODULE_ID}] Erreur dans applyStatusEffect :`, error);
  }
}

export async function applyBonusHealing(workflow, flag) {
  try {
    const targets = resolveHealingTargets(workflow, flag);

    if (!targets?.size) {
      console.warn(`[${MODULE_ID}] applyBonusHealing : aucune cible valide (mode "${flag.healing?.targetMode ?? "self"}")`);
      return;
    }

    const formula = flag.healing?.formula;
    if (!formula) return;

    const roll = await new Roll(formula).evaluate();
    await sendRollMessage(
      workflow.actor,
      roll,
      `${localize("BOT.chat.bonusHealingRoll")} Ã¢â‚¬â€ ${flag.itemName ?? localize("BOT.fallback.effectName")}`,
      "bonus-healing"
    );
    const healAmount = Math.max(0, roll.total ?? 0);
    const healedTargets = [];

    for (const token of targets) {
      const targetActor = token.actor;
      if (!targetActor) continue;

      const currentHp = Number(targetActor.system.attributes.hp.value ?? 0);
      const maxHp = Number(targetActor.system.attributes.hp.max ?? 0);
      if (maxHp <= 0 || healAmount <= 0) continue;

      const newHp = Math.min(maxHp, currentHp + healAmount);
      const appliedHeal = Math.max(0, newHp - currentHp);
      if (appliedHeal <= 0) continue;

      await targetActor.update({ "system.attributes.hp.value": newHp });
      healedTargets.push({ name: targetActor.name, amount: appliedHeal });
      console.log(`[${MODULE_ID}] Soin bonus : ${appliedHeal} PV vers ${targetActor.name}`);
    }

    if (!healedTargets.length) return;

    await ChatMessage.create({
      content: `<div style="border-left: 3px solid #2f9e44; padding: 4px 8px;">
        <strong>${flag.itemName ?? localize("BOT.fallback.effectName")}</strong> : ${healedTargets.map((target) => `${target.amount} PV vers ${target.name}`).join(", ")}
      </div>`,
      speaker: ChatMessage.getSpeaker({ actor: workflow.actor }),
    });

    if (!flag.damage && !flag.status) await consumeOrDecrementCharges(workflow, flag, targets);
  } catch (error) {
    console.error(`[${MODULE_ID}] Erreur dans applyBonusHealing :`, error);
  }
}

export async function applyTemporaryHp(workflow, flag) {
  try {
    const targets = resolveTemporaryHpTargets(workflow, flag);
    if (!targets?.size) {
      console.warn(`[${MODULE_ID}] applyTemporaryHp : aucune cible valide (mode "${flag.temporaryHp?.targetMode ?? "self"}")`);
      return;
    }

    const formula = flag.temporaryHp?.formula;
    if (!formula) return;

    const roll = await new Roll(formula).evaluate();
    await sendRollMessage(
      workflow.actor,
      roll,
      `${localize("BOT.chat.temporaryHpRoll")} Ã¢â‚¬â€ ${flag.itemName ?? localize("BOT.fallback.effectName")}`,
      "temporary-hp"
    );
    const tempHpAmount = Math.max(0, roll.total ?? 0);
    if (tempHpAmount <= 0) return;

    const mode = flag.temporaryHp?.mode ?? "keepHighest";
    const updatedTargets = [];

    for (const token of targets) {
      const targetActor = token.actor;
      if (!targetActor) continue;

      const currentTemp = Number(targetActor.system.attributes.hp.temp ?? 0);
      let newTempHp = currentTemp;

      if (mode === "replace") newTempHp = tempHpAmount;
      else if (mode === "add") newTempHp = currentTemp + tempHpAmount;
      else newTempHp = Math.max(currentTemp, tempHpAmount);

      if (newTempHp === currentTemp) continue;

      await targetActor.update({ "system.attributes.hp.temp": newTempHp });
      updatedTargets.push({ name: targetActor.name, amount: newTempHp });
      console.log(`[${MODULE_ID}] PV temporaires : ${newTempHp} vers ${targetActor.name}`);
    }

    if (!updatedTargets.length) return;

    await ChatMessage.create({
      content: `<div style="border-left: 3px solid #4c6ef5; padding: 4px 8px;">
        <strong>${flag.itemName ?? localize("BOT.fallback.effectName")}</strong> : ${updatedTargets.map((target) => `${target.amount} PV temporaires vers ${target.name}`).join(", ")}
      </div>`,
      speaker: ChatMessage.getSpeaker({ actor: workflow.actor }),
    });

    if (!flag.damage && !flag.status && !flag.healing) await consumeOrDecrementCharges(workflow, flag, targets);
  } catch (error) {
    console.error(`[${MODULE_ID}] Erreur dans applyTemporaryHp :`, error);
  }
}

export async function applyEffect(workflow, flag) {
  if (!flag.damage && !flag.status && !flag.healing && !flag.temporaryHp) {
    console.log(`[${MODULE_ID}] Aucun effet configurÃƒÂ© dans le flag`);
    return;
  }

  if (await shouldBlockTriggerFrequency(workflow.actor, flag)) {
    console.log(`[${MODULE_ID}] DÃƒÂ©clenchement ignorÃƒÂ© : frÃƒÂ©quence dÃƒÂ©jÃƒÂ  utilisÃƒÂ©e`);
    return;
  }

  await markTriggerFrequencyUsage(workflow.actor);

  if (flag.damage) await applyBonusDamage(workflow, flag);
  if (flag.status) await applyStatusEffect(workflow, flag);
  if (flag.healing) await applyBonusHealing(workflow, flag);
  if (flag.temporaryHp) await applyTemporaryHp(workflow, flag);
}

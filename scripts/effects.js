const MODULE_ID = "dnd5e-buff-on-trigger";
const BUFF_ICON = "modules/dnd5e-buff-on-trigger/icons/buff-active.svg";

export async function refreshBuffIndicator(actor, itemName = null) {
  const existing = actor.effects.find((e) => e.statuses.has("bot-active"));
  const activeBuff = actor.getFlag(MODULE_ID, "activeBuff");

  if (existing) await existing.delete();

  if (!activeBuff && itemName) {
    for (const token of canvas.tokens.placeables) {
      if (token.actor) await removeTargetIndicator(token.actor, itemName);
    }
  }

  if (activeBuff) {
    const itemImg = activeBuff._itemImg ?? BUFF_ICON;
    const name = activeBuff._itemName ?? "Buff on Trigger actif";
    const durationRounds = activeBuff.duration?.rounds ?? null;
    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name,
      img: itemImg,
      statuses: ["bot-active"],
      flags: { [MODULE_ID]: { indicator: true } },
      duration: durationRounds ? { rounds: durationRounds, startRound: game.combat?.round ?? 0 } : {},
    }]);
  }
}

export async function applyTargetIndicator(targetActor, flag) {
  if (!targetActor) return;
  const itemName = flag._itemName ?? "Buff on Trigger";
  const itemImg = flag._itemImg ?? BUFF_ICON;
  const existing = targetActor.effects.find(
    (e) => e.flags?.[MODULE_ID]?.targetIndicator === true && e.name === itemName
  );
  if (existing) return;
  await targetActor.createEmbeddedDocuments("ActiveEffect", [{
    name: itemName,
    img: itemImg,
    icon: itemImg,
    statuses: ["bot-target-" + (flag._itemName ?? "buff").slugify()],
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
    const token = canvas.tokens.get(flag._targetTokenId);
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

export async function applyBonusDamage(workflow, flag) {
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
      <img src="${flag._itemImg ?? BUFF_ICON}" width="16" height="16" style="vertical-align:middle; margin-right:4px;"/>
      <strong>${flag._itemName ?? "Buff on Trigger"}</strong> se déclenche !
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
      const saveRoll = await targetActor.rollSavingThrow({ ability: flag.save.ability }, { targetValue: flag.save.dc });
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
        { flavor: flag._itemName ?? "Buff on Trigger" }
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
        { flavor: flag._itemName ?? "Buff on Trigger" }
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
        content: `${flag._itemName ?? "Buff on Trigger"} — ${roll.total} dégâts ${damageType}`,
        speaker: ChatMessage.getSpeaker({ actor: workflow.actor }),
        rolls: [roll],
      });
    }
  }

  if (workflow.item !== null && flag.consumeOnTrigger !== false) {
    await workflow.actor?.unsetFlag(MODULE_ID, "activeBuff");
    console.log(`[${MODULE_ID}] Buff consommé sur ${workflow.actor.name}`);
    await refreshBuffIndicator(workflow.actor, flag._itemName);
    for (const token of targets) {
      if (token.actor) await removeTargetIndicator(token.actor, flag._itemName);
    }
  }
}

export async function applyStatusEffect(workflow, flag) {
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

  if (workflow.item !== null && !flag.damage && flag.consumeOnTrigger !== false) {
    await workflow.actor?.unsetFlag(MODULE_ID, "activeBuff");
    console.log(`[${MODULE_ID}] Buff (statut) consommé sur ${workflow.actor.name}`);
    await refreshBuffIndicator(workflow.actor, flag._itemName);
    for (const token of targets) {
      if (token.actor) await removeTargetIndicator(token.actor, flag._itemName);
    }
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

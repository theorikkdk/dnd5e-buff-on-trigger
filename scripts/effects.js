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
    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name,
      img: itemImg,
      statuses: ["bot-active"],
      flags: { [MODULE_ID]: { indicator: true } },
      duration: {},
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

export async function applyBonusDamage(workflow, flag) {
  const condition = flag.condition ?? "hit";
  const hitIds = new Set((workflow.hitTargets ?? []).map((t) => t.id));

  let targets;
  if (condition === "miss") {
    targets = new Set([...(workflow.targets ?? [])].filter((t) => !hitIds.has(t.id)));
  } else if (condition === "always") {
    targets = workflow.targets;
  } else {
    targets = workflow.hitTargets;
  }

  if (!targets?.size) {
    console.warn(`[${MODULE_ID}] applyBonusDamage : aucune cible pour la condition "${condition}"`);
    return;
  }

  console.log(`[${MODULE_ID}] Condition : ${condition} — cibles : ${targets.size}`);

  const formula = flag.damage.formula;
  const damageType = flag.damage.type;

  for (const token of targets) {
    const targetActor = token.actor;
    if (!targetActor) continue;

    const roll = await new Roll(formula).evaluate();
    console.log(`[${MODULE_ID}] Dégâts bonus : ${roll.total} ${damageType} sur ${targetActor.name}`);
    await targetActor.applyDamage([{ value: roll.total, type: damageType }]);
  }

  if (workflow.item !== null) {
    await workflow.actor?.unsetFlag(MODULE_ID, "activeBuff");
    console.log(`[${MODULE_ID}] Buff consommé sur ${workflow.actor.name}`);
    await refreshBuffIndicator(workflow.actor, flag._itemName);
    for (const token of targets) {
      if (token.actor) await removeTargetIndicator(token.actor, flag._itemName);
    }
  }
}

export async function applyStatusEffect(workflow, flag) {
  const condition = flag.condition ?? "hit";
  const hitIds = new Set((workflow.hitTargets ?? []).map((t) => t.id));

  let targets;
  if (condition === "miss") {
    targets = new Set([...(workflow.targets ?? [])].filter((t) => !hitIds.has(t.id)));
  } else if (condition === "always") {
    targets = workflow.targets;
  } else {
    targets = workflow.hitTargets;
  }

  if (!targets?.size) {
    console.warn(`[${MODULE_ID}] applyStatusEffect : aucune cible pour la condition "${condition}"`);
    return;
  }

  const statusId = flag.status.id;

  for (const token of targets) {
    const targetActor = token.actor;
    if (!targetActor) continue;

    await targetActor.toggleStatusEffect(statusId, { active: true });
    console.log(`[${MODULE_ID}] Statut ${statusId} appliqué sur ${targetActor.name}`);
  }

  if (workflow.item !== null && !flag.damage) {
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

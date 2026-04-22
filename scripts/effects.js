const MODULE_ID = "dnd5e-buff-on-trigger";

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

  await workflow.actor?.unsetFlag(MODULE_ID, "activeBuff");
  console.log(`[${MODULE_ID}] Buff consommé sur ${workflow.actor.name}`);
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

  if (!flag.damage) {
    await workflow.actor?.unsetFlag(MODULE_ID, "activeBuff");
    console.log(`[${MODULE_ID}] Buff (statut) consommé sur ${workflow.actor.name}`);
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

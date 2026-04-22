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

  await workflow.actor.unsetFlag(MODULE_ID, "buffTrigger");
  console.log(`[${MODULE_ID}] Buff consommé sur ${workflow.actor.name}`);
}

export async function applyEffect(workflow, flag) {
  if (flag.damage) {
    await applyBonusDamage(workflow, flag);
  } else {
    console.log(`[${MODULE_ID}] Aucun effet configuré dans le flag`);
  }
}

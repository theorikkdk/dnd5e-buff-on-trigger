import { applyEffect } from "./effects.js";

const MODULE_ID = "dnd5e-buff-on-trigger";

export function registerTriggers() {
  Hooks.on("midi-qol.RollComplete", (workflow) => {
    if (!workflow.actor) return;
    if (!workflow.activity) return;

    console.log(`[${MODULE_ID}] RollComplete déclenché, actionType = ${workflow.activity.actionType}`);

    const flag = workflow.actor.getFlag(MODULE_ID, "buffTrigger");
    if (!flag) return;

    if (flag.type === workflow.activity.actionType) {
      handleAttackTrigger(workflow, flag);
    }
  });
}

function handleAttackTrigger(workflow, flag) {
  console.log(`[${MODULE_ID}] Déclencheur ${workflow.activity.actionType} détecté sur ${workflow.actor.name}`);
  applyEffect(workflow, flag);
}

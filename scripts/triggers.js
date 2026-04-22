import { applyEffect, refreshBuffIndicator } from "./effects.js";

const MODULE_ID = "dnd5e-buff-on-trigger";

const ATTACK_ACTION_TYPES = new Set(["mwak", "rwak", "msak", "rsak"]);

export function registerTriggers() {
  Hooks.once("ready", () => {
    game.actors.forEach((actor) => refreshBuffIndicator(actor));
  });

  Hooks.on("midi-qol.RollComplete", async (workflow) => {
    if (!workflow.actor) return;
    if (!workflow.activity) return;

    const actionType = workflow.activity.actionType;
    console.log(`[${MODULE_ID}] RollComplete déclenché, actionType = ${actionType}`);

    // Phase 1 : l'item utilisé est un buff non-attaque → pose le marqueur sur l'acteur
    const buffConfig = workflow.item?.getFlag(MODULE_ID, "buffTrigger");
    if (buffConfig && !ATTACK_ACTION_TYPES.has(actionType)) {
      await workflow.actor.setFlag(MODULE_ID, "activeBuff", {
        ...buffConfig,
        _itemName: workflow.item?.name,
        _itemImg: workflow.item?.img,
      });
      console.log(`[${MODULE_ID}] Buff activé sur ${workflow.actor.name} via ${workflow.item.name}`);
      await refreshBuffIndicator(workflow.actor);
      return;
    }

    // Phase 2 : attaque → lit le marqueur sur l'acteur et déclenche l'effet
    const flag = workflow.actor.getFlag(MODULE_ID, "activeBuff");
    if (!flag) return;

    if (flag.type === actionType) {
      handleAttackTrigger(workflow, flag);
    }
  });
}

function handleAttackTrigger(workflow, flag) {
  console.log(`[${MODULE_ID}] Déclencheur ${workflow.activity.actionType} détecté sur ${workflow.actor.name}`);
  applyEffect(workflow, flag);
}

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

  Hooks.on("updateCombat", async (combat, changed, options, userId) => {
    if (changed.turn === undefined) return;

    // turnStart : acteur dont c'est maintenant le tour
    const currentCombatant = combat.combatant;
    const currentActor = currentCombatant?.actor;
    if (currentActor) {
      const flag = currentActor.getFlag(MODULE_ID, "activeBuff");
      if (flag?.type === "turnStart") {
        await handleTurnTrigger(currentActor, flag, "turnStart");
      }
    }

    // targetTurnStart : cherche un lanceur dont le buff se déclenche sur le combattant qui commence son tour
    const currentToken = canvas.tokens.get(currentCombatant?.tokenId);
    if (currentToken) {
      const isHostile = currentToken.document.disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE;
      const isUserTarget = game.user.targets.has(currentToken);
      if (isHostile || isUserTarget) {
        const sceneActors = new Map();
        for (const token of canvas.tokens.placeables) {
          if (token.actor && !sceneActors.has(token.actor.id)) {
            sceneActors.set(token.actor.id, token.actor);
          }
        }
        for (const sceneActor of sceneActors.values()) {
          const flag = sceneActor.getFlag(MODULE_ID, "activeBuff");
          if (flag?.type === "targetTurnStart") {
            await handleTurnTrigger(sceneActor, flag, "targetTurnStart", [currentToken]);
          }
        }
      }
    }

    // turnEnd et targetTurnEnd : acteur dont le tour vient de se terminer
    const prevTurnIndex = (combat.turn - 1 + combat.turns.length) % combat.turns.length;
    const prevCombatant = combat.turns[prevTurnIndex];
    const prevActor = prevCombatant?.actor;

    if (prevActor) {
      const flag = prevActor.getFlag(MODULE_ID, "activeBuff");
      if (flag?.type === "turnEnd") {
        await handleTurnTrigger(prevActor, flag, "turnEnd");
      }
    }

    // targetTurnEnd : cherche un lanceur dans la scène dont le buff se déclenche sur la cible qui vient de finir son tour
    const prevToken = canvas.tokens.get(prevCombatant?.tokenId);
    if (prevToken) {
      const isHostile = prevToken.document.disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE;
      const isUserTarget = game.user.targets.has(prevToken);
      if (isHostile || isUserTarget) {
        const sceneActors = new Map();
        for (const token of canvas.tokens.placeables) {
          if (token.actor && !sceneActors.has(token.actor.id)) {
            sceneActors.set(token.actor.id, token.actor);
          }
        }
        for (const sceneActor of sceneActors.values()) {
          const flag = sceneActor.getFlag(MODULE_ID, "activeBuff");
          if (flag?.type === "targetTurnEnd") {
            await handleTurnTrigger(sceneActor, flag, "targetTurnEnd", [prevToken]);
          }
        }
      }
    }
  });
}

function handleAttackTrigger(workflow, flag) {
  console.log(`[${MODULE_ID}] Déclencheur ${workflow.activity.actionType} détecté sur ${workflow.actor.name}`);
  applyEffect(workflow, flag);
}

async function handleTurnTrigger(actor, flag, triggerType, overrideTargets = null) {
  console.log(`[${MODULE_ID}] Déclencheur ${triggerType} pour ${actor.name}`);

  let cibles;
  if (overrideTargets !== null) {
    cibles = overrideTargets;
  } else {
    cibles = [...game.user.targets];
    if (cibles.length === 0) {
      cibles = canvas.tokens.placeables.filter(
        (t) => t.document.disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE
      );
    }
  }
  console.log(`[${MODULE_ID}] Cibles pour ${triggerType} : ${cibles.length}`);

  const targetsSet = new Set(cibles);
  const workflow = {
    actor,
    item: null,
    targets: targetsSet,
    hitTargets: new Set(cibles),
    missedTargets: new Set(),
  };
  await applyEffect(workflow, flag);
  if (flag.consumeOnTrigger === true) {
    await actor.unsetFlag(MODULE_ID, "activeBuff");
    await refreshBuffIndicator(actor);
  }
}

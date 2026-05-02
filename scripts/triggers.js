import { applyEffect, applyMechanicalBuffs, buildMechanicalChanges, refreshBuffIndicator, applyTargetIndicator } from "./effects.js";

const MODULE_ID = "dnd5e-buff-on-trigger";

const ATTACK_ACTION_TYPES = new Set(["mwak", "rwak", "msak", "rsak"]);

export function registerTriggers() {
  game.actors.forEach((actor) => refreshBuffIndicator(actor));

  Hooks.on("midi-qol.RollComplete", async (workflow) => {
    if (!workflow.actor) return;
    if (!workflow.activity) return;

    const actionType = workflow.activity.actionType;

    // Phase 1 : l'item utilisé est un buff non-attaque → pose le marqueur sur l'acteur
    const buffConfig = workflow.item?.getFlag(MODULE_ID, "buffTrigger");
    const flag = workflow.actor.getFlag(MODULE_ID, "activeBuff");
    if (buffConfig || flag) console.log(`[${MODULE_ID}] RollComplete déclenché, actionType = ${actionType}`);
    if (buffConfig && !ATTACK_ACTION_TYPES.has(actionType)) {
      const targetMode = buffConfig.targetMode ?? "self";
      const activeFlag = { ...buffConfig, itemName: workflow.item?.name, itemImg: workflow.item?.img, chargesRemaining: buffConfig.charges ?? null };
      const hasMechBuffs = activeFlag.buffs && Object.values(activeFlag.buffs).some((v) => v !== null);

      if (targetMode === "ally") {
        const allyToken = [...game.user.targets][0];
        if (!allyToken?.actor) {
          // Fallback sur le lanceur
          await workflow.actor.setFlag(MODULE_ID, "activeBuff", activeFlag);
          console.log(`[${MODULE_ID}] Mode "ally" sans cible — buff appliqué sur le lanceur ${workflow.actor.name}`);
          if (hasMechBuffs) {
            const changes = buildMechanicalChanges(activeFlag);
            await refreshBuffIndicator(workflow.actor, null, changes);
          } else {
            await refreshBuffIndicator(workflow.actor);
          }
        } else {
          await workflow.actor.setFlag(MODULE_ID, "activeBuff", activeFlag);
          console.log(`[${MODULE_ID}] Buff activé sur l'allié ${allyToken.actor.name} via ${workflow.item.name}`);
          await refreshBuffIndicator(workflow.actor);
          if (hasMechBuffs) {
            await applyMechanicalBuffs(allyToken.actor, activeFlag, activeFlag.duration?.rounds ?? null);
          } else {
            await applyTargetIndicator(allyToken.actor, activeFlag);
          }
        }
      } else if (targetMode === "target") {
        const targetToken = [...game.user.targets][0];
        if (!targetToken) {
          ui.notifications.warn(game.i18n.localize("BOT.notifications.noTargetSelected"));
          console.log(`[${MODULE_ID}] Mode target — activation annulée, aucune cible`);
          return;
        }
        activeFlag.targetTokenId = targetToken.id;
        await workflow.actor.setFlag(MODULE_ID, "activeBuff", activeFlag);
        console.log(`[${MODULE_ID}] Buff activé sur ${workflow.actor.name} via ${workflow.item.name} (cible fixe : ${targetToken.name})`);
        const buffTarget = canvas.tokens.get(activeFlag.targetTokenId)?.actor ?? null;
        if (hasMechBuffs && buffTarget) {
          await refreshBuffIndicator(workflow.actor);
          await applyMechanicalBuffs(buffTarget, activeFlag, activeFlag.duration?.rounds ?? null);
        } else {
          await refreshBuffIndicator(workflow.actor);
          if (targetToken.actor) await applyTargetIndicator(targetToken.actor, activeFlag);
        }
      } else {
        await workflow.actor.setFlag(MODULE_ID, "activeBuff", activeFlag);
        console.log(`[${MODULE_ID}] Buff activé sur ${workflow.actor.name} via ${workflow.item.name}`);
        if (hasMechBuffs) {
          const changes = buildMechanicalChanges(activeFlag);
          await refreshBuffIndicator(workflow.actor, null, changes);
        } else {
          await refreshBuffIndicator(workflow.actor);
          for (const token of game.user.targets) {
            if (token.actor) await applyTargetIndicator(token.actor, activeFlag);
          }
        }
      }
      return;
    }

    // Phase 2 : attaque → lit le marqueur sur l'acteur et déclenche l'effet
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
    if (combat.turn === 0 && !changed.round) return;
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

  Hooks.on("dnd5e.preRollSkill", (config, skillId) => {
    const actor = config.subject ?? config.actor ?? null;
    if (!actor?.getFlag) return;
    const activeBuff = actor.getFlag(MODULE_ID, "activeBuff");
    const skills = activeBuff?.buffs?.skills;
    if (!skills?.length) return;
    if (skills.includes("all") || skills.includes(skillId)) {
      config.advantage = true;
      console.log(`[${MODULE_ID}] Avantage compétence ${skillId} appliqué sur ${actor.name}`);
    }
  });

  Hooks.on("dnd5e.preRollAbility", (actor, config, abilityId) => {
    const activeBuff = actor.getFlag(MODULE_ID, "activeBuff");
    if (!activeBuff?.buffs?.skillMode) return;
    if (activeBuff.buffs.skillMode === "advantage") {
      config.advantage = true;
      console.log(`[${MODULE_ID}] Avantage caractéristique appliqué sur ${actor.name}`);
    } else if (activeBuff.buffs.skillMode === "disadvantage") {
      config.disadvantage = true;
      console.log(`[${MODULE_ID}] Désavantage caractéristique appliqué sur ${actor.name}`);
    }
  });

  Hooks.on("deleteActiveEffect", async (effect, options, userId) => {
    if (effect.statuses?.has("bot-active")) {
      const actor = effect.parent;
      if (!actor) return;
      const activeBuff = actor.getFlag(MODULE_ID, "activeBuff");
      const itemName = effect.name;
      await actor.unsetFlag(MODULE_ID, "activeBuff");
      await refreshBuffIndicator(actor, itemName);
      console.log(`[${MODULE_ID}] Buff supprimé manuellement sur ${actor.name}`);
      if (activeBuff?.duration?.concentration) {
        const concentrationEffect = actor.effects.find(
          (e) => e.statuses?.has("concentrating") || e.statuses?.has("concentration")
        );
        if (concentrationEffect) {
          await concentrationEffect.delete();
          console.log(`[${MODULE_ID}] Concentration retirée sur ${actor.name}`);
        }
      }
      return;
    }

    if (effect.statuses?.has("concentrating") || effect.statuses?.has("concentration")) {
      const actor = effect.parent;
      if (!actor) return;
      const activeBuff = actor.getFlag(MODULE_ID, "activeBuff");
      if (!activeBuff) return;
      const itemName = activeBuff.itemName;
      await actor.unsetFlag(MODULE_ID, "activeBuff");
      await refreshBuffIndicator(actor, itemName);
      console.log(`[${MODULE_ID}] Concentration brisée — buff ${itemName} annulé sur ${actor.name}`);
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
    await refreshBuffIndicator(actor, flag.itemName);
  }
}

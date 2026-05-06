import { MODULE_ID, ATTACK_ACTION_TYPES } from "./constants.js";
import { buildItemDurationData } from "./duration.js";
import { applyEffect, applyMechanicalBuffs, buildMechanicalChanges, refreshBuffIndicator, applyTargetIndicator } from "./effects.js";

const recentConcentrationRolls = new Map();

function getReceivedAttackCategories(workflow, item) {
  const actionType = workflow?.activity?.actionType
    ?? item?.system?.actionType
    ?? workflow?.item?.system?.actionType
    ?? null;

  const categories = new Set();
  if (actionType === "mwak") {
    categories.add("melee");
    categories.add("weapon");
    categories.add("mwak");
  }
  if (actionType === "rwak") {
    categories.add("ranged");
    categories.add("weapon");
    categories.add("rwak");
  }
  if (actionType === "msak") {
    categories.add("melee");
    categories.add("spell");
    categories.add("msak");
  }
  if (actionType === "rsak") {
    categories.add("ranged");
    categories.add("spell");
    categories.add("rsak");
  }
  return categories;
}

function collectDamageTypes(value, types = new Set()) {
  if (!value) return types;
  if (Array.isArray(value)) {
    for (const entry of value) collectDamageTypes(entry, types);
    return types;
  }
  if (typeof value === "object") {
    const candidate = value.type ?? value.damageType ?? value.damage?.type ?? null;
    if (typeof candidate === "string" && candidate.trim()) types.add(candidate);
    for (const nested of Object.values(value)) collectDamageTypes(nested, types);
  }
  return types;
}

function getReceivedDamageTypes(damageItem, workflow) {
  const types = new Set();
  collectDamageTypes(damageItem, types);
  collectDamageTypes(workflow?.damageItem, types);
  collectDamageTypes(workflow?.damageDetail, types);
  collectDamageTypes(workflow?.damageList, types);
  return [...types];
}

function getExactlyOneSelectedTarget() {
  const selectedTargets = [...(game.user?.targets ?? [])];
  return selectedTargets.length === 1 ? selectedTargets[0] ?? null : null;
}

function tokenMatchesStoredTarget(token, flag) {
  if (!token || !flag) return false;

  const tokenUuid = token.document?.uuid ?? token.uuid ?? null;
  const actorUuid = token.actor?.uuid ?? null;
  if (flag.storedTargetTokenUuid && tokenUuid && tokenUuid === flag.storedTargetTokenUuid) return true;
  if (flag.storedTargetActorUuid && actorUuid && actorUuid === flag.storedTargetActorUuid) return true;
  if (flag.targetTokenId && token.id && token.id === flag.targetTokenId) return true;
  return false;
}

function isWorkflowCriticalHit(workflow) {
  return Boolean(
    workflow?.isCritical
    || workflow?.critical
    || workflow?.attackRoll?.isCritical
    || workflow?.attackRoll?.options?.critical
  );
}

function getMissedAttackTargets(workflow) {
  if (workflow?.missedTargets?.size) return [...workflow.missedTargets];
  const hitIds = new Set([...(workflow?.hitTargets ?? [])].map((token) => token.id));
  return [...(workflow?.targets ?? [])].filter((token) => !hitIds.has(token.id));
}

function getStoredTargetCandidates(workflow, flag) {
  if (flag.type === "damaged") {
    const attackerToken = workflow.attackerToken
      ?? [...(workflow.hitTargets ?? [])][0]
      ?? [...(workflow.targets ?? [])][0]
      ?? null;
    return attackerToken ? [attackerToken] : [];
  }

  if (["mwak", "rwak", "msak", "rsak"].includes(flag.type)) {
    const condition = flag.condition ?? "hit";
    if (condition === "hit") return [...(workflow.hitTargets ?? [])];
    if (condition === "miss") return getMissedAttackTargets(workflow);
    if (condition === "critical") return isWorkflowCriticalHit(workflow) ? [...(workflow.hitTargets ?? [])] : [];

    const candidates = new Map();
    for (const token of [...(workflow.targets ?? []), ...(workflow.hitTargets ?? []), ...getMissedAttackTargets(workflow)]) {
      const key = token?.document?.uuid ?? token?.uuid ?? token?.id ?? null;
      if (key) candidates.set(key, token);
    }
    return [...candidates.values()];
  }

  const candidates = new Map();
  for (const token of [...(workflow.hitTargets ?? []), ...(workflow.targets ?? [])]) {
    const key = token?.document?.uuid ?? token?.uuid ?? token?.id ?? null;
    if (key) candidates.set(key, token);
  }
  return [...candidates.values()];
}

function workflowMatchesStoredTarget(workflow, flag) {
  if (!flag.requireStoredTargetMatch) return true;

  const candidates = getStoredTargetCandidates(workflow, flag);
  if (!candidates.length) {
    console.log(`[${MODULE_ID}] Déclenchement ignoré : cible mémorisée non correspondante`);
    return false;
  }

  if (!candidates.some((token) => tokenMatchesStoredTarget(token, flag))) {
    console.log(`[${MODULE_ID}] Déclenchement ignoré : cible mémorisée non correspondante`);
    return false;
  }

  return true;
}

function doesAttackConditionMatch(workflow, flag) {
  const condition = flag.condition ?? "hit";
  if (condition === "always") return true;

  const hitTargets = [...(workflow.hitTargets ?? [])];
  if (condition === "hit") {
    if (hitTargets.length > 0) return true;
    console.log(`[${MODULE_ID}] Déclenchement ignoré : attaque non touchée`);
    return false;
  }

  if (condition === "miss") {
    if (getMissedAttackTargets(workflow).length > 0) return true;
    console.log(`[${MODULE_ID}] Déclenchement ignoré : condition d’attaque non remplie`);
    return false;
  }

  if (condition === "critical") {
    if (isWorkflowCriticalHit(workflow) && hitTargets.length > 0) return true;
    console.log(`[${MODULE_ID}] Déclenchement ignoré : condition d’attaque non remplie`);
    return false;
  }

  console.log(`[${MODULE_ID}] Déclenchement ignoré : condition d’attaque non remplie`);
  return false;
}

async function clearConcentrationLinkedBuffs(sourceActor) {
  const sourceActorUuid = sourceActor?.uuid ?? null;
  const sourceActorId = sourceActor?.id ?? null;
  if (!sourceActorUuid && !sourceActorId) return;

  const carrierEntries = new Map();
  const addCarrier = (actor, tokenDocument = null) => {
    if (!actor?.getFlag) return;
    const key = tokenDocument?.uuid
      ?? actor.uuid
      ?? (tokenDocument?.id && tokenDocument?.parent?.id ? `${tokenDocument.parent.id}.${tokenDocument.id}` : null)
      ?? actor.id
      ?? null;
    if (!key || carrierEntries.has(key)) return;
    carrierEntries.set(key, { actor, tokenDocument });
  };

  for (const actor of game.actors.contents) addCarrier(actor);

  if (canvas?.tokens?.placeables) {
    for (const token of canvas.tokens.placeables) {
      addCarrier(token.actor ?? null, token.document ?? null);
    }
  }

  if (canvas?.scene?.tokens) {
    for (const tokenDocument of canvas.scene.tokens) {
      addCarrier(tokenDocument.actor ?? null, tokenDocument);
    }
  }

  if (game?.scenes?.contents) {
    for (const scene of game.scenes.contents) {
      for (const tokenDocument of scene.tokens ?? []) {
        addCarrier(tokenDocument.actor ?? null, tokenDocument);
      }
    }
  }

  console.log(`[${MODULE_ID}] Nettoyage concentration — porteurs inspectés : ${carrierEntries.size}`);

  let removedCount = 0;
  for (const { actor } of carrierEntries.values()) {
    const activeBuff = actor.getFlag(MODULE_ID, "activeBuff");
    if (!activeBuff) continue;

    console.log(`[${MODULE_ID}] Buff actif inspecté sur ${actor.name} — originActorUuid=${activeBuff.originActorUuid ?? "aucun"}`);

    const matchesOrigin = (sourceActorUuid && activeBuff.originActorUuid === sourceActorUuid)
      || (!activeBuff.originActorUuid && sourceActorId && actor.id === sourceActorId);
    if (!matchesOrigin) continue;

    const itemName = activeBuff.itemName;
    await actor.unsetFlag(MODULE_ID, "activeBuff");
    await actor.unsetFlag(MODULE_ID, "_lastDamagedTrigger");
    await refreshBuffIndicator(actor, itemName, [], activeBuff);
    removedCount += 1;
    console.log(`[${MODULE_ID}] Concentration brisée — buff distant supprimé sur ${actor.name}`);
  }

  console.log(`[${MODULE_ID}] Nettoyage concentration — buffs supprimés : ${removedCount}`);
}

export function registerTriggers() {
  game.actors.forEach((actor) => refreshBuffIndicator(actor));

  Hooks.on("midi-qol.RollComplete", async (workflow) => {
    try {
      if (!workflow.actor) return;
      if (!workflow.activity) return;

      const actionType = workflow.activity.actionType;

      // Phase 1 : l'item utilisé est un buff non-attaque → pose le marqueur sur l'acteur
      const buffConfig = workflow.item?.getFlag(MODULE_ID, "buffTrigger");
      const flag = workflow.actor.getFlag(MODULE_ID, "activeBuff");
      if (buffConfig || flag) console.log(`[${MODULE_ID}] RollComplete déclenché, actionType = ${actionType}`);
      if (buffConfig && !ATTACK_ACTION_TYPES.includes(actionType)) {
        const targetMode = buffConfig.targetMode === "ally" ? "target" : (buffConfig.targetMode ?? "self");
        const activeFlag = {
          ...buffConfig,
          itemName: workflow.item?.name,
          itemImg: workflow.item?.img,
          itemUuid: workflow.item?.uuid ?? null,
          originItemUuid: workflow.item?.uuid ?? null,
          originActorUuid: workflow.actor?.uuid ?? null,
          originSpellLevel: workflow.castData?.castLevel
            ?? workflow.castData?.level
            ?? workflow.castLevel
            ?? workflow.activity?.castLevel
            ?? workflow.activity?.spellLevel
            ?? workflow.item?.system?.level
            ?? null,
          duration: buildItemDurationData(workflow.item) ?? buffConfig.duration,
          chargesRemaining: buffConfig.charges ?? null
        };
        const hasMechBuffs = activeFlag.buffs && Object.values(activeFlag.buffs).some((v) => v !== null);
        const sourceActorName = workflow.actor.name;
        const shouldRememberTarget = targetMode === "target" || activeFlag.rememberTargetOnActivation === true;
        const selectedTargetToken = shouldRememberTarget ? getExactlyOneSelectedTarget() : null;

        if (shouldRememberTarget && !selectedTargetToken?.actor) {
          ui.notifications.warn(game.i18n.localize("BOT.notifications.selectExactlyOneTarget"));
          console.log(`[${MODULE_ID}] Activation annulée — il faut exactement une cible mémorisée`);
          return;
        }

        if (targetMode === "target") {
          activeFlag.targetTokenId = selectedTargetToken.id;
          activeFlag.storedTargetTokenUuid = selectedTargetToken.document?.uuid ?? selectedTargetToken.uuid ?? null;
          activeFlag.storedTargetActorUuid = selectedTargetToken.actor.uuid ?? null;
          await selectedTargetToken.actor.setFlag(MODULE_ID, "activeBuff", activeFlag);
          console.log(`[${MODULE_ID}] Buff activé sur ${selectedTargetToken.actor.name} via ${workflow.item.name}, origine : ${sourceActorName}`);
          if (hasMechBuffs) {
            const changes = buildMechanicalChanges(activeFlag);
            await refreshBuffIndicator(selectedTargetToken.actor, null, changes);
          } else {
            await refreshBuffIndicator(selectedTargetToken.actor);
          }
        } else {
          if (selectedTargetToken?.actor) {
            activeFlag.targetTokenId = selectedTargetToken.id;
            activeFlag.storedTargetTokenUuid = selectedTargetToken.document?.uuid ?? selectedTargetToken.uuid ?? null;
            activeFlag.storedTargetActorUuid = selectedTargetToken.actor.uuid ?? null;
          }
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
    } catch (error) {
      console.error(`[${MODULE_ID}] Erreur dans midi-qol.RollComplete :`, error);
    }
  });

  Hooks.on("updateCombat", async (combat, changed, options, userId) => {
    try {
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
    } catch (error) {
      console.error(`[${MODULE_ID}] Erreur dans updateCombat :`, error);
    }
  });

  Hooks.on("midi-qol.isDamaged", async (token, { item, workflow, damageItem }) => {
    try {
      const actor = token.actor;
      if (!actor) return;
      if (token.actor.id !== actor.id) return;
      const flag = actor?.getFlag(MODULE_ID, "activeBuff");
      if (!flag) {
        console.log(`[${MODULE_ID}] midi-qol.isDamaged : aucun buff actif trouvé sur ${actor.name}`);
        return;
      }
      if (flag.type !== "damaged") {
        console.log(`[${MODULE_ID}] midi-qol.isDamaged : buff actif trouvé mais type différent de damaged (${flag.type})`);
        return;
      }

      console.log(`[${MODULE_ID}] Déclencheur damaged sur ${actor.name}`);

      const expectedAttackType = typeof flag.receivedAttackType === "string" ? flag.receivedAttackType : "any";
      if (expectedAttackType !== "any") {
        const receivedAttackTypes = getReceivedAttackCategories(workflow, item);
        if (!receivedAttackTypes.has(expectedAttackType)) {
          console.log(`[${MODULE_ID}] damaged bloqué par type d’attaque`);
          return;
        }
      }

      const expectedDamageTypes = Array.isArray(flag.receivedDamageTypes) ? flag.receivedDamageTypes.filter(Boolean) : [];
      if (expectedDamageTypes.length > 0) {
        const receivedDamageTypes = getReceivedDamageTypes(damageItem, workflow);
        if (!receivedDamageTypes.length) {
          console.log(`[${MODULE_ID}] Types de dégâts reçus indisponibles pour le filtre damaged`);
        } else if (!receivedDamageTypes.some(type => expectedDamageTypes.includes(type))) {
          console.log(`[${MODULE_ID}] damaged bloqué par type de dégâts`);
          return;
        }
      }

      console.log(`[${MODULE_ID}] damaged autorisé`);

      const now = Date.now();
      const lastTriggered = actor.getFlag(MODULE_ID, "_lastDamagedTrigger") ?? 0;
      if (now - lastTriggered < 1000) return;
      await actor.setFlag(MODULE_ID, "_lastDamagedTrigger", now);
      const actorUuid = actor.uuid;
      const attackerTokenUuid = workflow?.token?.document?.uuid
        ?? workflow?.attackingToken?.document?.uuid
        ?? null;
      const itemUuid = item?.uuid ?? null;
      console.log(`[${MODULE_ID}] Déclencheur damaged différé pour éviter conflit concentration`);
      window.setTimeout(async () => {
        try {
          const delayedActor = fromUuidSync(actorUuid);
          if (!delayedActor?.getFlag) return;
          const delayedFlag = delayedActor.getFlag(MODULE_ID, "activeBuff");
          if (!delayedFlag || delayedFlag.type !== "damaged") return;
          const attackerToken = attackerTokenUuid
            ? (fromUuidSync(attackerTokenUuid)?.object ?? null)
            : null;
          const delayedItem = itemUuid ? fromUuidSync(itemUuid) : null;
          const fakeWorkflow = {
            actor: delayedActor,
            item: delayedItem ?? null,
            attackerToken: attackerToken ?? null,
            attackerTokenUuid: attackerTokenUuid,
            targets: attackerToken ? new Set([attackerToken]) : new Set(),
            hitTargets: attackerToken ? new Set([attackerToken]) : new Set(),
            missedTargets: new Set(),
            damageItem,
          };
          handleAttackTrigger(fakeWorkflow, delayedFlag);
        } catch (error) {
          console.error(`[${MODULE_ID}] Erreur dans midi-qol.isDamaged (différé) :`, error);
        }
      }, 100);
    } catch (error) {
      console.error(`[${MODULE_ID}] Erreur dans midi-qol.isDamaged :`, error);
    }
  });

  Hooks.on("midi-qol.isHealed", async (token, { item, workflow, damageItem }) => {
    try {
      const actor = token.actor;
      const flag = actor?.getFlag(MODULE_ID, "activeBuff");
      if (!flag || flag.type !== "healed") return;
      console.log(`[${MODULE_ID}] Déclencheur healed sur ${actor.name}`);
      const fakeWorkflow = {
        actor,
        item: item ?? null,
        targets: new Set(),
        hitTargets: new Set([token]),
        missedTargets: new Set(),
        damageItem,
      };
      handleAttackTrigger(fakeWorkflow, flag);
    } catch (error) {
      console.error(`[${MODULE_ID}] Erreur dans midi-qol.isHealed :`, error);
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

  Hooks.on("dnd5e.preRollConcentration", (rollConfig, dialogConfig, messageConfig) => {
    const actor = rollConfig?.subject ?? null;
    if (!actor?.uuid) return true;
    const now = Date.now();
    for (const [oldKey, oldTimestamp] of recentConcentrationRolls.entries()) {
      if (now - oldTimestamp > 5000) recentConcentrationRolls.delete(oldKey);
    }
    const dc = Number(rollConfig?.target ?? 0);
    const ability = rollConfig?.ability ?? "con";
    const key = `${actor.uuid}|${ability}|${dc}`;
    const lastTriggered = recentConcentrationRolls.get(key) ?? 0;
    if (now - lastTriggered < 500) {
      console.log(`[${MODULE_ID}] Jet de concentration doublon ignoré`);
      return false;
    }
    recentConcentrationRolls.set(key, now);
    return true;
  });

  Hooks.on("deleteActiveEffect", async (effect, options, userId) => {
    try {
      if (effect.statuses?.has("bot-active")) {
        const actor = effect.parent;
        if (!actor) return;
        const activeBuff = actor.getFlag(MODULE_ID, "activeBuff");
        const itemName = effect.name;
        await actor.unsetFlag(MODULE_ID, "activeBuff");
        await refreshBuffIndicator(actor, itemName, [], activeBuff);
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
        await clearConcentrationLinkedBuffs(actor);
        return;
      }
    } catch (error) {
      console.error(`[${MODULE_ID}] Erreur dans deleteActiveEffect :`, error);
    }
  });
}

function handleAttackTrigger(workflow, flag) {
  const triggerType = workflow.activity?.actionType ?? flag.type;
  console.log(`[${MODULE_ID}] Déclencheur ${triggerType} détecté sur ${workflow.actor.name}`);
  if (!doesAttackConditionMatch(workflow, flag)) return;
  if (!workflowMatchesStoredTarget(workflow, flag)) return;
  applyEffect(workflow, flag);
}

async function handleTurnTrigger(actor, flag, triggerType, overrideTargets = null) {
  console.log(`[${MODULE_ID}] Déclencheur ${triggerType} pour ${actor.name}`);

  let cibles;
  if (overrideTargets !== null) {
    cibles = overrideTargets;
  } else {
    cibles = [];
    console.log(`[${MODULE_ID}] Trigger de tour : aucune cible de déclenchement implicite`);
  }
  if (overrideTargets !== null) {
    console.log(`[${MODULE_ID}] Cibles explicites pour ${triggerType} : ${cibles.length}`);
  }

  const targetsSet = new Set(cibles);
  const workflow = {
    actor,
    item: null,
    targets: targetsSet,
    hitTargets: new Set(cibles),
    missedTargets: new Set(),
  };
  if (!workflowMatchesStoredTarget(workflow, flag)) return;
  await applyEffect(workflow, flag);
  if (flag.consumeOnTrigger === true) {
    await actor.unsetFlag(MODULE_ID, "activeBuff");
    await refreshBuffIndicator(actor, flag.itemName, [], flag);
  }
}


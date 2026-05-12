import { MODULE_ID, ATTACK_ACTION_TYPES, ATTACK_TRIGGER_TYPES, debugLog } from "./constants.js";
import { buildItemDurationData } from "./duration.js";
import { applyEffect, applyMechanicalBuffs, buildMechanicalChanges, refreshBuffIndicator, refreshStoredTargetIndicator, applyTargetIndicator, applyRollModifierToConfig, finalizeRollModifierApplication, resolveSaveDC } from "./effects.js";

const recentConcentrationRolls = new Map();

function resolveRollHookActor(config) {
  return config?.subject?.getFlag
    ? config.subject
    : config?.subject?.actor?.getFlag
      ? config.subject.actor
      : config?.actor?.getFlag
        ? config.actor
        : config?.item?.actor?.getFlag
          ? config.item.actor
          : null;
}

function getRollHookConfig(args) {
  return args.find((arg) => arg && typeof arg === "object" && !Array.isArray(arg) && !arg.getFlag && (
    Array.isArray(arg.rolls)
    || arg.parts !== undefined
    || arg.bonus !== undefined
    || arg.subject !== undefined
    || arg.actor !== undefined
    || arg.data !== undefined
    || arg.advantage !== undefined
    || arg.disadvantage !== undefined
  )) ?? null;
}

function summarizeRollHookArgs(args) {
  return args.map((arg, index) => {
    if (Array.isArray(arg)) return `${index}:array(${arg.length})`;
    if (!arg || typeof arg !== "object") return `${index}:${typeof arg}`;
    const ctor = arg.constructor?.name ?? "object";
    const keys = Object.keys(arg).slice(0, 10).join(",");
    const subject = arg.subject?.name ?? arg.subject?.item?.name ?? arg.subject?.constructor?.name ?? "none";
    const actor = arg.actor?.name ?? arg.subject?.actor?.name ?? arg.item?.actor?.name ?? "none";
    const rolls = Array.isArray(arg.rolls) ? arg.rolls.length : "none";
    const firstRoll = Array.isArray(arg.rolls) ? arg.rolls[0] : null;
    return `${index}:${ctor}{keys=${keys}; subject=${subject}; actor=${actor}; rolls=${rolls}; parts=${Array.isArray(arg.parts)}; bonus=${arg.bonus !== undefined}; roll0.parts=${Array.isArray(firstRoll?.parts)}; roll0.bonus=${firstRoll?.bonus !== undefined}}`;
  }).join(" | ");
}

async function handleRollModifierHook(hookName, rollType, ...args) {
  const config = getRollHookConfig(args);
  const actor = resolveRollHookActor(config) ?? args.find((arg) => arg?.getFlag) ?? null;
  if (!actor?.getFlag || !config) {
    console.warn(`[${MODULE_ID}] Modificateur de jet non appliqu\u00e9 : configuration dnd5e incompatible (${hookName})`);
    debugLog(`[${MODULE_ID}] Debug ${hookName} : ${summarizeRollHookArgs(args)}`);
    return;
  }
  debugLog(`[${MODULE_ID}] Debug ${hookName} : acteur=${actor.name}, subject=${config.subject?.constructor?.name ?? "none"}, rolls=${config.rolls?.length ?? 0}, roll0.parts=${Array.isArray(config.rolls?.[0]?.parts)}, roll0.bonus=${config.rolls?.[0]?.bonus !== undefined}, config.parts=${Array.isArray(config.parts)}, config.bonus=${config.bonus !== undefined}`);
  if (rollType === "ability" && (config.skill || config.tool)) {
    debugLog(`[${MODULE_ID}] Modificateur de jet ignor\u00e9 : type non compatible`);
    return;
  }
  await applyRollModifierToConfig(actor, rollType, config);
}

function handleRollModifierBuildHook(hookName, rollType, process, rollConfig) {
  const actor = resolveRollHookActor(process);
  if (!actor?.getFlag || !rollConfig) {
    console.warn(`[${MODULE_ID}] Modificateur de jet non appliqué : configuration dnd5e incompatible (${hookName})`);
    debugLog(`[${MODULE_ID}] Debug ${hookName} : processKeys=${Object.keys(process ?? {}).join(",")}, rollKeys=${Object.keys(rollConfig ?? {}).join(",")}`);
    return;
  }
  debugLog(`[${MODULE_ID}] Debug ${hookName} : acteur=${actor.name}, processSubject=${process?.subject?.constructor?.name ?? "none"}, rollKeys=${Object.keys(rollConfig ?? {}).join(",")}, parts=${Array.isArray(rollConfig.parts)}, bonus=${rollConfig.bonus !== undefined}, formula=${rollConfig.formula ?? "none"}, options=${Object.keys(rollConfig.options ?? {}).join(",")}`);
  if (rollType === "ability" && (process.skill || process.tool)) {
    debugLog(`[${MODULE_ID}] Modificateur de jet ignoré : type non compatible`);
    return;
  }
  const applied = applyRollModifierToConfig(actor, rollType, rollConfig, { consume: false });
  if (applied) process._botRollModifier = rollConfig._botRollModifier;
}

async function handleRollModifierFinalHook(hookName, rollType, rolls, process) {
  const actor = resolveRollHookActor(process);
  const metadata = process?._botRollModifier;
  if (!actor?.getFlag || !metadata) return;
  await finalizeRollModifierApplication(actor, rollType, metadata, rolls);
}

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

function doesAttackTriggerMatch(triggerType, actionType) {
  if (triggerType === actionType) return true;
  if (triggerType === "anyAttack") return ATTACK_ACTION_TYPES.includes(actionType);
  if (triggerType === "weaponAttack") return ["mwak", "rwak"].includes(actionType);
  if (triggerType === "spellAttack") return ["msak", "rsak"].includes(actionType);
  return false;
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

  if (ATTACK_TRIGGER_TYPES.includes(flag.type)) {
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
    debugLog(`[${MODULE_ID}] Déclenchement ignoré : cible mémorisée non correspondante`);
    return false;
  }

  if (!candidates.some((token) => tokenMatchesStoredTarget(token, flag))) {
    debugLog(`[${MODULE_ID}] Déclenchement ignoré : cible mémorisée non correspondante`);
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
    debugLog(`[${MODULE_ID}] Déclenchement ignoré : attaque non touchée`);
    return false;
  }

  if (condition === "miss") {
    if (getMissedAttackTargets(workflow).length > 0) return true;
    debugLog(`[${MODULE_ID}] Déclenchement ignoré : condition d’attaque non remplie`);
    return false;
  }

  if (condition === "critical") {
    if (isWorkflowCriticalHit(workflow) && hitTargets.length > 0) return true;
    debugLog(`[${MODULE_ID}] Déclenchement ignoré : condition d’attaque non remplie`);
    return false;
  }

  debugLog(`[${MODULE_ID}] Déclenchement ignoré : condition d’attaque non remplie`);
  return false;
}

function collectBuffCarrierEntries() {
  const carrierEntries = new Map();
  const addCarrier = (actor, tokenDocument = null) => {
    if (!actor?.getFlag) return;
    const key = actor.uuid
      ?? tokenDocument?.uuid
      ?? (tokenDocument?.id && tokenDocument?.parent?.id ? `${tokenDocument.parent.id}.${tokenDocument.id}` : null)
      ?? actor.id
      ?? null;
    if (!key || carrierEntries.has(key)) return;
    carrierEntries.set(key, { actor, tokenDocument });
  };

  for (const actor of game.actors.contents) addCarrier(actor);

  if (canvas?.tokens?.placeables) {
    for (const token of canvas.tokens.placeables) addCarrier(token.actor ?? null, token.document ?? null);
  }

  if (canvas?.scene?.tokens) {
    for (const tokenDocument of canvas.scene.tokens) addCarrier(tokenDocument.actor ?? null, tokenDocument);
  }

  if (game?.scenes?.contents) {
    for (const scene of game.scenes.contents) {
      for (const tokenDocument of scene.tokens ?? []) addCarrier(tokenDocument.actor ?? null, tokenDocument);
    }
  }

  return [...carrierEntries.values()];
}

function getBuffItemUuid(flag) {
  return flag?.originItemUuid ?? flag?.itemUuid ?? null;
}

function doesBuffMatchSameOriginAndItem(existingFlag, newFlag) {
  const newOriginActorUuid = newFlag?.originActorUuid ?? null;
  const newItemUuid = getBuffItemUuid(newFlag);
  return !!newOriginActorUuid
    && !!newItemUuid
    && existingFlag?.originActorUuid === newOriginActorUuid
    && getBuffItemUuid(existingFlag) === newItemUuid;
}

function findExistingBuffInstances(newFlag) {
  return collectBuffCarrierEntries()
    .map(({ actor }) => ({ actor, activeBuff: actor.getFlag(MODULE_ID, "activeBuff") }))
    .filter(({ activeBuff }) => doesBuffMatchSameOriginAndItem(activeBuff, newFlag));
}

function getStoredTargetName(flag) {
  const token = flag?.storedTargetTokenUuid && typeof fromUuidSync === "function"
    ? fromUuidSync(flag.storedTargetTokenUuid)?.object
    : null;
  const actor = token?.actor
    ?? (flag?.storedTargetActorUuid && typeof fromUuidSync === "function" ? fromUuidSync(flag.storedTargetActorUuid) : null);
  return token?.name ?? actor?.name ?? game.i18n.localize("BOT.ui.summary.notConfigured");
}

function getControlledToken() {
  const controlled = canvas?.tokens?.controlled ?? [];
  if (!controlled.length) {
    ui.notifications.warn(game.i18n.localize("BOT.notifications.selectMarkOwner"));
    return null;
  }
  if (controlled.length > 1) {
    ui.notifications.warn(game.i18n.localize("BOT.notifications.selectSingleMarkOwner"));
    return null;
  }
  return controlled[0] ?? null;
}

function getSingleUserTarget() {
  const targetSet = game.user?.targets ?? new Set();
  const targets = typeof targetSet.first === "function" ? [targetSet.first()].filter(Boolean) : [...targetSet];
  if (!targets.length) {
    ui.notifications.warn(game.i18n.localize("BOT.notifications.targetNewCreature"));
    return null;
  }
  if (targets.length > 1) {
    ui.notifications.warn(game.i18n.localize("BOT.notifications.targetSingleCreature"));
    return null;
  }
  return targets[0] ?? null;
}

async function clearExistingBuffInstance(actor, activeBuff) {
  if (!actor?.unsetFlag || !activeBuff) return;
  const itemName = activeBuff.itemName;
  await actor.unsetFlag(MODULE_ID, "activeBuff");
  await actor.unsetFlag(MODULE_ID, "_lastDamagedTrigger");
  const mechEffects = actor.effects?.filter((e) => e.flags?.[MODULE_ID]?.mechanicalBuff === true) ?? [];
  for (const effect of mechEffects) await effect.delete();
  await refreshBuffIndicator(actor, itemName, [], activeBuff);
}

async function moveStoredTarget(actor, activeBuff, newTargetToken) {
  if (!actor?.setFlag || !activeBuff?.rememberTargetOnActivation || !newTargetToken?.actor) return false;
  const previousFlag = foundry.utils.deepClone(activeBuff);
  const previousName = getStoredTargetName(previousFlag);
  const nextName = newTargetToken.name ?? newTargetToken.actor.name;
  const updatedFlag = {
    ...activeBuff,
    targetTokenId: newTargetToken.id ?? null,
    storedTargetTokenUuid: newTargetToken.document?.uuid ?? newTargetToken.uuid ?? null,
    storedTargetActorUuid: newTargetToken.actor.uuid ?? null,
  };

  await actor.setFlag(MODULE_ID, "activeBuff", updatedFlag);
  const nextFlag = actor.getFlag(MODULE_ID, "activeBuff") ?? updatedFlag;
  await refreshStoredTargetIndicator(actor, previousFlag);
  const originName = nextFlag.originActorUuid && typeof fromUuidSync === "function"
    ? fromUuidSync(nextFlag.originActorUuid)?.name ?? actor.name
    : actor.name;
  debugLog(`[${MODULE_ID}] Cible mÃ©morisÃ©e changÃ©e : ${previousName} â†’ ${nextName}`);
  debugLog(`[${MODULE_ID}] Indicateur de marque ajoutÃ© sur ${nextName}, origine ${originName}`);
  return true;
}

export async function changeStoredTarget() {
  const ownerToken = getControlledToken();
  if (!ownerToken?.actor) return false;

  const newTargetToken = getSingleUserTarget();
  if (!newTargetToken?.actor) return false;

  const activeBuff = ownerToken.actor.getFlag(MODULE_ID, "activeBuff");
  if (!activeBuff?.rememberTargetOnActivation) {
    ui.notifications.warn(game.i18n.localize("BOT.notifications.noActiveMarkFound"));
    return false;
  }

  return moveStoredTarget(ownerToken.actor, activeBuff, newTargetToken);
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

  debugLog(`[${MODULE_ID}] Nettoyage concentration — porteurs inspectés : ${carrierEntries.size}`);

  let removedCount = 0;
  for (const { actor } of carrierEntries.values()) {
    const activeBuff = actor.getFlag(MODULE_ID, "activeBuff");
    if (!activeBuff) continue;

    debugLog(`[${MODULE_ID}] Buff actif inspecté sur ${actor.name} — originActorUuid=${activeBuff.originActorUuid ?? "aucun"}`);

    const matchesOrigin = (sourceActorUuid && activeBuff.originActorUuid === sourceActorUuid)
      || (!activeBuff.originActorUuid && sourceActorId && actor.id === sourceActorId);
    if (!matchesOrigin) continue;

    const itemName = activeBuff.itemName;
    await actor.unsetFlag(MODULE_ID, "activeBuff");
    await actor.unsetFlag(MODULE_ID, "_lastDamagedTrigger");
    await refreshBuffIndicator(actor, itemName, [], activeBuff);
    removedCount += 1;
    debugLog(`[${MODULE_ID}] Concentration brisée — buff distant supprimé sur ${actor.name}`);
  }

  debugLog(`[${MODULE_ID}] Nettoyage concentration — buffs supprimés : ${removedCount}`);
}

function shouldRollActivationSave(flag) {
  const timing = flag?.save?.timing ?? "trigger";
  return !!flag?.save?.ability && (timing === "activation" || timing === "both");
}

async function shouldApplyBuffAfterActivationSave(workflow, activeFlag, targetToken) {
  if (!shouldRollActivationSave(activeFlag)) return true;

  if (!targetToken?.actor) {
    debugLog(`[${MODULE_ID}] JS d'activation ignoré : aucune cible claire`);
    return true;
  }

  const saveDc = await resolveSaveDC(workflow, activeFlag);
  if (saveDc === null) {
    debugLog(`[${MODULE_ID}] JS d'activation ignoré : DD indisponible`);
    return true;
  }

  const saveRolls = await targetToken.actor.rollSavingThrow(
    {
      ability: activeFlag.save.ability,
      target: saveDc,
      targetValue: saveDc,
      dc: saveDc,
    },
    { configure: false },
    { create: true }
  );
  const saveRoll = saveRolls?.[0] ?? null;
  if (!saveRoll) {
    debugLog(`[${MODULE_ID}] Buff non appliqué : JS d'activation indisponible`);
    return false;
  }

  const success = saveRoll.total >= saveDc;
  const applyOn = activeFlag.save.activationApplyOn ?? "failure";
  const shouldApply = applyOn === "success" ? success : !success;
  debugLog(`[${MODULE_ID}] JS d'activation ${activeFlag.save.ability} ${saveRoll.total} vs DD ${saveDc} — ${success ? "réussite" : "échec"} — buff ${shouldApply ? "appliqué" : "ignoré"}`);
  return shouldApply;
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
      if (buffConfig || flag) debugLog(`[${MODULE_ID}] RollComplete déclenché, actionType = ${actionType}`);
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
        const existingBuffs = findExistingBuffInstances(activeFlag);

        if (shouldRememberTarget && !selectedTargetToken?.actor) {
          ui.notifications.warn(game.i18n.localize("BOT.notifications.selectExactlyOneTarget"));
          debugLog(`[${MODULE_ID}] Activation annulée — il faut exactement une cible mémorisée`);
          return;
        }

        const activationSaveTarget = targetMode === "target" ? selectedTargetToken : null;
        if (!await shouldApplyBuffAfterActivationSave(workflow, activeFlag, activationSaveTarget)) {
          debugLog(`[${MODULE_ID}] Activation annulée — JS d'activation non satisfait`);
          return;
        }

        if (existingBuffs.length) {
          for (const existing of existingBuffs) {
            await clearExistingBuffInstance(existing.actor, existing.activeBuff);
          }
          debugLog(`[${MODULE_ID}] Ancien buff remplacÃ© : ${workflow.item.name}`);
        }

        if (targetMode === "target") {
          activeFlag.targetTokenId = selectedTargetToken.id;
          activeFlag.storedTargetTokenUuid = selectedTargetToken.document?.uuid ?? selectedTargetToken.uuid ?? null;
          activeFlag.storedTargetActorUuid = selectedTargetToken.actor.uuid ?? null;
          await selectedTargetToken.actor.setFlag(MODULE_ID, "activeBuff", activeFlag);
          debugLog(`[${MODULE_ID}] Buff activé sur ${selectedTargetToken.actor.name} via ${workflow.item.name}, origine : ${sourceActorName}`);
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
          debugLog(`[${MODULE_ID}] Buff activé sur ${workflow.actor.name} via ${workflow.item.name}`);
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
      if (flag.type === "passive") return;

      if (doesAttackTriggerMatch(flag.type, actionType)) {
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
        debugLog(`[${MODULE_ID}] midi-qol.isDamaged : aucun buff actif trouvé sur ${actor.name}`);
        return;
      }
      if (flag.type !== "damaged") {
        debugLog(`[${MODULE_ID}] midi-qol.isDamaged : buff actif trouvé mais type différent de damaged (${flag.type})`);
        return;
      }

      debugLog(`[${MODULE_ID}] Déclencheur damaged sur ${actor.name}`);

      const expectedAttackType = typeof flag.receivedAttackType === "string" ? flag.receivedAttackType : "any";
      if (expectedAttackType !== "any") {
        const receivedAttackTypes = getReceivedAttackCategories(workflow, item);
        if (!receivedAttackTypes.has(expectedAttackType)) {
          debugLog(`[${MODULE_ID}] damaged bloqué par type d’attaque`);
          return;
        }
      }

      const expectedDamageTypes = Array.isArray(flag.receivedDamageTypes) ? flag.receivedDamageTypes.filter(Boolean) : [];
      if (expectedDamageTypes.length > 0) {
        const receivedDamageTypes = getReceivedDamageTypes(damageItem, workflow);
        if (!receivedDamageTypes.length) {
          debugLog(`[${MODULE_ID}] Types de dégâts reçus indisponibles pour le filtre damaged`);
        } else if (!receivedDamageTypes.some(type => expectedDamageTypes.includes(type))) {
          debugLog(`[${MODULE_ID}] damaged bloqué par type de dégâts`);
          return;
        }
      }

      debugLog(`[${MODULE_ID}] damaged autorisé`);

      const now = Date.now();
      const lastTriggered = actor.getFlag(MODULE_ID, "_lastDamagedTrigger") ?? 0;
      if (now - lastTriggered < 1000) return;
      await actor.setFlag(MODULE_ID, "_lastDamagedTrigger", now);
      const actorUuid = actor.uuid;
      const attackerTokenUuid = workflow?.token?.document?.uuid
        ?? workflow?.attackingToken?.document?.uuid
        ?? null;
      const itemUuid = item?.uuid ?? null;
      debugLog(`[${MODULE_ID}] Déclencheur damaged différé pour éviter conflit concentration`);
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
      debugLog(`[${MODULE_ID}] Déclencheur healed sur ${actor.name}`);
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

  Hooks.on("dnd5e.preRollSkill", async (config, skillId) => {
    const actor = config.subject ?? config.actor ?? null;
    if (!actor?.getFlag) return;
    const activeBuff = actor.getFlag(MODULE_ID, "activeBuff");
    const skills = activeBuff?.buffs?.skills;
    if (skills?.length && (skills.includes("all") || skills.includes(skillId))) {
      config.advantage = true;
      debugLog(`[${MODULE_ID}] Avantage compétence ${skillId} appliqué sur ${actor.name}`);
    }
  });

  Hooks.on("dnd5e.preRollAbility", async (actor, config, abilityId) => {
    const activeBuff = actor.getFlag(MODULE_ID, "activeBuff");
    if (activeBuff?.buffs?.skillMode === "advantage") {
      config.advantage = true;
      debugLog(`[${MODULE_ID}] Avantage caractéristique appliqué sur ${actor.name}`);
    } else if (activeBuff?.buffs?.skillMode === "disadvantage") {
      config.disadvantage = true;
      debugLog(`[${MODULE_ID}] Désavantage caractéristique appliqué sur ${actor.name}`);
    }
  });


  Hooks.on("dnd5e.preRollAttack", async (...args) => {
    debugLog(`[${MODULE_ID}] Debug dnd5e.preRollAttack : ${summarizeRollHookArgs(args)}`);
  });

  Hooks.on("dnd5e.preRollSavingThrow", async (...args) => {
    debugLog(`[${MODULE_ID}] Debug dnd5e.preRollSavingThrow : ${summarizeRollHookArgs(args)}`);
  });

  Hooks.on("dnd5e.preRollAbilitySave", async (...args) => {
    debugLog(`[${MODULE_ID}] Debug dnd5e.preRollAbilitySave : ${summarizeRollHookArgs(args)}`);
  });

  Hooks.on("dnd5e.preRollAbilityCheck", async (...args) => {
    debugLog(`[${MODULE_ID}] Debug dnd5e.preRollAbilityCheck : ${summarizeRollHookArgs(args)}`);
  });

  Hooks.on("dnd5e.postBuildAttackRollConfig", async (process, rollConfig) => {
    handleRollModifierBuildHook("dnd5e.postBuildAttackRollConfig", "attack", process, rollConfig);
  });

  Hooks.on("dnd5e.postBuildSavingThrowRollConfig", async (process, rollConfig) => {
    handleRollModifierBuildHook("dnd5e.postBuildSavingThrowRollConfig", "save", process, rollConfig);
  });

  Hooks.on("dnd5e.postBuildAbilityCheckRollConfig", async (process, rollConfig) => {
    handleRollModifierBuildHook("dnd5e.postBuildAbilityCheckRollConfig", "ability", process, rollConfig);
  });

  Hooks.on("dnd5e.postBuildSkillRollConfig", async (process, rollConfig) => {
    handleRollModifierBuildHook("dnd5e.postBuildSkillRollConfig", "skill", process, rollConfig);
  });

  Hooks.on("dnd5e.postAttackRollConfiguration", async (rolls, process) => {
    await handleRollModifierFinalHook("dnd5e.postAttackRollConfiguration", "attack", rolls, process);
  });

  Hooks.on("dnd5e.postSavingThrowRollConfiguration", async (rolls, process) => {
    await handleRollModifierFinalHook("dnd5e.postSavingThrowRollConfiguration", "save", rolls, process);
  });

  Hooks.on("dnd5e.postAbilityCheckRollConfiguration", async (rolls, process) => {
    await handleRollModifierFinalHook("dnd5e.postAbilityCheckRollConfiguration", "ability", rolls, process);
  });

  Hooks.on("dnd5e.postSkillRollConfiguration", async (rolls, process) => {
    await handleRollModifierFinalHook("dnd5e.postSkillRollConfiguration", "skill", rolls, process);
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
      debugLog(`[${MODULE_ID}] Jet de concentration doublon ignoré`);
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
        debugLog(`[${MODULE_ID}] Buff supprimé manuellement sur ${actor.name}`);
        if (activeBuff?.duration?.concentration) {
          const concentrationEffect = actor.effects.find(
            (e) => e.statuses?.has("concentrating") || e.statuses?.has("concentration")
          );
          if (concentrationEffect) {
            await concentrationEffect.delete();
            debugLog(`[${MODULE_ID}] Concentration retirée sur ${actor.name}`);
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
  if (flag.type === "passive") return;
  const triggerType = workflow.activity?.actionType ?? flag.type;
  debugLog(`[${MODULE_ID}] Déclencheur ${triggerType} détecté sur ${workflow.actor.name}`);
  if (!doesAttackConditionMatch(workflow, flag)) return;
  if (!workflowMatchesStoredTarget(workflow, flag)) return;
  applyEffect(workflow, flag);
}

async function handleTurnTrigger(actor, flag, triggerType, overrideTargets = null) {
  debugLog(`[${MODULE_ID}] Déclencheur ${triggerType} pour ${actor.name}`);

  let cibles;
  if (overrideTargets !== null) {
    cibles = overrideTargets;
  } else {
    cibles = [];
    debugLog(`[${MODULE_ID}] Trigger de tour : aucune cible de déclenchement implicite`);
  }
  if (overrideTargets !== null) {
    debugLog(`[${MODULE_ID}] Cibles explicites pour ${triggerType} : ${cibles.length}`);
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

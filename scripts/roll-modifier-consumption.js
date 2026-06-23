export const ROLL_MODIFIER_CONSUMPTION_MODES = Object.freeze({
  AUTOMATIC: "automatic",
  PROMPT: "prompt",
});

export const ROLL_MODIFIER_PROMPT_TIMINGS = Object.freeze({
  BEFORE_ROLL: "beforeRoll",
  AFTER_ROLL: "afterRoll",
});

export function getRollModifierConsumptionMode(rollModifier) {
  return rollModifier?.consumptionMode === ROLL_MODIFIER_CONSUMPTION_MODES.PROMPT
    ? ROLL_MODIFIER_CONSUMPTION_MODES.PROMPT
    : ROLL_MODIFIER_CONSUMPTION_MODES.AUTOMATIC;
}

export function getRollModifierPromptTiming(rollModifier) {
  return rollModifier?.promptTiming === ROLL_MODIFIER_PROMPT_TIMINGS.AFTER_ROLL
    ? ROLL_MODIFIER_PROMPT_TIMINGS.AFTER_ROLL
    : ROLL_MODIFIER_PROMPT_TIMINGS.BEFORE_ROLL;
}

export function isPromptableRollModifierCandidate(candidate) {
  return candidate?.consumable === true
    && getRollModifierConsumptionMode(candidate?.activeFlag?.rollModifier)
      === ROLL_MODIFIER_CONSUMPTION_MODES.PROMPT;
}

export function canUseAfterRollPrompt({
  candidate,
  rollType,
  midiActive = false,
  experimentalEnabled = false,
  addRollAvailable = false,
  workflow = null,
} = {}) {
  return rollType === "attack"
    && isPromptableRollModifierCandidate(candidate)
    && getRollModifierPromptTiming(candidate?.activeFlag?.rollModifier)
      === ROLL_MODIFIER_PROMPT_TIMINGS.AFTER_ROLL
    && midiActive === true
    && experimentalEnabled === true
    && addRollAvailable === true
    && !!workflow?.actor
    && typeof workflow?.setAttackRoll === "function";
}

export function buildRollModifierPromptDecision(approvedBuffIds = []) {
  return {
    resolved: true,
    approvedBuffIds: [...new Set(
      (approvedBuffIds ?? []).filter((buffId) => typeof buffId === "string" && buffId)
    )],
  };
}

export function shouldApplyRollModifierCandidate(candidate, decision = null) {
  if (!isPromptableRollModifierCandidate(candidate)) return true;
  if (decision?.resolved !== true) return false;
  return decision.approvedBuffIds?.includes(candidate.buffId) === true;
}

export function isRollModifierMetadataConsumed(metadata) {
  if (!metadata || typeof metadata !== "object") return false;
  if (Array.isArray(metadata.modifiers)) {
    return metadata.modifiers.length > 0
      && metadata.modifiers.every((modifier) => modifier?.consumed === true);
  }
  return metadata.consumed === true;
}

export function createRollModifierPromptWrapper(original, {
  rollType,
  decisionKey,
  getCandidates,
  resolveDecision,
  resolveActor = (context) => context,
  onPrompt = null,
} = {}) {
  return async function(config = {}, dialog = {}, message = {}) {
    if (config?.[decisionKey]?.resolved === true) {
      return original.call(this, config, dialog, message);
    }

    const actor = resolveActor(this);
    const candidates = (getCandidates?.(actor, rollType, {
      context: this,
      config,
      dialog,
      message,
    }) ?? [])
      .filter(isPromptableRollModifierCandidate);
    if (!candidates.length) return original.call(this, config, dialog, message);

    onPrompt?.(actor, rollType, candidates);
    let decision;
    try {
      decision = await resolveDecision(candidates);
    } catch {
      decision = buildRollModifierPromptDecision([]);
    }
    return original.call(this, {
      ...config,
      [decisionKey]: decision,
    }, dialog, message);
  };
}

export function getBardicInspirationDie(classLevel) {
  const level = Number(classLevel);
  if (!Number.isFinite(level) || level < 5) return 6;
  if (level < 10) return 8;
  if (level < 15) return 10;
  return 12;
}

const PROMPT_PRESET_LABEL_KEYS = Object.freeze({
  bardicInspiration: "BOT.ui.rollModifier.promptEffect.bardicInspiration",
  guidance: "BOT.ui.rollModifier.promptEffect.guidance",
  resistance: "BOT.ui.rollModifier.promptEffect.resistance",
});

export function getRollModifierPromptDisplay(candidate, {
  localize = (key) => key,
  fallbackName = "Buff",
  bardicDieFallback = "Bardic Inspiration die",
} = {}) {
  const activeFlag = candidate?.activeFlag ?? {};
  const rollModifier = activeFlag.rollModifier ?? {};
  const presetId = activeFlag.presetMeta?.presetId ?? null;
  const presetLabelKey = PROMPT_PRESET_LABEL_KEYS[presetId] ?? null;
  const displayName = String(
    rollModifier.label
      ?? (presetLabelKey ? localize(presetLabelKey) : null)
      ?? activeFlag.presetMeta?.presetLabel
      ?? activeFlag.itemName
      ?? fallbackName
  ).trim() || fallbackName;

  const formula = String(candidate?.formula ?? rollModifier.formula ?? "").trim();
  let displayFormula = String(candidate?.displayFormula ?? rollModifier.formulaLabel ?? formula).trim();
  if (displayFormula.includes("@origin.bardicInspirationDie")) {
    displayFormula = bardicDieFallback;
  }

  return {
    name: displayName,
    formula: displayFormula || formula,
  };
}

const finalizedMidiAttackWorkflows = new WeakSet();
const afterRollPromptStates = new WeakMap();

function getAfterRollPromptState(workflow) {
  let state = afterRollPromptStates.get(workflow);
  if (!state) {
    state = new Map();
    afterRollPromptStates.set(workflow, state);
  }
  return state;
}

export async function processAfterRollPromptCandidate(workflow, candidate, {
  prompt,
  evaluateBonus,
  addRoll,
  setAttackRoll = (newRoll) => workflow?.setAttackRoll?.(newRoll),
  consume,
} = {}) {
  const buffId = candidate?.buffId;
  if (!workflow?.attackRoll || !buffId) return { status: "ignored" };

  const states = getAfterRollPromptState(workflow);
  if (states.has(buffId)) return { status: "duplicate" };
  states.set(buffId, "pending");

  let accepted = false;
  try {
    accepted = await prompt(candidate, workflow);
  } catch {
    accepted = false;
  }
  if (!accepted) {
    states.set(buffId, "declined");
    return { status: "declined" };
  }

  let rollApplied = false;
  try {
    const bonusRoll = await evaluateBonus(candidate, workflow);
    if (!bonusRoll) {
      states.delete(buffId);
      return { status: "failed" };
    }
    const newRoll = addRoll(workflow.attackRoll, bonusRoll);
    if (!newRoll) {
      states.delete(buffId);
      return { status: "failed" };
    }
    await setAttackRoll(newRoll);
    rollApplied = true;
    states.set(buffId, "applied");
    const consumed = await consume(candidate, workflow, newRoll);
    states.set(buffId, consumed === false ? "applied" : "consumed");
    return {
      status: consumed === false ? "applied" : "consumed",
      bonusRoll,
      newRoll,
    };
  } catch (error) {
    if (!rollApplied) states.delete(buffId);
    return { status: "failed", error };
  }
}

function hasPromptRollModifierMetadata(metadata) {
  const modifiers = Array.isArray(metadata?.modifiers) ? metadata.modifiers : [metadata];
  return modifiers.some((modifier) =>
    modifier?.consumptionMode === ROLL_MODIFIER_CONSUMPTION_MODES.PROMPT
  );
}

export function getMidiAttackRollModifierContext(workflow) {
  const actor = workflow?.actor ?? workflow?.item?.actor ?? null;
  const metadata = workflow?._botRollModifier ?? null;
  const attackRoll = workflow?.attackRoll ?? workflow?.attackRolls?.[0] ?? null;
  if (!actor
    || !metadata
    || !attackRoll
    || isRollModifierMetadataConsumed(metadata)
    || !hasPromptRollModifierMetadata(metadata)) return null;
  return {
    actor,
    metadata,
    rolls: [attackRoll],
  };
}

export async function finalizeMidiAttackRollModifierWorkflow(workflow, finalize) {
  if (!workflow || typeof workflow !== "object" || finalizedMidiAttackWorkflows.has(workflow)) {
    return false;
  }
  const context = getMidiAttackRollModifierContext(workflow);
  if (!context || typeof finalize !== "function") return false;

  finalizedMidiAttackWorkflows.add(workflow);
  try {
    return await finalize(context);
  } catch (error) {
    finalizedMidiAttackWorkflows.delete(workflow);
    throw error;
  }
}

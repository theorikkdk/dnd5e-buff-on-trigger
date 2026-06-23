export const ROLL_MODIFIER_CONSUMPTION_MODES = Object.freeze({
  AUTOMATIC: "automatic",
  PROMPT: "prompt",
});

export function getRollModifierConsumptionMode(rollModifier) {
  return rollModifier?.consumptionMode === ROLL_MODIFIER_CONSUMPTION_MODES.PROMPT
    ? ROLL_MODIFIER_CONSUMPTION_MODES.PROMPT
    : ROLL_MODIFIER_CONSUMPTION_MODES.AUTOMATIC;
}

export function isPromptableRollModifierCandidate(candidate) {
  return candidate?.consumable === true
    && getRollModifierConsumptionMode(candidate?.activeFlag?.rollModifier)
      === ROLL_MODIFIER_CONSUMPTION_MODES.PROMPT;
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

export function createRollModifierPromptWrapper(original, {
  rollType,
  decisionKey,
  getCandidates,
  resolveDecision,
  onPrompt = null,
} = {}) {
  return async function(config = {}, dialog = {}, message = {}) {
    if (config?.[decisionKey]?.resolved === true) {
      return original.call(this, config, dialog, message);
    }

    const candidates = (getCandidates?.(this, rollType) ?? [])
      .filter(isPromptableRollModifierCandidate);
    if (!candidates.length) return original.call(this, config, dialog, message);

    onPrompt?.(this, rollType, candidates);
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

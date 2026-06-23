import test from "node:test";
import assert from "node:assert/strict";

import {
  buildRollModifierPromptDecision,
  createRollModifierPromptWrapper,
  getRollModifierConsumptionMode,
  isPromptableRollModifierCandidate,
  shouldApplyRollModifierCandidate,
} from "../scripts/roll-modifier-consumption.js";

function candidate({
  buffId = "buff-guidance",
  consumptionMode,
  consumable = true,
} = {}) {
  return {
    buffId,
    consumable,
    activeFlag: {
      rollModifier: {
        enabled: true,
        formula: "1d4",
        ...(consumptionMode ? { consumptionMode } : {}),
      },
    },
  };
}

test("missing or unknown consumption mode remains automatic", () => {
  assert.equal(getRollModifierConsumptionMode({}), "automatic");
  assert.equal(getRollModifierConsumptionMode({ consumptionMode: "unknown" }), "automatic");
  assert.equal(shouldApplyRollModifierCandidate(candidate()), true);
});

test("automatic mode applies without a prompt decision", () => {
  assert.equal(shouldApplyRollModifierCandidate(candidate({
    consumptionMode: "automatic",
  })), true);
});

test("prompt mode applies only after an explicit yes decision", () => {
  const optional = candidate({ consumptionMode: "prompt" });
  const yes = buildRollModifierPromptDecision([optional.buffId]);

  assert.equal(isPromptableRollModifierCandidate(optional), true);
  assert.equal(shouldApplyRollModifierCandidate(optional, yes), true);
});

test("prompt mode skips the modifier after no or cancellation", () => {
  const optional = candidate({ consumptionMode: "prompt" });
  const no = buildRollModifierPromptDecision([]);

  assert.equal(shouldApplyRollModifierCandidate(optional, no), false);
  assert.equal(shouldApplyRollModifierCandidate(optional, null), false);
});

test("prompt mode is ignored for a non-consumable continuous modifier", () => {
  const continuous = candidate({
    consumptionMode: "prompt",
    consumable: false,
  });

  assert.equal(isPromptableRollModifierCandidate(continuous), false);
  assert.equal(shouldApplyRollModifierCandidate(continuous), true);
});

test("prompt decisions deduplicate exact buff ids", () => {
  assert.deepEqual(buildRollModifierPromptDecision([
    "buff-guidance",
    "buff-guidance",
    "",
    null,
  ]), {
    resolved: true,
    approvedBuffIds: ["buff-guidance"],
  });
});

test("prompt wrapper preserves automatic roll behavior without prompting", async () => {
  const calls = [];
  const original = async function(config, dialog, message) {
    calls.push({ actor: this, config, dialog, message });
    return "rolled";
  };
  let promptCount = 0;
  const wrapped = createRollModifierPromptWrapper(original, {
    rollType: "save",
    decisionKey: "_decision",
    getCandidates: () => [candidate({ consumptionMode: "automatic" })],
    resolveDecision: async () => {
      promptCount += 1;
      return buildRollModifierPromptDecision([]);
    },
  });
  const actor = { id: "actor" };
  const result = await wrapped.call(actor, { ability: "wis" }, { configure: true }, { create: true });

  assert.equal(result, "rolled");
  assert.equal(promptCount, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].config._decision, undefined);
});

test("prompt wrapper forwards yes and no decisions to the native roll", async () => {
  const original = async function(config) {
    return config._decision;
  };
  const optional = candidate({ consumptionMode: "prompt" });
  const yesWrapper = createRollModifierPromptWrapper(original, {
    rollType: "ability",
    decisionKey: "_decision",
    getCandidates: () => [optional],
    resolveDecision: async () => buildRollModifierPromptDecision([optional.buffId]),
  });
  const noWrapper = createRollModifierPromptWrapper(original, {
    rollType: "ability",
    decisionKey: "_decision",
    getCandidates: () => [optional],
    resolveDecision: async () => buildRollModifierPromptDecision([]),
  });

  assert.deepEqual(await yesWrapper.call({}, {}), {
    resolved: true,
    approvedBuffIds: [optional.buffId],
  });
  assert.deepEqual(await noWrapper.call({}, {}), {
    resolved: true,
    approvedBuffIds: [],
  });
});

test("prompt wrapper does not prompt twice when retry config already has a decision", async () => {
  let promptCount = 0;
  const decision = buildRollModifierPromptDecision(["buff-guidance"]);
  const wrapped = createRollModifierPromptWrapper(async (config) => config._decision, {
    rollType: "skill",
    decisionKey: "_decision",
    getCandidates: () => [candidate({ consumptionMode: "prompt" })],
    resolveDecision: async () => {
      promptCount += 1;
      return decision;
    },
  });

  assert.deepEqual(await wrapped.call({}, { _decision: decision }), decision);
  assert.equal(promptCount, 0);
});

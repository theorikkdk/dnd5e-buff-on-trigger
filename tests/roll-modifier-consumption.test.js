import test from "node:test";
import assert from "node:assert/strict";

import {
  buildRollModifierPromptDecision,
  canUseAfterRollPrompt,
  createRollModifierPromptWrapper,
  finalizeMidiAttackRollModifierWorkflow,
  getBardicInspirationDie,
  getMidiAttackRollModifierContext,
  getRollModifierConsumptionMode,
  getRollModifierPromptDisplay,
  getRollModifierPromptTiming,
  isPromptableRollModifierCandidate,
  isRollModifierMetadataConsumed,
  processAfterRollPromptCandidate,
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

test("missing or unknown prompt timing remains beforeRoll", () => {
  assert.equal(getRollModifierPromptTiming({}), "beforeRoll");
  assert.equal(getRollModifierPromptTiming({ promptTiming: "unknown" }), "beforeRoll");
  assert.equal(getRollModifierPromptTiming({ promptTiming: "afterRoll" }), "afterRoll");
});

test("afterRoll requires the experimental setting and a standard Midi attack workflow", () => {
  const optional = candidate({ consumptionMode: "prompt" });
  optional.activeFlag.rollModifier.promptTiming = "afterRoll";
  const workflow = {
    actor: {},
    setAttackRoll: async () => undefined,
  };

  assert.equal(canUseAfterRollPrompt({
    candidate: optional,
    rollType: "attack",
    midiActive: true,
    experimentalEnabled: false,
    addRollAvailable: true,
    workflow,
  }), false);
  assert.equal(canUseAfterRollPrompt({
    candidate: optional,
    rollType: "attack",
    midiActive: true,
    experimentalEnabled: true,
    addRollAvailable: true,
    workflow,
  }), true);
  assert.equal(canUseAfterRollPrompt({
    candidate: optional,
    rollType: "save",
    midiActive: true,
    experimentalEnabled: true,
    addRollAvailable: true,
    workflow,
  }), false);
  assert.equal(canUseAfterRollPrompt({
    candidate: optional,
    rollType: "attack",
    midiActive: true,
    experimentalEnabled: true,
    addRollAvailable: false,
    workflow,
  }), false);
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

test("failed native finalization does not mark unresolved metadata as consumed", () => {
  const single = {
    buffId: "buff-inspiration",
    formula: "1d@origin.bardicInspirationDie",
    consumed: false,
  };
  const batch = {
    consumed: true,
    modifiers: [
      { buffId: "buff-inspiration", consumed: false },
    ],
  };

  assert.equal(isRollModifierMetadataConsumed(single), false);
  assert.equal(isRollModifierMetadataConsumed(batch), false);
  batch.modifiers[0].consumed = true;
  assert.equal(isRollModifierMetadataConsumed(batch), true);
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

test("prompt wrapper can resolve an actor from an attack activity", async () => {
  const actor = { id: "attacker" };
  const activity = { actor };
  let candidateActor = null;
  const wrapped = createRollModifierPromptWrapper(async (config) => config._decision, {
    rollType: "attack",
    decisionKey: "_decision",
    resolveActor: (context) => context.actor,
    getCandidates: (resolvedActor) => {
      candidateActor = resolvedActor;
      return [candidate({ consumptionMode: "prompt" })];
    },
    resolveDecision: async (candidates) => buildRollModifierPromptDecision([candidates[0].buffId]),
  });

  assert.deepEqual(await wrapped.call(activity, {}), {
    resolved: true,
    approvedBuffIds: ["buff-guidance"],
  });
  assert.equal(candidateActor, actor);
});

test("attack prompt approval preserves a cancelled native roll result", async () => {
  const optional = candidate({
    buffId: "buff-inspiration",
    consumptionMode: "prompt",
  });
  let nativeCallCount = 0;
  const wrapped = createRollModifierPromptWrapper(async () => {
    nativeCallCount += 1;
    return null;
  }, {
    rollType: "attack",
    decisionKey: "_decision",
    resolveActor: (activity) => activity.actor,
    getCandidates: () => [optional],
    resolveDecision: async () => buildRollModifierPromptDecision([optional.buffId]),
  });

  assert.equal(await wrapped.call({ actor: {} }, {}), null);
  assert.equal(nativeCallCount, 1);
});

test("bardic inspiration die follows bard class progression", () => {
  assert.equal(getBardicInspirationDie(undefined), 6);
  assert.equal(getBardicInspirationDie(1), 6);
  assert.equal(getBardicInspirationDie(4), 6);
  assert.equal(getBardicInspirationDie(5), 8);
  assert.equal(getBardicInspirationDie(9), 8);
  assert.equal(getBardicInspirationDie(10), 10);
  assert.equal(getBardicInspirationDie(14), 10);
  assert.equal(getBardicInspirationDie(15), 12);
  assert.equal(getBardicInspirationDie(20), 12);
});

test("prompt display uses a resolved Bardic Inspiration die and localized preset name", () => {
  const display = getRollModifierPromptDisplay({
    formula: "1d@origin.bardicInspirationDie",
    displayFormula: "1d8",
    activeFlag: {
      itemName: "Buff A (Assistance)",
      presetMeta: { presetId: "bardicInspiration" },
      rollModifier: {},
    },
  }, {
    localize: (key) => ({
      "BOT.ui.rollModifier.promptEffect.bardicInspiration": "Inspiration bardique",
    })[key] ?? key,
  });

  assert.deepEqual(display, {
    name: "Inspiration bardique",
    formula: "1d8",
  });
  assert.equal(display.formula.includes("@origin"), false);
});

test("prompt display uses a readable fallback for an unresolved Bardic Inspiration die", () => {
  const display = getRollModifierPromptDisplay({
    formula: "1d@origin.bardicInspirationDie",
    activeFlag: {
      presetMeta: { presetId: "bardicInspiration" },
      rollModifier: {},
    },
  }, {
    localize: () => "Inspiration bardique",
    bardicDieFallback: "le dé d’Inspiration bardique",
  });

  assert.equal(display.formula, "le dé d’Inspiration bardique");
  assert.equal(display.formula.includes("@origin"), false);
});

test("prompt display keeps simple Guidance and Resistance formulas readable", () => {
  const labels = {
    "BOT.ui.rollModifier.promptEffect.guidance": "Assistance",
    "BOT.ui.rollModifier.promptEffect.resistance": "Résistance",
  };
  const localize = (key) => labels[key] ?? key;
  const guidance = getRollModifierPromptDisplay({
    formula: "1d4",
    activeFlag: {
      presetMeta: { presetId: "guidance" },
      rollModifier: {},
    },
  }, { localize });
  const resistance = getRollModifierPromptDisplay({
    formula: "1d4",
    activeFlag: {
      presetMeta: { presetId: "resistance" },
      rollModifier: {},
    },
  }, { localize });

  assert.deepEqual(guidance, { name: "Assistance", formula: "1d4" });
  assert.deepEqual(resistance, { name: "Résistance", formula: "1d4" });
});

test("prompt display preserves a custom item name as a coherent fallback", () => {
  const display = getRollModifierPromptDisplay({
    formula: "1d6",
    activeFlag: {
      itemName: "Coup de pouce héroïque",
      rollModifier: {},
    },
  });

  assert.deepEqual(display, {
    name: "Coup de pouce héroïque",
    formula: "1d6",
  });
});

test("afterRoll decline leaves the attack roll unchanged and does not consume", async () => {
  const attackRoll = { total: 14 };
  const workflow = { attackRoll };
  let consumed = 0;

  const result = await processAfterRollPromptCandidate(workflow, {
    buffId: "buff-inspiration",
  }, {
    prompt: async () => false,
    evaluateBonus: async () => ({ total: 8 }),
    addRoll: () => ({ total: 22 }),
    setAttackRoll: async (roll) => { workflow.attackRoll = roll; },
    consume: async () => { consumed += 1; },
  });

  assert.equal(result.status, "declined");
  assert.equal(workflow.attackRoll, attackRoll);
  assert.equal(consumed, 0);
});

test("afterRoll approval combines the roll then consumes the exact candidate", async () => {
  const attackRoll = { total: 14, terms: ["d20"] };
  const bonusRoll = { total: 8, terms: ["d8"] };
  const newRoll = { total: 22, terms: ["d20", "d8"] };
  const workflow = { attackRoll };
  const calls = [];

  const result = await processAfterRollPromptCandidate(workflow, {
    buffId: "buff-inspiration",
  }, {
    prompt: async () => true,
    evaluateBonus: async () => bonusRoll,
    addRoll: (base, bonus) => {
      calls.push(["add", base, bonus]);
      return newRoll;
    },
    setAttackRoll: async (roll) => {
      calls.push(["set", roll]);
      workflow.attackRoll = roll;
    },
    consume: async (currentCandidate) => {
      calls.push(["consume", currentCandidate.buffId]);
      return true;
    },
  });

  assert.equal(result.status, "consumed");
  assert.equal(workflow.attackRoll, newRoll);
  assert.deepEqual(newRoll.terms[0], "d20");
  assert.deepEqual(calls.map(([type]) => type), ["add", "set", "consume"]);
  assert.equal(calls[2][1], "buff-inspiration");
});

test("afterRoll setAttackRoll failure does not consume and can be retried", async () => {
  const workflow = { attackRoll: { total: 14 } };
  let consumed = 0;
  const options = {
    prompt: async () => true,
    evaluateBonus: async () => ({ total: 8 }),
    addRoll: () => ({ total: 22 }),
    setAttackRoll: async () => { throw new Error("set failed"); },
    consume: async () => { consumed += 1; },
  };

  assert.equal(
    (await processAfterRollPromptCandidate(workflow, { buffId: "buff-failed" }, options)).status,
    "failed"
  );
  assert.equal(consumed, 0);
  assert.equal(
    (await processAfterRollPromptCandidate(workflow, { buffId: "buff-failed" }, {
      ...options,
      prompt: async () => false,
    })).status,
    "declined"
  );
});

test("afterRoll processing is idempotent per workflow and buffId", async () => {
  const workflow = { attackRoll: { total: 14 } };
  let prompts = 0;
  let consumptions = 0;
  const candidate = { buffId: "buff-once" };
  const options = {
    prompt: async () => { prompts += 1; return true; },
    evaluateBonus: async () => ({ total: 4 }),
    addRoll: () => ({ total: 18 }),
    setAttackRoll: async (roll) => { workflow.attackRoll = roll; },
    consume: async () => { consumptions += 1; return true; },
  };

  assert.equal((await processAfterRollPromptCandidate(workflow, candidate, options)).status, "consumed");
  assert.equal((await processAfterRollPromptCandidate(workflow, candidate, options)).status, "duplicate");
  assert.equal(prompts, 1);
  assert.equal(consumptions, 1);
});

test("Midi attack completion exposes the exact approved prompt metadata and real roll", () => {
  const actor = { uuid: "Actor.attacker" };
  const metadata = {
    buffId: "buff-inspiration",
    consumptionMode: "prompt",
    formula: "1d8",
  };
  const attackRoll = { formula: "1d20 + 5 + 1d8", total: 19 };
  const workflow = {
    actor,
    attackRoll,
    _botRollModifier: metadata,
  };

  assert.deepEqual(getMidiAttackRollModifierContext(workflow), {
    actor,
    metadata,
    rolls: [attackRoll],
  });
});

test("Midi attack completion ignores declined, closed, cancelled, and automatic-only rolls", () => {
  const actor = { uuid: "Actor.attacker" };
  assert.equal(getMidiAttackRollModifierContext({ actor, attackRoll: {} }), null);
  assert.equal(getMidiAttackRollModifierContext({
    actor,
    _botRollModifier: { buffId: "buff-inspiration", consumptionMode: "prompt" },
  }), null);
  assert.equal(getMidiAttackRollModifierContext({
    actor,
    attackRoll: {},
    _botRollModifier: { buffId: "buff-bless", consumptionMode: "automatic" },
  }), null);
});

test("Midi attack completion finalizes a prompt modifier only once", async () => {
  const workflow = {
    actor: { uuid: "Actor.attacker" },
    attackRoll: { formula: "1d20 + 1d8" },
    _botRollModifier: {
      buffId: "buff-inspiration",
      consumptionMode: "prompt",
      formula: "1d@origin.bardicInspirationDie",
    },
  };
  const calls = [];
  const finalize = async (context) => {
    calls.push(context);
    return true;
  };

  assert.equal(await finalizeMidiAttackRollModifierWorkflow(workflow, finalize), true);
  assert.equal(await finalizeMidiAttackRollModifierWorkflow(workflow, finalize), false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].metadata.buffId, "buff-inspiration");
});

test("Midi completion recovers after native formula matching failed", async () => {
  const metadata = {
    consumed: true,
    modifiers: [{
      buffId: "buff-inspiration",
      consumptionMode: "prompt",
      formula: "1d@origin.bardicInspirationDie",
      consumed: false,
    }],
  };
  const workflow = {
    actor: { uuid: "Actor.attacker" },
    attackRoll: { formula: "1d20 + 5 + 1d10", total: 22 },
    _botRollModifier: metadata,
  };
  let finalizedBuffId = null;

  assert.equal(await finalizeMidiAttackRollModifierWorkflow(workflow, async (context) => {
    assert.equal(isRollModifierMetadataConsumed(context.metadata), false);
    finalizedBuffId = context.metadata.modifiers[0].buffId;
    return true;
  }), true);
  assert.equal(finalizedBuffId, "buff-inspiration");
});

test("Midi completion skips metadata already consumed by native finalization", async () => {
  const workflow = {
    actor: { uuid: "Actor.attacker" },
    attackRoll: { formula: "1d20 + 5 + 1d8", total: 18 },
    _botRollModifier: {
      buffId: "buff-inspiration",
      consumptionMode: "prompt",
      formula: "1d@origin.bardicInspirationDie",
      consumed: true,
    },
  };
  let calls = 0;

  assert.equal(await finalizeMidiAttackRollModifierWorkflow(workflow, async () => {
    calls += 1;
    return true;
  }), false);
  assert.equal(calls, 0);
});

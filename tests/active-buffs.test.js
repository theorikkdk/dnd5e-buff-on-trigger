import test from "node:test";
import assert from "node:assert/strict";

globalThis.foundry = {
  utils: {
    deepClone: (value) => structuredClone(value),
    randomID: () => "test-random-id",
  },
};
globalThis.game = {
  settings: {
    get: () => false,
  },
};

const {
  classifyNoStackApplication,
  findReplacementCandidateBuffIds,
  getActiveBuffs,
  getDominantBuffForStack,
  getStackingKey,
  getStackingMode,
  isDominantBuff,
  migrateLegacyActiveBuff,
  removeActiveBuff,
  upsertActiveBuff,
  upsertNoStackActiveBuff,
} = await import("../scripts/active-buffs.js");

const MODULE_ID = "dnd5e-buff-on-trigger";

class MockActor {
  constructor(uuid, moduleFlags = {}, { beforeSetFlag = null } = {}) {
    this.uuid = uuid;
    this.id = uuid;
    this.name = uuid;
    this.effects = [];
    this.flags = { [MODULE_ID]: structuredClone(moduleFlags) };
    this.beforeSetFlag = beforeSetFlag;
    this.setCalls = [];
    this.unsetCalls = [];
  }

  getFlag(moduleId, key) {
    return this.flags[moduleId]?.[key];
  }

  async setFlag(moduleId, key, value) {
    if (this.beforeSetFlag) await this.beforeSetFlag({ moduleId, key, value });
    this.flags[moduleId] ??= {};
    this.flags[moduleId][key] = structuredClone(value);
    this.setCalls.push({ moduleId, key, value: structuredClone(value) });
    return value;
  }

  async unsetFlag(moduleId, key) {
    delete this.flags[moduleId]?.[key];
    this.unsetCalls.push({ moduleId, key });
  }
}

function makeBuff(buffId, overrides = {}) {
  return {
    buffId,
    originActorUuid: "Actor.caster",
    originItemUuid: "Actor.caster.Item.spell",
    stackingKey: "shared-effect",
    stackingMode: "normal",
    appliedAt: 1,
    ...overrides,
  };
}

function getReplacementCandidates(actor, newFlag) {
  return findReplacementCandidateBuffIds(getActiveBuffs(actor), newFlag);
}

test("legacy migration does nothing when no legacy or modern flag exists", async () => {
  const actor = new MockActor("Actor.none");

  const result = await migrateLegacyActiveBuff(actor);

  assert.equal(result, null);
  assert.equal(actor.setCalls.length, 0);
});

for (const activeBuffs of [undefined, {}]) {
  const label = activeBuffs === undefined ? "absent activeBuffs" : "empty activeBuffs";
  test(`legacy migration fills ${label}`, async () => {
    const flags = {
      activeBuff: { itemName: "Legacy", originActorUuid: "Actor.caster" },
    };
    if (activeBuffs !== undefined) flags.activeBuffs = activeBuffs;
    const actor = new MockActor(`Actor.legacy-${label}`, flags);

    const migrated = await migrateLegacyActiveBuff(actor);

    assert.equal(migrated.buffId, "legacy-activeBuff");
    assert.deepEqual(actor.getFlag(MODULE_ID, "activeBuffs"), {
      "legacy-activeBuff": migrated,
    });
    assert.deepEqual(actor.getFlag(MODULE_ID, "activeBuff"), flags.activeBuff);
  });
}

test("legacy migration never overwrites a non-empty modern map", async () => {
  const modern = makeBuff("modern");
  const actor = new MockActor("Actor.modern", {
    activeBuff: { itemName: "Legacy" },
    activeBuffs: { modern },
  });

  const result = await migrateLegacyActiveBuff(actor);

  assert.equal(result, null);
  assert.deepEqual(actor.getFlag(MODULE_ID, "activeBuffs"), { modern });
  assert.equal(actor.setCalls.length, 0);
});

test("two concurrent upserts on one actor preserve both buffs", async () => {
  const actor = new MockActor("Actor.concurrent", {}, {
    beforeSetFlag: () => new Promise((resolve) => setTimeout(resolve, 5)),
  });

  await Promise.all([
    upsertActiveBuff(actor, makeBuff("first")),
    upsertActiveBuff(actor, makeBuff("second")),
  ]);

  assert.deepEqual(Object.keys(getActiveBuffs(actor)).sort(), ["first", "second"]);
});

test("concurrent removal then addition on one actor preserves the addition", async () => {
  const oldBuff = makeBuff("old");
  const actor = new MockActor("Actor.remove-add", {
    activeBuffs: { old: oldBuff },
  });

  await Promise.all([
    removeActiveBuff(actor, "old"),
    upsertActiveBuff(actor, makeBuff("new")),
  ]);

  assert.deepEqual(Object.keys(getActiveBuffs(actor)), ["new"]);
});

test("mutations on different actors do not share a queue", async () => {
  let releaseFirstActor;
  const firstActorGate = new Promise((resolve) => {
    releaseFirstActor = resolve;
  });
  const actorA = new MockActor("Actor.slow", {}, {
    beforeSetFlag: () => firstActorGate,
  });
  const actorB = new MockActor("Actor.fast");

  const slowMutation = upsertActiveBuff(actorA, makeBuff("slow"));
  await new Promise((resolve) => setImmediate(resolve));
  const fastMutation = upsertActiveBuff(actorB, makeBuff("fast"));
  await fastMutation;

  assert.deepEqual(Object.keys(getActiveBuffs(actorB)), ["fast"]);
  assert.deepEqual(Object.keys(getActiveBuffs(actorA)), []);

  releaseFirstActor();
  await slowMutation;
  assert.deepEqual(Object.keys(getActiveBuffs(actorA)), ["slow"]);
});

test("stacking mode defaults to normal and validates known modes", () => {
  assert.equal(getStackingMode({}), "normal");
  assert.equal(getStackingMode({ stackingMode: "unknown" }), "normal");
  assert.equal(getStackingMode({ stackingMode: "alwaysStack" }), "alwaysStack");
  assert.equal(getStackingMode({ stackingMode: "sameEffect" }), "sameEffect");
  assert.equal(getStackingMode({ stackingMode: "noStack" }), "noStack");
});

test("stacking key uses and normalizes the configured identity fallbacks", () => {
  assert.equal(getStackingKey({ stackingKey: "  Bless Élite  " }), "bless-elite");
  assert.equal(getStackingKey({ presetMeta: { presetId: "Test Preset" } }), "test-preset");
  assert.equal(getStackingKey({ originItemIdentifier: "DND5E.Bless" }), "dnd5e.bless");
  assert.equal(getStackingKey({ itemName: "Bouclier de la Foi" }), "bouclier-de-la-foi");
});

test("normal replacement selects only the same source and item on the carrier", () => {
  const activeBuffs = {
    same: makeBuff("same"),
    otherCaster: makeBuff("otherCaster", { originActorUuid: "Actor.other" }),
    otherItem: makeBuff("otherItem", { originItemUuid: "Item.other" }),
  };

  assert.deepEqual(
    findReplacementCandidateBuffIds(activeBuffs, makeBuff("new")),
    ["same"],
  );
});

test("replacement remains local to each target map", () => {
  const targetA = { a: makeBuff("a") };
  const targetB = { b: makeBuff("b") };
  const targetC = {};
  const reapplied = makeBuff("new");

  assert.deepEqual(findReplacementCandidateBuffIds(targetB, reapplied), ["b"]);
  assert.deepEqual(findReplacementCandidateBuffIds(targetC, reapplied), []);
  assert.deepEqual(Object.keys(targetA), ["a"]);
});

test("normal multi-target A+B then B+C replaces only B", () => {
  const actorA = new MockActor("Actor.target-a", {
    activeBuffs: { a: makeBuff("a") },
  });
  const actorB = new MockActor("Actor.target-b", {
    activeBuffs: { b: makeBuff("b") },
  });
  const actorC = new MockActor("Actor.target-c");
  const plannedApplications = [
    [actorB, makeBuff("b-new")],
    [actorC, makeBuff("c-new")],
  ];

  const candidatesByTarget = Object.fromEntries(
    plannedApplications.map(([actor, newFlag]) => [
      actor.uuid,
      getReplacementCandidates(actor, newFlag),
    ]),
  );

  assert.deepEqual(candidatesByTarget, {
    "Actor.target-b": ["b"],
    "Actor.target-c": [],
  });
  assert.deepEqual(Object.keys(getActiveBuffs(actorA)), ["a"]);
});

test("sameEffect multi-target A+B then B+C keeps all existing instances", async () => {
  const actorA = new MockActor("Actor.same-a", {
    activeBuffs: { a: makeBuff("a", { stackingMode: "sameEffect" }) },
  });
  const actorB = new MockActor("Actor.same-b", {
    activeBuffs: { b: makeBuff("b", { stackingMode: "sameEffect" }) },
  });
  const actorC = new MockActor("Actor.same-c");
  const newB = makeBuff("b-new", { stackingMode: "sameEffect", appliedAt: 2 });
  const newC = makeBuff("c-new", { stackingMode: "sameEffect", appliedAt: 2 });

  assert.deepEqual(getReplacementCandidates(actorB, newB), []);
  assert.deepEqual(getReplacementCandidates(actorC, newC), []);

  await Promise.all([
    upsertActiveBuff(actorB, newB),
    upsertActiveBuff(actorC, newC),
  ]);

  assert.deepEqual(Object.keys(getActiveBuffs(actorA)), ["a"]);
  assert.deepEqual(Object.keys(getActiveBuffs(actorB)).sort(), ["b", "b-new"]);
  assert.deepEqual(Object.keys(getActiveBuffs(actorC)), ["c-new"]);
});

test("alwaysStack multi-target A+B then B+C keeps all existing instances", async () => {
  const actorA = new MockActor("Actor.stack-a", {
    activeBuffs: { a: makeBuff("a", { stackingMode: "alwaysStack" }) },
  });
  const actorB = new MockActor("Actor.stack-b", {
    activeBuffs: { b: makeBuff("b", { stackingMode: "alwaysStack" }) },
  });
  const actorC = new MockActor("Actor.stack-c");
  const newB = makeBuff("b-new", { stackingMode: "alwaysStack", appliedAt: 2 });
  const newC = makeBuff("c-new", { stackingMode: "alwaysStack", appliedAt: 2 });

  assert.deepEqual(getReplacementCandidates(actorB, newB), []);
  assert.deepEqual(getReplacementCandidates(actorC, newC), []);

  await Promise.all([
    upsertActiveBuff(actorB, newB),
    upsertActiveBuff(actorC, newC),
  ]);

  assert.deepEqual(Object.keys(getActiveBuffs(actorA)), ["a"]);
  assert.deepEqual(Object.keys(getActiveBuffs(actorB)).sort(), ["b", "b-new"]);
  assert.deepEqual(Object.keys(getActiveBuffs(actorC)), ["c-new"]);
});

test("noStack multi-target blocks an occupied target and allows a free target", () => {
  const occupiedActor = new MockActor("Actor.no-stack-a", {
    activeBuffs: {
      existing: makeBuff("existing", {
        stackingMode: "noStack",
        originActorUuid: "Actor.first-caster",
      }),
    },
  });
  const freeActor = new MockActor("Actor.no-stack-b");
  const incoming = makeBuff("incoming", {
    stackingMode: "noStack",
    originActorUuid: "Actor.second-caster",
  });

  const occupiedResult = classifyNoStackApplication(getActiveBuffs(occupiedActor), incoming);
  const freeResult = classifyNoStackApplication(getActiveBuffs(freeActor), incoming);

  assert.equal(occupiedResult.status, "blocked");
  assert.equal(occupiedResult.blockingBuffId, "existing");
  assert.equal(freeResult.status, "allowed");
  assert.deepEqual(freeResult.replacementCandidateBuffIds, []);
  assert.deepEqual(Object.keys(getActiveBuffs(occupiedActor)), ["existing"]);
});

test("alwaysStack and sameEffect never select replacement candidates", () => {
  const activeBuffs = { existing: makeBuff("existing") };

  assert.deepEqual(
    findReplacementCandidateBuffIds(activeBuffs, makeBuff("always", { stackingMode: "alwaysStack" })),
    [],
  );
  assert.deepEqual(
    findReplacementCandidateBuffIds(activeBuffs, makeBuff("same-effect", { stackingMode: "sameEffect" })),
    [],
  );
});

test("sameEffect keeps multiple instances with one dominant by level then date", () => {
  const lower = makeBuff("lower", {
    stackingMode: "sameEffect",
    originSpellLevel: 1,
    appliedAt: 100,
  });
  const higherEarlier = makeBuff("higher-earlier", {
    stackingMode: "sameEffect",
    originSpellLevel: 2,
    appliedAt: 50,
  });
  const higherLater = makeBuff("higher-later", {
    stackingMode: "sameEffect",
    originSpellLevel: 2,
    appliedAt: 200,
  });
  const actor = new MockActor("Actor.dominance", {
    activeBuffs: {
      lower,
      "higher-earlier": higherEarlier,
      "higher-later": higherLater,
    },
  });

  assert.equal(getDominantBuffForStack(actor, "shared-effect").buffId, "higher-later");
  assert.equal(isDominantBuff(actor, higherLater), true);
  assert.equal(isDominantBuff(actor, lower), false);
  assert.equal(Object.keys(getActiveBuffs(actor)).length, 3);
});

test("noStack permits same source replacement and blocks a different source", () => {
  const existing = makeBuff("existing", { stackingMode: "noStack" });
  const activeBuffs = { existing };

  const replaceable = classifyNoStackApplication(
    activeBuffs,
    makeBuff("replacement", { stackingMode: "noStack" }),
  );
  assert.equal(replaceable.status, "replaceable");
  assert.deepEqual(replaceable.replacementCandidateBuffIds, ["existing"]);

  const blocked = classifyNoStackApplication(
    activeBuffs,
    makeBuff("blocked", {
      stackingMode: "noStack",
      originActorUuid: "Actor.other-caster",
    }),
  );
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.blockingBuffId, "existing");
  assert.deepEqual(blocked.replacementCandidateBuffIds, []);
});

test("blocked noStack mutation leaves the existing map untouched", async () => {
  const existing = makeBuff("existing", { stackingMode: "noStack" });
  const actor = new MockActor("Actor.no-stack", {
    activeBuffs: { existing },
  });

  const result = await upsertNoStackActiveBuff(actor, makeBuff("blocked", {
    stackingMode: "noStack",
    originActorUuid: "Actor.other-caster",
  }));

  assert.equal(result.status, "blocked");
  assert.deepEqual(actor.getFlag(MODULE_ID, "activeBuffs"), { existing });
  assert.equal(actor.setCalls.length, 0);
});

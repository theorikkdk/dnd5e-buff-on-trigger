import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  buildActiveBuffDiagnosticText,
  collectActiveBuffDiagnostics,
  collectActiveSceneBuffActorContexts,
} from "../scripts/active-buff-diagnostics.js";

const MODULE_ID = "dnd5e-buff-on-trigger";

class MockActor {
  constructor({ id, uuid, name, activeBuffs, effects = [] }) {
    this.id = id;
    this.uuid = uuid;
    this.name = name;
    this.effects = effects;
    this.flags = { [MODULE_ID]: { activeBuffs } };
  }

  getFlag(moduleId, key) {
    return this.flags?.[moduleId]?.[key];
  }

  setFlag() {
    throw new Error("diagnostics must remain read-only");
  }

  unsetFlag() {
    throw new Error("diagnostics must remain read-only");
  }

  update() {
    throw new Error("diagnostics must remain read-only");
  }
}

function activeBuff(buffId, overrides = {}) {
  return {
    buffId,
    itemName: "Guidance",
    originActorUuid: "Actor.caster",
    originItemUuid: "Actor.caster.Item.guidance",
    stackingMode: "noStack",
    stackingKey: "guidance",
    type: "passive",
    ...overrides,
  };
}

function context(actor, overrides = {}) {
  return {
    key: actor.uuid,
    actor,
    actorUuid: actor.uuid,
    actorName: actor.name,
    tokenNames: [],
    tokenUuids: [],
    actorLink: true,
    synthetic: false,
    ...overrides,
  };
}

const resolver = (uuid) => ({
  "Actor.caster": { uuid, name: "Caster" },
  "Actor.caster.Item.guidance": { uuid, name: "Guidance" },
}[uuid] ?? null);

test("collects active buffs from one actor without mutating it", () => {
  const actor = new MockActor({
    id: "target",
    uuid: "Actor.target",
    name: "Target",
    activeBuffs: { buff1: activeBuff("buff1") },
    effects: [{
      name: "Guidance",
      flags: { [MODULE_ID]: { indicator: true, buffId: "buff1" } },
      statuses: new Set(["bot-active"]),
    }],
  });

  const report = collectActiveBuffDiagnostics([context(actor)], {
    resolveUuid: resolver,
    concentrationPredicate: () => false,
  });

  assert.equal(report.buffCount, 1);
  assert.equal(report.entries[0].buffId, "buff1");
  assert.equal(report.entries[0].carrier.actorName, "Target");
  assert.equal(report.entries[0].sourceActor.name, "Caster");
  assert.deepEqual(report.entries[0].warnings, []);
});

test("collects multiple actors and tolerates actors without activeBuffs", () => {
  const first = new MockActor({
    uuid: "Actor.one",
    name: "One",
    activeBuffs: { first: activeBuff("first") },
  });
  const second = new MockActor({
    uuid: "Actor.two",
    name: "Two",
    activeBuffs: undefined,
  });

  const report = collectActiveBuffDiagnostics([context(first), context(second)], {
    resolveUuid: resolver,
    concentrationPredicate: () => false,
  });

  assert.equal(report.actorCount, 2);
  assert.equal(report.buffCount, 1);
});

test("invalid activeBuffs maps and partial entries do not crash", () => {
  const invalidMap = new MockActor({
    uuid: "Actor.invalid-map",
    name: "Invalid map",
    activeBuffs: "broken",
  });
  const partial = new MockActor({
    uuid: "Actor.partial",
    name: "Partial",
    activeBuffs: {
      broken: 42,
      partial: { itemName: "Partial buff" },
    },
  });

  const report = collectActiveBuffDiagnostics([context(invalidMap), context(partial)], {
    resolveUuid: () => null,
    concentrationPredicate: () => false,
  });

  assert.equal(report.buffCount, 1);
  assert.ok(report.actorWarnings.some((warning) => warning.warning === "invalidActiveBuffsMap"));
  assert.ok(report.actorWarnings.some((warning) => warning.warning === "invalidActiveBuffEntry"));
  assert.ok(report.entries[0].warnings.includes("missingSourceActorUuid"));
});

test("scene contexts deduplicate linked actors and keep unlinked tokens separate", () => {
  const linkedActor = new MockActor({ uuid: "Actor.linked", name: "Linked", activeBuffs: {} });
  const syntheticA = new MockActor({ uuid: "Scene.scene.Token.a.Actor.synthetic", name: "Goblin", activeBuffs: {} });
  const syntheticB = new MockActor({ uuid: "Scene.scene.Token.b.Actor.synthetic", name: "Goblin", activeBuffs: {} });
  const token = (id, actor, actorLink, name) => ({
    actor,
    name,
    document: {
      id,
      uuid: `Scene.scene.Token.${id}`,
      name,
      actor,
      actorLink,
      parent: { id: "scene" },
    },
  });

  const contexts = collectActiveSceneBuffActorContexts({
    tokenPlaceables: [
      token("linked-a", linkedActor, true, "Hero A"),
      token("linked-b", linkedActor, true, "Hero B"),
      token("a", syntheticA, false, "Goblin A"),
      token("b", syntheticB, false, "Goblin B"),
    ],
    tokenDocuments: [],
  });

  assert.equal(contexts.length, 3);
  assert.deepEqual(
    contexts.find((entry) => entry.actor === linkedActor).tokenNames,
    ["Hero A", "Hero B"],
  );
  assert.equal(contexts.filter((entry) => entry.synthetic).length, 2);
});

test("text report is stable and contains only summarized diagnostic data", () => {
  const actor = new MockActor({
    uuid: "Actor.target",
    name: "Target",
    activeBuffs: { buff1: activeBuff("buff1") },
  });
  const report = collectActiveBuffDiagnostics([context(actor)], {
    resolveUuid: resolver,
    concentrationPredicate: () => false,
  });
  report.generatedAt = "2026-06-23T00:00:00.000Z";

  const text = buildActiveBuffDiagnosticText(report);
  assert.match(text, /Target — Guidance/);
  assert.match(text, /buffId=buff1/);
  assert.match(text, /stack=noStack\/guidance/);
  assert.doesNotMatch(text, /rollModifier/);
});

test("diagnostic implementation contains no document mutation calls", async () => {
  const source = await readFile("scripts/active-buff-diagnostics.js", "utf8");
  for (const forbiddenCall of [
    ".setFlag(",
    ".unsetFlag(",
    ".update(",
    ".delete(",
    "removeActiveBuff(",
    "endActiveBuff(",
    "pruneStaleActiveBuffs(",
    "refreshActorBuffRuntime(",
  ]) {
    assert.equal(source.includes(forbiddenCall), false, `unexpected mutation call ${forbiddenCall}`);
  }
});

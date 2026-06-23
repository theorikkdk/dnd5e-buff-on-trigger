import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  buildActiveBuffDiagnosticEntrySummary,
  buildActiveBuffDiagnosticText,
  collectActiveBuffDiagnostics,
  collectActiveSceneBuffActorContexts,
  filterActiveBuffDiagnosticReport,
  getActiveBuffDiagnosticNavigation,
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

test("buff without embedded buffId, readable name, or trigger is detected", () => {
  const actor = new MockActor({
    uuid: "Actor.incomplete",
    name: "Incomplete",
    activeBuffs: {
      mapKey: {
        originActorUuid: "Actor.caster",
        originItemUuid: "Actor.caster.Item.guidance",
        stackingMode: "normal",
      },
    },
    effects: [{
      name: "Indicator",
      flags: { [MODULE_ID]: { indicator: true, buffId: "mapKey" } },
      statuses: new Set(["bot-active"]),
    }],
  });

  const report = collectActiveBuffDiagnostics([context(actor)], {
    resolveUuid: (uuid) => uuid === "Actor.caster"
      ? { uuid, name: "Caster" }
      : (uuid === "Actor.caster.Item.guidance" ? { uuid } : null),
    concentrationPredicate: () => false,
  });

  assert.ok(report.entries[0].warnings.includes("missingBuffId"));
  assert.ok(report.entries[0].warnings.includes("missingBuffName"));
  assert.ok(report.entries[0].warnings.includes("missingTriggerType"));
  assert.equal(
    report.entries[0].issues.find((issue) => issue.code === "missingBuffId")?.severity,
    "critical",
  );
});

test("unresolved source actor and item UUIDs are detected", () => {
  const actor = new MockActor({
    uuid: "Actor.sources",
    name: "Sources",
    activeBuffs: { buff1: activeBuff("buff1") },
    effects: [{
      name: "Guidance",
      flags: { [MODULE_ID]: { indicator: true, buffId: "buff1" } },
      statuses: new Set(["bot-active"]),
    }],
  });

  const report = collectActiveBuffDiagnostics([context(actor)], {
    resolveUuid: () => null,
    concentrationPredicate: () => false,
  });

  assert.ok(report.entries[0].warnings.includes("unresolvedSourceActor"));
  assert.ok(report.entries[0].warnings.includes("unresolvedSourceItem"));
});

test("unknown stacking mode and missing required stacking key are detected", () => {
  const actor = new MockActor({
    uuid: "Actor.stacking",
    name: "Stacking",
    activeBuffs: {
      unknown: activeBuff("unknown", { stackingMode: "mystery" }),
      missingKey: activeBuff("missingKey", {
        itemName: null,
        originItemUuid: null,
        stackingMode: "noStack",
        stackingKey: null,
      }),
    },
  });

  const report = collectActiveBuffDiagnostics([context(actor)], {
    resolveUuid: resolver,
    concentrationPredicate: () => false,
  });
  const unknown = report.entries.find((entry) => entry.buffId === "unknown");
  const missingKey = report.entries.find((entry) => entry.buffId === "missingKey");

  assert.ok(unknown.warnings.includes("unknownStackingMode"));
  assert.ok(missingKey.warnings.includes("missingStackingKey"));
});

test("two noStack buffs with one key on the same carrier are critical", () => {
  const actor = new MockActor({
    uuid: "Actor.duplicate",
    name: "Duplicate",
    activeBuffs: {
      first: activeBuff("first", { stackingKey: "bardic-inspiration" }),
      second: activeBuff("second", { stackingKey: "bardic-inspiration" }),
    },
  });

  const report = collectActiveBuffDiagnostics([context(actor)], {
    resolveUuid: resolver,
    concentrationPredicate: () => false,
  });

  assert.equal(report.entries.length, 2);
  for (const entry of report.entries) {
    assert.ok(entry.warnings.includes("duplicateNoStack"));
    assert.equal(
      entry.issues.find((issue) => issue.code === "duplicateNoStack")?.severity,
      "critical",
    );
  }
});

test("same noStack key on distinct unlinked tokens is not a collision", () => {
  const first = new MockActor({
    uuid: "Scene.scene.Token.a.Actor.synthetic",
    name: "Goblin",
    activeBuffs: { first: activeBuff("first", { stackingKey: "guidance" }) },
  });
  const second = new MockActor({
    uuid: "Scene.scene.Token.b.Actor.synthetic",
    name: "Goblin",
    activeBuffs: { second: activeBuff("second", { stackingKey: "guidance" }) },
  });

  const report = collectActiveBuffDiagnostics([
    context(first, {
      key: "Scene.scene.Token.a",
      tokenNames: ["Goblin A"],
      tokenUuids: ["Scene.scene.Token.a"],
      actorLink: false,
      synthetic: true,
    }),
    context(second, {
      key: "Scene.scene.Token.b",
      tokenNames: ["Goblin B"],
      tokenUuids: ["Scene.scene.Token.b"],
      actorLink: false,
      synthetic: true,
    }),
  ], {
    resolveUuid: resolver,
    concentrationPredicate: () => false,
  });

  assert.equal(report.entries.length, 2);
  assert.equal(report.entries.some((entry) => entry.warnings.includes("duplicateNoStack")), false);
});

test("invalid and explicitly expired duration data are detected", () => {
  const actor = new MockActor({
    uuid: "Actor.duration",
    name: "Duration",
    activeBuffs: {
      invalid: activeBuff("invalid", { duration: { rounds: "later" } }),
      expired: activeBuff("expired", { duration: { rounds: 2 } }),
    },
    effects: [
      {
        name: "Invalid duration",
        flags: { [MODULE_ID]: { indicator: true, buffId: "invalid" } },
        statuses: new Set(["bot-active"]),
        duration: { remaining: 1 },
      },
      {
        name: "Expired duration",
        flags: { [MODULE_ID]: { indicator: true, buffId: "expired" } },
        statuses: new Set(["bot-active"]),
        duration: { remaining: 0 },
      },
    ],
  });

  const report = collectActiveBuffDiagnostics([context(actor)], {
    resolveUuid: resolver,
    concentrationPredicate: () => false,
  });

  assert.ok(report.entries.find((entry) => entry.buffId === "invalid").warnings.includes("invalidDuration"));
  assert.ok(report.entries.find((entry) => entry.buffId === "expired").warnings.includes("expiredDuration"));
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

function diagnosticEntry({
  actorName,
  tokenName,
  buffName,
  buffId,
  sourceActor = "Caster",
  sourceItem = "Spell",
  triggerType = "passive",
  stackingMode = "normal",
  stackingKey = "spell",
  warnings = [],
}) {
  return {
    carrier: {
      actorName,
      actorUuid: `Actor.${actorName}`,
      tokenNames: tokenName ? [tokenName] : [],
      tokenUuids: tokenName ? [`Scene.scene.Token.${tokenName}`] : [],
      actorLink: true,
      synthetic: false,
    },
    buffName,
    buffId,
    sourceActor: { name: sourceActor, uuid: `Actor.${sourceActor}` },
    sourceItem: { name: sourceItem, uuid: `Item.${sourceItem}` },
    stackingMode,
    stackingKey,
    triggerType,
    concentration: { expected: false, linked: false, effectName: null },
    linkedStatuses: [],
    indicators: { active: [], target: [], storedTarget: [], mechanical: [] },
    duration: { rounds: null, appliedAt: null, summary: "" },
    warnings,
  };
}

function filterableReport() {
  return {
    generatedAt: "2026-06-23T00:00:00.000Z",
    sceneName: "Test Scene",
    actorCount: 3,
    buffCount: 3,
    warningCount: 2,
    actorWarnings: [],
    entries: [
      diagnosticEntry({
        actorName: "Élodie",
        tokenName: "Hero Token",
        buffName: "Guidance",
        buffId: "buff-guidance",
        sourceActor: "Cleric",
        sourceItem: "Guidance Spell",
        stackingMode: "noStack",
        stackingKey: "guidance",
      }),
      diagnosticEntry({
        actorName: "Target",
        tokenName: "Target Token",
        buffName: "Bardic Inspiration",
        buffId: "buff-inspiration",
        sourceActor: "Bard",
        sourceItem: "Bardic Inspiration Feature",
        triggerType: "passive",
        stackingMode: "noStack",
        stackingKey: "bardic-inspiration",
        warnings: ["missingActiveIndicator"],
      }),
      diagnosticEntry({
        actorName: "Enemy",
        tokenName: "Goblin",
        buffName: "Bane",
        buffId: "buff-bane",
        sourceActor: "Warlock",
        sourceItem: "Bane Spell",
        triggerType: "damaged",
        stackingMode: "sameEffect",
        stackingKey: "bane",
        warnings: ["unresolvedSourceItem"],
      }),
    ],
  };
}

test("diagnostic navigation exposes the available carrier actor and token", () => {
  const entry = diagnosticEntry({
    actorName: "Target",
    tokenName: "Target Token",
    buffName: "Guidance",
    buffId: "buff-guidance",
  });
  const documents = new Map([
    [entry.carrier.actorUuid, { uuid: entry.carrier.actorUuid, name: "Target" }],
    [entry.carrier.tokenUuids[0], {
      uuid: entry.carrier.tokenUuids[0],
      actor: { uuid: entry.carrier.actorUuid, name: "Target" },
    }],
    [entry.sourceActor.uuid, { uuid: entry.sourceActor.uuid, name: "Caster" }],
    [entry.sourceItem.uuid, { uuid: entry.sourceItem.uuid, name: "Spell" }],
  ]);

  const navigation = getActiveBuffDiagnosticNavigation(entry, {
    resolveUuid: (uuid) => documents.get(uuid) ?? null,
    tokenLookup: () => null,
  });

  assert.equal(navigation.carrierActorAvailable, true);
  assert.equal(navigation.carrierTokenAvailable, true);
  assert.equal(navigation.sourceActorAvailable, true);
  assert.equal(navigation.sourceItemAvailable, true);
  assert.equal(navigation.buffIdAvailable, true);
  assert.equal(navigation.summaryAvailable, true);
});

test("diagnostic navigation hides an unresolved source item action", () => {
  const entry = diagnosticEntry({
    actorName: "Target",
    buffName: "Guidance",
    buffId: "buff-guidance",
  });

  const navigation = getActiveBuffDiagnosticNavigation(entry, {
    resolveUuid: (uuid) => uuid === entry.carrier.actorUuid
      ? { uuid, name: "Target" }
      : null,
    tokenLookup: () => null,
  });

  assert.equal(navigation.carrierActorAvailable, true);
  assert.equal(navigation.carrierTokenAvailable, false);
  assert.equal(navigation.sourceItemAvailable, false);
});

test("short diagnostic summary is stable and contains useful row identifiers", () => {
  const entry = diagnosticEntry({
    actorName: "Target",
    tokenName: "Target Token",
    buffName: "Bardic Inspiration",
    buffId: "buff-inspiration",
    sourceActor: "Bard",
    sourceItem: "Bardic Inspiration Feature",
    stackingMode: "noStack",
    stackingKey: "bardic-inspiration",
    warnings: ["missingActiveIndicator"],
  });

  assert.equal(
    buildActiveBuffDiagnosticEntrySummary(entry),
    [
      "Target [Target Token] — Bardic Inspiration (buff-inspiration)",
      "source=Bard; item=Bardic Inspiration Feature; trigger=passive; stack=noStack/bardic-inspiration",
      "issues=missingActiveIndicator",
    ].join("\n"),
  );
});

test("diagnostic search matches buff names", () => {
  const filtered = filterActiveBuffDiagnosticReport(filterableReport(), { query: "inspiration" });
  assert.deepEqual(filtered.entries.map((entry) => entry.buffId), ["buff-inspiration"]);
});

test("diagnostic search matches actor and token names without case or accent sensitivity", () => {
  const byActor = filterActiveBuffDiagnosticReport(filterableReport(), { query: "ELODIE" });
  const byToken = filterActiveBuffDiagnosticReport(filterableReport(), { query: "goblin" });
  assert.deepEqual(byActor.entries.map((entry) => entry.buffId), ["buff-guidance"]);
  assert.deepEqual(byToken.entries.map((entry) => entry.buffId), ["buff-bane"]);
});

test("diagnostic search matches source items and stacking metadata", () => {
  const byItem = filterActiveBuffDiagnosticReport(filterableReport(), { query: "Guidance Spell" });
  const byStack = filterActiveBuffDiagnosticReport(filterableReport(), { query: "sameEffect" });
  assert.deepEqual(byItem.entries.map((entry) => entry.buffId), ["buff-guidance"]);
  assert.deepEqual(byStack.entries.map((entry) => entry.buffId), ["buff-bane"]);
});

test("diagnostic inconsistencies-only filter keeps warning rows", () => {
  const filtered = filterActiveBuffDiagnosticReport(filterableReport(), { warningsOnly: true });
  assert.deepEqual(
    filtered.entries.map((entry) => entry.buffId),
    ["buff-inspiration", "buff-bane"],
  );
});

test("diagnostic search combines with inconsistencies-only filter", () => {
  const filtered = filterActiveBuffDiagnosticReport(filterableReport(), {
    query: "Bard",
    warningsOnly: true,
  });
  assert.deepEqual(filtered.entries.map((entry) => entry.buffId), ["buff-inspiration"]);
});

test("diagnostic filter reports total, displayed and inconsistent counters", () => {
  const filtered = filterActiveBuffDiagnosticReport(filterableReport(), { query: "spell" });
  assert.equal(filtered.totalCount, 3);
  assert.equal(filtered.visibleCount, 2);
  assert.equal(filtered.inconsistentCount, 2);
  assert.equal(filtered.report.totalBuffCount, 3);
  assert.equal(filtered.report.visibleBuffCount, 2);
  assert.equal(filtered.report.inconsistentBuffCount, 2);
});

test("copied text and JSON reports use the filtered view", () => {
  const filtered = filterActiveBuffDiagnosticReport(filterableReport(), { query: "Guidance" });
  const text = buildActiveBuffDiagnosticText(filtered.report);
  const json = JSON.parse(JSON.stringify(filtered.report));

  assert.match(text, /Guidance/);
  assert.doesNotMatch(text, /Bardic Inspiration/);
  assert.equal(json.entries.length, 1);
  assert.equal(json.entries[0].buffId, "buff-guidance");
  assert.deepEqual(json.filters, { query: "Guidance", warningsOnly: false });
});

test("new diagnostic issues appear in text and JSON reports and drive filtering", () => {
  const report = filterableReport();
  report.entries[0].warnings = ["duplicateNoStack"];
  report.entries[0].issues = [{ code: "duplicateNoStack", severity: "critical" }];
  const filtered = filterActiveBuffDiagnosticReport(report, { warningsOnly: true });
  const text = buildActiveBuffDiagnosticText(filtered.report);
  const json = JSON.parse(JSON.stringify(filtered.report));

  assert.match(text, /critical:duplicateNoStack/);
  assert.equal(json.entries[0].issues[0].severity, "critical");
  assert.ok(filtered.entries.some((entry) => entry.buffId === "buff-guidance"));
});

import test from "node:test";
import assert from "node:assert/strict";

const {
  buildDeletedTokenBuffSnapshot,
  cleanupExternalBuffArtifacts,
} = await import("../scripts/delete-token-cleanup.js");

const MODULE_ID = "dnd5e-buff-on-trigger";
const DELETED_ACTOR_UUID = "Scene.scene.Token.deleted.Actor.synthetic";

function makeEffect(id, moduleFlag) {
  return {
    id,
    deleted: false,
    flags: {
      [MODULE_ID]: moduleFlag,
    },
  };
}

function makeActor(uuid, effects = []) {
  return { uuid, effects };
}

async function deleteMockEffect(effect) {
  if (effect.deleted) return false;
  effect.deleted = true;
  return true;
}

function makeSnapshot(buffIds = ["buff-a"]) {
  return {
    tokenUuid: "Scene.scene.Token.deleted",
    actorUuid: DELETED_ACTOR_UUID,
    buffIds,
  };
}

test("cleanup removes a stored target indicator owned by the deleted actor", async () => {
  const storedTarget = makeEffect("stored-target", {
    storedTargetIndicator: true,
    ownerActorUuid: DELETED_ACTOR_UUID,
  });
  const actorB = makeActor("Actor.target-b", [storedTarget]);

  const removed = await cleanupExternalBuffArtifacts(
    makeSnapshot(),
    [actorB],
    deleteMockEffect,
  );

  assert.equal(storedTarget.deleted, true);
  assert.deepEqual(removed, {
    storedTargetIndicators: 1,
    linkedStatuses: 0,
    targetIndicators: 0,
  });
});

test("cleanup removes a linked status owned by the deleted actor", async () => {
  const linkedStatus = makeEffect("linked-status", {
    linkedStatus: true,
    ownerActorUuid: DELETED_ACTOR_UUID,
  });
  const actorB = makeActor("Actor.target-b", [linkedStatus]);

  const removed = await cleanupExternalBuffArtifacts(
    makeSnapshot(),
    [actorB],
    deleteMockEffect,
  );

  assert.equal(linkedStatus.deleted, true);
  assert.deepEqual(removed, {
    storedTargetIndicators: 0,
    linkedStatuses: 1,
    targetIndicators: 0,
  });
});

test("cleanup removes a target indicator matching an exact snapshot buffId", async () => {
  const targetIndicator = makeEffect("target-indicator", {
    targetIndicator: true,
    buffId: "buff-a",
  });
  const actorB = makeActor("Actor.target-b", [targetIndicator]);

  const removed = await cleanupExternalBuffArtifacts(
    makeSnapshot(["buff-a"]),
    [actorB],
    deleteMockEffect,
  );

  assert.equal(targetIndicator.deleted, true);
  assert.deepEqual(removed, {
    storedTargetIndicators: 0,
    linkedStatuses: 0,
    targetIndicators: 1,
  });
});

test("cleanup preserves artifacts owned by another actor or buff", async () => {
  const otherStoredTarget = makeEffect("other-stored-target", {
    storedTargetIndicator: true,
    ownerActorUuid: "Actor.other-owner",
  });
  const otherLinkedStatus = makeEffect("other-linked-status", {
    linkedStatus: true,
    ownerActorUuid: "Actor.other-owner",
  });
  const otherTargetIndicator = makeEffect("other-target-indicator", {
    targetIndicator: true,
    buffId: "buff-other",
  });
  const actorB = makeActor("Actor.target-b", [
    otherStoredTarget,
    otherLinkedStatus,
    otherTargetIndicator,
  ]);

  const removed = await cleanupExternalBuffArtifacts(
    makeSnapshot(["buff-a"]),
    [actorB],
    deleteMockEffect,
  );

  assert.deepEqual(
    actorB.effects.map((effect) => effect.deleted),
    [false, false, false],
  );
  assert.deepEqual(removed, {
    storedTargetIndicators: 0,
    linkedStatuses: 0,
    targetIndicators: 0,
  });
});

test("cleanup ignores the deleted synthetic actor itself", async () => {
  const localStoredTarget = makeEffect("local-stored-target", {
    storedTargetIndicator: true,
    ownerActorUuid: DELETED_ACTOR_UUID,
  });
  const localLinkedStatus = makeEffect("local-linked-status", {
    linkedStatus: true,
    ownerActorUuid: DELETED_ACTOR_UUID,
  });
  const localTargetIndicator = makeEffect("local-target-indicator", {
    targetIndicator: true,
    buffId: "buff-a",
  });
  const deletedActor = makeActor(DELETED_ACTOR_UUID, [
    localStoredTarget,
    localLinkedStatus,
    localTargetIndicator,
  ]);

  const removed = await cleanupExternalBuffArtifacts(
    makeSnapshot(["buff-a"]),
    [deletedActor],
    deleteMockEffect,
  );

  assert.deepEqual(
    deletedActor.effects.map((effect) => effect.deleted),
    [false, false, false],
  );
  assert.deepEqual(removed, {
    storedTargetIndicators: 0,
    linkedStatuses: 0,
    targetIndicators: 0,
  });
});

test("snapshot captures exact buffIds and deduplicates embedded ids", () => {
  const activeBuffs = {
    mapKeyA: { buffId: "shared-id", itemName: "First" },
    mapKeyB: { buffId: "shared-id", itemName: "Duplicate" },
    mapKeyC: { itemName: "Fallback to map key" },
  };

  const snapshot = buildDeletedTokenBuffSnapshot({
    tokenUuid: "Scene.scene.Token.deleted",
    actorUuid: DELETED_ACTOR_UUID,
    activeBuffs,
  });

  assert.deepEqual(snapshot.buffIds, ["shared-id", "mapKeyC"]);
  assert.equal(snapshot.activeBuffs, activeBuffs);
  assert.equal(snapshot.tokenUuid, "Scene.scene.Token.deleted");
  assert.equal(snapshot.actorUuid, DELETED_ACTOR_UUID);
});

for (const activeBuffs of [undefined, {}, null, []]) {
  test(`snapshot handles ${JSON.stringify(activeBuffs)} activeBuffs`, () => {
    const snapshot = buildDeletedTokenBuffSnapshot({
      tokenUuid: "Scene.scene.Token.deleted",
      actorUuid: DELETED_ACTOR_UUID,
      activeBuffs,
    });

    assert.deepEqual(snapshot.buffIds, []);
    assert.deepEqual(snapshot.activeBuffs, {});
  });
}

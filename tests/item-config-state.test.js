import test from "node:test";
import assert from "node:assert/strict";

globalThis.window = globalThis;
globalThis.document = { querySelectorAll: () => [] };
globalThis.HTMLElement = class HTMLElement {};
globalThis.Event = class Event {
  constructor(type) {
    this.type = type;
  }
};
globalThis.Hooks = { on: () => {}, once: () => {} };
globalThis.ui = { windows: {} };
globalThis.Dialog = class Dialog {};
globalThis.CONFIG = { statusEffects: [] };
globalThis.game = {
  i18n: {
    localize: (key) => key,
    format: (key) => key,
  },
  settings: {
    get: () => false,
  },
};
globalThis.foundry = {
  applications: {
    api: {
      ApplicationV2: class ApplicationV2 {},
      HandlebarsApplicationMixin: (Base) => Base,
    },
  },
  utils: {
    deepClone: (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value)),
  },
};

const { hasUsableBuffTriggerConfig } = await import("../scripts/ui.js");

test("item sheet state is inactive without a usable Buff on Trigger flag", () => {
  assert.equal(hasUsableBuffTriggerConfig(null), false);
  assert.equal(hasUsableBuffTriggerConfig(undefined), false);
  assert.equal(hasUsableBuffTriggerConfig({}), false);
});

test("item sheet state ignores a default passive configuration without effects", () => {
  assert.equal(hasUsableBuffTriggerConfig({
    targetMode: "self",
    type: "passive",
    condition: "hit",
    consumeOnTrigger: true,
    triggerFrequency: "none",
    stackingMode: "normal",
    buffs: {},
  }), false);
});

test("item sheet state becomes active for a usable trigger configuration", () => {
  assert.equal(hasUsableBuffTriggerConfig({ type: "mwak" }), true);
  assert.equal(hasUsableBuffTriggerConfig({ type: "damaged" }), true);
  assert.equal(hasUsableBuffTriggerConfig({ type: "unknown-trigger" }), false);
});

test("item sheet state becomes active for roll modifiers and preset-like flags", () => {
  assert.equal(hasUsableBuffTriggerConfig({
    type: "passive",
    rollModifier: {
      enabled: true,
      formula: "1d4",
      rollTypes: [],
    },
  }), false);
  assert.equal(hasUsableBuffTriggerConfig({
    type: "passive",
    rollModifier: {
      enabled: true,
      formula: "1d4",
      rollTypes: ["ability", "skill"],
    },
  }), true);
});

test("item sheet state becomes active for mechanical buffs, statuses, and end conditions", () => {
  assert.equal(hasUsableBuffTriggerConfig({ buffs: { movement: {} } }), false);
  assert.equal(hasUsableBuffTriggerConfig({ buffs: { ac: 2 } }), true);
  assert.equal(hasUsableBuffTriggerConfig({ buffs: { movement: { enabled: true, value: "10" } } }), true);
  assert.equal(hasUsableBuffTriggerConfig({ buffs: { skills: ["ste"] } }), true);
  assert.equal(hasUsableBuffTriggerConfig({ status: { ids: ["blinded"] } }), true);
  assert.equal(hasUsableBuffTriggerConfig({ endConditions: { onDamageTaken: true } }), true);
});

test("item sheet state becomes active for stored target configuration", () => {
  assert.equal(hasUsableBuffTriggerConfig({ rememberTargetOnActivation: true }), true);
  assert.equal(hasUsableBuffTriggerConfig({ requireStoredTargetMatch: true }), true);
});

test("item sheet state does not depend on the item name or active actor buffs", () => {
  assert.equal(hasUsableBuffTriggerConfig({
    itemName: "Bless",
    activeBuffs: {
      "buff-1": { itemName: "Bless" },
    },
  }), false);
});

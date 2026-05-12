import { MODULE_ID, BUFF_ICON, STORED_TARGET_ICON, debugLog } from "./constants.js";
import { syncItemDurationFlag } from "./duration.js";
import { changeStoredTarget, registerTriggers } from "./triggers.js";
import { registerItemSheetButton } from "./ui.js";

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "debug", {
    name: "BOT.settings.debug.name",
    hint: "BOT.settings.debug.hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
  });

  game.settings.register(MODULE_ID, "customPresets", {
    scope: "world",
    config: false,
    type: Object,
    default: {},
  });

  game.settings.register(MODULE_ID, "bonusDamageCriticalMode", {
    name: "BOT.settings.bonusDamageCriticalMode.name",
    hint: "BOT.settings.bonusDamageCriticalMode.hint",
    scope: "world",
    config: true,
    type: String,
    default: "system",
    choices: {
      system: game.i18n.localize("BOT.ui.damage.criticalMode.system"),
      doubleDice: game.i18n.localize("BOT.ui.damage.criticalMode.doubleDice"),
      maxBaseDice: game.i18n.localize("BOT.ui.damage.criticalMode.maxBaseDice"),
      neverDouble: game.i18n.localize("BOT.ui.damage.criticalMode.neverDouble"),
    },
  });
  game.settings.register(MODULE_ID, "bonusDamageApplicationMode", {
    name: "BOT.settings.bonusDamageApplicationMode.name",
    hint: "BOT.settings.bonusDamageApplicationMode.hint",
    scope: "world",
    config: true,
    type: String,
    default: "automatic",
    choices: {
      automatic: game.i18n.localize("BOT.settings.bonusDamageApplicationMode.automatic"),
      midiWorkflow: game.i18n.localize("BOT.settings.bonusDamageApplicationMode.midiWorkflow"),
    },
  });
  debugLog(`[${MODULE_ID}] Module initialized`);
});

Hooks.once("setup", () => {
  CONFIG.statusEffects.push({
    id: "bot-active",
    name: game.i18n.localize("BOT.status.active"),
    img: BUFF_ICON,
  });
  CONFIG.statusEffects.push({
    id: "bot-stored-target",
    name: game.i18n.localize("BOT.status.storedTarget"),
    img: STORED_TARGET_ICON,
  });
  debugLog(`[${MODULE_ID}] Statut bot-active enregistré dans setup`);
});

Hooks.once("ready", () => {
  debugLog(`[${MODULE_ID}] Module ready`);
  const module = game.modules.get(MODULE_ID);
  if (module) {
    module.api = {
      ...(module.api ?? {}),
      changeStoredTarget,
    };
  }

  ensureChangeStoredTargetMacro();
  registerTriggers();
  registerItemSheetButton();

  Hooks.on("updateItem", async (item, changed, options, userId) => {
    await syncItemDurationFlag(item, options);
  });
});

async function ensureChangeStoredTargetMacro() {
  if (!game.user?.isGM || !game.macros || typeof Macro === "undefined") return;
  const name = game.i18n.localize("BOT.macro.changeStoredTarget.name");
  const existing = game.macros.find((macro) => macro.flags?.[MODULE_ID]?.utility === "changeStoredTarget");
  if (existing) return;

  await Macro.create({
    name,
    type: "script",
    command: `game.modules.get("${MODULE_ID}").api.changeStoredTarget();`,
    img: STORED_TARGET_ICON,
    flags: { [MODULE_ID]: { utility: "changeStoredTarget" } },
  });
}


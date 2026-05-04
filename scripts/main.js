import { MODULE_ID, BUFF_ICON } from "./constants.js";
import { syncItemDurationFlag } from "./duration.js";
import { registerTriggers } from "./triggers.js";
import { registerItemSheetButton } from "./ui.js";

Hooks.once("init", () => {
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
  console.log(`[${MODULE_ID}] Module initialized`);
});

Hooks.once("setup", () => {
  CONFIG.statusEffects.push({
    id: "bot-active",
    name: game.i18n.localize("BOT.status.active"),
    img: BUFF_ICON,
  });
  console.log(`[${MODULE_ID}] Statut bot-active enregistré dans setup`);
});

Hooks.once("ready", () => {
  console.log(`[${MODULE_ID}] Module ready`);
  registerTriggers();
  registerItemSheetButton();

  Hooks.on("updateItem", async (item, changed, options, userId) => {
    await syncItemDurationFlag(item, options);
  });
});

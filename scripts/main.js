import { MODULE_ID, BUFF_ICON } from "./constants.js";
import { registerTriggers } from "./triggers.js";
import { registerItemSheetButton } from "./ui.js";

Hooks.once("init", () => {
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
});

import { registerTriggers } from "./triggers.js";
import { registerItemSheetButton } from "./ui.js";

const MODULE_ID = "dnd5e-buff-on-trigger";

Hooks.once("init", () => {
  console.log(`[${MODULE_ID}] Module initialized`);
});

Hooks.once("setup", () => {
  CONFIG.statusEffects.push({
    id: "bot-active",
    name: game.i18n.localize("BOT.status.active"),
    img: "modules/dnd5e-buff-on-trigger/icons/buff-active.svg",
  });
  console.log(`[${MODULE_ID}] Statut bot-active enregistré dans setup`);
});

Hooks.once("ready", () => {
  console.log(`[${MODULE_ID}] Module ready`);
  registerTriggers();
  registerItemSheetButton();
});

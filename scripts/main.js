// import { registerTriggers } from "./triggers.js";
// import { registerEffects } from "./effects.js";
// import { registerUI } from "./ui.js";

const MODULE_ID = "dnd5e-buff-on-trigger";

Hooks.once("init", () => {
  console.log(`[${MODULE_ID}] Module initialized`);
});

Hooks.once("ready", () => {
  console.log(`[${MODULE_ID}] Module ready`);
});

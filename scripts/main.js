import { MODULE_ID, BUFF_ICON, STORED_TARGET_ICON, debugLog } from "./constants.js";
import { syncItemDurationFlag } from "./duration.js";
import { changeStoredTarget, registerTriggers } from "./triggers.js";
import { registerItemSheetButton } from "./ui.js";
import { migrateLegacyActiveBuff } from "./active-buffs.js";

const MODULE_MACROS = [
  {
    utility: "changeStoredTarget",
    nameKey: "BOT.macro.changeStoredTarget.name",
    command: `game.modules.get("${MODULE_ID}").api.changeStoredTarget();`,
    img: STORED_TARGET_ICON,
  },
];

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

  game.settings.registerMenu(MODULE_ID, "moduleMacros", {
    name: "BOT.settings.moduleMacros.name",
    label: "BOT.settings.moduleMacros.label",
    hint: "BOT.settings.moduleMacros.hint",
    icon: "fas fa-scroll",
    type: ModuleMacrosConfig,
    restricted: true,
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

Hooks.once("ready", async () => {
  debugLog(`[${MODULE_ID}] Module ready`);
  const module = game.modules.get(MODULE_ID);
  if (module) {
    module.api = {
      ...(module.api ?? {}),
      changeStoredTarget,
    };
  }

  ensureModuleMacros();
  if (game.user?.isGM) {
    for (const actor of game.actors ?? []) {
      try {
        await migrateLegacyActiveBuff(actor);
      } catch (error) {
        console.error(`[${MODULE_ID}] Erreur de migration activeBuff pour ${actor?.name ?? actor?.uuid ?? "acteur inconnu"} :`, error);
      }
    }
  }
  registerTriggers();
  registerItemSheetButton();

  Hooks.on("updateItem", async (item, changed, options, userId) => {
    await syncItemDurationFlag(item, options);
  });
});

class ModuleMacrosConfig extends FormApplication {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "bot-module-macros",
      title: game.i18n.localize("BOT.settings.moduleMacros.name"),
      template: `modules/${MODULE_ID}/templates/module-macros.html`,
      width: 420,
    });
  }

  async _updateObject() {
    if (!game.user?.isGM) {
      ui.notifications.warn(game.i18n.localize("BOT.notifications.gmOnly"));
      return;
    }

    const result = await ensureModuleMacros({ updateExisting: true });
    if (result.created > 0 || result.updated > 0) {
      ui.notifications.info(game.i18n.localize("BOT.notifications.moduleMacrosRecreated"));
    } else if (result.existing > 0) {
      ui.notifications.info(game.i18n.localize("BOT.notifications.moduleMacroAlreadyExists"));
    }
  }
}

async function ensureModuleMacros({ updateExisting = false } = {}) {
  const result = { created: 0, updated: 0, existing: 0 };
  if (!game.user?.isGM || !game.macros || typeof Macro === "undefined") return result;

  for (const macroData of MODULE_MACROS) {
    const name = game.i18n.localize(macroData.nameKey);
    const existing = findModuleMacro(macroData, name);
    const desired = {
      name,
      type: "script",
      command: macroData.command,
      img: macroData.img,
      flags: { [MODULE_ID]: { utility: macroData.utility } },
    };

    if (!existing) {
      await Macro.create(desired);
      result.created += 1;
      continue;
    }

    if (updateExisting && shouldUpdateMacro(existing, desired, macroData.utility)) {
      await existing.update(desired);
      result.updated += 1;
    } else {
      result.existing += 1;
    }
  }

  return result;
}

function findModuleMacro(macroData, localizedName) {
  return game.macros.find((macro) => macro.flags?.[MODULE_ID]?.utility === macroData.utility)
    ?? game.macros.find((macro) => macro.command === macroData.command)
    ?? game.macros.find((macro) => macro.name === localizedName);
}

function shouldUpdateMacro(existing, desired, utility) {
  return existing.name !== desired.name
    || existing.type !== desired.type
    || existing.command !== desired.command
    || existing.img !== desired.img
    || existing.flags?.[MODULE_ID]?.utility !== utility;
}


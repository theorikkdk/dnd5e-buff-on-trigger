import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const LANGUAGE_FILES = ["lang/en.json", "lang/fr.json"];
const CRITICAL_KEYS = [
  "BOT.ui.configTitle",
  "BOT.ui.enable",
  "BOT.ui.presets.title",
  "BOT.settings.experimentalAfterRollPrompt.name",
  "BOT.settings.experimentalAfterRollPrompt.hint",
  "BOT.ui.rollModifier.promptTitle",
  "BOT.ui.rollModifier.promptMessage",
  "BOT.ui.rollModifier.afterRollPromptMessage",
  "BOT.ui.rollModifier.bardicDieLabel",
  "BOT.ui.rollModifier.promptEffect.bardicInspiration",
  "BOT.ui.rollModifier.promptTimingLabel",
  "BOT.ui.rollModifier.promptTiming.beforeRoll",
  "BOT.ui.rollModifier.promptTiming.afterRoll",
];

async function readLanguageFile(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function findPathCollisions(keys) {
  const keySet = new Set(keys);
  return keys.filter((key) => {
    const parts = key.split(".");
    for (let index = 1; index < parts.length; index += 1) {
      if (keySet.has(parts.slice(0, index).join("."))) return true;
    }
    return false;
  });
}

test("language files expose the same localization keys", async () => {
  const [english, french] = await Promise.all(LANGUAGE_FILES.map(readLanguageFile));

  assert.deepEqual(
    Object.keys(french).sort(),
    Object.keys(english).sort(),
  );
});

test("language files contain the critical module localization keys", async () => {
  for (const path of LANGUAGE_FILES) {
    const translations = await readLanguageFile(path);
    for (const key of CRITICAL_KEYS) {
      assert.equal(typeof translations[key], "string", `${path} is missing ${key}`);
      assert.notEqual(translations[key].trim(), "", `${path} has an empty ${key}`);
    }
  }
});

test("language keys do not collide with their own nested paths", async () => {
  for (const path of LANGUAGE_FILES) {
    const translations = await readLanguageFile(path);
    const collisions = findPathCollisions(Object.keys(translations));

    assert.deepEqual(
      collisions,
      [],
      `${path} contains flat keys that Foundry cannot expand together`,
    );
  }
});

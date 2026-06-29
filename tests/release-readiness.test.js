import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  validateAndNormalizeImportedPreset,
  validateCustomPresetImportEnvelope,
} from "../scripts/custom-preset-import.js";

const manifest = JSON.parse(await readFile("module.json", "utf8"));
const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const execFileAsync = promisify(execFile);
const DEFAULT_CONFIG = {
  type: "passive",
  stackingMode: "normal",
  triggerFrequency: "none",
  receivedDamageTypes: [],
  endConditions: null,
  rollModifier: null,
  status: null,
  save: null,
  buffs: {
    resistances: [],
    abilityCheckModifiers: {},
  },
};

test("module manifest exposes valid release metadata and existing package paths", async () => {
  assert.equal(manifest.id, "dnd5e-buff-on-trigger");
  assert.equal(manifest.version, "1.0.0");
  assert.equal(packageJson.version, manifest.version);
  assert.equal(manifest.compatibility?.minimum, "13");
  assert.equal(manifest.compatibility?.verified, "13");
  assert.deepEqual(manifest.system, ["dnd5e"]);

  const packagePaths = [
    ...(manifest.esmodules ?? []),
    ...(manifest.scripts ?? []),
    ...(manifest.styles ?? []),
    ...(manifest.languages ?? []).map((language) => language.path),
  ];
  await Promise.all(packagePaths.map((file) => access(file)));

  assert.equal(
    manifest.manifest,
    "https://github.com/theorikkdk/dnd5e-buff-on-trigger/releases/download/v1.0.0/module.json",
  );
  assert.equal(
    manifest.download,
    "https://github.com/theorikkdk/dnd5e-buff-on-trigger/releases/download/v1.0.0/module.zip",
  );
  assert.equal(manifest.readme, "https://github.com/theorikkdk/dnd5e-buff-on-trigger/blob/main/README.md");
  assert.equal(manifest.license, "https://github.com/theorikkdk/dnd5e-buff-on-trigger/blob/main/LICENSE");
  assert.equal(manifest.changelog, "https://github.com/theorikkdk/dnd5e-buff-on-trigger/blob/main/CHANGELOG.md");
});

test("dnd5e is required and Midi-QOL is an optional recommendation", () => {
  const dnd5e = manifest.relationships?.systems?.find((entry) => entry.id === "dnd5e");
  const midiQol = manifest.relationships?.recommends?.find((entry) => entry.id === "midi-qol");

  assert.equal(dnd5e?.type, "system");
  assert.equal(dnd5e?.compatibility?.minimum, "5.2.4");
  assert.equal(midiQol?.type, "module");
  assert.equal(midiQol?.compatibility?.minimum, "13.0.0");
  assert.equal(manifest.relationships?.modules, undefined);
});

test("declared MIT license exists and matches the README", async () => {
  const [license, readme] = await Promise.all([
    readFile("LICENSE", "utf8"),
    readFile("README.md", "utf8"),
  ]);

  assert.equal(manifest.license, "https://github.com/theorikkdk/dnd5e-buff-on-trigger/blob/main/LICENSE");
  assert.match(license, /^MIT License/m);
  assert.match(license, /Copyright \(c\) 2026 Theorik/);
  assert.match(license, /Permission is hereby granted, free of charge/);
  assert.match(readme, /## License\s+\[MIT\]\(LICENSE\)/);
});

test("release changelog documents version 1.0.0", async () => {
  const changelog = await readFile("CHANGELOG.md", "utf8");

  assert.match(changelog, /^# Changelog/m);
  assert.match(changelog, /## \[1\.0\.0\] - 2026-06-26/);
  assert.match(changelog, /### Added/);
  assert.match(changelog, /### Changed/);
  assert.match(changelog, /### Fixed/);
  assert.match(changelog, /### Documentation/);
  assert.match(changelog, /### Internal \/ Tests/);
});

test("local non-SRD preset pack is importable when present and not part of the public manifest", async () => {
  assert.equal(JSON.stringify(manifest).includes("non-srd-presets.local.json"), false);
  assert.equal(JSON.stringify(manifest).includes("preset-packs"), false);

  let rawPack;
  try {
    rawPack = await readFile("preset-packs/non-srd-presets.local.json", "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }

  const pack = JSON.parse(rawPack);
  const envelope = validateCustomPresetImportEnvelope(pack, manifest.id);
  assert.equal(envelope.valid, true, envelope.errors.join(", "));
  assert.equal(pack.schemaVersion, 1);
  assert.equal(pack.version, "1");
  assert.ok(Array.isArray(pack.presets));
  assert.ok(pack.presets.length > 0);

  for (const preset of pack.presets) {
    assert.equal(String(preset.label ?? "").startsWith("BOT."), false);
    assert.equal(String(preset.description ?? "").startsWith("BOT."), false);
    const result = validateAndNormalizeImportedPreset(preset, { defaultConfig: DEFAULT_CONFIG });
    assert.deepEqual(result.errors, [], `${preset.id}: ${result.errors.join(", ")}`);
  }
});

test("repository does not track accidental gitlinks", async () => {
  const { stdout } = await execFileAsync("git", ["ls-files", "--stage"]);
  const gitlinks = stdout
    .split(/\r?\n/)
    .filter((line) => line.startsWith("160000 "));

  assert.deepEqual(gitlinks, []);
});

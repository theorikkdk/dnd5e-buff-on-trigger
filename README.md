# dnd5e-buff-on-trigger

A FoundryVTT module for D&D 5e that automates deferred buff effects triggered by combat conditions such as attacks, damage rolls, and turn events.

## Features

- Apply temporary buffs automatically when specific combat triggers fire
- Integrates with the D&D 5e system and optionally with midi-qol for enhanced workflow hooks

## Presets

The buff configuration window includes searchable built-in and custom presets. Presets are grouped as:

- **Built-in presets** provided by the module
- **Custom presets** created or imported by the user
- **Test presets**, visible only when the module's debug setting is enabled

The search field matches preset labels, descriptions, and trigger types. Searches are case-insensitive and accent-insensitive, so searches such as `Bless`, `bless`, `Bénédiction`, and `benediction` work as expected.

### Useful built-in presets

The first curated built-in pack contains:

| Preset | Automated behavior |
| --- | --- |
| Guidance | Adds 1d4 to the next ability or skill check |
| Resistance | Adds 1d4 to the next saving throw |
| Bless | Adds 1d4 to attack rolls and saving throws |
| Bane | Subtracts 1d4 from attack rolls and saving throws after the activation save fails |
| Shield of Faith | Grants a +2 AC bonus |
| Heroism | Grants temporary HP at the start of the bearer's turn and immunity to Frightened |
| Protection from Poison | Grants resistance to poison damage |

Built-in presets cannot be edited, deleted, replaced, or exported through the custom preset manager. Creating an item from a preset copies its configuration to the item, so the item remains usable independently of the preset catalogue.

Development presets whose labels begin with `[TEST]` remain included for Foundry validation. They are hidden during normal use and appear in their own group when debug mode is enabled.

### Custom preset management

Use **Manage custom presets** in the buff configuration window to open the dedicated management window. From there you can:

- select one or several custom presets;
- select or deselect all visible presets;
- export all visible custom presets;
- export only the selected custom presets;
- delete one or several selected custom presets after confirmation.

Only custom presets stored by this module are manageable. Built-in presets, including built-in `[TEST]` presets, are never offered for deletion or custom export. Invalid stored presets are left untouched in the setting but are hidden from the preset list and management window.

Custom presets whose labels begin with `[TEST]` follow the same debug visibility rule as built-in test presets.

### Importing custom presets

The importer accepts a JSON file containing one or more presets. Each preset is validated and normalized before it is stored:

- invalid presets are rejected without preventing valid presets from the same file from being imported;
- safe corrections, such as normalizing an unknown stacking mode, are reported as warnings;
- unknown trigger types are rejected;
- malformed fields that can be safely normalized are restored to supported types.

Example:

```json
{
  "module": "dnd5e-buff-on-trigger",
  "schemaVersion": 1,
  "version": "1",
  "presets": [
    {
      "id": "custom-example-guidance",
      "label": "Example Guidance",
      "description": "Adds 1d4 to the next ability or skill check.",
      "flag": {
        "type": "passive",
        "targetMode": "target",
        "fallbackToSelfIfNoTarget": true,
        "rollModifier": {
          "enabled": true,
          "formula": "1d4",
          "rollTypes": ["ability", "skill"]
        },
        "charges": 1,
        "consumeOnTrigger": false
      }
    }
  ]
}
```

`schemaVersion: 1` is the current custom preset format. Legacy exports without `schemaVersion` are temporarily accepted as schema version 1. Files with an unsupported or invalid schema version, or files explicitly created for another module, are refused.

When duplicates are detected by custom ID or case-insensitive label, the importer offers these choices:

- **Add as copies**: preserve existing presets and create new unique IDs;
- **Skip duplicates**: keep existing presets and import only new entries;
- **Replace existing custom presets**: update matching custom presets while preserving their existing IDs when possible.

Built-in presets are never considered replaceable custom presets and are never modified by an import.

### Exporting custom presets

Export actions are available from the dedicated custom preset management window:

- **Export all visible presets** exports every valid custom preset currently visible;
- **Export selection** exports only checked presets.

Built-in presets and invalid dormant custom presets are excluded. Custom `[TEST]` presets are exported through these actions only when debug mode makes them visible.

### Current preset limitations

- Mage Armor is not included because the module currently supports additive AC bonuses, not a base AC calculation such as `13 + Dexterity modifier`.
- Protection from Poison automates poison damage resistance. Neutralizing an existing poison and advantage on saving throws against poison must be handled manually.
- Only custom presets can be exported or deleted through the custom preset manager.
- Built-in presets cannot be modified through the custom preset UI.

## Requirements

- FoundryVTT v13+
- D&D 5e system
- midi-qol (optional)

## Installation

Install via the FoundryVTT module manager using the manifest URL:

```
https://github.com/theorikkdk/dnd5e-buff-on-trigger/releases/latest/download/module.json
```

## License

MIT

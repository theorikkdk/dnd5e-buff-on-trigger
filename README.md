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
| Guidance | Prompts before an ability or skill check to optionally add 1d4 |
| Resistance | Prompts before a saving throw to optionally add 1d4 |
| Bardic Inspiration | Prompts before or, experimentally, after a compatible Midi-QOL attack roll to add the bard's Inspiration die |
| Bless | Adds 1d4 to attack rolls and saving throws |
| Bane | Subtracts 1d4 from attack rolls and saving throws after the activation save fails |
| Shield of Faith | Grants a +2 AC bonus |
| Heroism | Grants temporary HP at the start of the bearer's turn and immunity to Frightened |
| Protection from Poison | Grants resistance to poison damage |
| Darkvision | Configures 60 ft / 18 m of darkvision according to the scene units |
| Pass without Trace | Grants +10 to Stealth checks; aura and narrative stealth effects remain manual |

Built-in presets cannot be edited, deleted, replaced, or exported through the custom preset manager. Creating an item from a preset copies its configuration to the item, so the item remains usable independently of the preset catalogue.

Development presets whose labels begin with `[TEST]` remain included for Foundry validation. They are hidden during normal use and appear in their own group when debug mode is enabled.

### Consumable roll modifiers

Consumable roll modifiers support two consumption modes:

- `consumptionMode: "automatic"` applies and consumes the modifier automatically, preserving the behavior of older items and configurations;
- `consumptionMode: "prompt"` asks the player whether to use the modifier. Declining or closing the dialog leaves the buff available for a later compatible roll.

Prompted modifiers also support two timings:

- `promptTiming: "beforeRoll"` displays the dialog before the roll;
- `promptTiming: "afterRoll"` displays the dialog after the d20 but before Midi-QOL resolves the attack as a hit or miss. This timing is experimental.

The world setting **Prompt after the roll with Midi-QOL (experimental)** enables the experimental timing and is disabled by default. If it is disabled, Midi-QOL is unavailable, or the current workflow is not compatible, an `afterRoll` modifier safely falls back to `beforeRoll`.

The built-in presets use these modes as follows:

- **Bardic Inspiration** uses prompted consumption and requests `afterRoll` timing. On supported standard Midi-QOL attacks, the exact active buff instance is consumed only after its bonus is added successfully. Bardic Inspiration uses `noStack`, so a bearer cannot have multiple active Bardic Inspirations at once.
- **Guidance** and **Resistance** use prompted consumption before the roll.
- **Bless** and **Bane** remain automatic and never display a consumption dialog.

Example roll modifier configuration:

```json
{
  "rollModifier": {
    "enabled": true,
    "formula": "1d@origin.bardicInspirationDie",
    "rollTypes": ["ability", "skill", "attack", "save"],
    "consumptionMode": "prompt",
    "promptTiming": "afterRoll"
  }
}
```

The `afterRoll` path currently targets standard Midi-QOL attack workflows first. Specialized or unsupported Midi-QOL workflows may fall back to `beforeRoll`. Without Midi-QOL, or when the required Midi-QOL API is unavailable, the prompt also falls back to `beforeRoll`.

### Creating a custom preset

A preset is a reusable buff configuration. Built-in presets are maintained by the module, while custom presets are created or imported by the user. Only custom presets can be exported or deleted.

Applying a preset copies its current configuration to the item. The item is independent afterward: changing or deleting the custom preset does not modify items that were already created from it.

#### Creating one from the UI

1. Open the item sheet and open the module's buff configuration.
2. Select an existing preset as a starting point, or configure the fields manually from an empty/default configuration.
3. Adjust the target, trigger, bonuses, duration, consumption, stacking, status, and end-condition fields that the effect needs.
4. Save the item configuration and test the item in Foundry.
5. Use **Save as custom preset** to keep the current configuration as a reusable custom preset.
6. Open **Manage custom presets** when you want to export or delete it.

Keeping item saving and preset saving separate is intentional: the item is the playable effect, while the custom preset is a reusable template.

#### Common preset families

| Family | Typical configuration |
| --- | --- |
| Roll bonus | Enable `rollModifier`, choose compatible roll types, and enter a formula such as `1d4` |
| AC bonus | Use a passive buff with an additive AC bonus |
| Damage resistance | Add one or more supported damage types to the resistance list |
| Linked status | Select the status, its target, and when it is applied or removed |
| Consumable buff | Give the buff charges and choose automatic or prompted roll-modifier consumption |
| Automatic ending | Configure a duration or supported end condition |
| Triggered buff | Choose a supported trigger such as damage taken, healing, turn start/end, or attack |

Not every family needs every field. Start with the smallest configuration that represents the effect correctly.

#### Roll modifiers

Roll modifiers can affect these supported roll categories:

- `ability`: ability checks;
- `skill`: skill checks;
- `attack`: attack rolls;
- `save`: saving throws.

Continuous modifiers such as Bless normally use automatic behavior. A consumable modifier can instead ask whether it should be used:

- `consumptionMode: "automatic"` applies and consumes the modifier without asking;
- `consumptionMode: "prompt"` asks first and consumes the exact buff instance only when the bonus is actually used;
- `promptTiming: "beforeRoll"` asks before the roll;
- `promptTiming: "afterRoll"` asks after the d20 on compatible Midi-QOL attacks when the experimental world setting is enabled.

Guidance uses a prompted `1d4` on ability and skill checks. Resistance uses a prompted `1d4` on saving throws. Bardic Inspiration prompts for ability checks, skill checks, attacks, and saving throws. Bless applies its modifier automatically and does not display a prompt.

Closing or declining a prompt does not consume the buff. An unsupported `afterRoll` workflow falls back to `beforeRoll`.

#### Stacking and `stackingKey`

The stacking mode controls whether related buff instances replace, coexist, or block one another. A stable `stackingKey` identifies configurations that represent the same mechanical effect.

| Mode | Recommended use |
| --- | --- |
| `normal` | Reapplying the same item from the same source to the same bearer replaces or refreshes that instance. Other bearers remain independent. |
| `sameEffect` | Several instances may coexist, but only the mechanically dominant instance for the same `stackingKey` applies. When it ends, the next eligible instance can become active. |
| `noStack` | Only one instance with the same `stackingKey` may exist on a bearer. A different source is blocked instead of adding a duplicate. |

Use `noStack` when the target must never hold two versions of an effect, even from different sources. Bardic Inspiration therefore uses `stackingKey: "bardic-inspiration"` with `noStack`.

Use `sameEffect` when preserving separate instances matters but their mechanical bonuses must not accumulate. Bless and additive AC effects such as Shield of Faith are examples of effects that should be mechanically non-cumulative.

Do not leave `stackingKey` empty for `noStack` or `sameEffect`. Use a short, stable, effect-specific value such as `bardic-inspiration`, `bless`, or `shield-of-faith`.

#### Practical recipes

**A. Optional +1d4 before a roll**

- type: passive;
- roll types: `ability` and `skill` (or only the categories the effect supports);
- formula: `1d4`;
- charges: `1`;
- consumption mode: `prompt`;
- prompt timing: `beforeRoll`;
- stacking: `noStack` with a stable key when only one copy may exist.

This is the basic pattern used by Guidance-like effects. Answering **No** keeps the charge for a later roll.

**B. Non-cumulative AC bonus**

- type: passive;
- additive AC bonus: for example `+2`;
- consumption: disabled;
- stacking: `sameEffect`;
- stacking key: a stable value such as `shield-of-faith`.

Separate instances can remain traceable, but only the dominant mechanical bonus applies. This pattern is suitable for additive AC effects; it cannot implement a replacement AC formula such as Mage Armor's `13 + Dexterity modifier`.

**C. Inspiration-like prompted bonus**

- type: passive;
- roll types: `ability`, `skill`, `attack`, and `save`;
- formula: a supported fixed die such as `1d6`, or a supported origin formula;
- charges: `1`;
- consumption mode: `prompt`;
- prompt timing: `beforeRoll`, or experimental `afterRoll` for compatible Midi-QOL attacks;
- stacking: `noStack`;
- stacking key: a unique stable value.

Use `noStack` here when a bearer must not receive a second Inspiration-like buff from another source. The built-in Bardic Inspiration preset additionally resolves its die from the bard's level and falls back to `1d6` when necessary.

**D. Exportable custom preset**

The following file contains one simple optional `1d4` preset and can be imported as schema version 1:

```json
{
  "module": "dnd5e-buff-on-trigger",
  "schemaVersion": 1,
  "version": "1",
  "presets": [
    {
      "id": "custom-optional-d4",
      "label": "Optional d4",
      "description": "Optionally adds 1d4 to an ability or skill check.",
      "flag": {
        "type": "passive",
        "targetMode": "target",
        "fallbackToSelfIfNoTarget": true,
        "stackingMode": "noStack",
        "stackingKey": "optional-d4",
        "rollModifier": {
          "enabled": true,
          "formula": "1d4",
          "rollTypes": ["ability", "skill"],
          "consumptionMode": "prompt",
          "promptTiming": "beforeRoll"
        },
        "charges": 1,
        "consumeOnTrigger": false
      }
    }
  ]
}
```

A JSON file may contain several entries in `presets`. During import, invalid entries are rejected and duplicate custom presets can be copied, skipped, or replaced. Built-in presets are never replaced.

#### Common mistakes and limits

- Omitting `stackingKey` while using `noStack` or `sameEffect` makes related instances impossible to classify reliably.
- Using `sameEffect` when duplicates must be blocked still allows several instances to exist; use `noStack` for a strict one-per-bearer rule.
- Mage Armor cannot be represented accurately because the module supports additive AC bonuses, not a base AC formula of `13 + Dexterity modifier`.
- Built-in presets are module-owned. Save your configuration as a custom preset before expecting to export or delete it.
- The active-buff diagnostic cannot safely repair a missing source item. Verify whether the item was deleted and resolve that case manually.
- Experimental `afterRoll` prompting primarily targets standard Midi-QOL attack workflows and may fall back to `beforeRoll`.
- Some spells require rules or calculations that the current configuration fields cannot represent safely. Prefer a small, reliable preset over an approximate automation.

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
- Darkvision configures the actor's senses. Reliable synchronization with the token's actual vision may depend on a specialized compatible module such as Vision 5e; Vision 5e is not required by this module.
- Pass without Trace automates only the +10 Stealth check bonus. The aura, tracking restrictions, and narrative stealth effects must be handled manually.
- Only custom presets can be exported or deleted through the custom preset manager.
- Built-in presets cannot be modified through the custom preset UI.

## Active buff diagnostics

The **Active Buff Diagnostics** tool is available to GMs from the module settings. It inspects the actors and tokens on the active scene, including supported unlinked tokens and their synthetic actors. It does not scan inactive scenes.

For each active buff, the diagnostic can display the carrier actor or token, buff name and exact `buffId`, source actor and item, trigger, stacking mode and key, concentration information, linked statuses and indicators, and available duration, round, or turn data. Missing or inconsistent data is reported with an `info`, `warning`, or `critical` severity and a cautious repair suggestion.

### Search, filters, and reports

The diagnostic window provides:

- search by carrier actor, token, buff, source actor or item, trigger, stacking mode, stacking key, or `buffId`;
- an **inconsistencies only** filter;
- counters for total, displayed, and inconsistent buffs;
- text and JSON reports containing only the currently filtered rows.

The global **Refresh**, **Copy text report**, and **Copy JSON report** actions do not modify world data.

### Navigation actions

When the referenced document is available, a diagnostic row can:

- open the carrier actor;
- select and center the carrier token on the active scene;
- open the source actor;
- open the source item;
- copy the exact `buffId`;
- copy a short summary of the row.

Unavailable actors, tokens, or items simply leave the corresponding action unavailable.

### Targeted repairs

Most of the diagnostic is read-only. A GM may explicitly repair only a small set of missing artifacts that can be reconstructed safely from an existing active buff:

- a missing active-buff indicator;
- a missing stored-target indicator;
- a missing linked status when the expected status is known.

The repair action is shown only when the diagnostic has enough information. Every repair requires confirmation and targets one exact carrier and `buffId`; after the operation, the diagnostic refreshes so the corresponding warning can be checked again.

The diagnostic does **not** repair:

- a missing source actor or source item;
- a buff without a `buffId`;
- a `noStack` collision;
- an expired or invalid duration;
- an unknown stacking mode;
- a missing stacking key;
- broken concentration data;
- orphaned buffs or other ambiguous records.

There is no **Repair all** action, automatic repair at startup, global cleanup, or automatic removal of orphaned data. Navigation, reports, and suggestions remain read-only; only an explicitly confirmed targeted action may modify world data.

### Ending one active buff

For a safely targetable row, a GM can use **End this buff** to end that exact active buff manually. The action is hidden for non-GM users and whenever the carrier cannot be resolved, the `buffId` is absent, the active-buff data is inconsistent, or the row cannot otherwise be matched safely.

Before changing the world, the diagnostic requires confirmation and displays the carrier, buff name, and exact `buffId`. It then calls the module's existing buff-ending logic using the exact carrier and `buffId`, never a buff name. On success, the diagnostic refreshes and the targeted buff disappears from the list.

The normal end-of-buff workflow removes the targeted active buff and performs the cleanup already associated with that buff, including its indicators, linked statuses, linked concentration, and other supported runtime data where applicable.

This action:

- does not provide an **End all** operation;
- does not perform a global cleanup;
- does not find or remove buffs by name;
- does not delete actors, tokens, or source items;
- does not trigger automatic repairs;
- does not remove other buffs carried by the same actor.

**Caution:** **End this buff** intentionally modifies world state. Use it only when you deliberately want to end the precise buff instance shown in the confirmation dialog.

## Requirements

- FoundryVTT v13+
- D&D 5e system 5.2.4+
- Midi-QOL 13.x (optional, recommended for enhanced workflows and experimental `afterRoll`)

## Installation

Install via the FoundryVTT module manager using the manifest URL:

```
https://github.com/theorikkdk/dnd5e-buff-on-trigger/releases/latest/download/module.json
```

## License

[MIT](LICENSE)

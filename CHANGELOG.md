# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows semantic versioning from version 1.0.0 onward.

## [1.0.0] - 2026-06-26

### Added

- Added a curated built-in preset library for common D&D5e buffs:
  - Guidance / Assistance.
  - Resistance / Résistance.
  - Bless / Bénédiction.
  - Bane / Fléau.
  - Shield of Faith / Bouclier de la foi.
  - Heroism / Héroïsme.
  - Protection from Poison / Protection contre le poison.
  - Bardic Inspiration / Inspiration bardique.
  - Darkvision / Vision dans le noir.
  - Pass without Trace / Passage sans trace.
- Added custom preset management:
  - import one or many custom presets from JSON;
  - export all visible custom presets or a selected subset;
  - delete one or many custom presets with confirmation;
  - manage custom presets in a dedicated window.
- Added interactive duplicate handling during custom preset import:
  - add duplicates as copies;
  - ignore duplicates;
  - replace existing custom presets;
  - cancel the import.
- Added explicit custom preset export schema versioning with `schemaVersion: 1`.
- Added preset search and grouping for built-in, custom, and debug/test presets.
- Added optional roll modifier consumption:
  - automatic consumption for existing behavior;
  - prompted consumption before the roll;
  - experimental prompted consumption after compatible Midi-QOL attack rolls.
- Added Bardic Inspiration support with:
  - prompted consumption;
  - experimental Midi-QOL after-roll timing;
  - exact instance consumption by `buffId`;
  - `noStack` behavior using `stackingKey: "bardic-inspiration"`.
- Added active buff stacking behaviors for modern multi-buff data:
  - `normal`;
  - `sameEffect`;
  - `noStack`;
  - existing always-stack behavior.
- Added support for active buffs on unlinked tokens and synthetic actors on the active scene.
- Added a GM active buff diagnostic tool:
  - active buff list for the active scene;
  - linked and unlinked token support;
  - search and inconsistency filters;
  - text and JSON reports;
  - navigation actions for carriers, tokens, sources, and items;
  - copy actions for `buffId` and row summaries;
  - readable inconsistency suggestions;
  - targeted repairs for missing active indicators, stored-target indicators, and linked statuses;
  - targeted "End this buff" action with confirmation.

### Changed

- Migrated active buff storage to the modern multi-buff `activeBuffs[buffId]` model.
- Kept the legacy `activeBuff` bridge only for compatibility and migration.
- Centralized remaining legacy active buff access.
- Serialized `activeBuffs` mutations per actor to prevent concurrent writes from losing buffs.
- Limited replacement/deduplication to the same bearer/target instead of removing matching buffs globally.
- Delayed cleanup of replaced buffs until the new application succeeds.
- Made `alwaysStack` and `sameEffect` preserve coexisting instances during replacement checks.
- Implemented `noStack` as a blocking mode for conflicting active instances with the same `stackingKey`.
- Improved runtime refresh for active scene actors, including unlinked tokens and synthetic actors.
- Hid `[TEST]` presets during normal use while keeping them available in debug mode.
- Improved the module utility macro so it is recognized by stable flags and not by name alone.

### Fixed

- Fixed legacy `activeBuff` to `activeBuffs` migration for absent or empty modern maps.
- Fixed migration and runtime refresh for actors and tokens created or updated after `ready`.
- Fixed active scene `canvasReady` handling for synthetic actors and unlinked tokens.
- Fixed target-turn de-duplication for multiple unlinked tokens from the same prototype.
- Fixed cleanup of external indicators and linked statuses when an unlinked token carrying buffs is deleted.
- Fixed custom preset import validation so invalid triggers, invalid enums, and unsafe nested types do not break the UI.
- Fixed custom preset list filtering so invalid dormant presets are not shown or exported.
- Fixed localization loading issues and guarded critical localization keys with tests.
- Fixed Bardic Inspiration prompt text to avoid raw formulas such as `@origin.bardicInspirationDie`.
- Fixed Midi-QOL attack prompt consumption so accepted prompted bonuses consume the exact active buff instance.
- Fixed Darkvision preset unit conversion so 60 ft is applied as 60 in imperial scenes and 18 in metric scenes.

### Documentation

- Documented built-in presets and current preset limitations.
- Documented custom preset creation from the UI.
- Documented custom preset import/export, schema versioning, and duplicate strategies.
- Documented roll modifier consumption modes and prompt timings.
- Documented experimental Midi-QOL after-roll prompting for Bardic Inspiration.
- Documented Darkvision token-vision synchronization limits and Vision 5e compatibility notes.
- Documented the GM active buff diagnostic tool.
- Documented targeted diagnostic repairs and the targeted "End this buff" action.
- Added release readiness notes for:
  - Foundry VTT 13 compatibility;
  - dnd5e 5.2.4+ compatibility;
  - Midi-QOL 13 as a recommended optional module;
  - MIT license;
  - GitHub release manifest and download URLs.

### Internal / Tests

- Added automated tests for active buff migration, mutation queues, replacement logic, stacking, noStack, and dominance.
- Added tests for unlinked token cleanup and synthetic actor handling.
- Added tests for custom preset validation, import/export, duplicate strategies, schema versioning, and management helpers.
- Added tests for preset visibility, search, grouping, labels, descriptions, and built-in preset mechanics.
- Added tests for roll modifier prompt consumption, Bardic Inspiration, and Midi-QOL after-roll abstractions.
- Added tests for the GM diagnostic tool, reports, filters, navigation, suggestions, targeted repairs, and targeted buff ending.
- Added release readiness tests for manifest metadata, optional Midi-QOL recommendation, MIT license, and accidental gitlinks.

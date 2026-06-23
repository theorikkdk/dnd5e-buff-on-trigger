import { MODULE_ID } from "./constants.js";
import { getActiveBuffs, getStackingKey, getStackingMode } from "./active-buffs.js";
import { findConcentrationEffectForBuff, isConcentrationBuff } from "./concentration.js";

const FormApplicationBase = globalThis.FormApplication ?? class {};
const KNOWN_STACKING_MODES = new Set(["normal", "sameEffect", "noStack", "alwaysStack"]);
const STACKING_MODES_REQUIRING_KEY = new Set(["sameEffect", "noStack"]);

const DIAGNOSTIC_SEVERITIES = Object.freeze({
  missingBuffId: "critical",
  missingBuffName: "warning",
  missingTriggerType: "warning",
  invalidActiveBuffsMap: "critical",
  invalidActiveBuffEntry: "critical",
  missingSourceActorUuid: "info",
  unresolvedSourceActor: "warning",
  missingSourceItem: "info",
  unresolvedSourceItem: "warning",
  unknownStackingMode: "critical",
  missingStackingKey: "critical",
  duplicateNoStack: "critical",
  missingActiveIndicator: "warning",
  missingLinkedStatus: "warning",
  missingConcentration: "warning",
  invalidDuration: "warning",
  expiredDuration: "warning",
  invalidAppliedAt: "info",
});

function toArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value.values === "function") return [...value.values()];
  if (typeof value[Symbol.iterator] === "function") return [...value];
  return [];
}

function getTokenDocument(token) {
  return token?.document ?? token ?? null;
}

function getDiagnosticActorKey(actor, tokenDocument) {
  if (!actor) return null;
  if (tokenDocument?.actorLink === false) {
    return tokenDocument.uuid
      ?? (tokenDocument.id && tokenDocument.parent?.id
        ? `${tokenDocument.parent.id}.${tokenDocument.id}`
        : null)
      ?? actor.uuid
      ?? actor.id
      ?? null;
  }
  return actor.uuid ?? actor.id ?? tokenDocument?.uuid ?? tokenDocument?.id ?? null;
}

export function collectActiveSceneBuffActorContexts({
  tokenPlaceables = globalThis.canvas?.tokens?.placeables ?? [],
  tokenDocuments = globalThis.canvas?.scene?.tokens ?? [],
} = {}) {
  const contexts = new Map();

  const addToken = (token) => {
    const tokenDocument = getTokenDocument(token);
    const actor = token?.actor ?? tokenDocument?.actor ?? null;
    if (!actor?.getFlag) return;
    const key = getDiagnosticActorKey(actor, tokenDocument);
    if (!key) return;

    const tokenName = token?.name ?? tokenDocument?.name ?? null;
    const tokenUuid = tokenDocument?.uuid ?? null;
    const existing = contexts.get(key);
    if (existing) {
      if (tokenName && !existing.tokenNames.includes(tokenName)) existing.tokenNames.push(tokenName);
      if (tokenUuid && !existing.tokenUuids.includes(tokenUuid)) existing.tokenUuids.push(tokenUuid);
      return;
    }

    contexts.set(key, {
      key,
      actor,
      actorUuid: actor.uuid ?? actor.id ?? null,
      actorName: actor.name ?? null,
      tokenNames: tokenName ? [tokenName] : [],
      tokenUuids: tokenUuid ? [tokenUuid] : [],
      actorLink: tokenDocument?.actorLink !== false,
      synthetic: tokenDocument?.actorLink === false,
    });
  };

  for (const token of tokenPlaceables ?? []) addToken(token);
  for (const tokenDocument of tokenDocuments ?? []) addToken(tokenDocument);
  return [...contexts.values()];
}

function resolveDocument(uuid, resolver) {
  if (!uuid || typeof resolver !== "function") return null;
  try {
    return resolver(uuid) ?? null;
  } catch {
    return null;
  }
}

function getEffectModuleFlag(effect) {
  return effect?.flags?.[MODULE_ID] ?? {};
}

function effectMatchesBuff(effect, context, buffId) {
  const flag = getEffectModuleFlag(effect);
  if (flag.buffId !== buffId) return false;
  return !flag.ownerActorUuid || flag.ownerActorUuid === context.actorUuid;
}

function getConfiguredStatusIds(activeBuff) {
  const configured = activeBuff?.status?.ids ?? activeBuff?.status?.id ?? [];
  return [...new Set(
    (Array.isArray(configured) ? configured : [configured])
      .map((statusId) => String(statusId ?? "").trim())
      .filter(Boolean)
  )];
}

function formatDuration(activeBuff) {
  const rounds = Number(activeBuff?.duration?.rounds);
  const parts = [];
  if (Number.isFinite(rounds) && rounds > 0) parts.push(`${rounds} round${rounds === 1 ? "" : "s"}`);
  if (activeBuff?.duration?.concentration === true) parts.push("concentration");
  if (activeBuff?.appliedAt) parts.push(`appliedAt=${activeBuff.appliedAt}`);
  return parts.join(", ");
}

function buildDiagnosticIssues({
  activeBuff,
  explicitBuffId,
  buffName,
  sourceActor,
  sourceItem,
  stackingMode,
  stackingKey,
  indicators,
  activeIndicatorEffects,
  linkedStatuses,
  concentrationExpected,
  concentrationEffect,
}) {
  const issues = [];
  const addIssue = (code) => {
    if (issues.some((issue) => issue.code === code)) return;
    issues.push({ code, severity: DIAGNOSTIC_SEVERITIES[code] ?? "warning" });
  };
  if (!explicitBuffId) addIssue("missingBuffId");
  if (!buffName) addIssue("missingBuffName");
  if (typeof activeBuff?.type !== "string" || !activeBuff.type.trim()) addIssue("missingTriggerType");
  if (!activeBuff?.originActorUuid) addIssue("missingSourceActorUuid");
  else if (!sourceActor) addIssue("unresolvedSourceActor");
  if (!(activeBuff?.originItemUuid ?? activeBuff?.itemUuid ?? activeBuff?.itemName)) {
    addIssue("missingSourceItem");
  } else if ((activeBuff?.originItemUuid ?? activeBuff?.itemUuid) && !sourceItem) {
    addIssue("unresolvedSourceItem");
  }
  const rawStackingMode = String(activeBuff?.stackingMode ?? "").trim();
  if (rawStackingMode && !KNOWN_STACKING_MODES.has(rawStackingMode)) addIssue("unknownStackingMode");
  if (STACKING_MODES_REQUIRING_KEY.has(stackingMode) && !stackingKey) addIssue("missingStackingKey");
  if (!indicators.active.length) addIssue("missingActiveIndicator");
  if (getConfiguredStatusIds(activeBuff).length && !linkedStatuses.length) {
    addIssue("missingLinkedStatus");
  }
  if (concentrationExpected && !concentrationEffect) addIssue("missingConcentration");

  const duration = activeBuff?.duration;
  if (duration != null && (typeof duration !== "object" || Array.isArray(duration))) {
    addIssue("invalidDuration");
  } else if (duration && Object.hasOwn(duration, "rounds")) {
    const rounds = Number(duration.rounds);
    if (!Number.isFinite(rounds) || rounds <= 0) addIssue("invalidDuration");
  }
  if (activeBuff?.appliedAt != null && !Number.isFinite(Number(activeBuff.appliedAt))) {
    addIssue("invalidAppliedAt");
  }
  if (activeIndicatorEffects.some((effect) => {
    const remaining = Number(effect?.duration?.remaining);
    return Number.isFinite(remaining) && remaining <= 0;
  })) {
    addIssue("expiredDuration");
  }
  return issues;
}

export function collectActiveBuffDiagnostics(contexts, {
  resolveUuid = globalThis.fromUuidSync,
  findConcentration = findConcentrationEffectForBuff,
  concentrationPredicate = isConcentrationBuff,
} = {}) {
  const safeContexts = Array.isArray(contexts) ? contexts.filter((context) => context?.actor) : [];
  const allEffects = safeContexts.flatMap((context) =>
    toArray(context.actor.effects).map((effect) => ({ context, effect }))
  );
  const entries = [];
  const actorWarnings = [];

  for (const context of safeContexts) {
    let rawActiveBuffs;
    try {
      rawActiveBuffs = context.actor.getFlag(MODULE_ID, "activeBuffs");
    } catch {
      rawActiveBuffs = null;
    }
    if (rawActiveBuffs != null
      && (typeof rawActiveBuffs !== "object" || Array.isArray(rawActiveBuffs))) {
      actorWarnings.push({
        actorUuid: context.actorUuid,
        actorName: context.actorName,
        warning: "invalidActiveBuffsMap",
        severity: DIAGNOSTIC_SEVERITIES.invalidActiveBuffsMap,
      });
      continue;
    }

    const activeBuffs = getActiveBuffs(context.actor);
    for (const [mapBuffId, rawActiveBuff] of Object.entries(activeBuffs)) {
      if (!rawActiveBuff || typeof rawActiveBuff !== "object" || Array.isArray(rawActiveBuff)) {
        actorWarnings.push({
          actorUuid: context.actorUuid,
          actorName: context.actorName,
          buffId: mapBuffId,
          warning: "invalidActiveBuffEntry",
          severity: DIAGNOSTIC_SEVERITIES.invalidActiveBuffEntry,
        });
        continue;
      }

      const activeBuff = rawActiveBuff;
      const buffId = activeBuff.buffId ?? mapBuffId ?? null;
      const sourceActorUuid = activeBuff.originActorUuid ?? null;
      const sourceItemUuid = activeBuff.originItemUuid ?? activeBuff.itemUuid ?? null;
      const sourceActor = resolveDocument(sourceActorUuid, resolveUuid);
      const sourceItem = resolveDocument(sourceItemUuid, resolveUuid);
      const matchingEffects = allEffects
        .filter(({ effect }) => effectMatchesBuff(effect, context, buffId));
      const activeIndicators = matchingEffects
        .filter(({ effect }) => getEffectModuleFlag(effect).indicator === true
          || effect?.statuses?.has?.("bot-active") === true);
      const targetIndicators = matchingEffects
        .filter(({ effect }) => getEffectModuleFlag(effect).targetIndicator === true);
      const storedTargetIndicators = matchingEffects
        .filter(({ effect }) => getEffectModuleFlag(effect).storedTargetIndicator === true);
      const mechanicalEffects = matchingEffects
        .filter(({ effect }) => getEffectModuleFlag(effect).mechanicalBuff === true);
      const linkedStatuses = matchingEffects
        .filter(({ effect }) => getEffectModuleFlag(effect).linkedStatus === true);
      const concentrationExpected = Boolean(concentrationPredicate?.(activeBuff));
      const concentrationEffect = concentrationExpected
        ? findConcentration?.(activeBuff, context.actor) ?? null
        : null;
      const indicators = {
        active: activeIndicators.map(({ effect }) => effect.name ?? effect.id ?? "indicator"),
        target: targetIndicators.map(({ context: targetContext, effect }) =>
          `${targetContext.actorName ?? targetContext.actorUuid}: ${effect.name ?? effect.id ?? "indicator"}`
        ),
        storedTarget: storedTargetIndicators.map(({ context: targetContext, effect }) =>
          `${targetContext.actorName ?? targetContext.actorUuid}: ${effect.name ?? effect.id ?? "indicator"}`
        ),
        mechanical: mechanicalEffects.map(({ effect }) => effect.name ?? effect.id ?? "effect"),
      };
      const statusDetails = linkedStatuses.map(({ context: statusContext, effect }) => ({
        actor: statusContext.actorName ?? statusContext.actorUuid,
        statusId: getEffectModuleFlag(effect).statusId ?? [...(effect.statuses ?? [])][0] ?? null,
        name: effect.name ?? null,
      }));
      const readableBuffName = activeBuff.itemName ?? activeBuff.name ?? sourceItem?.name ?? null;
      const configuredStackingMode = String(activeBuff?.stackingMode ?? "").trim() || null;
      const stackingMode = getStackingMode(activeBuff);
      const stackingKey = getStackingKey(activeBuff);
      const issues = buildDiagnosticIssues({
        activeBuff,
        explicitBuffId: activeBuff.buffId,
        buffName: readableBuffName,
        sourceActor,
        sourceItem,
        stackingMode,
        stackingKey,
        indicators,
        activeIndicatorEffects: activeIndicators.map(({ effect }) => effect),
        linkedStatuses,
        concentrationExpected,
        concentrationEffect,
      });
      const warnings = issues.map((issue) => issue.code);

      entries.push({
        carrier: {
          actorName: context.actorName ?? context.actorUuid ?? "Unknown actor",
          actorUuid: context.actorUuid,
          tokenNames: [...context.tokenNames],
          tokenUuids: [...context.tokenUuids],
          actorLink: context.actorLink,
          synthetic: context.synthetic,
        },
        buffName: readableBuffName ?? buffId ?? "Unknown buff",
        buffId,
        sourceActor: {
          name: sourceActor?.name ?? activeBuff.originTokenName ?? null,
          uuid: sourceActorUuid,
        },
        sourceItem: {
          name: sourceItem?.name ?? activeBuff.itemName ?? null,
          uuid: sourceItemUuid,
        },
        configuredStackingMode,
        stackingMode,
        stackingKey,
        triggerType: activeBuff.type ?? null,
        concentration: {
          expected: concentrationExpected,
          linked: Boolean(concentrationEffect),
          effectName: concentrationEffect?.name ?? null,
        },
        linkedStatuses: statusDetails,
        indicators,
        duration: {
          rounds: Number.isFinite(Number(activeBuff?.duration?.rounds))
            ? Number(activeBuff.duration.rounds)
            : null,
          appliedAt: activeBuff.appliedAt ?? null,
          summary: formatDuration(activeBuff),
        },
        warnings,
        issues,
      });
    }
  }

  const noStackGroups = new Map();
  for (const entry of entries) {
    if (entry.stackingMode !== "noStack" || !entry.stackingKey) continue;
    const carrierKey = entry.carrier.tokenUuids[0] ?? entry.carrier.actorUuid ?? entry.carrier.actorName;
    const groupKey = `${carrierKey}|${entry.stackingKey}`;
    const group = noStackGroups.get(groupKey) ?? [];
    group.push(entry);
    noStackGroups.set(groupKey, group);
  }
  for (const group of noStackGroups.values()) {
    if (group.length < 2) continue;
    for (const entry of group) {
      if (!entry.warnings.includes("duplicateNoStack")) entry.warnings.push("duplicateNoStack");
      if (!entry.issues.some((issue) => issue.code === "duplicateNoStack")) {
        entry.issues.push({
          code: "duplicateNoStack",
          severity: DIAGNOSTIC_SEVERITIES.duplicateNoStack,
        });
      }
    }
  }

  entries.sort((left, right) =>
    String(left.carrier.actorName).localeCompare(String(right.carrier.actorName))
      || String(left.buffName).localeCompare(String(right.buffName))
      || String(left.buffId).localeCompare(String(right.buffId))
  );
  return {
    generatedAt: new Date().toISOString(),
    sceneName: globalThis.canvas?.scene?.name ?? null,
    actorCount: safeContexts.length,
    buffCount: entries.length,
    warningCount: entries.reduce((total, entry) => total + entry.warnings.length, actorWarnings.length),
    actorWarnings,
    entries,
  };
}

function normalizeDiagnosticSearchText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function getDiagnosticEntrySearchText(entry) {
  return normalizeDiagnosticSearchText([
    entry?.carrier?.actorName,
    entry?.carrier?.actorUuid,
    ...(entry?.carrier?.tokenNames ?? []),
    ...(entry?.carrier?.tokenUuids ?? []),
    entry?.buffName,
    entry?.buffId,
    entry?.sourceActor?.name,
    entry?.sourceActor?.uuid,
    entry?.sourceItem?.name,
    entry?.sourceItem?.uuid,
    entry?.triggerType,
    entry?.stackingMode,
    entry?.stackingKey,
  ].filter(Boolean).join(" "));
}

function getActorWarningSearchText(warning) {
  return normalizeDiagnosticSearchText([
    warning?.actorName,
    warning?.actorUuid,
    warning?.buffId,
    warning?.warning,
  ].filter(Boolean).join(" "));
}

export function filterActiveBuffDiagnosticReport(report, {
  query = "",
  warningsOnly = false,
} = {}) {
  const normalizedQuery = normalizeDiagnosticSearchText(query);
  const entries = Array.isArray(report?.entries) ? report.entries : [];
  const actorWarnings = Array.isArray(report?.actorWarnings) ? report.actorWarnings : [];
  const matchesQuery = (searchText) => !normalizedQuery || searchText.includes(normalizedQuery);
  const visibleEntries = entries.filter((entry) =>
    (!warningsOnly || (entry?.warnings?.length ?? 0) > 0)
    && matchesQuery(getDiagnosticEntrySearchText(entry))
  );
  const visibleActorWarnings = actorWarnings.filter((warning) =>
    matchesQuery(getActorWarningSearchText(warning))
  );
  const visibleActorKeys = new Set([
    ...visibleEntries.map((entry) => entry?.carrier?.actorUuid).filter(Boolean),
    ...visibleActorWarnings.map((warning) => warning?.actorUuid).filter(Boolean),
  ]);
  const inconsistentCount = entries.filter((entry) => (entry?.warnings?.length ?? 0) > 0).length;
  const filteredReport = {
    ...(report ?? {}),
    actorCount: visibleActorKeys.size,
    buffCount: visibleEntries.length,
    warningCount: visibleEntries.reduce(
      (total, entry) => total + (entry?.warnings?.length ?? 0),
      visibleActorWarnings.length,
    ),
    actorWarnings: visibleActorWarnings,
    entries: visibleEntries,
    filters: {
      query: String(query ?? ""),
      warningsOnly: warningsOnly === true,
    },
    totalBuffCount: entries.length,
    visibleBuffCount: visibleEntries.length,
    inconsistentBuffCount: inconsistentCount,
  };
  return {
    report: filteredReport,
    entries: visibleEntries,
    actorWarnings: visibleActorWarnings,
    totalCount: entries.length,
    visibleCount: visibleEntries.length,
    inconsistentCount,
  };
}

function resolveCarrierToken(entry, resolver, tokenLookup) {
  for (const tokenUuid of entry?.carrier?.tokenUuids ?? []) {
    const tokenDocument = resolveDocument(tokenUuid, resolver);
    if (tokenDocument) return tokenDocument;
    const tokenId = String(tokenUuid ?? "").split(".").at(-1);
    const token = tokenId && typeof tokenLookup === "function" ? tokenLookup(tokenId) : null;
    if (token) return token?.document ?? token;
  }
  return null;
}

export function getActiveBuffDiagnosticNavigation(entry, {
  resolveUuid = globalThis.fromUuidSync,
  tokenLookup = (tokenId) => globalThis.canvas?.tokens?.get?.(tokenId) ?? null,
} = {}) {
  const carrierToken = resolveCarrierToken(entry, resolveUuid, tokenLookup);
  const carrierActor = resolveDocument(entry?.carrier?.actorUuid, resolveUuid)
    ?? carrierToken?.actor
    ?? carrierToken?.object?.actor
    ?? null;
  const sourceActor = resolveDocument(entry?.sourceActor?.uuid, resolveUuid);
  const sourceItem = resolveDocument(entry?.sourceItem?.uuid, resolveUuid);
  return {
    carrierActorAvailable: Boolean(carrierActor),
    carrierTokenAvailable: Boolean(carrierToken),
    sourceActorAvailable: Boolean(sourceActor),
    sourceItemAvailable: Boolean(sourceItem),
    buffIdAvailable: Boolean(String(entry?.buffId ?? "").trim()),
    summaryAvailable: Boolean(entry),
  };
}

export function buildActiveBuffDiagnosticEntrySummary(entry) {
  if (!entry) return "";
  const tokenNames = entry?.carrier?.tokenNames?.filter(Boolean) ?? [];
  const carrier = `${entry?.carrier?.actorName ?? entry?.carrier?.actorUuid ?? "Unknown actor"}${tokenNames.length
    ? ` [${tokenNames.join(", ")}]`
    : ""}`;
  const source = entry?.sourceActor?.name
    ?? entry?.sourceActor?.uuid
    ?? "unknown source";
  const item = entry?.sourceItem?.name
    ?? entry?.sourceItem?.uuid
    ?? "unknown item";
  const issues = entry?.issues?.length
    ? entry.issues.map((issue) => `${issue.severity}:${issue.code}`).join(", ")
    : (entry?.warnings?.length ? entry.warnings.join(", ") : "none");
  return [
    `${carrier} — ${entry?.buffName ?? "Unknown buff"} (${entry?.buffId ?? "no buffId"})`,
    `source=${source}; item=${item}; trigger=${entry?.triggerType ?? "-"}; stack=${entry?.stackingMode ?? "-"}/${entry?.stackingKey ?? "-"}`,
    `issues=${issues}`,
  ].join("\n");
}

export function buildActiveBuffDiagnosticText(report) {
  const lines = [
    `Active Buff Diagnostics${report?.sceneName ? ` — ${report.sceneName}` : ""}`,
    `Actors: ${report?.actorCount ?? 0}; Buffs: ${report?.buffCount ?? 0}; Warnings: ${report?.warningCount ?? 0}`,
  ];
  for (const entry of report?.entries ?? []) {
    const tokens = entry.carrier.tokenNames.length ? ` [${entry.carrier.tokenNames.join(", ")}]` : "";
    lines.push("");
    lines.push(`${entry.carrier.actorName}${tokens} — ${entry.buffName}`);
    lines.push(`buffId=${entry.buffId ?? "-"}; stack=${entry.stackingMode}/${entry.stackingKey ?? "-"}; trigger=${entry.triggerType ?? "-"}`);
    lines.push(`source=${entry.sourceActor.name ?? entry.sourceActor.uuid ?? "-"}; item=${entry.sourceItem.name ?? entry.sourceItem.uuid ?? "-"}`);
    lines.push(`concentration=${entry.concentration.expected ? (entry.concentration.linked ? "linked" : "missing") : "no"}; statuses=${entry.linkedStatuses.map((status) => status.statusId ?? status.name).filter(Boolean).join(", ") || "-"}`);
    lines.push(`indicators=active:${entry.indicators.active.length}, target:${entry.indicators.target.length}, stored:${entry.indicators.storedTarget.length}, mechanical:${entry.indicators.mechanical.length}; duration=${entry.duration.summary || "-"}`);
    if (entry.warnings.length) lines.push(`warnings=${entry.warnings.join(", ")}`);
    if (entry.issues?.length) {
      lines.push(`issues=${entry.issues.map((issue) => `${issue.severity}:${issue.code}`).join(", ")}`);
    }
  }
  for (const warning of report?.actorWarnings ?? []) {
    lines.push("");
    lines.push(`${warning.actorName ?? warning.actorUuid ?? "Unknown actor"} — warning=${warning.warning}${warning.buffId ? `; buffId=${warning.buffId}` : ""}`);
  }
  return lines.join("\n");
}

export class ActiveBuffDiagnosticsApplication extends FormApplicationBase {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "bot-active-buff-diagnostics",
      title: game.i18n.localize("BOT.diagnostics.title"),
      template: `modules/${MODULE_ID}/templates/active-buff-diagnostics.html`,
      width: 980,
      height: 680,
      resizable: true,
      closeOnSubmit: false,
      submitOnChange: false,
    });
  }

  getData() {
    const contexts = collectActiveSceneBuffActorContexts();
    const report = collectActiveBuffDiagnostics(contexts);
    this._diagnosticReport = report;
    const filterState = this._filterState ?? { query: "", warningsOnly: false };
    const filtered = filterActiveBuffDiagnosticReport(report, filterState);
    this._filteredDiagnosticReport = filtered.report;
    const warningLabel = (code) => game.i18n.localize(`BOT.diagnostics.warning.${code}`);
    return {
      report,
      hasEntries: report.entries.length > 0,
      hasActorWarnings: report.actorWarnings.length > 0,
      filterState,
      counts: {
        total: filtered.totalCount,
        visible: filtered.visibleCount,
        inconsistent: filtered.inconsistentCount,
      },
      rows: report.entries.map((entry, diagnosticIndex) => {
        const navigation = getActiveBuffDiagnosticNavigation(entry);
        return {
          ...entry,
          diagnosticIndex,
          navigation,
          carrierLabel: [
            entry.carrier.actorName,
            entry.carrier.tokenNames.length ? `(${entry.carrier.tokenNames.join(", ")})` : null,
            entry.carrier.synthetic ? game.i18n.localize("BOT.diagnostics.synthetic") : null,
          ].filter(Boolean).join(" "),
          sourceLabel: entry.sourceActor.name ?? entry.sourceActor.uuid ?? "—",
          itemLabel: entry.sourceItem.name ?? entry.sourceItem.uuid ?? "—",
          stackingLabel: `${entry.configuredStackingMode && entry.configuredStackingMode !== entry.stackingMode
            ? `${entry.configuredStackingMode} → ${entry.stackingMode}`
            : entry.stackingMode} / ${entry.stackingKey ?? "—"}`,
          concentrationLabel: entry.concentration.expected
            ? game.i18n.localize(entry.concentration.linked
              ? "BOT.diagnostics.concentrationLinked"
              : "BOT.diagnostics.concentrationMissing")
            : game.i18n.localize("BOT.diagnostics.no"),
          statusesLabel: entry.linkedStatuses
            .map((status) => status.statusId ?? status.name)
            .filter(Boolean)
            .join(", ") || "—",
          indicatorsLabel: game.i18n.format("BOT.diagnostics.indicatorCounts", {
            active: entry.indicators.active.length,
            target: entry.indicators.target.length,
            stored: entry.indicators.storedTarget.length,
            mechanical: entry.indicators.mechanical.length,
          }),
          durationLabel: entry.duration.summary || "—",
          warningDetails: (entry.issues ?? entry.warnings.map((code) => ({
            code,
            severity: DIAGNOSTIC_SEVERITIES[code] ?? "warning",
          }))).map((issue) => ({
            ...issue,
            label: warningLabel(issue.code),
            severityLabel: game.i18n.localize(`BOT.diagnostics.severity.${issue.severity}`),
          })),
        };
      }),
      actorWarnings: report.actorWarnings.map((warning, diagnosticIndex) => ({
        ...warning,
        diagnosticIndex,
        label: warningLabel(warning.warning),
        severityLabel: game.i18n.localize(`BOT.diagnostics.severity.${warning.severity ?? "warning"}`),
      })),
    };
  }

  activateListeners(html) {
    super.activateListeners(html);
    const root = html?.[0] ?? html;
    root?.querySelector?.('[data-action="refresh"]')?.addEventListener("click", () => this.render(false));
    root?.querySelector?.('[data-action="copy-text"]')?.addEventListener("click", () => this._copyReport("text"));
    root?.querySelector?.('[data-action="copy-json"]')?.addEventListener("click", () => this._copyReport("json"));
    for (const button of root?.querySelectorAll?.("[data-row-action]") ?? []) {
      button.addEventListener("click", () => {
        const entry = this._diagnosticReport?.entries?.[Number(button.dataset.diagnosticIndex)];
        this._handleRowAction(button.dataset.rowAction, entry);
      });
    }
    const searchInput = root?.querySelector?.('[data-filter="search"]');
    const warningsOnlyInput = root?.querySelector?.('[data-filter="warnings-only"]');
    const applyFilters = () => {
      this._filterState = {
        query: searchInput?.value ?? "",
        warningsOnly: warningsOnlyInput?.checked === true,
      };
      const filtered = filterActiveBuffDiagnosticReport(this._diagnosticReport, this._filterState);
      this._filteredDiagnosticReport = filtered.report;
      const visibleEntries = new Set(filtered.entries);
      const visibleActorWarnings = new Set(filtered.actorWarnings);

      for (const row of root?.querySelectorAll?.("tr[data-diagnostic-index]") ?? []) {
        const entry = this._diagnosticReport?.entries?.[Number(row.dataset.diagnosticIndex)];
        row.hidden = !visibleEntries.has(entry);
      }
      for (const row of root?.querySelectorAll?.("[data-actor-warning-index]") ?? []) {
        const warning = this._diagnosticReport?.actorWarnings?.[Number(row.dataset.actorWarningIndex)];
        row.hidden = !visibleActorWarnings.has(warning);
      }

      const table = root?.querySelector?.("[data-diagnostic-table]");
      const noResults = root?.querySelector?.("[data-diagnostic-no-results]");
      const actorWarningsSection = root?.querySelector?.("[data-actor-warnings]");
      if (table) table.hidden = filtered.visibleCount === 0;
      if (noResults) noResults.hidden = filtered.visibleCount !== 0;
      if (actorWarningsSection) actorWarningsSection.hidden = filtered.actorWarnings.length === 0;
      const totalCount = root?.querySelector?.("[data-count-total]");
      const visibleCount = root?.querySelector?.("[data-count-visible]");
      const inconsistentCount = root?.querySelector?.("[data-count-inconsistent]");
      if (totalCount) totalCount.textContent = String(filtered.totalCount);
      if (visibleCount) visibleCount.textContent = String(filtered.visibleCount);
      if (inconsistentCount) inconsistentCount.textContent = String(filtered.inconsistentCount);
    };
    searchInput?.addEventListener("input", applyFilters);
    warningsOnlyInput?.addEventListener("change", applyFilters);
    applyFilters();
  }

  async _copyReport(format) {
    if (!game.user?.isGM) return;
    const report = this._filteredDiagnosticReport
      ?? this._diagnosticReport
      ?? collectActiveBuffDiagnostics(collectActiveSceneBuffActorContexts());
    const content = format === "json"
      ? JSON.stringify(report, null, 2)
      : buildActiveBuffDiagnosticText(report);
    try {
      await this._copyText(content);
      ui.notifications.info(game.i18n.localize("BOT.diagnostics.copied"));
    } catch {
      ui.notifications.error(game.i18n.localize("BOT.diagnostics.copyFailed"));
    }
  }

  async _copyText(content) {
    if (game.clipboard?.copyPlainText) return game.clipboard.copyPlainText(content);
    if (globalThis.navigator?.clipboard?.writeText) {
      return globalThis.navigator.clipboard.writeText(content);
    }
    throw new Error("Clipboard API unavailable");
  }

  _resolveRowTargets(entry) {
    const tokenDocument = resolveCarrierToken(
      entry,
      globalThis.fromUuidSync,
      (tokenId) => canvas?.tokens?.get?.(tokenId) ?? null,
    );
    return {
      carrierToken: tokenDocument,
      carrierActor: resolveDocument(entry?.carrier?.actorUuid, globalThis.fromUuidSync)
        ?? tokenDocument?.actor
        ?? tokenDocument?.object?.actor
        ?? null,
      sourceActor: resolveDocument(entry?.sourceActor?.uuid, globalThis.fromUuidSync),
      sourceItem: resolveDocument(entry?.sourceItem?.uuid, globalThis.fromUuidSync),
    };
  }

  async _handleRowAction(action, entry) {
    if (!game.user?.isGM || !entry) return;
    const targets = this._resolveRowTargets(entry);
    if (action === "open-carrier") {
      targets.carrierActor?.sheet?.render?.(true);
      return;
    }
    if (action === "focus-token") {
      const tokenDocument = targets.carrierToken?.document ?? targets.carrierToken;
      const token = targets.carrierToken?.object
        ?? canvas?.tokens?.get?.(tokenDocument?.id)
        ?? null;
      if (!token) return;
      token.control?.({ releaseOthers: true });
      const center = token.center ?? tokenDocument?.getCenterPoint?.();
      if (center) await canvas?.animatePan?.({ x: center.x, y: center.y });
      return;
    }
    if (action === "open-source-actor") {
      targets.sourceActor?.sheet?.render?.(true);
      return;
    }
    if (action === "open-source-item") {
      targets.sourceItem?.sheet?.render?.(true);
      return;
    }
    if (action === "copy-buff-id") {
      if (!entry.buffId) return;
      await this._copyText(String(entry.buffId));
      ui.notifications.info(game.i18n.localize("BOT.diagnostics.buffIdCopied"));
      return;
    }
    if (action === "copy-summary") {
      await this._copyText(buildActiveBuffDiagnosticEntrySummary(entry));
      ui.notifications.info(game.i18n.localize("BOT.diagnostics.summaryCopied"));
    }
  }

  async _updateObject() {}
}

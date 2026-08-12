import { addDays, parseISO } from "date-fns";
import { resolveTemplateLabel } from "./availability-helpers";
import { isRouteActiveOnDate } from "./route-catalog";
import { effectiveDefaultDriverForDate } from "./person-roster-dates";
import type { AppData, ScheduleSlot, SlotOverrideState, SlotTemplate } from "./types";
import { formatISODate, isWeekdayISO } from "./week-utils";

const OVERRIDE_RETENTION_DAYS = 120;

function slotDateFromId(slotId: string): string {
  const i = slotId.indexOf("__");
  return i === -1 ? slotId : slotId.slice(0, i);
}

function templateIdFromSlotId(slotId: string): string {
  const i = slotId.indexOf("__");
  return i === -1 ? slotId : slotId.slice(i + 2);
}

function snapshotSlot(slot: ScheduleSlot, overrides: Record<string, SlotOverrideState>): void {
  overrides[slot.id] = {
    driverId: slot.driverId,
    isGap: slot.isGap,
    gapReason: slot.gapReason,
    absenceType: slot.absenceType,
    gapForDriverId: slot.gapForDriverId ?? null,
  };
}

function dataWithTemplates(data: AppData, templates: SlotTemplate[]): AppData {
  return { ...data, settings: { ...data.settings, slotTemplates: templates } };
}

function buildSlotFromTemplate(
  data: AppData,
  date: string,
  template: SlotTemplate
): ScheduleSlot | null {
  const def = data.settings.routeDefinitions.find((d) => d.id === template.routeDefinitionId);
  if (def && !isRouteActiveOnDate(def, date)) return null;
  const { label, routeType } = resolveTemplateLabel(template, data.settings.routeDefinitions);
  const driverId = effectiveDefaultDriverForDate(data, date, template);
  return {
    id: `${date}__${template.id}`,
    date,
    routeType,
    label,
    driverId,
    isGap: false,
    isOfficeSlot: false,
    gapForDriverId: null,
  };
}

/**
 * Freeze schedule grid history before `effectiveDate` by writing slot overrides from the
 * previous template defaults and any slots already loaded for the current week.
 */
export function preserveScheduleBeforeEffectiveDate(
  data: AppData,
  effectiveDate: string,
  previousTemplates: SlotTemplate[]
): void {
  const overrides = { ...(data.slotOverrides ?? {}) };
  const prevData = dataWithTemplates(data, previousTemplates);

  for (const slot of data.slots) {
    if (slot.date >= effectiveDate) continue;
    snapshotSlot(slot, overrides);
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - OVERRIDE_RETENTION_DAYS);
  const cutoffISO = formatISODate(cutoff);
  let d = parseISO(cutoffISO < effectiveDate ? cutoffISO : effectiveDate);
  const end = parseISO(effectiveDate);

  while (d < end) {
    const dateISO = formatISODate(d);
    if (isWeekdayISO(dateISO)) {
      for (const t of previousTemplates) {
        const slotId = `${dateISO}__${t.id}`;
        if (overrides[slotId]) continue;
        const slot = buildSlotFromTemplate(prevData, dateISO, t);
        if (slot) snapshotSlot(slot, overrides);
      }
    }
    d = addDays(d, 1);
  }

  data.slotOverrides = Object.keys(overrides).length ? overrides : undefined;
}

/** Drop overrides on/after `effectiveDate` that only mirrored the previous template defaults. */
export function clearOverridesMatchingOldDefaultsOnOrAfter(
  data: AppData,
  effectiveDate: string,
  previousTemplates: SlotTemplate[]
): void {
  if (!data.slotOverrides) return;
  const overrides = { ...data.slotOverrides };
  const prevData = dataWithTemplates(data, previousTemplates);

  for (const [slotId, o] of Object.entries(overrides)) {
    const date = slotDateFromId(slotId);
    if (date < effectiveDate) continue;
    const tid = templateIdFromSlotId(slotId);
    const t = previousTemplates.find((x) => x.id === tid);
    if (!t) continue;
    const oldDef = effectiveDefaultDriverForDate(prevData, date, t);
    const matchesOld =
      !o.isGap &&
      o.driverId === oldDef &&
      (o.gapForDriverId == null || o.gapForDriverId === undefined) &&
      !o.gapReason;
    if (matchesOld) delete overrides[slotId];
  }

  data.slotOverrides = Object.keys(overrides).length ? overrides : undefined;
}

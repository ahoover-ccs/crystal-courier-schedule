import { resolveTemplateLabel } from "./availability-helpers";
import { effectiveDefaultDriverForDate } from "./person-roster-dates";
import type { AppData, ScheduleSlot } from "./types";

/** Reconstruct Mon–Fri slots for one calendar day from templates + saved overrides. */
export function slotsForDate(data: AppData, date: string): ScheduleSlot[] {
  const { slotTemplates, routeDefinitions } = data.settings;
  const overrides = data.slotOverrides ?? {};
  return slotTemplates.map((t) => {
    const id = `${date}__${t.id}`;
    const { label, routeType, isOfficeRoute } = resolveTemplateLabel(t, routeDefinitions);
    const def = effectiveDefaultDriverForDate(data, date, t);
    const base: ScheduleSlot = {
      id,
      date,
      routeType,
      label,
      driverId: def,
      isGap: false,
      isOfficeSlot: isOfficeRoute === true,
      gapForDriverId: null,
    };
    const o = overrides[id];
    if (!o) return base;
    return {
      ...base,
      driverId: o.driverId,
      isGap: o.isGap,
      gapReason: o.gapReason,
      gapForDriverId: o.gapForDriverId ?? null,
      absenceType: o.absenceType,
    };
  });
}

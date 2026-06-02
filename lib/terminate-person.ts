import type { AppData, WeekdayKey } from "./types";
import { WEEKDAY_KEYS } from "./types";

function slotDateFromId(slotId: string): string {
  const i = slotId.indexOf("__");
  return i === -1 ? slotId : slotId.slice(0, i);
}

/** Terminate a person: settings apply immediately; schedule/overrides only on/after `effectiveDate`. */
export function terminatePersonInData(
  data: AppData,
  personId: string,
  effectiveDate: string
): void {
  const person = data.people.find((p) => p.id === personId);
  if (!person) return;

  person.terminatedAt = effectiveDate;

  data.settings.fillPriorityIds = data.settings.fillPriorityIds.filter((x) => x !== personId);
  data.settings.slotTemplates = data.settings.slotTemplates.map((t) => {
    const days = { ...t.defaultDriversByDay } as Record<WeekdayKey, string | null>;
    for (const d of WEEKDAY_KEYS) {
      if (days[d] === personId) days[d] = null;
    }
    return { ...t, defaultDriversByDay: days };
  });

  if (data.slotOverrides) {
    const next = { ...data.slotOverrides };
    for (const [slotId, o] of Object.entries(next)) {
      const date = slotDateFromId(slotId);
      if (date < effectiveDate) continue;
      if (o.driverId !== personId && o.gapForDriverId !== personId) continue;
      const row = { ...o };
      if (row.driverId === personId) {
        row.driverId = null;
        row.isGap = true;
      }
      if (row.gapForDriverId === personId) {
        row.gapForDriverId = null;
      }
      next[slotId] = row;
    }
    data.slotOverrides = Object.keys(next).length ? next : undefined;
  }

  data.slots = data.slots.map((s) => {
    if (s.date < effectiveDate) return s;
    if (s.driverId !== personId && s.gapForDriverId !== personId) return s;
    if (s.driverId === personId) {
      return {
        ...s,
        driverId: null,
        isGap: true,
        gapReason: s.gapReason,
        gapForDriverId: s.gapForDriverId === personId ? null : s.gapForDriverId,
      };
    }
    return { ...s, gapForDriverId: null };
  });

  data.timeOffRequests = data.timeOffRequests.filter((r) => {
    if (r.driverId !== personId) return true;
    return r.date < effectiveDate;
  });

  data.openShifts = data.openShifts.map((o) => {
    if (o.claimedById === personId) {
      return { ...o, claimedById: null, claimedByName: null, status: "open" as const };
    }
    if (o.pendingClaimDriverId === personId) {
      return {
        ...o,
        pendingClaimDriverId: null,
        pendingClaimDriverName: null,
        pendingClaimAt: null,
      };
    }
    return o;
  });

  if (data.nonDefaultShiftReminders) {
    data.nonDefaultShiftReminders = data.nonDefaultShiftReminders.filter(
      (r) => !r.key.includes(personId)
    );
    if (!data.nonDefaultShiftReminders.length) {
      data.nonDefaultShiftReminders = undefined;
    }
  }
}

/** Clear template default references to unknown or terminated people (settings save safety). */
export function sanitizeTemplateDefaults(data: AppData): void {
  const activeIds = new Set(data.people.filter((p) => !p.terminatedAt).map((p) => p.id));
  data.settings.slotTemplates = data.settings.slotTemplates.map((t) => {
    const days = { ...t.defaultDriversByDay };
    for (const d of WEEKDAY_KEYS) {
      const id = days[d];
      if (id && !activeIds.has(id)) days[d] = null;
    }
    return { ...t, defaultDriversByDay: days };
  });
  data.settings.fillPriorityIds = data.settings.fillPriorityIds.filter((id) => activeIds.has(id));
}

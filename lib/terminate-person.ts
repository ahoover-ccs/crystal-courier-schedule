import type { AppData } from "./types";
import { WEEKDAY_KEYS } from "./types";
import { retainKnownVehicleDayDefaults } from "./vehicles";
import { appendActivity } from "./activity-log";

function slotDateFromId(slotId: string): string {
  const i = slotId.indexOf("__");
  return i === -1 ? slotId : slotId.slice(0, i);
}

/**
 * Terminate a person effective `effectiveDate` (that date and after).
 * Weekday route defaults stay so weeks before that date still rebuild with this person.
 * Fill-in priority and assignments on/after the date are cleared now.
 */
export function terminatePersonInData(
  data: AppData,
  personId: string,
  effectiveDate: string
): void {
  const person = data.people.find((p) => p.id === personId);
  if (!person) return;

  person.terminatedAt = effectiveDate;

  data.settings.fillPriorityIds = data.settings.fillPriorityIds.filter((x) => x !== personId);

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

  appendActivity(data, {
    category: "roster",
    summary: `${person.name} terminated effective ${effectiveDate}`,
  });
}

/**
 * Drop template defaults that point at deleted people.
 * Terminated people stay on weekday defaults so dates before `terminatedAt` still rebuild.
 */
export function sanitizeTemplateDefaults(data: AppData): void {
  const knownIds = new Set(data.people.map((p) => p.id));
  const activeIds = new Set(data.people.filter((p) => !p.terminatedAt).map((p) => p.id));
  data.settings.slotTemplates = data.settings.slotTemplates.map((t) => {
    const days = { ...t.defaultDriversByDay };
    for (const d of WEEKDAY_KEYS) {
      const id = days[d];
      if (id && !knownIds.has(id)) days[d] = null;
    }
    const vehicleIds = new Set((data.settings.vehicles ?? []).map((v) => v.id));
    return {
      ...t,
      defaultDriversByDay: days,
      defaultVehiclesByDay: retainKnownVehicleDayDefaults(t.defaultVehiclesByDay, vehicleIds),
    };
  });
  data.settings.fillPriorityIds = data.settings.fillPriorityIds.filter((id) => activeIds.has(id));
}

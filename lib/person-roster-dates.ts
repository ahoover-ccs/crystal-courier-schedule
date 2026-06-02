import { isPersonEffectiveOnDate } from "./active-people";
import { defaultDriverForTemplateDate } from "./availability-helpers";
import type { AppData, Person, ScheduleSlot, SlotTemplate } from "./types";

/** Template default driver only when that person is effective on `date`. */
export function effectiveDefaultDriverForDate(
  data: AppData,
  date: string,
  template: SlotTemplate
): string | null {
  const raw = defaultDriverForTemplateDate(date, template);
  if (!raw) return null;
  const person = data.people.find((p) => p.id === raw);
  if (!person || !isPersonEffectiveOnDate(person, date)) return null;
  return raw;
}

/** Remove a person from slots/overrides strictly before their hire date. */
export function clearPersonFromScheduleBeforeDate(
  data: AppData,
  personId: string,
  hiredAt: string
): void {
  if (data.slotOverrides) {
    const next = { ...data.slotOverrides };
    for (const [slotId, o] of Object.entries(next)) {
      const sep = slotId.indexOf("__");
      const date = sep === -1 ? slotId : slotId.slice(0, sep);
      if (date >= hiredAt) continue;
      if (o.driverId !== personId && o.gapForDriverId !== personId) continue;
      const row = { ...o };
      if (row.driverId === personId) {
        row.driverId = null;
        row.isGap = false;
        row.gapReason = undefined;
        row.absenceType = undefined;
      }
      if (row.gapForDriverId === personId) {
        row.gapForDriverId = null;
        row.gapReason = undefined;
        row.absenceType = undefined;
      }
      if (!row.driverId && !row.isGap && !row.gapForDriverId) {
        delete next[slotId];
      } else {
        next[slotId] = row;
      }
    }
    data.slotOverrides = Object.keys(next).length ? next : undefined;
  }

  data.slots = data.slots.map((s) => {
    if (s.date >= hiredAt) return s;
    if (s.driverId !== personId && s.gapForDriverId !== personId) return s;
    if (s.driverId === personId) {
      return {
        ...s,
        driverId: null,
        isGap: false,
        gapReason: undefined,
        absenceType: undefined,
        gapForDriverId: s.gapForDriverId === personId ? null : s.gapForDriverId,
      };
    }
    return {
      ...s,
      gapForDriverId: null,
      gapReason: undefined,
      absenceType: undefined,
    };
  });
}

/** Strip assignments/gaps for people outside their hire/termination window. */
export function applyRosterDateRulesToSlots(
  slots: ScheduleSlot[],
  people: Person[]
): ScheduleSlot[] {
  const byId = new Map(people.map((p) => [p.id, p]));
  return slots.map((s) => {
    let slot = s;
    if (slot.driverId) {
      const p = byId.get(slot.driverId);
      if (p && !isPersonEffectiveOnDate(p, slot.date)) {
        slot = {
          ...slot,
          driverId: null,
          isGap: false,
          gapReason: undefined,
          absenceType: undefined,
        };
      }
    }
    if (slot.gapForDriverId) {
      const p = byId.get(slot.gapForDriverId);
      if (p && !isPersonEffectiveOnDate(p, slot.date)) {
        slot = {
          ...slot,
          gapForDriverId: null,
          gapReason: undefined,
          absenceType: undefined,
        };
      }
    }
    return slot;
  });
}

import { isActivePerson } from "./active-people";
import { effectiveDefaultDriverForDate } from "./person-roster-dates";
import { refreshSlotOverrideFromSlot, templateIdFromSlotId } from "./slot-overrides";
import { canAssignDriver } from "./suggestions";
import type { AppData } from "./types";
import { weekWorkdaysFromWeekStart } from "./week-utils";

/** Fill slots that are empty and not time-off gaps, using route default drivers (respects weekday toggles). */
export function applyDefaultDriversToEmptySlots(data: AppData): {
  data: AppData;
  errors: string[];
} {
  const weekDays = weekWorkdaysFromWeekStart(data.settings.defaultWeekStart);
  const errors: string[] = [];
  const slots = data.slots.map((s) => ({ ...s }));
  /** Single mutable copy so `refreshSlotOverrideFromSlot` updates `slotOverrides` on the returned object. */
  const next: AppData = { ...data, slots };

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    if (!weekDays.includes(slot.date)) continue;
    if (slot.isGap) continue;
    if (slot.gapForDriverId != null) continue;
    if (slot.driverId !== null) continue;

    const tid = templateIdFromSlotId(slot.id);
    const t = data.settings.slotTemplates.find((x) => x.id === tid);
    const def = t ? effectiveDefaultDriverForDate(data, slot.date, t) : null;
    if (!def) continue;
    const defPerson = data.people.find((p) => p.id === def);
    if (!defPerson || !isActivePerson(defPerson)) continue;

    const check = canAssignDriver(next, slot.id, def);
    if (!check.ok) {
      errors.push(`${slot.label} (${slot.date}): ${check.reason}`);
      continue;
    }
    slots[i] = { ...slot, driverId: def };
    refreshSlotOverrideFromSlot(next, slots[i]);
  }

  return { data: next, errors };
}

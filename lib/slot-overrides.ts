import { defaultDriverForTemplateDate } from "./availability-helpers";
import type { AppData, ScheduleSlot, SlotOverrideState } from "./types";

export function templateIdFromSlotId(slotId: string): string {
  const i = slotId.indexOf("__");
  return i === -1 ? slotId : slotId.slice(i + 2);
}

export function mergeSlotOverridesIntoSlots(
  slots: ScheduleSlot[],
  overrides: Record<string, SlotOverrideState> | undefined
): ScheduleSlot[] {
  if (!overrides || Object.keys(overrides).length === 0) return slots;
  return slots.map((s) => {
    const o = overrides[s.id];
    if (!o) return s;
    return {
      ...s,
      driverId: o.driverId,
      isGap: o.isGap,
      gapReason: o.gapReason,
      gapForDriverId: o.gapForDriverId ?? null,
    };
  });
}

/**
 * Keeps `slotOverrides` in sync with the canonical slot row. Removes the entry when the slot
 * matches a fresh template default (no gap), so new weeks can follow Settings defaults until
 * someone changes the cell again.
 */
export function refreshSlotOverrideFromSlot(data: AppData, slot: ScheduleSlot): void {
  const t = data.settings.slotTemplates.find((x) => x.id === templateIdFromSlotId(slot.id));
  const def = t ? defaultDriverForTemplateDate(slot.date, t) : null;

  const isTimeOffGap =
    slot.isGap &&
    Boolean(slot.gapReason?.includes("Time off")) &&
    slot.gapForDriverId != null;

  const matchesNaiveTemplateDefault =
    !isTimeOffGap &&
    !slot.isGap &&
    slot.driverId === def &&
    (slot.gapForDriverId == null || slot.gapForDriverId === undefined) &&
    !slot.gapReason;

  if (matchesNaiveTemplateDefault) {
    if (!data.slotOverrides || !(slot.id in data.slotOverrides)) return;
    const next = { ...data.slotOverrides };
    delete next[slot.id];
    data.slotOverrides = Object.keys(next).length ? next : undefined;
    return;
  }

  const row: SlotOverrideState = {
    driverId: slot.driverId,
    isGap: slot.isGap,
    gapReason: slot.gapReason,
    gapForDriverId: slot.gapForDriverId ?? null,
  };
  data.slotOverrides = { ...(data.slotOverrides ?? {}), [slot.id]: row };
}

export function refreshSlotOverridesForSlots(data: AppData, slots: ScheduleSlot[]): void {
  for (const s of slots) {
    refreshSlotOverrideFromSlot(data, s);
  }
}

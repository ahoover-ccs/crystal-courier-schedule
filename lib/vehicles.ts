import { dateToWeekdayKey, slotTemplateForSlot } from "./availability-helpers";
import { isSpecialRouteSlotId } from "./special-routes";
import type { AppData, ScheduleSlot, SlotTemplate, Vehicle, WeekdayKey } from "./types";
import { WEEKDAY_KEYS } from "./types";
import { conflictsWithDayAssignments } from "./route-windows";

export function emptyWeekdayIds(): Record<WeekdayKey, string | null> {
  return { mon: null, tue: null, wed: null, thu: null, fri: null };
}

export function normalizeDefaultVehiclesByDay(t: {
  defaultVehiclesByDay?: Partial<Record<WeekdayKey, string | null>>;
  defaultVehicleId?: string | null;
}): Record<WeekdayKey, string | null> {
  const out = emptyWeekdayIds();
  if (t.defaultVehiclesByDay) {
    for (const d of WEEKDAY_KEYS) {
      out[d] = t.defaultVehiclesByDay[d] ?? null;
    }
    return out;
  }
  const one = t.defaultVehicleId ?? null;
  for (const d of WEEKDAY_KEYS) out[d] = one;
  return out;
}

export function retainKnownVehicleDayDefaults(
  byDay: Record<WeekdayKey, string | null> | undefined,
  vehicleIds: Set<string>
): Record<WeekdayKey, string | null> {
  const next = normalizeDefaultVehiclesByDay({ defaultVehiclesByDay: byDay });
  for (const d of WEEKDAY_KEYS) {
    if (next[d] && !vehicleIds.has(next[d] as string)) next[d] = null;
  }
  return next;
}

export function vehiclesInSettings(data: AppData): Vehicle[] {
  return data.settings.vehicles ?? [];
}

export function activeVehicles(data: AppData): Vehicle[] {
  return vehiclesInSettings(data)
    .filter((v) => v.id && v.name.trim())
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

export function vehicleById(data: AppData, id: string | null | undefined): Vehicle | undefined {
  if (!id) return undefined;
  return vehiclesInSettings(data).find((v) => v.id === id);
}

export function vehicleDisplayName(v: Vehicle): string {
  const plate = v.plate?.trim();
  return plate ? `${v.name.trim()} (${plate})` : v.name.trim();
}

export function defaultVehicleIdForTemplate(
  template: SlotTemplate | undefined,
  date: string
): string | null {
  if (!template) return null;
  const day = dateToWeekdayKey(date);
  if (!day) return null;
  const byDay = normalizeDefaultVehiclesByDay(template);
  return byDay[day] ?? null;
}

export function isNonDefaultVehicleForSlot(
  data: AppData,
  slot: ScheduleSlot,
  template?: SlotTemplate
): boolean {
  if (!slot.vehicleId) return false;
  if (isSpecialRouteSlotId(slot.id)) return true;
  const t = template ?? slotTemplateForSlot(data, slot);
  const def = defaultVehicleIdForTemplate(t, slot.date);
  return slot.vehicleId !== def;
}

export function assignmentsForVehicleOnDate(
  slots: ScheduleSlot[],
  date: string,
  vehicleId: string,
  excludeSlotId?: string
): ScheduleSlot["routeType"][] {
  return slots
    .filter(
      (s) => s.date === date && s.vehicleId === vehicleId && s.id !== excludeSlotId
    )
    .map((s) => s.routeType);
}

export function canAssignVehicle(
  data: AppData,
  slotId: string,
  vehicleId: string | null
): { ok: true } | { ok: false; reason: string } {
  if (vehicleId === null) return { ok: true };
  const slot = data.slots.find((s) => s.id === slotId);
  if (!slot) return { ok: false, reason: "Slot not found" };
  const vehicle = vehicleById(data, vehicleId);
  if (!vehicle) return { ok: false, reason: "That car is not in the fleet." };
  const busyTypes = assignmentsForVehicleOnDate(data.slots, slot.date, vehicleId, slotId);
  if (conflictsWithDayAssignments(slot.routeType, busyTypes)) {
    return {
      ok: false,
      reason: `${vehicleDisplayName(vehicle)} is already on a route that overlaps this time window.`,
    };
  }
  return { ok: true };
}

export function normalizeVehicles(raw: Vehicle[] | undefined): Vehicle[] {
  if (!raw?.length) return [];
  const seen = new Set<string>();
  const next: Vehicle[] = [];
  for (const v of raw) {
    if (!v || typeof v.id !== "string" || !v.id.trim()) continue;
    if (seen.has(v.id)) continue;
    const name = typeof v.name === "string" ? v.name.trim() : "";
    if (!name) continue;
    seen.add(v.id);
    const plate = typeof v.plate === "string" ? v.plate.trim() : "";
    next.push(plate ? { id: v.id, name, plate } : { id: v.id, name });
  }
  return next;
}

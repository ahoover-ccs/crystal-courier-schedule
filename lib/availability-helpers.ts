import { getISODay, parseISO } from "date-fns";
import type {
  AppData,
  DayShiftAvailability,
  Person,
  RouteDefinition,
  RouteType,
  ScheduleSlot,
  SlotTemplate,
  WeekdayKey,
  WeeklyShiftAvailability,
} from "./types";
import { WEEKDAY_KEYS } from "./types";

const ISO_TO_KEY: Record<number, WeekdayKey | undefined> = {
  1: "mon",
  2: "tue",
  3: "wed",
  4: "thu",
  5: "fri",
};

export function dateToWeekdayKey(date: string): WeekdayKey | null {
  const dow = getISODay(parseISO(date));
  return ISO_TO_KEY[dow] ?? null;
}

export function createDefaultDayAvailability(): DayShiftAvailability {
  return {
    lab: true,
    morning: true,
    afternoon: true,
    allday: true,
    office: true,
  };
}

export function createDefaultWeeklyShiftAvailability(): WeeklyShiftAvailability {
  const row = createDefaultDayAvailability();
  return {
    mon: { ...row },
    tue: { ...row },
    wed: { ...row },
    thu: { ...row },
    fri: { ...row },
  };
}

export function defaultDriverForTemplateDate(
  date: string,
  template: SlotTemplate
): string | null {
  const day = dateToWeekdayKey(date);
  if (!day) return null;
  return template.defaultDriversByDay[day] ?? null;
}

/** Matches gold “non-default” styling when no weekday default is set (any assignee is non-default). */
export function isNonDefaultAssignmentForSlot(
  template: SlotTemplate,
  slot: ScheduleSlot
): boolean {
  if (!slot.driverId) return false;
  const def = defaultDriverForTemplateDate(slot.date, template);
  return slot.driverId !== def;
}

export function slotTemplateForSlot(data: AppData, slot: ScheduleSlot): SlotTemplate | undefined {
  const i = slot.id.indexOf("__");
  if (i === -1) return undefined;
  const tid = slot.id.slice(i + 2);
  return data.settings.slotTemplates.find((t) => t.id === tid);
}

export function resolveTemplateLabel(
  template: SlotTemplate,
  definitions: RouteDefinition[]
): { label: string; routeType: RouteType; isOfficeRoute: boolean } {
  const def = definitions.find((d) => d.id === template.routeDefinitionId);
  return {
    label: def?.name ?? "Unknown route",
    routeType: def?.routeType ?? "morning",
    isOfficeRoute: def?.routeType === "office",
  };
}

/** For fill-in suggestions: person must be marked available for this calendar day + shift type. */
export function isPersonAvailableForSlotOnDate(
  person: Person,
  date: string,
  routeType: RouteType
): boolean {
  const day = dateToWeekdayKey(date);
  if (!day) return false;
  const dayMap = person.weeklyShiftAvailability?.[day];
  if (!dayMap) return true;
  return dayMap[routeType] !== false;
}

/** True if the person has a pending (not yet approved) time-off request that covers this date + route type. */
export function hasPendingTimeOffForSlot(
  data: AppData,
  personId: string,
  date: string,
  routeType: RouteType
): boolean {
  return data.timeOffRequests.some(
    (r) =>
      r.status === "pending" &&
      r.driverId === personId &&
      r.date === date &&
      r.routeTypes.includes(routeType)
  );
}

/** Merge partial weekly availability with full defaults */
export function normalizeWeeklyAvailability(
  raw: Partial<WeeklyShiftAvailability> | undefined
): WeeklyShiftAvailability {
  const base = createDefaultWeeklyShiftAvailability();
  if (!raw) return base;
  for (const d of WEEKDAY_KEYS) {
    const dayPartial = raw[d];
    if (dayPartial) {
      base[d] = { ...base[d], ...dayPartial };
    }
  }
  return base;
}

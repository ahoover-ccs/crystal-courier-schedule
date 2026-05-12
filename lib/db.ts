import { promises as fs } from "fs";
import path from "path";
import {
  dateToWeekdayKey,
  defaultDriverForTemplateDate,
  resolveTemplateLabel,
} from "./availability-helpers";
import type {
  AppData,
  Person,
  RouteDefinition,
  ScheduleSlot,
  AppSettings,
  SlotTemplate,
  WeekdayKey,
} from "./types";
import { formatISODate, mondayOfWeekContaining, weekDaysFromMonday } from "./week-utils";
import { normalizeAppData } from "./normalize";
import { mergeSlotOverridesIntoSlots } from "./slot-overrides";
import { createDefaultWeeklyShiftAvailability } from "./availability-helpers";
import { newProfileToken } from "./profile-token";
import { roleNeedsProfileToken } from "./roles";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "schedule.json");

const STEVE = "drv-steve-prince";

const allDays = (driverId: string | null): Record<WeekdayKey, string | null> => ({
  mon: driverId,
  tue: driverId,
  wed: driverId,
  thu: driverId,
  fri: driverId,
});

const emptyDays = (): Record<WeekdayKey, string | null> =>
  allDays(null);

function seedRouteDefinitions(): RouteDefinition[] {
  return [
    { id: "rd-acculens", name: "Acculens Lab run", routeType: "lab" },
    { id: "rd-lab-2", name: "Lab route 2", routeType: "lab" },
    { id: "rd-lab-3", name: "Lab route 3", routeType: "lab" },
    { id: "rd-am-1", name: "Morning route 1", routeType: "morning" },
    { id: "rd-bldr", name: "BLDR (AM)", routeType: "morning" },
    { id: "rd-am-3", name: "Morning route 3", routeType: "morning" },
    { id: "rd-am-4", name: "Morning route 4", routeType: "morning" },
    { id: "rd-am-5", name: "Morning route 5", routeType: "morning" },
    { id: "rd-pm-1", name: "Afternoon route 1", routeType: "afternoon" },
    { id: "rd-pm-2", name: "Afternoon route 2", routeType: "afternoon" },
    { id: "rd-ngbr", name: "NGBR (PM)", routeType: "afternoon" },
    { id: "rd-pm-4", name: "Afternoon route 4", routeType: "afternoon" },
    { id: "rd-pm-5", name: "Afternoon route 5", routeType: "afternoon" },
    { id: "rd-ad-1", name: "All day 1", routeType: "allday" },
    { id: "rd-ad-2", name: "All day 2", routeType: "allday" },
  ];
}

function seedSlotTemplates(): SlotTemplate[] {
  return [
    { id: "t-lab-1", routeDefinitionId: "rd-acculens", defaultDriversByDay: allDays(STEVE) },
    { id: "t-lab-2", routeDefinitionId: "rd-lab-2", defaultDriversByDay: emptyDays() },
    { id: "t-lab-3", routeDefinitionId: "rd-lab-3", defaultDriversByDay: emptyDays() },
    { id: "t-am-1", routeDefinitionId: "rd-am-1", defaultDriversByDay: emptyDays() },
    { id: "t-am-2", routeDefinitionId: "rd-bldr", defaultDriversByDay: allDays(STEVE) },
    { id: "t-am-3", routeDefinitionId: "rd-am-3", defaultDriversByDay: emptyDays() },
    { id: "t-am-4", routeDefinitionId: "rd-am-4", defaultDriversByDay: emptyDays() },
    { id: "t-am-5", routeDefinitionId: "rd-am-5", defaultDriversByDay: emptyDays() },
    { id: "t-pm-1", routeDefinitionId: "rd-pm-1", defaultDriversByDay: emptyDays() },
    { id: "t-pm-2", routeDefinitionId: "rd-pm-2", defaultDriversByDay: emptyDays() },
    { id: "t-pm-3", routeDefinitionId: "rd-ngbr", defaultDriversByDay: allDays(STEVE) },
    { id: "t-pm-4", routeDefinitionId: "rd-pm-4", defaultDriversByDay: emptyDays() },
    { id: "t-pm-5", routeDefinitionId: "rd-pm-5", defaultDriversByDay: emptyDays() },
    { id: "t-ad-1", routeDefinitionId: "rd-ad-1", defaultDriversByDay: emptyDays() },
    { id: "t-ad-2", routeDefinitionId: "rd-ad-2", defaultDriversByDay: emptyDays() },
  ];
}

function withProfile(p: Person): Person {
  if (!roleNeedsProfileToken(p.role)) return p;
  return { ...p, profileToken: p.profileToken ?? newProfileToken() };
}

function seedPeople(): Person[] {
  const weekly = createDefaultWeeklyShiftAvailability();
  const raw: Person[] = [
    {
      id: "owner-1",
      name: "Owner",
      role: "owner",
      email: "owner@crystalcourier.com",
      weeklyShiftAvailability: weekly,
    },
    {
      id: "ops-1",
      name: "Ops Manager",
      role: "ops_manager",
      email: "ops@crystalcourier.com",
      weeklyShiftAvailability: weekly,
    },
    {
      id: "disp-1",
      name: "Dispatcher A",
      role: "dispatch",
      email: "dispatch1@crystalcourier.com",
      weeklyShiftAvailability: weekly,
    },
    {
      id: "disp-2",
      name: "Dispatcher B",
      role: "dispatch",
      email: "dispatch2@crystalcourier.com",
      weeklyShiftAvailability: weekly,
    },
    {
      id: "disp-3",
      name: "Dispatcher C",
      role: "dispatch",
      email: "dispatch3@crystalcourier.com",
      weeklyShiftAvailability: weekly,
    },
    {
      id: STEVE,
      name: "Steve Prince",
      role: "full_time_driver",
      phone: "+13035550000",
      email: "steve.prince@example.com",
      weeklyShiftAvailability: weekly,
    },
    {
      id: "drv-1",
      name: "Jordan Lee",
      role: "full_time_driver",
      phone: "+13035550101",
      weeklyShiftAvailability: weekly,
    },
    {
      id: "drv-2",
      name: "Sam Rivera",
      role: "full_time_driver",
      phone: "+13035550102",
      weeklyShiftAvailability: weekly,
    },
    {
      id: "drv-3",
      name: "Casey Morgan",
      role: "part_time_driver",
      phone: "+13035550103",
      weeklyShiftAvailability: weekly,
    },
    {
      id: "drv-4",
      name: "Riley Chen",
      role: "part_time_driver",
      phone: "+13035550104",
      weeklyShiftAvailability: weekly,
    },
    {
      id: "drv-5",
      name: "Alex Park",
      role: "full_time_driver",
      phone: "+13035550105",
      weeklyShiftAvailability: weekly,
    },
    {
      id: "on-1",
      name: "On-call: Jamie",
      role: "on_call_driver",
      email: "jamie@example.com",
      phone: "+13035550999",
      weeklyShiftAvailability: weekly,
    },
    {
      id: "on-2",
      name: "On-call: Taylor",
      role: "on_call_driver",
      email: "taylor@example.com",
      phone: "+13035550998",
      weeklyShiftAvailability: weekly,
    },
    {
      id: "on-3",
      name: "On-call: Morgan",
      role: "on_call_driver",
      email: "morgan@example.com",
      phone: "+13035550997",
      weeklyShiftAvailability: weekly,
    },
  ];
  return raw.map((p) => withProfile(p));
}

function buildSlotsForWeek(
  weekStart: string,
  templates: SlotTemplate[],
  definitions: RouteDefinition[]
): ScheduleSlot[] {
  const days = weekDaysFromMonday(weekStart);
  const slots: ScheduleSlot[] = [];
  for (const date of days) {
    for (const t of templates) {
      const { label, routeType, isOfficeRoute } = resolveTemplateLabel(t, definitions);
      const driverId = defaultDriverForTemplateDate(date, t);
      slots.push({
        id: `${date}__${t.id}`,
        date,
        routeType,
        label,
        driverId,
        isGap: false,
        isOfficeSlot: isOfficeRoute === true,
        gapForDriverId: null,
      });
    }
  }
  return slots;
}

function defaultWeekStart(): string {
  return formatISODate(mondayOfWeekContaining(new Date()));
}

export function createSeedData(): AppData {
  const routeDefinitions = seedRouteDefinitions();
  const slotTemplates = seedSlotTemplates();
  const people = seedPeople();
  const fillPriorityIds = [
    "owner-1",
    "ops-1",
    "disp-1",
    "disp-2",
    "disp-3",
    STEVE,
    "drv-1",
    "drv-2",
    "drv-3",
    "drv-4",
    "drv-5",
    "on-1",
    "on-2",
    "on-3",
  ];
  const defaultWeek = defaultWeekStart();
  const settings: AppSettings = {
    routeDefinitions,
    slotTemplates,
    fillPriorityIds,
    defaultWeekStart: defaultWeek,
  };
  return normalizeAppData({
    people,
    slots: buildSlotsForWeek(defaultWeek, slotTemplates, routeDefinitions),
    timeOffRequests: [],
    openShifts: [],
    announcements: [],
    absenceStats: [],
    settings,
  });
}

export async function readDb(): Promise<AppData> {
  try {
    const raw = await fs.readFile(DB_PATH, "utf-8");
    return normalizeAppData(JSON.parse(raw) as AppData);
  } catch {
    return createSeedData();
  }
}

export async function writeDb(data: AppData): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const normalized = normalizeAppData(data);
  await fs.writeFile(DB_PATH, JSON.stringify(normalized, null, 2), "utf-8");
}

export async function ensureDb(): Promise<AppData> {
  try {
    await fs.access(DB_PATH);
    return readDb();
  } catch {
    const seed = createSeedData();
    await writeDb(seed);
    return seed;
  }
}

export function rebuildSlotsForWeek(data: AppData, weekStart: string): AppData {
  const fresh = buildSlotsForWeek(
    weekStart,
    data.settings.slotTemplates,
    data.settings.routeDefinitions
  );
  const slots = mergeSlotOverridesIntoSlots(fresh, data.slotOverrides);
  return normalizeAppData({
    ...data,
    slots,
    settings: { ...data.settings, defaultWeekStart: weekStart },
  });
}

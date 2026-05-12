import { promises as fs } from "fs";
import path from "path";
import { Pool, type PoolConfig } from "pg";
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

const DATABASE_URL = process.env.DATABASE_URL;
const USE_POSTGRES = Boolean(DATABASE_URL);

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

// ---------------------------------------------------------------------------
// Storage backends
//
// When `DATABASE_URL` is set the app stores its state as a single JSONB row in
// a Postgres table named `app_state`. This preserves the existing
// read-mutate-write API surface (`readDb` / `writeDb` / `ensureDb`) without
// requiring any caller changes. When `DATABASE_URL` is unset we fall back to
// the original `data/schedule.json` file, which keeps the local dev experience
// identical and avoids forcing a Postgres install for development.
//
// The JSONB-blob model is intentional: this app's mutations all happen against
// the in-memory `AppData` object (then write back), so swapping the backing
// store to one row keeps every API route and lib function unchanged. At this
// scale (handful of admin users) it is correct; if write contention ever
// becomes a real concern we can move to row-locking transactions or normalize
// into per-entity tables.
// ---------------------------------------------------------------------------

declare global {
  // eslint-disable-next-line no-var
  var __ccsPgPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __ccsPgReady: Promise<void> | undefined;
}

function buildPoolConfig(): PoolConfig {
  const config: PoolConfig = { connectionString: DATABASE_URL };
  // Managed Postgres providers (Render, Neon, Supabase, etc.) require TLS for
  // external connections. `rejectUnauthorized: false` is the broad-compatibility
  // setting; tighten if you ship a verified CA bundle.
  if (!/sslmode=disable/.test(DATABASE_URL ?? "")) {
    config.ssl = { rejectUnauthorized: false };
  }
  return config;
}

function getPool(): Pool {
  if (process.env.NODE_ENV !== "production") {
    if (!global.__ccsPgPool) {
      global.__ccsPgPool = new Pool(buildPoolConfig());
    }
    return global.__ccsPgPool;
  }
  if (!global.__ccsPgPool) {
    global.__ccsPgPool = new Pool(buildPoolConfig());
  }
  return global.__ccsPgPool;
}

async function ensurePostgresSchema(): Promise<void> {
  if (!global.__ccsPgReady) {
    global.__ccsPgReady = (async () => {
      const pool = getPool();
      await pool.query(`
        CREATE TABLE IF NOT EXISTS app_state (
          id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
          data JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      // First-run import: if the table is empty but a data/schedule.json
      // file ships with the deploy, seed Postgres from it so an existing
      // roster carries over automatically on the first deploy.
      const { rows } = await pool.query<{ exists: boolean }>(
        `SELECT EXISTS (SELECT 1 FROM app_state WHERE id = 1) AS exists`
      );
      if (!rows[0]?.exists) {
        try {
          const raw = await fs.readFile(DB_PATH, "utf-8");
          const imported = normalizeAppData(JSON.parse(raw) as AppData);
          await pool.query(
            `INSERT INTO app_state (id, data) VALUES (1, $1::jsonb)
             ON CONFLICT (id) DO NOTHING`,
            [JSON.stringify(imported)]
          );
        } catch {
          // No bundled JSON; ensureDb() will seed defaults on first call.
        }
      }
    })().catch((e) => {
      // Reset the cached promise so a transient failure can be retried.
      global.__ccsPgReady = undefined;
      throw e;
    });
  }
  return global.__ccsPgReady;
}

async function pgRead(): Promise<AppData | null> {
  await ensurePostgresSchema();
  const pool = getPool();
  const { rows } = await pool.query<{ data: AppData }>(
    `SELECT data FROM app_state WHERE id = 1`
  );
  if (rows.length === 0) return null;
  return normalizeAppData(rows[0].data);
}

async function pgWrite(data: AppData): Promise<void> {
  await ensurePostgresSchema();
  const pool = getPool();
  const normalized = normalizeAppData(data);
  await pool.query(
    `INSERT INTO app_state (id, data, updated_at) VALUES (1, $1::jsonb, NOW())
     ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
    [JSON.stringify(normalized)]
  );
}

async function fileRead(): Promise<AppData> {
  try {
    const raw = await fs.readFile(DB_PATH, "utf-8");
    return normalizeAppData(JSON.parse(raw) as AppData);
  } catch {
    return createSeedData();
  }
}

async function fileWrite(data: AppData): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const normalized = normalizeAppData(data);
  await fs.writeFile(DB_PATH, JSON.stringify(normalized, null, 2), "utf-8");
}

export async function readDb(): Promise<AppData> {
  if (USE_POSTGRES) {
    const existing = await pgRead();
    return existing ?? createSeedData();
  }
  return fileRead();
}

export async function writeDb(data: AppData): Promise<void> {
  if (USE_POSTGRES) {
    return pgWrite(data);
  }
  return fileWrite(data);
}

export async function ensureDb(): Promise<AppData> {
  if (USE_POSTGRES) {
    const existing = await pgRead();
    if (existing) return existing;
    const seed = createSeedData();
    await pgWrite(seed);
    return seed;
  }
  try {
    await fs.access(DB_PATH);
    return fileRead();
  } catch {
    const seed = createSeedData();
    await fileWrite(seed);
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

import { createDefaultWeeklyShiftAvailability, normalizeWeeklyAvailability } from "./availability-helpers";
import { migratePersonRole } from "./roles";
import { newProfileToken } from "./profile-token";
import type {
  AppData,
  Person,
  RouteDefinition,
  SlotTemplate,
  SlotOverrideState,
  WeekdayKey,
  WeeklyShiftAvailability,
} from "./types";
import { WEEKDAY_KEYS } from "./types";

type LegacyShiftAvailability = Partial<Record<string, boolean>>;
type LegacySlotTemplate = {
  id: string;
  routeType?: string;
  label?: string;
  defaultDriverId?: string | null;
  defaultDays?: Partial<Record<WeekdayKey, boolean>>;
  routeDefinitionId?: string;
  defaultDriversByDay?: Partial<Record<WeekdayKey, string | null>>;
};

function migratePerson(p: Person & { shiftAvailability?: LegacyShiftAvailability }): Person {
  const role = migratePersonRole(p.role as string);
  let weekly: WeeklyShiftAvailability;

  if (p.weeklyShiftAvailability && typeof p.weeklyShiftAvailability === "object") {
    weekly = normalizeWeeklyAvailability(p.weeklyShiftAvailability);
  } else if (p.shiftAvailability) {
    const day = {
      lab: p.shiftAvailability.lab !== false,
      morning: p.shiftAvailability.morning !== false,
      afternoon: p.shiftAvailability.afternoon !== false,
      allday: p.shiftAvailability.allday !== false,
      office: (p.shiftAvailability as LegacyShiftAvailability).office !== false,
    };
    weekly = {
      mon: { ...day },
      tue: { ...day },
      wed: { ...day },
      thu: { ...day },
      fri: { ...day },
    };
    weekly = normalizeWeeklyAvailability(weekly);
  } else {
    weekly = createDefaultWeeklyShiftAvailability();
  }

  let x: Person = {
    ...p,
    role,
    weeklyShiftAvailability: weekly,
  };
  delete (x as Person & { shiftAvailability?: unknown }).shiftAvailability;

  if (
    (role === "full_time_driver" ||
      role === "part_time_driver" ||
      role === "on_call_driver") &&
    !x.profileToken
  ) {
    x = { ...x, profileToken: newProfileToken() };
  }
  return x;
}

function buildRouteDefinitionsFromLegacy(
  templates: LegacySlotTemplate[],
  existing: RouteDefinition[]
): RouteDefinition[] {
  const byId = new Map(existing.map((d) => [d.id, d]));
  for (const t of templates) {
    if (t.routeDefinitionId && byId.has(t.routeDefinitionId)) continue;
    const id = t.routeDefinitionId ?? `rd-${t.id}`;
    if (byId.has(id)) continue;
    const name = t.label ?? "Route";
    const routeType = (t.routeType ?? "morning") as RouteDefinition["routeType"];
    const wantOffice =
      name.toLowerCase().includes("office") || routeType === ("office" as string);
    byId.set(id, {
      id,
      name,
      routeType: wantOffice ? "office" : routeType,
      isOfficeRoute: wantOffice,
    });
  }
  return Array.from(byId.values()).map((d) => ({
    ...d,
    isOfficeRoute: d.routeType === "office",
  }));
}

function migrateSlotTemplates(
  templates: LegacySlotTemplate[],
  definitions: RouteDefinition[]
): SlotTemplate[] {
  const defByLegacyId = new Map(definitions.map((d) => [d.id, d]));

  return templates.map((t) => {
    if (t.routeDefinitionId && t.defaultDriversByDay) {
      const dayMap: Record<WeekdayKey, string | null> = {
        mon: null,
        tue: null,
        wed: null,
        thu: null,
        fri: null,
      };
      for (const d of WEEKDAY_KEYS) {
        dayMap[d] = t.defaultDriversByDay[d] ?? null;
      }
      return {
        id: t.id,
        routeDefinitionId: t.routeDefinitionId,
        defaultDriversByDay: dayMap,
      };
    }

    const rdId = `rd-${t.id}`;
    const def =
      definitions.find((d) => d.id === rdId) ??
      definitions.find((d) => d.name === t.label) ??
      definitions[0];

    const defaultDriverId = t.defaultDriverId ?? null;
    const defaultDays = {
      mon: true,
      tue: true,
      wed: true,
      thu: true,
      fri: true,
      ...t.defaultDays,
    };

    const defaultDriversByDay: Record<WeekdayKey, string | null> = {
      mon: null,
      tue: null,
      wed: null,
      thu: null,
      fri: null,
    };
    for (const d of WEEKDAY_KEYS) {
      defaultDriversByDay[d] =
        defaultDays[d] && defaultDriverId ? defaultDriverId : null;
    }

    return {
      id: t.id,
      routeDefinitionId: def?.id ?? rdId,
      defaultDriversByDay,
    };
  });
}

function migrateSlots(slots: AppData["slots"]): AppData["slots"] {
  return slots.map((s) => {
    const rt = s.routeType as string;
    const inferredOffice =
      Boolean(s.label?.toLowerCase().includes("office")) || rt === "office";
    return {
      ...s,
      routeType: rt === "office" ? "office" : s.routeType,
      isOfficeSlot:
        typeof s.isOfficeSlot === "boolean" ? s.isOfficeSlot : inferredOffice,
      gapForDriverId: s.gapForDriverId ?? null,
    };
  });
}

function syncAbsenceStatsRequested(data: AppData): void {
  const agg = new Map<string, Map<number, Set<string>>>();
  for (const r of data.timeOffRequests) {
    if (r.status !== "approved") continue;
    if (!agg.has(r.driverId)) agg.set(r.driverId, new Map());
    const m = agg.get(r.driverId)!;
    const y = parseInt(r.date.slice(0, 4), 10);
    if (!m.has(y)) m.set(y, new Set());
    m.get(y)!.add(r.date);
  }
  for (const [pid, ym] of agg) {
    for (const [y, dates] of ym) {
      let row = data.absenceStats.find((a) => a.personId === pid && a.year === y);
      if (!row) {
        row = {
          personId: pid,
          year: y,
          requestedDayCount: 0,
          coveredAbsenceDayCount: 0,
        };
        data.absenceStats.push(row);
      }
      row.requestedDayCount = dates.size;
    }
  }
}

/** Drop very old override rows so schedule.json does not grow without bound */
function pruneSlotOverrides(
  overrides: Record<string, SlotOverrideState> | undefined
): Record<string, SlotOverrideState> | undefined {
  if (!overrides || !Object.keys(overrides).length) return overrides;
  const d = new Date();
  d.setDate(d.getDate() - 120);
  const cutoff = d.toISOString().slice(0, 10);
  const next = { ...overrides };
  for (const id of Object.keys(next)) {
    const sep = id.indexOf("__");
    const datePart = sep === -1 ? id : id.slice(0, sep);
    if (datePart < cutoff) delete next[id];
  }
  return Object.keys(next).length ? next : undefined;
}

export function normalizeAppData(raw: AppData): AppData {
  const data = raw as AppData & {
    settings?: AppData["settings"] & { routeDefinitions?: RouteDefinition[] };
    announcements?: AppData["announcements"];
    absenceStats?: AppData["absenceStats"];
    nonDefaultShiftReminders?: AppData["nonDefaultShiftReminders"];
    slotOverrides?: AppData["slotOverrides"];
  };

  const routeDefinitions = buildRouteDefinitionsFromLegacy(
    (data.settings.slotTemplates ?? []) as LegacySlotTemplate[],
    data.settings.routeDefinitions ?? []
  );

  const slotTemplates = migrateSlotTemplates(
    (data.settings.slotTemplates ?? []) as LegacySlotTemplate[],
    routeDefinitions
  );

  const people = (data.people ?? []).map((p) =>
    migratePerson(p as Person & { shiftAvailability?: LegacyShiftAvailability })
  );

  const slots = migrateSlots(data.slots ?? []);

  const openShifts = (data.openShifts ?? []).map((o) => ({
    ...o,
    pendingClaimDriverId: o.pendingClaimDriverId ?? null,
    pendingClaimDriverName: o.pendingClaimDriverName ?? null,
    pendingClaimAt: o.pendingClaimAt ?? null,
  }));

  const timeOffRequests = (data.timeOffRequests ?? []).map((r) => ({
    ...r,
    status:
      r.status === "pending" || r.status === "approved" || r.status === "rejected"
        ? r.status
        : "approved",
  }));

  const out: AppData = {
    people,
    slots,
    timeOffRequests,
    openShifts,
    announcements: data.announcements ?? [],
    absenceStats: data.absenceStats ?? [],
    nonDefaultShiftReminders: data.nonDefaultShiftReminders ?? [],
    slotOverrides: pruneSlotOverrides(
      data.slotOverrides && Object.keys(data.slotOverrides).length ? data.slotOverrides : undefined
    ),
    settings: {
      routeDefinitions,
      slotTemplates,
      fillPriorityIds: data.settings.fillPriorityIds ?? [],
      defaultWeekStart: data.settings.defaultWeekStart ?? "",
    },
  };
  syncAbsenceStatsRequested(out);
  return out;
}

import { NextRequest, NextResponse } from "next/server";
import {
  clearOverridesMatchingOldDefaultsOnOrAfter,
  preserveScheduleBeforeEffectiveDate,
} from "@/lib/apply-slot-templates-effective";
import { applyDefaultDriversToEmptySlots } from "@/lib/apply-defaults";
import { ensureDb, rebuildSlotsForWeek, writeDb } from "@/lib/db";
import { syncSlotTemplatesWithCatalog } from "@/lib/sync-catalog-templates";
import { sanitizeTemplateDefaults } from "@/lib/terminate-person";
import { migrateRouteType } from "@/lib/route-types";
import { formatISODate } from "@/lib/week-utils";
import type { AppSettings, RouteDefinition, SlotTemplate, Vehicle, WeekdayKey } from "@/lib/types";
import { WEEKDAY_KEYS } from "@/lib/types";
import { normalizeDefaultVehiclesByDay, normalizeVehicles, retainKnownVehicleDayDefaults } from "@/lib/vehicles";

function normalizeRouteDefinitions(defs: RouteDefinition[]): RouteDefinition[] {
  return defs.map((d) => ({
    id: d.id,
    name: d.name,
    routeType: migrateRouteType(d.routeType as string),
    ...(d.retiredAt ? { retiredAt: d.retiredAt } : {}),
  }));
}

function normalizeSlotTemplates(templates: SlotTemplate[]): SlotTemplate[] {
  return templates.map((t) => {
    const defaultDriversByDay = {} as Record<WeekdayKey, string | null>;
    for (const d of WEEKDAY_KEYS) {
      defaultDriversByDay[d] = t.defaultDriversByDay?.[d] ?? null;
    }
    return {
      id: t.id,
      routeDefinitionId: t.routeDefinitionId,
      defaultDriversByDay,
      defaultVehiclesByDay: normalizeDefaultVehiclesByDay(t),
    };
  });
}

function mergeRetiredRoutes(
  previous: RouteDefinition[],
  incoming: RouteDefinition[]
): RouteDefinition[] {
  const incomingIds = new Set(incoming.map((d) => d.id));
  const retiredToday = formatISODate(new Date());

  const newlyRetired = previous
    .filter((d) => !d.retiredAt && !incomingIds.has(d.id))
    .map((d) => ({ ...normalizeRouteDefinitions([d])[0], retiredAt: retiredToday }));

  const stillRetired = previous.filter((d) => d.retiredAt && !incomingIds.has(d.id));

  return normalizeRouteDefinitions([...incoming, ...newlyRetired, ...stillRetired]);
}

function preserveTemplatesForRetiredRoutes(
  previous: SlotTemplate[],
  incoming: SlotTemplate[],
  routeDefinitions: RouteDefinition[]
): SlotTemplate[] {
  const incomingIds = new Set(incoming.map((t) => t.id));
  const retiredRouteIds = new Set(
    routeDefinitions.filter((d) => d.retiredAt).map((d) => d.id)
  );
  const preserved = previous.filter(
    (t) => retiredRouteIds.has(t.routeDefinitionId) && !incomingIds.has(t.id)
  );
  return normalizeSlotTemplates([...incoming, ...preserved]);
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { fillPriorityIds, slotTemplates, defaultWeekStart, routeDefinitions, slotTemplatesEffectiveDate, vehicles } =
    body as Partial<AppSettings & {
      routeDefinitions?: RouteDefinition[];
      slotTemplatesEffectiveDate?: string;
      vehicles?: Vehicle[];
    }>;
  let data = await ensureDb();
  if (fillPriorityIds) {
    data.settings.fillPriorityIds = fillPriorityIds;
  }

  if (vehicles !== undefined) {
    const nextVehicles = normalizeVehicles(vehicles);
    const ids = new Set(nextVehicles.map((v) => v.id));
    data.settings.vehicles = nextVehicles;
    data.settings.slotTemplates = data.settings.slotTemplates.map((t) => ({
      ...t,
      defaultVehiclesByDay: retainKnownVehicleDayDefaults(t.defaultVehiclesByDay, ids),
    }));
    data.slots = data.slots.map((s) =>
      s.vehicleId && !ids.has(s.vehicleId) ? { ...s, vehicleId: null } : s
    );
    if (data.slotOverrides) {
      const next = { ...data.slotOverrides };
      for (const [id, o] of Object.entries(next)) {
        if (o.vehicleId && !ids.has(o.vehicleId)) {
          next[id] = { ...o, vehicleId: null };
        }
      }
      data.slotOverrides = next;
    }
    const { data: filledVehicles } = applyDefaultDriversToEmptySlots(data);
    data = filledVehicles;
  }

  const catalogChanged = routeDefinitions !== undefined;
  const rowsChanged = slotTemplates !== undefined;

  if (routeDefinitions !== undefined) {
    data.settings.routeDefinitions = mergeRetiredRoutes(
      data.settings.routeDefinitions,
      routeDefinitions
    );
  }
  if (slotTemplates !== undefined) {
    const previousTemplates = data.settings.slotTemplates;
    if (
      slotTemplatesEffectiveDate &&
      /^\d{4}-\d{2}-\d{2}$/.test(slotTemplatesEffectiveDate)
    ) {
      preserveScheduleBeforeEffectiveDate(data, slotTemplatesEffectiveDate, previousTemplates);
    }
    data.settings.slotTemplates = preserveTemplatesForRetiredRoutes(
      data.settings.slotTemplates,
      slotTemplates,
      data.settings.routeDefinitions
    );
    if (
      slotTemplatesEffectiveDate &&
      /^\d{4}-\d{2}-\d{2}$/.test(slotTemplatesEffectiveDate)
    ) {
      clearOverridesMatchingOldDefaultsOnOrAfter(
        data,
        slotTemplatesEffectiveDate,
        previousTemplates
      );
    }
  }
  if (catalogChanged || rowsChanged) {
    data.settings.slotTemplates = syncSlotTemplatesWithCatalog(
      data.settings.routeDefinitions,
      data.settings.slotTemplates
    );
    data = rebuildSlotsForWeek(data, data.settings.defaultWeekStart);
    const { data: filled } = applyDefaultDriversToEmptySlots(data);
    data = filled;
  }

  if (defaultWeekStart) {
    data.settings.defaultWeekStart = defaultWeekStart;
  }
  sanitizeTemplateDefaults(data);
  await writeDb(data);
  return NextResponse.json(data);
}

import { NextRequest, NextResponse } from "next/server";
import { applyDefaultDriversToEmptySlots } from "@/lib/apply-defaults";
import { ensureDb, rebuildSlotsForWeek, writeDb } from "@/lib/db";
import { syncSlotTemplatesWithCatalog } from "@/lib/sync-catalog-templates";
import { sanitizeTemplateDefaults } from "@/lib/terminate-person";
import type { AppSettings, RouteDefinition, SlotTemplate, WeekdayKey } from "@/lib/types";
import { WEEKDAY_KEYS } from "@/lib/types";

function normalizeRouteDefinitions(defs: RouteDefinition[]): RouteDefinition[] {
  return defs.map((d) => ({
    ...d,
    isOfficeRoute: d.routeType === "office",
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
    };
  });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { fillPriorityIds, slotTemplates, defaultWeekStart, routeDefinitions } = body as Partial<
    AppSettings & { routeDefinitions?: RouteDefinition[] }
  >;
  let data = await ensureDb();
  if (fillPriorityIds) {
    data.settings.fillPriorityIds = fillPriorityIds;
  }

  const catalogChanged = routeDefinitions !== undefined;
  const rowsChanged = slotTemplates !== undefined;

  if (routeDefinitions !== undefined) {
    data.settings.routeDefinitions = normalizeRouteDefinitions(routeDefinitions);
  }
  if (slotTemplates !== undefined) {
    data.settings.slotTemplates = normalizeSlotTemplates(slotTemplates);
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

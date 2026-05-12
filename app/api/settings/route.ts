import { NextRequest, NextResponse } from "next/server";
import { ensureDb, writeDb } from "@/lib/db";
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
  const data = await ensureDb();
  if (fillPriorityIds) {
    data.settings.fillPriorityIds = fillPriorityIds;
  }
  if (routeDefinitions?.length) {
    data.settings.routeDefinitions = normalizeRouteDefinitions(routeDefinitions);
  }
  if (slotTemplates?.length) {
    data.settings.slotTemplates = normalizeSlotTemplates(slotTemplates);
  }
  if (defaultWeekStart) {
    data.settings.defaultWeekStart = defaultWeekStart;
  }
  await writeDb(data);
  return NextResponse.json(data);
}

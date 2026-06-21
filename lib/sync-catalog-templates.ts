import type { RouteDefinition, SlotTemplate, WeekdayKey } from "./types";
import { activeRouteDefinitions } from "./route-catalog";

const emptyDriversByDay = (): Record<WeekdayKey, string | null> => ({
  mon: null,
  tue: null,
  wed: null,
  thu: null,
  fri: null,
});

/** Ensure every active catalog route has at least one schedule row on the weekly grid. */
export function syncSlotTemplatesWithCatalog(
  routeDefinitions: RouteDefinition[],
  slotTemplates: SlotTemplate[]
): SlotTemplate[] {
  const catalog = activeRouteDefinitions(routeDefinitions);
  const activeIds = new Set(catalog.map((d) => d.id));
  const retiredTemplates = slotTemplates.filter((t) => !activeIds.has(t.routeDefinitionId));
  const activeTemplates = slotTemplates.filter((t) => activeIds.has(t.routeDefinitionId));
  const used = new Set(activeTemplates.map((t) => t.routeDefinitionId));
  const next = activeTemplates.map((t) => ({
    ...t,
    defaultDriversByDay: { ...t.defaultDriversByDay },
  }));
  for (const rd of catalog) {
    if (used.has(rd.id)) continue;
    next.push({
      id: `t-${rd.id}-${Date.now()}`,
      routeDefinitionId: rd.id,
      defaultDriversByDay: emptyDriversByDay(),
    });
  }
  return [...next, ...retiredTemplates];
}

import type { RouteDefinition, SlotTemplate, WeekdayKey } from "./types";
import { WEEKDAY_KEYS } from "./types";

const emptyDriversByDay = (): Record<WeekdayKey, string | null> => ({
  mon: null,
  tue: null,
  wed: null,
  thu: null,
  fri: null,
});

/** Ensure every catalog route has at least one schedule row on the weekly grid. */
export function syncSlotTemplatesWithCatalog(
  routeDefinitions: RouteDefinition[],
  slotTemplates: SlotTemplate[]
): SlotTemplate[] {
  const used = new Set(slotTemplates.map((t) => t.routeDefinitionId));
  const next = slotTemplates.map((t) => ({
    ...t,
    defaultDriversByDay: { ...t.defaultDriversByDay },
  }));
  for (const rd of routeDefinitions) {
    if (used.has(rd.id)) continue;
    next.push({
      id: `t-${rd.id}-${Date.now()}`,
      routeDefinitionId: rd.id,
      defaultDriversByDay: emptyDriversByDay(),
    });
  }
  return next;
}

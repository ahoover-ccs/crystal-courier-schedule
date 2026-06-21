import type { RouteDefinition, SlotTemplate } from "./types";

/** Route is shown on the schedule for this calendar date. */
export function isRouteActiveOnDate(def: RouteDefinition, date: string): boolean {
  return !def.retiredAt || date < def.retiredAt;
}

export function activeRouteDefinitions(definitions: RouteDefinition[]): RouteDefinition[] {
  return definitions.filter((d) => !d.retiredAt);
}

export function isTemplateActiveInWeek(
  template: SlotTemplate,
  definitions: RouteDefinition[],
  weekDays: string[]
): boolean {
  const def = definitions.find((d) => d.id === template.routeDefinitionId);
  if (!def) return false;
  return weekDays.some((d) => isRouteActiveOnDate(def, d));
}

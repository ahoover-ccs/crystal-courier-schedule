import { resolveTemplateLabel } from "./availability-helpers";
import type { RouteDefinition, RouteType, SlotTemplate } from "./types";

/** Lab → morning → afternoon, then other shift types, for stable grid/catalog order. */
export function routeTypeDisplayOrder(routeType: RouteType): number {
  switch (routeType) {
    case "lab":
      return 0;
    case "morning":
      return 1;
    case "afternoon":
      return 2;
    case "allday":
      return 3;
    case "office":
      return 4;
    default:
      return 5;
  }
}

export function compareRouteDefinitionsByDisplayOrder(
  a: RouteDefinition,
  b: RouteDefinition
): number {
  const typeCmp =
    routeTypeDisplayOrder(a.routeType) - routeTypeDisplayOrder(b.routeType);
  if (typeCmp !== 0) return typeCmp;
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

export function compareSlotTemplatesByDisplayOrder(
  a: SlotTemplate,
  b: SlotTemplate,
  definitions: RouteDefinition[]
): number {
  const la = resolveTemplateLabel(a, definitions);
  const lb = resolveTemplateLabel(b, definitions);
  const typeCmp =
    routeTypeDisplayOrder(la.routeType) - routeTypeDisplayOrder(lb.routeType);
  if (typeCmp !== 0) return typeCmp;
  return la.label.localeCompare(lb.label, undefined, { sensitivity: "base" });
}

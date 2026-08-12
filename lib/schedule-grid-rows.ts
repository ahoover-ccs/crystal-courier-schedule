import {
  hasPendingTimeOffForSlot,
  isNonDefaultAssignmentForSlot,
  resolveTemplateLabel,
} from "./availability-helpers";
import { isTemplateActiveInWeek } from "./route-catalog";
import { routeTypeDisplayOrder } from "./route-display-order";
import { specialRouteSlotId, specialRoutesInWeek } from "./special-routes";
import type { AppData, RouteType, ScheduleSlot, SlotTemplate, SpecialRoute } from "./types";
import { weekWorkdaysFromWeekStart } from "./week-utils";

export type ScheduleGridRow = {
  key: string;
  kind: "template" | "special";
  template?: SlotTemplate;
  special?: SpecialRoute;
  routeType: RouteType;
  label: string;
  rowSlots: (ScheduleSlot | null)[];
};

function compareGridRows(
  a: ScheduleGridRow & {
    blankCount: number;
    nonDefaultCount: number;
    pendingTimeOffCount: number;
    index: number;
  },
  b: ScheduleGridRow & {
    blankCount: number;
    nonDefaultCount: number;
    pendingTimeOffCount: number;
    index: number;
  }
): number {
  if (b.blankCount !== a.blankCount) return b.blankCount - a.blankCount;
  if (b.nonDefaultCount !== a.nonDefaultCount) return b.nonDefaultCount - a.nonDefaultCount;
  if (b.pendingTimeOffCount !== a.pendingTimeOffCount)
    return b.pendingTimeOffCount - a.pendingTimeOffCount;
  const typeCmp = routeTypeDisplayOrder(a.routeType) - routeTypeDisplayOrder(b.routeType);
  if (typeCmp !== 0) return typeCmp;
  const nameCmp = a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
  if (nameCmp !== 0) return nameCmp;
  return a.index - b.index;
}

/** Weekly grid rows: open first, then non-default (including filled specials), then defaults. */
export function buildScheduleGridRows(data: AppData): ScheduleGridRow[] {
  const days = weekWorkdaysFromWeekStart(data.settings.defaultWeekStart);
  const routeDefs = data.settings.routeDefinitions;
  const rows: Array<
    ScheduleGridRow & {
      blankCount: number;
      nonDefaultCount: number;
      pendingTimeOffCount: number;
      index: number;
    }
  > = [];

  const templates = data.settings.slotTemplates.filter((t) =>
    isTemplateActiveInWeek(t, routeDefs, days)
  );
  templates.forEach((t, index) => {
    const rowSlots = days.map((d) => {
      const id = `${d}__${t.id}`;
      return data.slots.find((s) => s.id === id) ?? null;
    });
    const { label, routeType } = resolveTemplateLabel(t, routeDefs);
    rows.push({
      key: t.id,
      kind: "template",
      template: t,
      routeType,
      label,
      rowSlots,
      blankCount: rowSlots.filter((s) => s && !s.driverId).length,
      nonDefaultCount: rowSlots.filter((s) => s && isNonDefaultAssignmentForSlot(t, s, data))
        .length,
      pendingTimeOffCount: rowSlots.filter(
        (s) =>
          s && s.driverId && hasPendingTimeOffForSlot(data, s.driverId, s.date, s.routeType)
      ).length,
      index,
    });
  });

  specialRoutesInWeek(data, data.settings.defaultWeekStart).forEach((route, i) => {
    const rowSlots = days.map((d) => {
      if (d !== route.date) return null;
      return data.slots.find((s) => s.id === specialRouteSlotId(route)) ?? null;
    });
    rows.push({
      key: route.id,
      kind: "special",
      special: route,
      routeType: route.routeType,
      label: route.name,
      rowSlots,
      blankCount: rowSlots.filter((s) => s && !s.driverId).length,
      // Filled specials sort with non-default (gold) rows, above catalog defaults.
      nonDefaultCount: rowSlots.filter((s) => s && s.driverId).length,
      pendingTimeOffCount: rowSlots.filter(
        (s) =>
          s && s.driverId && hasPendingTimeOffForSlot(data, s.driverId, s.date, s.routeType)
      ).length,
      index: templates.length + i,
    });
  });

  rows.sort(compareGridRows);
  return rows.map(
    ({
      blankCount: _b,
      nonDefaultCount: _n,
      pendingTimeOffCount: _p,
      index: _i,
      ...row
    }) => row
  );
}

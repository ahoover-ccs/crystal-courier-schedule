import { hasOfficeSlotsOnDate, qualifiedOfficeCoverCount } from "./office-rules";
import { isDispatcherLike } from "./roles";
import { suggestFillIns } from "./suggestions";
import type { AppData, RouteType } from "./types";

/** Build schedule as if these routes are cleared for this driver on this date. */
export function shadowDataForTimeOff(
  data: AppData,
  driverId: string,
  date: string,
  routeTypes: RouteType[]
): AppData {
  const slots = data.slots.map((s) => {
    if (
      s.date === date &&
      routeTypes.includes(s.routeType) &&
      s.driverId === driverId
    ) {
      return { ...s, driverId: null, isGap: true, gapForDriverId: driverId };
    }
    return s;
  });
  return { ...data, slots };
}

export function estimateTimeOffApproval(
  data: AppData,
  driverId: string,
  date: string,
  routeTypes: RouteType[]
): { percent: number; warnLow: boolean; message: string } {
  const person = data.people.find((p) => p.id === driverId);
  if (!person) {
    return { percent: 0, warnLow: true, message: "Unknown driver." };
  }

  const shadow = shadowDataForTimeOff(data, driverId, date, routeTypes);
  const affected = shadow.slots.filter(
    (s) =>
      s.date === date &&
      routeTypes.includes(s.routeType) &&
      s.driverId === null &&
      s.isGap
  );

  if (affected.length === 0) {
    return {
      percent: 85,
      warnLow: false,
      message:
        "You are not currently scheduled on these routes for that date. Request may still be noted.",
    };
  }

  let gapsWithNoDispatch = 0;
  let gapsWithFewFillIns = 0;

  for (const slot of affected) {
    const sug = suggestFillIns(shadow, slot, 12);
    const dispatchHits = sug.filter((p) => isDispatcherLike(p.role)).length;
    if (dispatchHits === 0) gapsWithNoDispatch++;
    if (sug.length < 2) gapsWithFewFillIns++;
  }

  // Office: if requester covers office today, removing them may drop coverage
  let officePenalty = 0;
  if (hasOfficeSlotsOnDate(data, date)) {
    const requesterOfficeSlots = data.slots.filter(
      (s) =>
        s.date === date &&
        s.isOfficeSlot &&
        s.driverId === driverId &&
        routeTypes.includes(s.routeType)
    );
    if (requesterOfficeSlots.length > 0) {
      const afterRemove = qualifiedOfficeCoverCount(shadow, date);
      if (afterRemove < 1) officePenalty = 40;
      else if (afterRemove === 1) officePenalty = 15;
    }
  }

  let percent = 92;
  percent -= gapsWithNoDispatch * 28;
  percent -= gapsWithFewFillIns * 8;
  percent -= officePenalty;
  percent = Math.max(5, Math.min(95, percent));

  const warnLow = percent < 50;

  let message = "";
  if (percent >= 75) {
    message =
      "Coverage looks good — dispatch can likely absorb this if nothing else breaks that day.";
  } else if (percent >= 50) {
    message =
      "Approval is uncertain — fewer dispatchers or fill-ins look available for these slots.";
  } else {
    message =
      "Whoa! Don't make any plans yet. There's a very low chance that we will be able to approve your request!";
  }

  return { percent: Math.round(percent), warnLow, message };
}

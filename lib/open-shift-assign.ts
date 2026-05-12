import { incrementCoveredAbsence } from "./absence-stats";
import type { AppData, OpenShift } from "./types";

/** Assign driver to slot and mark the posted open shift filled (mutates `data`). */
export function assignOpenShiftToDriver(
  data: AppData,
  slotIdx: number,
  driverId: string,
  personName: string,
  openShift: OpenShift
): void {
  const prevSlot = data.slots[slotIdx];
  if (prevSlot.gapForDriverId) {
    incrementCoveredAbsence(data, prevSlot.gapForDriverId, prevSlot.date);
  }
  data.slots[slotIdx] = {
    ...prevSlot,
    driverId,
    isGap: false,
    gapReason: undefined,
    gapForDriverId: null,
  };
  openShift.status = "filled";
  openShift.claimedById = driverId;
  openShift.claimedByName = personName;
  openShift.pendingClaimDriverId = null;
  openShift.pendingClaimDriverName = null;
  openShift.pendingClaimAt = null;
}

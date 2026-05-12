import type { AppData } from "./types";

/** Cancel open shifts whose slot id is not in the current grid (e.g. after changing week). */
export function cancelOrphanOpenShifts(data: AppData): void {
  const slotIds = new Set(data.slots.map((s) => s.id));
  const stamp = new Date().toISOString();
  for (const o of data.openShifts) {
    if (o.status !== "open") continue;
    if (slotIds.has(o.slotId)) continue;
    o.status = "cancelled";
    o.notificationLog = [
      ...o.notificationLog,
      {
        at: stamp,
        channel: "in-app",
        message:
          "Auto-cancelled: this posting referred to a slot that is not on the calendar for the selected week.",
      },
    ];
  }
}

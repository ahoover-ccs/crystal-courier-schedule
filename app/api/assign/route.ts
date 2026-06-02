import { NextRequest, NextResponse } from "next/server";
import { unplannedGapReason } from "@/lib/absence-labels";
import { incrementCoveredAbsence } from "@/lib/absence-stats";
import { defaultDriverForTemplateDate, slotTemplateForSlot } from "@/lib/availability-helpers";
import { ensureDb, writeDb } from "@/lib/db";
import { refreshSlotOverrideFromSlot } from "@/lib/slot-overrides";
import { canAssignDriver, hasApprovedTimeOffForSlot } from "@/lib/suggestions";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { slotId, driverId } = body as { slotId: string; driverId: string | null };
  if (!slotId) {
    return NextResponse.json({ error: "slotId required" }, { status: 400 });
  }
  const data = await ensureDb();
  const idx = data.slots.findIndex((s) => s.id === slotId);
  if (idx === -1) {
    return NextResponse.json({ error: "Slot not found" }, { status: 404 });
  }
  const prev = data.slots[idx];

  const check = canAssignDriver(data, slotId, driverId);
  if (!check.ok) {
    return NextResponse.json({ error: check.reason }, { status: 409 });
  }

  if (driverId && !prev.driverId && prev.gapForDriverId) {
    incrementCoveredAbsence(data, prev.gapForDriverId, prev.date);
  }

  if (driverId === null) {
    const removedId = prev.driverId;
    const template = slotTemplateForSlot(data, prev);
    const def = template ? defaultDriverForTemplateDate(prev.date, template) : null;
    const hadApprovedTimeOff =
      removedId != null &&
      hasApprovedTimeOffForSlot(data, removedId, prev.date, prev.routeType);
    const keepTimeOffMeta =
      (prev.absenceType === "planned" || Boolean(prev.gapReason?.includes("Time off"))) &&
      prev.gapForDriverId != null;

    if (removedId && !hadApprovedTimeOff && !keepTimeOffMeta && removedId === def) {
      const p = data.people.find((x) => x.id === removedId);
      data.slots[idx] = {
        ...prev,
        driverId: null,
        isGap: true,
        absenceType: "unplanned",
        gapReason: unplannedGapReason(p?.name ?? "Driver"),
        gapForDriverId: removedId,
      };
    } else {
      data.slots[idx] = {
        ...prev,
        driverId: null,
        isGap: true,
        gapReason: keepTimeOffMeta ? prev.gapReason : undefined,
        absenceType: keepTimeOffMeta ? "planned" : undefined,
        gapForDriverId: keepTimeOffMeta ? prev.gapForDriverId : null,
      };
    }
  } else {
    data.slots[idx] = {
      ...prev,
      driverId,
      isGap: false,
      gapReason: undefined,
      absenceType: undefined,
      gapForDriverId: null,
    };
  }

  refreshSlotOverrideFromSlot(data, data.slots[idx]);

  const os = data.openShifts.find((o) => o.slotId === slotId && o.status === "open");
  if (os && driverId) {
    os.status = "filled";
    os.claimedById = driverId;
    const p = data.people.find((x) => x.id === driverId);
    os.claimedByName = p?.name ?? driverId;
    os.pendingClaimDriverId = null;
    os.pendingClaimDriverName = null;
    os.pendingClaimAt = null;
  }
  await writeDb(data);
  return NextResponse.json(data);
}

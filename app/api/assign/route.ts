import { NextRequest, NextResponse } from "next/server";
import { incrementCoveredAbsence } from "@/lib/absence-stats";
import { ensureDb, writeDb } from "@/lib/db";
import { refreshSlotOverrideFromSlot } from "@/lib/slot-overrides";
import { canAssignDriver } from "@/lib/suggestions";

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
    const keepTimeOffMeta =
      Boolean(prev.gapReason?.includes("Time off")) && prev.gapForDriverId != null;
    data.slots[idx] = {
      ...prev,
      driverId: null,
      isGap: true,
      gapReason: keepTimeOffMeta ? prev.gapReason : undefined,
      gapForDriverId: keepTimeOffMeta ? prev.gapForDriverId : null,
    };
  } else {
    data.slots[idx] = {
      ...prev,
      driverId,
      isGap: false,
      gapReason: undefined,
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

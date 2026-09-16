import { NextRequest, NextResponse } from "next/server";
import { ensureDb, writeDb } from "@/lib/db";
import { refreshSlotOverrideFromSlot } from "@/lib/slot-overrides";
import { canAssignVehicle } from "@/lib/vehicles";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { slotId, vehicleId } = body as { slotId: string; vehicleId: string | null };
  if (!slotId) {
    return NextResponse.json({ error: "slotId required" }, { status: 400 });
  }
  if (vehicleId !== null && typeof vehicleId !== "string") {
    return NextResponse.json({ error: "vehicleId must be a string or null" }, { status: 400 });
  }

  const data = await ensureDb();
  const idx = data.slots.findIndex((s) => s.id === slotId);
  if (idx === -1) {
    return NextResponse.json({ error: "Slot not found" }, { status: 404 });
  }

  const check = canAssignVehicle(data, slotId, vehicleId);
  if (!check.ok) {
    return NextResponse.json({ error: check.reason }, { status: 409 });
  }

  const prev = data.slots[idx];
  data.slots[idx] = { ...prev, vehicleId };
  refreshSlotOverrideFromSlot(data, data.slots[idx]);
  await writeDb(data);
  return NextResponse.json(data);
}

import { NextRequest, NextResponse } from "next/server";
import { incrementCoveredAbsence } from "@/lib/absence-stats";
import { ensureDb, writeDb } from "@/lib/db";
import { assignOpenShiftToDriver } from "@/lib/open-shift-assign";
import { refreshSlotOverrideFromSlot } from "@/lib/slot-overrides";
import { canAssignDriver } from "@/lib/suggestions";
import type { AppData, OpenShift } from "@/lib/types";

function assignPersonToSlotDirect(
  data: AppData,
  slotIdx: number,
  driverId: string,
  personName: string
) {
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
}

function submitPendingOpenShiftClaim(
  data: AppData,
  os: OpenShift,
  driverId: string,
  personName: string
): { ok: true } | { ok: false; error: string; status: number } {
  if (os.pendingClaimDriverId) {
    if (os.pendingClaimDriverId === driverId) {
      return {
        ok: false,
        error: "Your sign-up is already waiting for manager approval.",
        status: 409,
      };
    }
    return {
      ok: false,
      error: "Someone else is already waiting for approval on this shift.",
      status: 409,
    };
  }
  const check = canAssignDriver(data, os.slotId, driverId);
  if (!check.ok) {
    return { ok: false, error: check.reason, status: 409 };
  }
  const idx = data.slots.findIndex((s) => s.id === os.slotId);
  if (idx === -1) {
    return { ok: false, error: "Slot missing", status: 404 };
  }
  if (data.slots[idx].driverId) {
    return { ok: false, error: "This shift is no longer open", status: 409 };
  }
  os.pendingClaimDriverId = driverId;
  os.pendingClaimDriverName = personName;
  os.pendingClaimAt = new Date().toISOString();
  return { ok: true };
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { openShiftId, slotId, driverId } = body as {
    openShiftId?: string;
    slotId?: string;
    driverId: string;
  };
  if (!driverId) {
    return NextResponse.json({ error: "driverId required" }, { status: 400 });
  }
  if ((openShiftId ? 1 : 0) + (slotId ? 1 : 0) !== 1) {
    return NextResponse.json(
      { error: "Provide exactly one of openShiftId or slotId" },
      { status: 400 }
    );
  }

  const data = await ensureDb();
  const person = data.people.find((p) => p.id === driverId);
  if (!person) {
    return NextResponse.json({ error: "Person not found" }, { status: 404 });
  }

  if (slotId) {
    const os = data.openShifts.find((o) => o.slotId === slotId && o.status === "open");
    if (os) {
      const pending = submitPendingOpenShiftClaim(data, os, driverId, person.name);
      if (!pending.ok) {
        return NextResponse.json({ error: pending.error }, { status: pending.status });
      }
      await writeDb(data);
      return NextResponse.json(data);
    }

    const idx = data.slots.findIndex((s) => s.id === slotId);
    if (idx === -1) {
      return NextResponse.json({ error: "Slot not found" }, { status: 404 });
    }
    const slot = data.slots[idx];
    if (slot.driverId) {
      return NextResponse.json({ error: "This shift is no longer open" }, { status: 409 });
    }
    const check = canAssignDriver(data, slotId, driverId);
    if (!check.ok) {
      return NextResponse.json({ error: check.reason }, { status: 409 });
    }
    assignPersonToSlotDirect(data, idx, driverId, person.name);
    refreshSlotOverrideFromSlot(data, data.slots[idx]);
    await writeDb(data);
    return NextResponse.json(data);
  }

  const os = data.openShifts.find((o) => o.id === openShiftId);
  if (!os || os.status !== "open") {
    return NextResponse.json({ error: "Shift not available" }, { status: 409 });
  }
  const pending = submitPendingOpenShiftClaim(data, os, driverId, person.name);
  if (!pending.ok) {
    return NextResponse.json({ error: pending.error }, { status: pending.status });
  }
  await writeDb(data);
  return NextResponse.json(data);
}

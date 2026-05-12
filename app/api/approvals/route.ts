import { NextRequest, NextResponse } from "next/server";
import { applyApprovedTimeOffRequestToData } from "@/lib/apply-time-off-approval";
import { ensureDb, writeDb } from "@/lib/db";
import { assignOpenShiftToDriver } from "@/lib/open-shift-assign";
import { refreshSlotOverrideFromSlot } from "@/lib/slot-overrides";
import { isDispatcherLike } from "@/lib/roles";
import {
  notifyShiftSignUpApprovedToDriver,
  notifyTimeOffApprovedToDriver,
} from "@/lib/send-approval-notifications";
import { canAssignDriver } from "@/lib/suggestions";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { type, id, approverId, action } = body as {
    type: "time-off" | "shift";
    id: string;
    approverId: string;
    action: "approve" | "reject";
  };

  if (!type || !id || !approverId || (action !== "approve" && action !== "reject")) {
    return NextResponse.json(
      { error: "type, id, approverId, and action (approve | reject) required" },
      { status: 400 }
    );
  }

  const data = await ensureDb();
  const approver = data.people.find((p) => p.id === approverId);
  if (!approver || !isDispatcherLike(approver.role)) {
    return NextResponse.json(
      { error: "Only owners, ops managers, and dispatchers can approve requests." },
      { status: 403 }
    );
  }

  const scheduleUrl = `${(process.env.APP_PUBLIC_URL ?? "").replace(/\/$/, "") || new URL(req.url).origin}/schedule`;

  if (type === "time-off") {
    const row = data.timeOffRequests.find((r) => r.id === id);
    if (!row) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }
    if (row.status !== "pending") {
      return NextResponse.json({ error: "This request is not pending" }, { status: 409 });
    }

    if (action === "reject") {
      row.status = "rejected";
      await writeDb(data);
      return NextResponse.json({ data: await ensureDb() });
    }

    applyApprovedTimeOffRequestToData(data, row);
    row.status = "approved";
    await writeDb(data);

    const person = data.people.find((p) => p.id === row.driverId);
    if (person) {
      await notifyTimeOffApprovedToDriver({
        person,
        dates: [row.date],
        routeTypes: row.routeTypes,
        scheduleUrl,
      });
    }

    return NextResponse.json({ data: await ensureDb() });
  }

  if (type === "shift") {
    const os = data.openShifts.find((o) => o.id === id);
    if (!os) {
      return NextResponse.json({ error: "Open shift not found" }, { status: 404 });
    }
    if (os.status !== "open" || !os.pendingClaimDriverId) {
      return NextResponse.json({ error: "No pending sign-up for this posting" }, { status: 409 });
    }

    if (action === "reject") {
      os.pendingClaimDriverId = null;
      os.pendingClaimDriverName = null;
      os.pendingClaimAt = null;
      const stamp = new Date().toISOString();
      os.notificationLog = [
        ...os.notificationLog,
        {
          at: stamp,
          channel: "in-app",
          message: `Sign-up declined by ${approver.name}.`,
        },
      ];
      await writeDb(data);
      return NextResponse.json({ data: await ensureDb() });
    }

    const driverId = os.pendingClaimDriverId;
    const person = data.people.find((p) => p.id === driverId);
    if (!person) {
      return NextResponse.json({ error: "Driver not found" }, { status: 404 });
    }

    const check = canAssignDriver(data, os.slotId, driverId);
    if (!check.ok) {
      return NextResponse.json(
        { error: `Cannot approve: ${check.reason}` },
        { status: 409 }
      );
    }

    const idx = data.slots.findIndex((s) => s.id === os.slotId);
    if (idx === -1) {
      return NextResponse.json({ error: "Slot missing" }, { status: 404 });
    }
    if (data.slots[idx].driverId) {
      return NextResponse.json(
        { error: "This shift is no longer open on the schedule" },
        { status: 409 }
      );
    }

    assignOpenShiftToDriver(data, idx, driverId, person.name, os);
    refreshSlotOverrideFromSlot(data, data.slots[idx]);
    await writeDb(data);

    await notifyShiftSignUpApprovedToDriver({
      person,
      label: os.label,
      date: os.date,
      scheduleUrl,
    });

    return NextResponse.json({ data: await ensureDb() });
  }

  return NextResponse.json({ error: "Invalid type" }, { status: 400 });
}

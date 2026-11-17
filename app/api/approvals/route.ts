import { NextRequest, NextResponse } from "next/server";
import { appendActivity } from "@/lib/activity-log";
import { applyApprovedTimeOffRequestToData } from "@/lib/apply-time-off-approval";
import { ensureDb, writeDb } from "@/lib/db";
import { assignOpenShiftToDriver } from "@/lib/open-shift-assign";
import { driverPortalUrl } from "@/lib/public-urls";
import { refreshSlotOverrideFromSlot } from "@/lib/slot-overrides";
import { isDispatcherLike } from "@/lib/roles";
import {
  notifyShiftSignUpApprovedToDriver,
  notifyTimeOffApprovedToDriver,
  notifyTimeOffRejectedToDriver,
} from "@/lib/send-approval-notifications";
import { canAssignDriver } from "@/lib/suggestions";
import { pendingTimeOffBatch } from "@/lib/time-off-batch";
import { withdrawApprovedTimeOffRequest } from "@/lib/withdraw-time-off";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { type, id, approverId, action } = body as {
    type: "time-off" | "shift";
    id: string;
    approverId: string;
    action: "approve" | "reject" | "cancel";
  };

  if (
    !type ||
    !id ||
    !approverId ||
    (action !== "approve" && action !== "reject" && action !== "cancel")
  ) {
    return NextResponse.json(
      { error: "type, id, approverId, and action (approve | reject | cancel) required" },
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

  const scheduleUrl = driverPortalUrl(new URL(req.url).origin);

  if (type === "time-off") {
    const row = data.timeOffRequests.find((r) => r.id === id);
    if (!row) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    if (action === "cancel") {
      if (row.status !== "approved") {
        return NextResponse.json({ error: "Only approved time off can be cancelled" }, { status: 409 });
      }
      withdrawApprovedTimeOffRequest(data, row, approver.name);
      await writeDb(data);
      return NextResponse.json({ data: await ensureDb() });
    }

    if (row.status !== "pending") {
      return NextResponse.json({ error: "This request is not pending" }, { status: 409 });
    }

    const batch = pendingTimeOffBatch(data.timeOffRequests, row);
    const dates = batch.map((item) => item.date);
    const dateSummary =
      dates.length === 1
        ? dates[0]
        : `${dates[0]} through ${dates[dates.length - 1]} (${dates.length} days)`;

    if (action === "reject") {
      for (const item of batch) item.status = "rejected";
      appendActivity(data, {
        category: "time_off",
        summary: `Time off rejected: ${row.driverName} on ${dateSummary} (by ${approver.name})`,
        detail: row.routeTypes.join(", "),
      });
      await writeDb(data);

      const person = data.people.find((p) => p.id === row.driverId);
      if (person) {
        await notifyTimeOffRejectedToDriver({
          person,
          dates,
          routeTypes: row.routeTypes,
        });
      }

      return NextResponse.json({ data: await ensureDb() });
    }

    for (const item of batch) {
      applyApprovedTimeOffRequestToData(data, item);
      item.status = "approved";
    }
    appendActivity(data, {
      category: "time_off",
      summary: `Time off approved: ${row.driverName} on ${dateSummary} (by ${approver.name})`,
      detail: row.routeTypes.join(", "),
    });
    await writeDb(data);

    const person = data.people.find((p) => p.id === row.driverId);
    if (person) {
      await notifyTimeOffApprovedToDriver({
        person,
        dates,
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
    if (action === "cancel") {
      return NextResponse.json({ error: "Cancel only applies to approved time off" }, { status: 400 });
    }

    if (action === "reject") {
      const declinedName = os.pendingClaimDriverName ?? "driver";
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
      appendActivity(data, {
        category: "open_shift",
        summary: `Open shift sign-up rejected: ${declinedName} for ${os.label} on ${os.date} (by ${approver.name})`,
      });
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
    appendActivity(data, {
      category: "open_shift",
      summary: `Open shift filled: ${person.name} on ${os.label} (${os.date}) — approved by ${approver.name}`,
    });
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

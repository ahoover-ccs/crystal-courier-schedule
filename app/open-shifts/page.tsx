"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { addDays, format, parseISO } from "date-fns";
import type { AppData, OpenShift, Person } from "@/lib/types";
import { isDriverLike } from "@/lib/roles";

export default function OpenShiftsPage() {
  const pathname = usePathname();
  const isDriverPortal = pathname.startsWith("/driver");
  const [data, setData] = useState<AppData | null>(null);
  const [claimerId, setClaimerId] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/data");
    setData(await r.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const drivers: Person[] = useMemo(
    () =>
      data?.people
        .filter((p) => isDriverLike(p.role))
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name)) ?? [],
    [data]
  );

  /** Only shifts managers posted with “Notify team” — still open on the schedule. */
  const postedOpenShifts: OpenShift[] = useMemo(() => {
    if (!data) return [];
    const today = format(new Date(), "yyyy-MM-dd");
    const last = format(addDays(new Date(), 30), "yyyy-MM-dd");
    return data.openShifts
      .filter((o) => {
        if (o.status !== "open") return false;
        if (o.date < today || o.date > last) return false;
        const slot = data.slots.find((s) => s.id === o.slotId);
        return Boolean(slot && !slot.driverId);
      })
      .sort((a, b) =>
        a.date === b.date ? a.label.localeCompare(b.label) : a.date.localeCompare(b.date)
      );
  }, [data]);

  const claimOpenShift = async (openShift: OpenShift) => {
    if (!claimerId) {
      setErr("Select who is signing up.");
      return;
    }
    setErr(null);
    setMsg(null);
    const res = await fetch("/api/open-shifts/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ openShiftId: openShift.id, driverId: claimerId }),
    });
    const json = await res.json();
    if (!res.ok) {
      setErr(json.error ?? "Could not claim");
      return;
    }
    setMsg(
      "Sign-up submitted. You’ll get email and text when a manager or dispatcher approves it."
    );
    setData(json as AppData);
  };

  if (!data) return <p className="text-cc-muted">Loading…</p>;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-serif text-3xl text-cc-navy">Open shifts</h1>
      <p className="mt-2 text-sm text-cc-muted">
        Shifts appear here only after a manager uses <strong className="font-medium text-cc-ink">Notify team (email / SMS)</strong>{" "}
        on the schedule. Signing up submits a request; an owner, ops manager, or dispatcher approves it{" "}
        {isDriverPortal ? (
          <span className="font-medium text-cc-ink">in management</span>
        ) : (
          <>
            on{" "}
            <Link href="/approvals" className="font-medium text-cc-navy underline decoration-cc-gold/50 hover:decoration-cc-gold">
              Approvals needed
            </Link>
          </>
        )}
        . Only one pending sign-up per shift.
      </p>

      <div className="mt-6 rounded border border-cc-line bg-cc-paper p-4 shadow-sm">
        <label className="block text-sm font-medium text-cc-ink">Signing up as</label>
        <select
          value={claimerId}
          onChange={(e) => setClaimerId(e.target.value)}
          className="mt-1 w-full max-w-md rounded border border-cc-line bg-white px-3 py-2 font-serif"
        >
          <option value="">Select…</option>
          {drivers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {drivers.length === 0 && (
          <p className="mt-2 text-xs text-cc-muted">No driver roles in the roster yet.</p>
        )}
      </div>

      {err && <p className="mt-4 text-sm text-red-700">{err}</p>}
      {msg && <p className="mt-4 text-sm text-green-800">{msg}</p>}

      <ul className="mt-6 space-y-4">
        {postedOpenShifts.length === 0 && (
          <li className="rounded border border-cc-line bg-white px-4 py-6 text-center text-cc-muted">
            No team-posted open shifts in the next 30 days. Use Notify team on a gap from the schedule
            to list one here.
          </li>
        )}
        {postedOpenShifts.map((o) => {
          const slot = data.slots.find((s) => s.id === o.slotId);
          const pendingId = o.pendingClaimDriverId;
          const pendingForSelf = Boolean(claimerId && pendingId === claimerId);
          const pendingForSomeoneElse = Boolean(pendingId && pendingId !== claimerId);
          return (
            <li key={o.id} className="rounded border border-cc-line bg-white p-4 shadow-sm">
              <p className="font-medium text-cc-navy">{o.label}</p>
              <p className="text-sm text-cc-muted">
                {format(parseISO(o.date), "EEEE, MMMM d, yyyy")}
              </p>
              {slot?.gapReason && (
                <p className="mt-1 text-xs text-amber-900">{slot.gapReason}</p>
              )}
              {pendingId && (
                <p className="mt-2 text-xs text-amber-900">
                  A sign-up is awaiting approval for {o.pendingClaimDriverName ?? "a driver"}.
                </p>
              )}
              {pendingForSelf && (
                <p className="mt-1 text-xs text-green-800">That’s you — you’ll be notified when it’s approved.</p>
              )}
              <button
                type="button"
                onClick={() => claimOpenShift(o)}
                disabled={!drivers.length || !claimerId || pendingForSomeoneElse || pendingForSelf}
                className="mt-3 rounded bg-cc-navy px-4 py-2 text-sm text-cc-paper hover:bg-cc-navy-deep disabled:opacity-50"
              >
                Sign up for this shift
              </button>
            </li>
          );
        })}
      </ul>

      <section className="mt-10 border-t border-cc-line pt-8">
        <h2 className="font-serif text-lg text-cc-navy">Recent notification batches</h2>
        <p className="mt-1 text-xs text-cc-muted">
          From manager “notify team” actions on gaps. Delivery uses Resend / Twilio when configured.
        </p>
        <ul className="mt-3 max-h-48 space-y-2 overflow-y-auto text-xs text-cc-muted">
          {data.openShifts
            .filter((o) => o.notificationLog?.length)
            .flatMap((o) =>
              o.notificationLog.map((n, i) => (
                <li key={`${o.id}-${i}`} className="rounded bg-cc-cream/50 px-2 py-1">
                  [{n.channel}] {n.message}
                </li>
              ))
            )}
          {data.openShifts.every((o) => !o.notificationLog?.length) && (
            <li>No notification log yet.</li>
          )}
        </ul>
      </section>
    </div>
  );
}

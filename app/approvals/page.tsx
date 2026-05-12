"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import type { AppData, OpenShift, Person, TimeOffRequest } from "@/lib/types";
import { isDispatcherLike } from "@/lib/roles";

export default function ApprovalsPage() {
  const [data, setData] = useState<AppData | null>(null);
  const [approverId, setApproverId] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/data");
    setData(await r.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const dispatchers: Person[] = useMemo(
    () =>
      data?.people
        .filter((p) => isDispatcherLike(p.role))
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name)) ?? [],
    [data]
  );

  const pendingTimeOff: TimeOffRequest[] = useMemo(
    () =>
      (data?.timeOffRequests ?? [])
        .filter((r) => r.status === "pending")
        .sort((a, b) => (a.date === b.date ? a.driverName.localeCompare(b.driverName) : a.date.localeCompare(b.date))),
    [data]
  );

  const pendingShiftClaims: OpenShift[] = useMemo(() => {
    if (!data) return [];
    return data.openShifts
      .filter((o) => o.status === "open" && o.pendingClaimDriverId)
      .sort((a, b) => (a.date === b.date ? a.label.localeCompare(b.label) : a.date.localeCompare(b.date)));
  }, [data]);

  const act = async (
    type: "time-off" | "shift",
    id: string,
    action: "approve" | "reject"
  ) => {
    if (!approverId) {
      setErr("Select who is approving.");
      return;
    }
    setErr(null);
    setMsg(null);
    setBusyId(`${type}-${id}-${action}`);
    try {
      const res = await fetch("/api/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, id, approverId, action }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErr(json.error ?? "Request failed");
        return;
      }
      setMsg(action === "approve" ? "Approved. The team member was notified by email and text if we have their contact info." : "Rejected.");
      setData(json.data as AppData);
    } catch {
      setErr("Network error");
    } finally {
      setBusyId(null);
    }
  };

  if (!data) return <p className="text-cc-muted">Loading…</p>;

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-serif text-3xl text-cc-navy">Approvals needed</h1>
      <p className="mt-2 text-sm text-cc-muted">
        Time off requests and open-shift sign-ups appear here. Approving applies the change on the
        schedule and emails/texts the driver when contact info is on file.
      </p>

      <div className="mt-6 rounded border border-cc-line bg-cc-paper p-4 shadow-sm">
        <label className="block text-sm font-medium text-cc-ink">Acting as (owner, ops, or dispatch)</label>
        <select
          value={approverId}
          onChange={(e) => setApproverId(e.target.value)}
          className="mt-1 w-full max-w-md rounded border border-cc-line bg-white px-3 py-2 font-serif"
        >
          <option value="">Select…</option>
          {dispatchers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {dispatchers.length === 0 && (
          <p className="mt-2 text-xs text-cc-muted">No eligible roles in the roster.</p>
        )}
      </div>

      {err && <p className="mt-4 text-sm text-red-700">{err}</p>}
      {msg && <p className="mt-4 text-sm text-green-800">{msg}</p>}

      <section className="mt-10">
        <h2 className="font-serif text-xl text-cc-navy">Time off</h2>
        <ul className="mt-4 space-y-3">
          {pendingTimeOff.length === 0 && (
            <li className="rounded border border-cc-line bg-white px-4 py-4 text-sm text-cc-muted">
              No pending time off requests.
            </li>
          )}
          {pendingTimeOff.map((r) => (
            <li
              key={r.id}
              className="rounded border border-cc-line bg-white p-4 shadow-sm"
            >
              <p className="font-medium text-cc-ink">{r.driverName}</p>
              <p className="text-sm text-cc-muted">
                {format(parseISO(r.date), "EEEE, MMM d, yyyy")} · {r.routeTypes.join(", ")}
              </p>
              {r.note && <p className="mt-1 text-xs text-cc-muted">Note: {r.note}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={Boolean(busyId) || !approverId}
                  onClick={() => act("time-off", r.id, "approve")}
                  className="rounded bg-cc-navy px-3 py-1.5 text-sm text-cc-paper hover:bg-cc-navy-deep disabled:opacity-50"
                >
                  {busyId === `time-off-${r.id}-approve` ? "…" : "Approve"}
                </button>
                <button
                  type="button"
                  disabled={Boolean(busyId) || !approverId}
                  onClick={() => act("time-off", r.id, "reject")}
                  className="rounded border border-cc-line px-3 py-1.5 text-sm text-cc-ink hover:bg-cc-cream/50 disabled:opacity-50"
                >
                  {busyId === `time-off-${r.id}-reject` ? "…" : "Reject"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10 border-t border-cc-line pt-10">
        <h2 className="font-serif text-xl text-cc-navy">Open shift sign-ups</h2>
        <ul className="mt-4 space-y-3">
          {pendingShiftClaims.length === 0 && (
            <li className="rounded border border-cc-line bg-white px-4 py-4 text-sm text-cc-muted">
              No pending shift sign-ups.
            </li>
          )}
          {pendingShiftClaims.map((o) => (
            <li key={o.id} className="rounded border border-cc-line bg-white p-4 shadow-sm">
              <p className="font-medium text-cc-ink">{o.label}</p>
              <p className="text-sm text-cc-muted">
                {format(parseISO(o.date), "EEEE, MMM d, yyyy")}
              </p>
              <p className="mt-2 text-sm text-cc-ink">
                Sign-up: <span className="font-medium">{o.pendingClaimDriverName}</span>
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={Boolean(busyId) || !approverId}
                  onClick={() => act("shift", o.id, "approve")}
                  className="rounded bg-cc-navy px-3 py-1.5 text-sm text-cc-paper hover:bg-cc-navy-deep disabled:opacity-50"
                >
                  {busyId === `shift-${o.id}-approve` ? "…" : "Approve"}
                </button>
                <button
                  type="button"
                  disabled={Boolean(busyId) || !approverId}
                  onClick={() => act("shift", o.id, "reject")}
                  className="rounded border border-cc-line px-3 py-1.5 text-sm text-cc-ink hover:bg-cc-cream/50 disabled:opacity-50"
                >
                  {busyId === `shift-${o.id}-reject` ? "…" : "Reject"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

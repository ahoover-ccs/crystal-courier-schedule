"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import type { AppData, Person, RouteType } from "@/lib/types";

const ROUTE_OPTIONS: { value: RouteType; label: string }[] = [
  { value: "lab", label: "Lab run (early)" },
  { value: "morning", label: "Morning route" },
  { value: "afternoon", label: "Afternoon route" },
  { value: "allday", label: "All day route" },
  { value: "office", label: "Office" },
];

type Preview = {
  estimate: { percent: number; warnLow: boolean; message: string };
  stats: {
    requestedDaysThisYear: number;
    projectedRequestedDaysThisYear: number;
    coveredAbsenceDaysThisYear: number;
    warnManyDaysOff: boolean;
  };
  daysInRange?: number;
};

export default function TimeOffPage() {
  const pathname = usePathname();
  const isDriverPortal = pathname.startsWith("/driver");
  const [data, setData] = useState<AppData | null>(null);
  const [driverId, setDriverId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [types, setTypes] = useState<RouteType[]>([]);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);

  useEffect(() => {
    fetch("/api/data")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setErr("Could not load team list"));
  }, []);

  const people: Person[] =
    data?.people.slice().sort((a, b) => a.name.localeCompare(b.name)) ?? [];

  const effectiveEnd = endDate.trim() && endDate >= startDate ? endDate : undefined;

  const runPreview = useCallback(async () => {
    if (!driverId || !startDate || types.length === 0) {
      setPreview(null);
      return;
    }
    try {
      const res = await fetch("/api/time-off/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driverId,
          date: startDate,
          endDate: effectiveEnd,
          routeTypes: types,
        }),
      });
      const json = await res.json();
      if (res.ok) setPreview(json);
      else setPreview(null);
    } catch {
      setPreview(null);
    }
  }, [driverId, startDate, effectiveEnd, types]);

  useEffect(() => {
    const t = setTimeout(runPreview, 300);
    return () => clearTimeout(t);
  }, [runPreview]);

  const toggleType = (t: RouteType) => {
    setTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    if (!driverId || !startDate || types.length === 0) {
      setErr("Choose a team member, start date, and at least one route type.");
      return;
    }
    if (endDate.trim() && endDate < startDate) {
      setErr("End date must be on or after the start date.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/time-off", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driverId,
          date: startDate,
          endDate: effectiveEnd,
          routeTypes: types,
          note: note || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Request failed");
      const n = (json.datesRequested as string[] | undefined)?.length ?? 1;
      setMsg(
        n === 1
          ? "Time off request submitted for approval. An owner, ops manager, or dispatcher must approve it on Approvals needed before your assignments are cleared. A notification was sent to the scheduling inbox."
          : `${n} time off requests submitted for approval (one per day). Approve each on Approvals needed; until then the schedule is unchanged. A notification was sent to the scheduling inbox.`
      );
      setTypes([]);
      setNote("");
      setEndDate("");
      setPreview(null);
      if (json.data) setData(json.data as AppData);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="font-serif text-3xl text-cc-navy">Request time off</h1>
      <p className="mt-2 text-sm text-cc-muted">
        Choose a single day or a date range (inclusive). Requests go to{" "}
        {isDriverPortal ? (
          <span className="font-medium text-cc-ink">management for approval</span>
        ) : (
          <Link href="/approvals" className="font-medium text-cc-navy underline decoration-cc-gold/50 hover:decoration-cc-gold">
            Approvals needed
          </Link>
        )}{" "}
        first. Once approved,
        only slots where you are assigned for the selected route types are cleared.
      </p>

      <form onSubmit={submit} className="mt-8 space-y-4 rounded border border-cc-line bg-cc-paper p-6 shadow-sm">
        <div>
          <label className="block text-sm font-medium text-cc-ink">Team member</label>
          <select
            required
            value={driverId}
            onChange={(e) => setDriverId(e.target.value)}
            className="mt-1 w-full rounded border border-cc-line bg-white px-3 py-2 font-serif"
          >
            <option value="">Select…</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-cc-ink">From</label>
            <input
              type="date"
              required
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1 w-full rounded border border-cc-line bg-white px-3 py-2 font-serif"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-cc-ink">Through (optional)</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              min={startDate || undefined}
              className="mt-1 w-full rounded border border-cc-line bg-white px-3 py-2 font-serif"
            />
          </div>
        </div>
        <fieldset>
          <legend className="text-sm font-medium text-cc-ink">Route types off</legend>
          <div className="mt-2 space-y-2">
            {ROUTE_OPTIONS.map((o) => (
              <label key={o.value} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={types.includes(o.value)}
                  onChange={() => toggleType(o.value)}
                />
                {o.label}
              </label>
            ))}
          </div>
        </fieldset>

        {preview && (
          <div
            className={`rounded border px-3 py-3 text-sm ${
              preview.estimate.warnLow
                ? "border-amber-400 bg-amber-50 text-amber-950"
                : "border-cc-line bg-white text-cc-ink"
            }`}
          >
            {preview.daysInRange != null && preview.daysInRange > 1 && (
              <p className="mb-2 text-xs text-cc-muted">
                Range: {preview.daysInRange} calendar day{preview.daysInRange === 1 ? "" : "s"} (preview
                uses the tightest approval estimate in the range).
              </p>
            )}
            <p className="font-medium">Estimated approval likelihood: ~{preview.estimate.percent}%</p>
            <p className="mt-1">{preview.estimate.message}</p>
            {preview.estimate.warnLow && (
              <p className="mt-2 font-semibold">
                Whoa! Don&apos;t make any plans yet. There&apos;s a very low chance that we will be able to
                approve your request!
              </p>
            )}
            <p className="mt-2 text-xs text-cc-muted">
              Time off days this year (before this request): {preview.stats.requestedDaysThisYear}. If
              approved, distinct days this year would be about{" "}
              {preview.stats.projectedRequestedDaysThisYear}. Days others covered your routes this
              year: {preview.stats.coveredAbsenceDaysThisYear}.
            </p>
            {preview.stats.warnManyDaysOff && (
              <p className="mt-2 font-medium text-amber-900">
                You&apos;ve reached more than 12 days off this year — please try to limit further
                requests when you can. You can still submit this one.
              </p>
            )}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-cc-ink">Note (optional)</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded border border-cc-line bg-white px-3 py-2 font-serif"
          />
        </div>
        {err && <p className="text-sm text-red-700">{err}</p>}
        {msg && <p className="text-sm text-green-800">{msg}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-cc-navy py-2 text-cc-paper hover:bg-cc-navy-deep disabled:opacity-50"
        >
          {loading ? "Submitting…" : "Submit request"}
        </button>
      </form>
    </div>
  );
}

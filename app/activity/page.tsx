"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import type { ActivityLogEntry, AppData } from "@/lib/types";

const CATEGORY_LABEL: Record<ActivityLogEntry["category"], string> = {
  open_shift: "Open shifts",
  time_off: "Time off",
  reminder: "Reminders",
  announcement: "Announcements",
  roster: "Roster",
  schedule: "Schedule",
};

export default function ActivityLogPage() {
  const [data, setData] = useState<AppData | null>(null);
  const [filter, setFilter] = useState<ActivityLogEntry["category"] | "all">("all");

  const load = useCallback(async () => {
    const r = await fetch("/api/data");
    setData(await r.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const entries = useMemo(() => {
    const list = data?.activityLog ?? [];
    if (filter === "all") return list;
    return list.filter((e) => e.category === filter);
  }, [data, filter]);

  if (!data) return <p className="text-cc-muted">Loading…</p>;

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-sm text-cc-muted">
        <Link href="/settings" className="text-cc-navy underline decoration-cc-gold/50 hover:decoration-cc-gold">
          ← Settings
        </Link>
      </p>
      <h1 className="mt-2 font-serif text-3xl text-cc-navy">Activity log</h1>
      <p className="mt-2 text-sm text-cc-muted">
        Key site events — open-shift notifications, approvals, time off, reminders, and more.
        Entries are kept for about six months.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={`rounded px-3 py-1 text-sm ${
            filter === "all"
              ? "bg-cc-navy text-cc-paper"
              : "border border-cc-line bg-white text-cc-ink hover:bg-cc-cream/50"
          }`}
        >
          All
        </button>
        {(Object.keys(CATEGORY_LABEL) as ActivityLogEntry["category"][]).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setFilter(c)}
            className={`rounded px-3 py-1 text-sm ${
              filter === c
                ? "bg-cc-navy text-cc-paper"
                : "border border-cc-line bg-white text-cc-ink hover:bg-cc-cream/50"
            }`}
          >
            {CATEGORY_LABEL[c]}
          </button>
        ))}
      </div>

      <ul className="mt-6 space-y-3">
        {entries.length === 0 && (
          <li className="rounded border border-cc-line bg-white px-4 py-6 text-center text-sm text-cc-muted">
            No activity logged yet.
          </li>
        )}
        {entries.map((e) => (
          <li key={e.id} className="rounded border border-cc-line bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-xs uppercase tracking-wide text-cc-gold">
                {CATEGORY_LABEL[e.category]}
              </span>
              <time className="text-xs text-cc-muted" dateTime={e.at}>
                {format(parseISO(e.at), "MMM d, yyyy · h:mm a")}
              </time>
            </div>
            <p className="mt-1 text-sm text-cc-ink">{e.summary}</p>
            {e.detail && (
              <pre className="mt-2 whitespace-pre-wrap rounded bg-cc-cream/40 px-2 py-1.5 text-xs text-cc-muted">
                {e.detail}
              </pre>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

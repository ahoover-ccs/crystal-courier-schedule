"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { addDays, format, parseISO } from "date-fns";
import type { AppData, RouteType } from "@/lib/types";
import { isNonDefaultAssignmentForSlot, resolveTemplateLabel } from "@/lib/availability-helpers";
import { formatISODate, mondayOfWeekContaining, weekDaysFromMonday } from "@/lib/week-utils";

function routeStyle(rt: RouteType): string {
  switch (rt) {
    case "lab":
      return "border-l-4 border-l-[#4a6fa5] bg-[#eef3fa]";
    case "morning":
      return "border-l-4 border-l-[#2d8a6e] bg-[#ecf8f3]";
    case "afternoon":
      return "border-l-4 border-l-[#b45309] bg-[#fff6e9]";
    case "allday":
      return "border-l-4 border-l-[#6b4c9a] bg-[#f3eef9]";
    case "office":
      return "border-l-4 border-l-[#1e3a5f] bg-[#e8eef5]";
    default:
      return "";
  }
}

function routeLabel(rt: RouteType): string {
  switch (rt) {
    case "lab":
      return "Lab";
    case "morning":
      return "AM";
    case "afternoon":
      return "PM";
    case "allday":
      return "All day";
    case "office":
      return "Office";
    default:
      return rt;
  }
}

export function DriverScheduleBoard() {
  const [data, setData] = useState<AppData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [weekInput, setWeekInput] = useState("");

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch("/api/data");
      if (!res.ok) throw new Error("Failed to load schedule");
      const json = (await res.json()) as AppData;
      setData(json);
      setWeekInput(json.settings.defaultWeekStart);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Error");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const weekDays = useMemo(() => {
    if (!data) return [];
    return weekDaysFromMonday(data.settings.defaultWeekStart);
  }, [data]);

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    data?.people.forEach((p) => m.set(p.id, p.name));
    return m;
  }, [data]);

  const slotsByTemplate = useMemo(() => {
    if (!data) return [];
    const days = weekDaysFromMonday(data.settings.defaultWeekStart);
    const templates = data.settings.slotTemplates;
    const rows = templates.map((t, index) => {
      const rowSlots = days.map((d) => {
        const id = `${d}__${t.id}`;
        return data.slots.find((s) => s.id === id) ?? null;
      });
      const blankCount = rowSlots.filter((s) => s && !s.driverId).length;
      const nonDefaultCount = rowSlots.filter((s) => s && isNonDefaultAssignmentForSlot(t, s)).length;
      return { template: t, rowSlots, blankCount, nonDefaultCount, index };
    });
    rows.sort((a, b) => {
      if (b.blankCount !== a.blankCount) return b.blankCount - a.blankCount;
      if (b.nonDefaultCount !== a.nonDefaultCount) return b.nonDefaultCount - a.nonDefaultCount;
      return a.index - b.index;
    });
    return rows.map(({ template, rowSlots }) => ({ template, rowSlots }));
  }, [data]);

  const loadWeek = useCallback(async (weekStart: string) => {
    setBusy(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/week-view", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not load that week");
      const next = json.data as AppData;
      setData(next);
      setWeekInput(next.settings.defaultWeekStart);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load week");
    } finally {
      setBusy(false);
    }
  }, []);

  const jumpWeek = (days: number) => {
    if (!data) return;
    const base = parseISO(data.settings.defaultWeekStart);
    const targetMonday = formatISODate(mondayOfWeekContaining(addDays(base, days)));
    void loadWeek(targetMonday);
  };

  if (!data) {
    return <p className="text-cc-muted">{loadError ?? "Loading schedule..."}</p>;
  }

  return (
    <div className="min-w-0 flex-1 overflow-x-auto">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs uppercase tracking-wide text-cc-muted">
            Week (pick any day; calendar jumps to that week)
          </label>
          <input
            type="date"
            value={weekInput}
            onChange={(ev) => {
              const next = ev.target.value;
              setWeekInput(next);
              if (next) void loadWeek(next);
            }}
            className="mt-1 rounded border border-cc-line bg-white px-2 py-1 font-serif text-cc-ink"
          />
        </div>
        <button
          type="button"
          onClick={() => jumpWeek(-7)}
          disabled={busy || !data}
          className="rounded border border-cc-line bg-white px-3 py-2 text-sm text-cc-ink hover:bg-cc-cream/60 disabled:opacity-50"
        >
          Previous week
        </button>
        <button
          type="button"
          onClick={() => jumpWeek(7)}
          disabled={busy || !data}
          className="rounded border border-cc-line bg-white px-3 py-2 text-sm text-cc-ink hover:bg-cc-cream/60 disabled:opacity-50"
        >
          Next week
        </button>
        {busy && <span className="text-sm text-cc-muted">Loading week...</span>}
      </div>
      <p className="mb-4 text-sm text-cc-muted">
        Week of {format(parseISO(data.settings.defaultWeekStart), "MMMM d, yyyy")}. This view is
        read-only for drivers.
      </p>

      <div className="min-w-[640px] rounded border border-cc-line bg-cc-paper shadow-sm">
        <div
          className="grid gap-px bg-cc-line"
          style={{ gridTemplateColumns: `10rem repeat(${weekDays.length}, minmax(0,1fr))` }}
        >
          <div className="bg-cc-navy px-2 py-2 text-xs font-medium uppercase tracking-wide text-cc-paper">
            Route
          </div>
          {weekDays.map((d) => (
            <div key={d} className="bg-cc-navy px-2 py-2 text-center text-xs font-medium text-cc-paper">
              {format(parseISO(d), "EEE M/d")}
            </div>
          ))}

          {slotsByTemplate.map(({ template, rowSlots }) => {
            const { label: routeRowLabel, routeType } = resolveTemplateLabel(
              template,
              data.settings.routeDefinitions
            );

            return (
              <Fragment key={template.id}>
                <div
                  key={`label-${template.id}`}
                  className={`flex flex-col justify-center bg-white px-2 py-2 text-sm ${routeStyle(routeType)}`}
                >
                  <span className="text-xs font-semibold text-cc-muted">{routeLabel(routeType)}</span>
                  <span className="leading-tight text-cc-ink">{routeRowLabel}</span>
                </div>

                {rowSlots.map((slot, i) => {
                  const isNonDefault = slot ? isNonDefaultAssignmentForSlot(template, slot) : false;
                  return (
                    <div key={slot?.id ?? `missing-${template.id}-${i}`} className="bg-cc-cream/40 p-1">
                      <div
                        className={`min-h-[4.5rem] rounded border border-dashed border-cc-line p-2 ${
                          slot?.isGap && !slot.driverId ? "ring-1 ring-amber-500/50" : ""
                        }`}
                      >
                        {slot?.driverId ? (
                          <p
                            className={`rounded px-2 py-1 text-sm text-cc-paper ${
                              isNonDefault ? "bg-cc-gold" : "bg-cc-navy"
                            }`}
                          >
                            {nameById.get(slot.driverId) ?? "Assigned"}
                          </p>
                        ) : (
                          <p className="mt-2 text-center text-xs text-cc-muted">Open</p>
                        )}
                        {slot?.gapReason && (
                          <p className="mt-2 text-xs text-amber-900">{slot.gapReason}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}

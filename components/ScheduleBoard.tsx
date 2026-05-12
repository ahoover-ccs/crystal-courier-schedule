"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { format, parseISO } from "date-fns";
import type { AppData, Person, RouteType, ScheduleSlot } from "@/lib/types";
import {
  hasPendingTimeOffForSlot,
  isNonDefaultAssignmentForSlot,
  resolveTemplateLabel,
} from "@/lib/availability-helpers";
import { roleLabel } from "@/lib/roles";
import { suggestFillIns } from "@/lib/suggestions";
import { formatISODate, mondayOfWeekContaining, weekDaysFromMonday } from "@/lib/week-utils";

const SYNC_DEFAULTS_NOTICE =
  "Refreshed from disk: time-off gaps re-applied, then empty cells filled from Settings defaults.";

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

function DraggableRosterCard({ person }: { person: Person }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `roster-${person.id}`,
    data: { kind: "roster" as const, personId: person.id },
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px,${transform.y}px,0)` }
    : undefined;
  return (
    <button
      type="button"
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`w-full cursor-grab rounded border border-cc-line bg-white px-2 py-1.5 text-left text-sm shadow-sm active:cursor-grabbing ${
        isDragging ? "opacity-60" : ""
      }`}
    >
      <span className="font-medium text-cc-ink">{person.name}</span>
      <span className="ml-2 text-xs text-cc-muted">({roleLabel(person.role)})</span>
    </button>
  );
}

function DraggableAssignChip({
  slotId,
  driverId,
  name,
  isNonDefault,
  isPendingTimeOff,
}: {
  slotId: string;
  driverId: string;
  name: string;
  isNonDefault: boolean;
  isPendingTimeOff: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `assign-${slotId}`,
    data: { kind: "assign" as const, slotId, driverId },
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px,${transform.y}px,0)` }
    : undefined;
  // Pending time off wins over the non-default highlight while approval is in flight.
  const chipColor = isPendingTimeOff
    ? "bg-cc-sky"
    : isNonDefault
      ? "bg-cc-gold"
      : "bg-cc-navy";
  return (
    <button
      type="button"
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      title={isPendingTimeOff ? "Time off requested — pending approval" : undefined}
      className={`mt-1 w-full cursor-grab rounded px-2 py-1 text-left text-sm text-cc-paper active:cursor-grabbing ${chipColor} ${
        isDragging ? "opacity-50" : ""
      }`}
    >
      {name}
    </button>
  );
}

function SlotCell({
  slot,
  occupantName,
  isNonDefaultAssignment,
  isPendingTimeOff,
}: {
  slot: ScheduleSlot;
  occupantName: string | null;
  isNonDefaultAssignment: boolean;
  isPendingTimeOff: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `slot-${slot.id}`,
    data: { kind: "slot" as const, slotId: slot.id },
  });
  return (
    <div
      ref={setNodeRef}
      className={`min-h-[4.5rem] rounded border border-dashed border-cc-line p-1 transition-colors ${
        isOver ? "bg-cc-gold/15 ring-2 ring-cc-gold/40" : "bg-white/80"
      } ${slot.isGap && !slot.driverId ? "ring-1 ring-amber-500/50" : ""}`}
    >
      {slot.driverId && occupantName ? (
        <DraggableAssignChip
          slotId={slot.id}
          driverId={slot.driverId}
          name={occupantName}
          isNonDefault={isNonDefaultAssignment}
          isPendingTimeOff={isPendingTimeOff}
        />
      ) : (
        <p className="mt-2 text-center text-xs text-cc-muted">Drop here</p>
      )}
    </div>
  );
}

function UnassignPool() {
  const { setNodeRef, isOver } = useDroppable({
    id: "unassign-pool",
    data: { kind: "pool" as const },
  });
  return (
    <div
      ref={setNodeRef}
      className={`rounded border border-dashed px-3 py-4 text-center text-sm ${
        isOver ? "border-cc-gold bg-cc-gold/10 text-cc-ink" : "border-cc-muted/40 text-cc-muted"
      }`}
    >
      Drag a name here to unassign
    </div>
  );
}

export function ScheduleBoard() {
  const [data, setData] = useState<AppData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [activeDrag, setActiveDrag] = useState<{ label: string } | null>(null);
  const [weekInput, setWeekInput] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const weekSwitchSeq = useRef(0);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

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

  useEffect(() => {
    if (!weekInput || !data) return;
    let targetMonday: string;
    try {
      targetMonday = formatISODate(mondayOfWeekContaining(parseISO(weekInput)));
    } catch {
      return;
    }
    if (targetMonday === data.settings.defaultWeekStart) return;

    const seq = ++weekSwitchSeq.current;
    const previousMonday = data.settings.defaultWeekStart;

    void (async () => {
      if (seq !== weekSwitchSeq.current) return;
      setBusy(true);
      setLoadError(null);
      setNotice(null);
      try {
        const res = await fetch("/api/week", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ weekStart: targetMonday }),
        });
        const json = await res.json();
        if (seq !== weekSwitchSeq.current) return;
        if (!res.ok) throw new Error(json.error ?? "Week change failed");
        setData(json.data as AppData);
        setWeekInput((json.data as AppData).settings.defaultWeekStart);
        const errs = json.errors as string[] | undefined;
        if (errs?.length) {
          setLoadError(`Some defaults could not be applied: ${errs.join(" · ")}`);
        }
        setNotice(SYNC_DEFAULTS_NOTICE);
      } catch (e) {
        if (seq !== weekSwitchSeq.current) return;
        setLoadError(e instanceof Error ? e.message : "Error");
        setWeekInput(previousMonday);
      } finally {
        if (seq === weekSwitchSeq.current) {
          setBusy(false);
        }
      }
    })();
  }, [weekInput, data?.settings.defaultWeekStart]);

  const weekDays = useMemo(() => {
    if (!data) return [];
    return weekDaysFromMonday(data.settings.defaultWeekStart);
  }, [data]);

  const slotsByTemplate = useMemo(() => {
    if (!data) return [];
    const monday = data.settings.defaultWeekStart;
    const days = weekDaysFromMonday(monday);
    const templates = data.settings.slotTemplates;
    const rows = templates.map((t, index) => {
      const rowSlots = days.map((d) => {
        const id = `${d}__${t.id}`;
        return data.slots.find((s) => s.id === id) ?? null;
      });
      const blankCount = rowSlots.filter((s) => s && !s.driverId).length;
      const nonDefaultCount = rowSlots.filter(
        (s) => s && isNonDefaultAssignmentForSlot(t, s)
      ).length;
      const pendingTimeOffCount = rowSlots.filter(
        (s) =>
          s &&
          s.driverId &&
          hasPendingTimeOffForSlot(data, s.driverId, s.date, s.routeType)
      ).length;
      return { template: t, rowSlots, blankCount, nonDefaultCount, pendingTimeOffCount, index };
    });
    // Row order: empty slots first, then rows with non-default (gold) assignments,
    // then rows with pending-time-off (sky) chips, then the rest in their original order.
    rows.sort((a, b) => {
      if (b.blankCount !== a.blankCount) return b.blankCount - a.blankCount;
      if (b.nonDefaultCount !== a.nonDefaultCount) return b.nonDefaultCount - a.nonDefaultCount;
      if (b.pendingTimeOffCount !== a.pendingTimeOffCount)
        return b.pendingTimeOffCount - a.pendingTimeOffCount;
      return a.index - b.index;
    });
    return rows.map(({ template, rowSlots }) => ({ template, rowSlots }));
  }, [data]);

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    data?.people.forEach((p) => m.set(p.id, p.name));
    return m;
  }, [data]);

  const assign = async (slotId: string, driverId: string | null) => {
    setBusy(true);
    try {
      const res = await fetch("/api/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotId, driverId }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error ?? "Assign failed");
      }
      setData(json as AppData);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Assign failed");
    } finally {
      setBusy(false);
    }
  };

  const refreshSchedule = async () => {
    weekSwitchSeq.current += 1;
    setBusy(true);
    setLoadError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/sync-defaults", {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Refresh failed");
      setData(json.data as AppData);
      setWeekInput((json.data as AppData).settings.defaultWeekStart);
      const errs = json.errors as string[] | undefined;
      if (errs?.length) {
        setLoadError(`Some defaults could not be applied: ${errs.join(" · ")}`);
      }
      setNotice(SYNC_DEFAULTS_NOTICE);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  const notifyTeamForOpenSlot = async (slotId: string) => {
    setBusy(true);
    try {
      const res = await fetch("/api/open-shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Invite failed");
      setData(json.data as AppData);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  const onDragStart = (e: DragStartEvent) => {
    const d = e.active.data.current;
    if (d?.kind === "roster") {
      const p = data?.people.find((x) => x.id === d.personId);
      setActiveDrag({ label: p?.name ?? "" });
    } else if (d?.kind === "assign") {
      const p = data?.people.find((x) => x.id === d.driverId);
      setActiveDrag({ label: p?.name ?? "" });
    }
  };

  const onDragEnd = async (e: DragEndEvent) => {
    setActiveDrag(null);
    const { active, over } = e;
    if (!over || !data) return;
    const overId = String(over.id);
    const activeData = active.data.current as
      | { kind: "roster"; personId: string }
      | { kind: "assign"; slotId: string; driverId: string }
      | undefined;
    const overData = over.data.current as
      | { kind: "slot"; slotId: string }
      | { kind: "pool" }
      | undefined;
    if (!activeData) return;

    if (overData?.kind === "pool" && activeData.kind === "assign") {
      await assign(activeData.slotId, null);
      return;
    }

    if (overData?.kind !== "slot") return;
    const targetSlotId = overData.slotId;

    if (activeData.kind === "roster") {
      await assign(targetSlotId, activeData.personId);
      return;
    }

    if (activeData.kind === "assign") {
      if (activeData.slotId === targetSlotId) return;
      await assign(activeData.slotId, null);
      await assign(targetSlotId, activeData.driverId);
    }
  };

  const gaps = useMemo(() => {
    if (!data) return [];
    return data.slots.filter((s) => !s.driverId && weekDays.includes(s.date));
  }, [data, weekDays]);

  if (!data) {
    return (
      <p className="text-cc-muted">{loadError ?? "Loading schedule…"}</p>
    );
  }

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="flex flex-col gap-6 lg:flex-row">
        <aside className="lg:w-64 lg:shrink-0">
          <h2 className="mb-2 font-serif text-lg text-cc-navy">Team roster</h2>
          <p className="mb-3 text-xs text-cc-muted">
            Drag to adjust or cover gaps. One person can hold multiple non-overlapping routes per day.
            Change the week with the date control or use Refresh—both reload from disk and fill only
            empty, non–gap cells from Settings (saved assignments stay via overrides).
          </p>
          <div className="flex max-h-[50vh] flex-col gap-1 overflow-y-auto rounded border border-cc-line bg-cc-paper p-2 lg:max-h-[70vh]">
            {data.people
              .slice()
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((p) => (
                <DraggableRosterCard key={p.id} person={p} />
              ))}
          </div>
          <div className="mt-4">
            <UnassignPool />
          </div>
        </aside>

        <div className="min-w-0 flex-1 overflow-x-auto">
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs uppercase tracking-wide text-cc-muted">
                Week (pick any day; calendar jumps to that week)
              </label>
              <input
                type="date"
                value={weekInput}
                onChange={(ev) => setWeekInput(ev.target.value)}
                className="mt-1 rounded border border-cc-line bg-white px-2 py-1 font-serif text-cc-ink"
              />
            </div>
            <button
              type="button"
              onClick={() => refreshSchedule()}
              disabled={busy}
              className="rounded bg-cc-gold px-3 py-2 text-sm font-medium text-white shadow hover:bg-cc-navy disabled:opacity-50"
            >
              Refresh
            </button>
            {busy && <span className="text-sm text-cc-muted">Saving…</span>}
          </div>
          <p className="mt-2 max-w-xl text-xs text-cc-muted">
            Changing the week runs the same logic as{" "}
            <strong className="font-medium text-cc-ink">Refresh</strong>, plus rebuilding the Mon–Fri
            grid for that week: read the schedule file, merge saved cell overrides, then fill only empty
            non-gap cells from Settings.
          </p>
          {notice && (
            <p className="mt-2 rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900">
              {notice}
            </p>
          )}
          {loadError && (
            <p className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {loadError}
            </p>
          )}

          <div className="min-w-[640px] rounded border border-cc-line bg-cc-paper shadow-sm">
            <div
              className="grid gap-px bg-cc-line"
              style={{
                gridTemplateColumns: `10rem repeat(${weekDays.length}, minmax(0,1fr))`,
              }}
            >
              <div className="bg-cc-navy px-2 py-2 text-xs font-medium uppercase tracking-wide text-cc-paper">
                Route
              </div>
              {weekDays.map((d) => (
                <div
                  key={d}
                  className="bg-cc-navy px-2 py-2 text-center text-xs font-medium text-cc-paper"
                >
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
                    className={`flex flex-col justify-center bg-white px-2 py-2 text-sm ${routeStyle(routeType)}`}
                  >
                    <span className="text-xs font-semibold text-cc-muted">
                      {routeLabel(routeType)}
                    </span>
                    <span className="leading-tight text-cc-ink">{routeRowLabel}</span>
                  </div>
                  {rowSlots.map((slot, i) =>
                    slot ? (
                      <div key={slot.id} className="bg-cc-cream/40 p-1">
                        <SlotCell
                          slot={slot}
                          occupantName={slot.driverId ? nameById.get(slot.driverId) ?? "?" : null}
                          isNonDefaultAssignment={isNonDefaultAssignmentForSlot(template, slot)}
                          isPendingTimeOff={
                            slot.driverId
                              ? hasPendingTimeOffForSlot(data, slot.driverId, slot.date, slot.routeType)
                              : false
                          }
                        />
                      </div>
                    ) : (
                      <div key={`missing-${template.id}-${i}`} className="bg-zinc-100 p-2 text-xs">
                        —
                      </div>
                    )
                  )}
                </Fragment>
              );
              })}
            </div>
          </div>
        </div>

        <aside className="lg:w-80 lg:shrink-0">
          <h2 className="mb-2 font-serif text-lg text-cc-navy">Gaps &amp; fill-ins</h2>
          <p className="mb-3 text-xs text-cc-muted">
            After time off or unassigning, suggested names follow your priority order in Settings. Use
            notify to email/SMS everyone with no assignment that day (see Resend &amp; Twilio env vars).
          </p>
          <ul className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
            {gaps.length === 0 && (
              <li className="rounded border border-cc-line bg-white px-3 py-2 text-sm text-cc-muted">
                No open routes this week.
              </li>
            )}
            {gaps.map((slot) => {
              const sug = suggestFillIns(data, slot);
              return (
                <li
                  key={slot.id}
                  className="rounded border border-cc-line bg-white p-3 text-sm shadow-sm"
                >
                  <p className="font-medium text-cc-ink">
                    {slot.label} · {format(parseISO(slot.date), "EEE M/d")}
                  </p>
                  {slot.gapReason && (
                    <p className="text-xs text-amber-800">{slot.gapReason}</p>
                  )}
                  <p className="mt-2 text-xs uppercase text-cc-muted">Suggested</p>
                  <ul className="mt-1 space-y-1">
                    {sug.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => assign(slot.id, p.id)}
                          className="text-left text-cc-navy underline decoration-cc-gold/50 hover:decoration-cc-gold"
                        >
                          {p.name}
                        </button>
                      </li>
                    ))}
                    {sug.length === 0 && (
                      <li className="text-xs text-cc-muted">No eligible people (overlap).</li>
                    )}
                  </ul>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => notifyTeamForOpenSlot(slot.id)}
                    className="mt-3 w-full rounded border border-cc-navy px-2 py-1.5 text-xs font-medium text-cc-navy hover:bg-cc-navy hover:text-cc-paper"
                  >
                    Notify team (email / SMS)
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>
      </div>

      <DragOverlay>
        {activeDrag ? (
          <div className="rounded border border-cc-gold bg-cc-paper px-3 py-2 shadow-lg">
            {activeDrag.label}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { normalizeWeeklyAvailability } from "@/lib/availability-helpers";
import { ROLE_OPTIONS, roleLabel, roleNeedsProfileToken } from "@/lib/roles";
import type {
  AppData,
  PersonRole,
  RouteDefinition,
  RouteType,
  SlotTemplate,
  WeekdayKey,
} from "@/lib/types";
import { WEEKDAY_KEYS } from "@/lib/types";

const ROUTE_TYPES: { value: RouteType; label: string }[] = [
  { value: "lab", label: "Lab" },
  { value: "morning", label: "Morning" },
  { value: "afternoon", label: "Afternoon" },
  { value: "allday", label: "All day" },
  { value: "office", label: "Office" },
];

const WEEKDAY_LABELS: Record<WeekdayKey, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
};

const SHIFT_ABBR: Record<RouteType, string> = {
  lab: "L",
  morning: "AM",
  afternoon: "PM",
  allday: "AD",
  office: "Ofc",
};

export function SettingsForm() {
  const [data, setData] = useState<AppData | null>(null);
  const [routeDefs, setRouteDefs] = useState<RouteDefinition[]>([]);
  const [templates, setTemplates] = useState<SlotTemplate[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{
    name: string;
    role: PersonRole;
    email: string;
    phone: string;
  } | null>(null);

  const [newPerson, setNewPerson] = useState({
    name: "",
    role: "full_time_driver" as PersonRole,
    email: "",
    phone: "",
  });

  const load = useCallback(async () => {
    const r = await fetch("/api/data");
    const d = (await r.json()) as AppData;
    setData(d);
    setRouteDefs(d.settings.routeDefinitions.map((x) => ({ ...x })));
    setTemplates(d.settings.slotTemplates.map((t) => ({ ...t, defaultDriversByDay: { ...t.defaultDriversByDay } })));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const move = (id: string, dir: -1 | 1) => {
    if (!data) return;
    const ids = [...data.settings.fillPriorityIds];
    const i = ids.indexOf(id);
    if (i === -1) return;
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    setData({ ...data, settings: { ...data.settings, fillPriorityIds: ids } });
  };

  const savePriority = async () => {
    if (!data) return;
    setErr(null);
    setSaved(null);
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fillPriorityIds: data.settings.fillPriorityIds }),
    });
    if (!res.ok) {
      const j = await res.json();
      setErr(j.error ?? "Save failed");
      return;
    }
    setSaved("Fill-in priority saved.");
    setData(await res.json());
  };

  const saveRoutesAndCatalog = async () => {
    if (!data) return;
    setErr(null);
    setSaved(null);
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        routeDefinitions: routeDefs,
        slotTemplates: templates,
      }),
    });
    if (!res.ok) {
      const j = await res.json();
      setErr(j.error ?? "Save failed");
      return;
    }
    const next = (await res.json()) as AppData;
    setData(next);
    setRouteDefs(next.settings.routeDefinitions.map((x) => ({ ...x })));
    setTemplates(
      next.settings.slotTemplates.map((t) => ({
        ...t,
        defaultDriversByDay: { ...t.defaultDriversByDay },
      }))
    );
    setSaved("Route catalog and schedule rows saved. Open the Schedule page and use Refresh if you added rows.");
  };

  const addPerson = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!newPerson.name.trim()) return;
    const res = await fetch("/api/people", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newPerson.name,
        role: newPerson.role,
        email: newPerson.email || undefined,
        phone: newPerson.phone || undefined,
      }),
    });
    if (!res.ok) {
      const j = await res.json();
      setErr(j.error ?? "Failed to add");
      return;
    }
    setData(await res.json());
    setNewPerson({ name: "", role: "full_time_driver", email: "", phone: "" });
    setSaved("Team member added.");
  };

  const startEdit = (id: string) => {
    const p = data?.people.find((x) => x.id === id);
    if (!p) return;
    setEditingId(id);
    setEditDraft({
      name: p.name,
      role: p.role,
      email: p.email ?? "",
      phone: p.phone ?? "",
    });
  };

  const saveEdit = async () => {
    if (!editingId || !editDraft) return;
    setErr(null);
    const res = await fetch(`/api/people/${editingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editDraft),
    });
    if (!res.ok) {
      const j = await res.json();
      setErr(j.error ?? "Update failed");
      return;
    }
    setData(await res.json());
    setEditingId(null);
    setEditDraft(null);
    setSaved("Person updated.");
  };

  const removePerson = async (id: string) => {
    if (!confirm("Remove this person from the roster? Their defaults and assignments are cleared.")) {
      return;
    }
    setErr(null);
    const res = await fetch(`/api/people/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json();
      setErr(j.error ?? "Delete failed");
      return;
    }
    const next = (await res.json()) as AppData;
    setData(next);
    setTemplates(
      next.settings.slotTemplates.map((t) => ({
        ...t,
        defaultDriversByDay: { ...t.defaultDriversByDay },
      }))
    );
    setSaved("Person removed.");
  };

  const setPersonDayShift = (
    personId: string,
    day: WeekdayKey,
    rt: RouteType,
    available: boolean
  ) => {
    setData((d) => {
      if (!d) return d;
      return {
        ...d,
        people: d.people.map((p) => {
          if (p.id !== personId) return p;
          const w = normalizeWeeklyAvailability(p.weeklyShiftAvailability);
          return {
            ...p,
            weeklyShiftAvailability: {
              ...w,
              [day]: { ...w[day], [rt]: available },
            },
          };
        }),
      };
    });
  };

  const saveAllShiftAvailability = async () => {
    if (!data) return;
    setErr(null);
    setSaved(null);
    const res = await fetch("/api/people/shift-availability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        updates: data.people.map((p) => ({
          id: p.id,
          weeklyShiftAvailability: normalizeWeeklyAvailability(p.weeklyShiftAvailability),
        })),
      }),
    });
    if (!res.ok) {
      const j = await res.json();
      setErr(j.error ?? "Save failed");
      return;
    }
    setData(await res.json());
    setSaved("Shift availability saved.");
  };

  const copyProfileLink = async (token: string) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const link = `${origin}/my-availability?t=${encodeURIComponent(token)}`;
    try {
      await navigator.clipboard.writeText(link);
      setSaved("Personal link copied to clipboard.");
    } catch {
      setErr("Could not copy — copy manually: " + link);
    }
  };

  const regenerateToken = async (personId: string) => {
    if (!confirm("Old personal links will stop working. Continue?")) return;
    setErr(null);
    const res = await fetch(`/api/people/${personId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ regenerateProfileToken: true }),
    });
    if (!res.ok) {
      const j = await res.json();
      setErr(j.error ?? "Failed");
      return;
    }
    setData(await res.json());
    setSaved("New personal link generated — copy it again for this person.");
  };

  const addRouteDefinition = () => {
    setRouteDefs((r) => [
      ...r,
      {
        id: `rd-${Date.now()}`,
        name: "New route",
        routeType: "morning",
      },
    ]);
  };

  const removeRouteDefinition = (id: string) => {
    if (templates.some((t) => t.routeDefinitionId === id)) {
      if (!confirm("This route is used on the schedule grid. Remove those rows first or change them.")) {
        return;
      }
      setTemplates((t) => t.filter((x) => x.routeDefinitionId !== id));
    }
    setRouteDefs((r) => r.filter((x) => x.id !== id));
  };

  const addTemplateRow = () => {
    const first = routeDefs[0]?.id ?? "rd-new";
    const empty: Record<WeekdayKey, string | null> = {
      mon: null,
      tue: null,
      wed: null,
      thu: null,
      fri: null,
    };
    setTemplates((t) => [
      ...t,
      { id: `t-${Date.now()}`, routeDefinitionId: first, defaultDriversByDay: { ...empty } },
    ]);
  };

  const removeTemplateRow = (id: string) => {
    setTemplates((t) => t.filter((x) => x.id !== id));
  };

  const setTemplateDayDriver = (rowId: string, day: WeekdayKey, personId: string | null) => {
    setTemplates((t) =>
      t.map((x) =>
        x.id === rowId
          ? { ...x, defaultDriversByDay: { ...x.defaultDriversByDay, [day]: personId } }
          : x
      )
    );
  };

  if (!data) return <p className="text-cc-muted">Loading…</p>;

  const peopleAlpha = data.people
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="mx-auto max-w-6xl space-y-14">
      {err && (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</p>
      )}
      {saved && (
        <p className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900">{saved}</p>
      )}

      <section>
        <h1 className="font-serif text-3xl text-cc-navy">Settings</h1>
        <p className="mt-2 text-sm text-cc-muted">
          Data file: <code className="rounded bg-cc-cream px-1">data/schedule.json</code>. Add a catalog
          entry with shift type &ldquo;Office&rdquo;, then add a schedule row so an Ops Manager,
          Dispatch, or Owner can be assigned. Office rows can be left open just like any other route.
        </p>
      </section>

      <section className="border-t border-cc-line pt-10">
        <h2 className="font-serif text-2xl text-cc-navy">Team roster</h2>
        <ul className="mt-4 space-y-2 rounded border border-cc-line bg-cc-paper p-4">
          {peopleAlpha.map((p) => (
            <li
              key={p.id}
              className="flex flex-col gap-2 border-b border-cc-line/50 py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between"
            >
              {editingId === p.id && editDraft ? (
                <div className="flex flex-1 flex-wrap items-end gap-2">
                  <input
                    value={editDraft.name}
                    onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
                    className="rounded border border-cc-line px-2 py-1"
                  />
                  <select
                    value={editDraft.role}
                    onChange={(e) =>
                      setEditDraft({ ...editDraft, role: e.target.value as PersonRole })
                    }
                    className="rounded border border-cc-line px-2 py-1"
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                  <input
                    placeholder="Email"
                    value={editDraft.email}
                    onChange={(e) => setEditDraft({ ...editDraft, email: e.target.value })}
                    className="rounded border border-cc-line px-2 py-1 text-sm"
                  />
                  <input
                    placeholder="Phone"
                    value={editDraft.phone}
                    onChange={(e) => setEditDraft({ ...editDraft, phone: e.target.value })}
                    className="rounded border border-cc-line px-2 py-1 text-sm"
                  />
                  <button
                    type="button"
                    onClick={saveEdit}
                    className="rounded bg-cc-navy px-2 py-1 text-sm text-cc-paper"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(null);
                      setEditDraft(null);
                    }}
                    className="text-sm text-cc-muted underline"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <div>
                    <span className="font-medium text-cc-ink">{p.name}</span>
                    <span className="ml-2 text-xs text-cc-muted">({roleLabel(p.role)})</span>
                    {(p.email || p.phone) && (
                      <p className="text-xs text-cc-muted">
                        {p.email}
                        {p.email && p.phone ? " · " : ""}
                        {p.phone}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => startEdit(p.id)}
                        className="text-sm text-cc-navy underline"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => removePerson(p.id)}
                        className="text-sm text-red-700 underline"
                      >
                        Remove
                      </button>
                    </div>
                    {roleNeedsProfileToken(p.role) && p.profileToken && (
                      <div className="flex flex-wrap justify-end gap-2 text-xs">
                        <button
                          type="button"
                          onClick={() => copyProfileLink(p.profileToken!)}
                          className="text-cc-gold underline"
                        >
                          Copy availability link
                        </button>
                        <button
                          type="button"
                          onClick={() => regenerateToken(p.id)}
                          className="text-cc-muted underline"
                        >
                          New link
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>

        <form onSubmit={addPerson} className="mt-6 space-y-3 rounded border border-cc-line bg-white p-4">
          <p className="text-sm font-medium text-cc-ink">Add team member</p>
          <div className="flex flex-wrap gap-2">
            <input
              required
              placeholder="Name"
              value={newPerson.name}
              onChange={(e) => setNewPerson({ ...newPerson, name: e.target.value })}
              className="rounded border border-cc-line px-2 py-1"
            />
            <select
              value={newPerson.role}
              onChange={(e) =>
                setNewPerson({ ...newPerson, role: e.target.value as PersonRole })
              }
              className="rounded border border-cc-line px-2 py-1"
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <input
              placeholder="Email (optional)"
              value={newPerson.email}
              onChange={(e) => setNewPerson({ ...newPerson, email: e.target.value })}
              className="rounded border border-cc-line px-2 py-1 text-sm"
            />
            <input
              placeholder="Phone (optional)"
              value={newPerson.phone}
              onChange={(e) => setNewPerson({ ...newPerson, phone: e.target.value })}
              className="rounded border border-cc-line px-2 py-1 text-sm"
            />
            <button type="submit" className="rounded bg-cc-gold px-3 py-1 text-sm text-white">
              Add
            </button>
          </div>
        </form>
      </section>

      <section className="border-t border-cc-line pt-10">
        <h2 className="font-serif text-2xl text-cc-navy">Shift availability (by day)</h2>
        <p className="mt-2 text-sm text-cc-muted">
          For each weekday, check the shift types someone can cover for fill-in suggestions. Drivers can
          update their own grid via the emailed link on{" "}
          <a href="/my-availability" className="text-cc-navy underline">
            My availability
          </a>
          .
        </p>
        <div className="mt-4 overflow-x-auto rounded border border-cc-line bg-cc-paper">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-cc-line bg-cc-cream/50 text-xs uppercase text-cc-muted">
                <th className="px-2 py-2">Name</th>
                {WEEKDAY_KEYS.map((d) => (
                  <th key={d} className="px-1 py-2">
                    {WEEKDAY_LABELS[d]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {peopleAlpha.map((p) => {
                const w = normalizeWeeklyAvailability(p.weeklyShiftAvailability);
                return (
                  <tr key={p.id} className="border-b border-cc-line/60">
                    <td className="px-2 py-2 align-top">
                      <span className="font-medium text-cc-ink">{p.name}</span>
                      <span className="ml-1 block text-xs text-cc-muted">({roleLabel(p.role)})</span>
                    </td>
                    {WEEKDAY_KEYS.map((d) => (
                      <td key={d} className="px-1 py-2 align-top">
                        <div className="flex flex-col gap-0.5">
                          {ROUTE_TYPES.map((rt) => (
                            <label key={rt.value} className="flex cursor-pointer items-center gap-1 text-xs">
                              <input
                                type="checkbox"
                                checked={w[d][rt.value] !== false}
                                onChange={(e) =>
                                  setPersonDayShift(p.id, d, rt.value, e.target.checked)
                                }
                              />
                              {SHIFT_ABBR[rt.value]}
                            </label>
                          ))}
                        </div>
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <button
          type="button"
          onClick={saveAllShiftAvailability}
          className="mt-3 rounded bg-cc-navy px-4 py-2 text-sm text-cc-paper hover:bg-cc-navy-deep"
        >
          Save shift availability
        </button>
      </section>

      <section className="border-t border-cc-line pt-10">
        <h2 className="font-serif text-2xl text-cc-navy">Route catalog</h2>
        <p className="mt-2 text-sm text-cc-muted">
          Define each customer/route once. Use shift type &ldquo;Office&rdquo; for in-office coverage rows
          (only Ops / Dispatch / Owner can be assigned).
        </p>
        <div className="mt-4 space-y-2 rounded border border-cc-line bg-cc-paper p-4">
          {routeDefs.map((rd) => (
            <div
              key={rd.id}
              className="flex flex-wrap items-center gap-2 border-b border-cc-line/40 py-2 last:border-0"
            >
              <input
                value={rd.name}
                onChange={(e) =>
                  setRouteDefs((r) =>
                    r.map((x) => (x.id === rd.id ? { ...x, name: e.target.value } : x))
                  )
                }
                className="min-w-[8rem] flex-1 rounded border border-cc-line px-2 py-1"
              />
              <select
                value={rd.routeType}
                onChange={(e) =>
                  setRouteDefs((r) =>
                    r.map((x) =>
                      x.id === rd.id ? { ...x, routeType: e.target.value as RouteType } : x
                    )
                  )
                }
                className="rounded border border-cc-line px-2 py-1"
              >
                {ROUTE_TYPES.map((rt) => (
                  <option key={rt.value} value={rt.value}>
                    {rt.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => removeRouteDefinition(rd.id)}
                className="text-xs text-red-700 underline"
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addRouteDefinition}
            className="text-sm text-cc-navy underline"
          >
            Add route to catalog
          </button>
        </div>
      </section>

      <section className="border-t border-cc-line pt-10">
        <h2 className="font-serif text-2xl text-cc-navy">Schedule rows (weekly grid)</h2>
        <p className="mt-2 text-sm text-cc-muted">
          Each row is one line on the Mon–Fri board. Pick the route, then choose the default driver per
          weekday (leave blank for open that day).
        </p>
        <div className="mt-4 overflow-x-auto rounded border border-cc-line bg-cc-paper">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b border-cc-line bg-cc-cream/50 text-xs uppercase text-cc-muted">
                <th className="px-2 py-2">Route</th>
                {WEEKDAY_KEYS.map((d) => (
                  <th key={d} className="px-1 py-2">
                    {WEEKDAY_LABELS[d]}
                  </th>
                ))}
                <th className="w-16" />
              </tr>
            </thead>
            <tbody>
              {templates.map((row) => (
                <tr key={row.id} className="border-b border-cc-line/60">
                  <td className="px-2 py-2">
                    <select
                      value={row.routeDefinitionId}
                      onChange={(e) =>
                        setTemplates((t) =>
                          t.map((x) =>
                            x.id === row.id
                              ? { ...x, routeDefinitionId: e.target.value }
                              : x
                          )
                        )
                      }
                      className="w-full max-w-[14rem] rounded border border-cc-line px-2 py-1"
                    >
                      {routeDefs.map((rd) => (
                        <option key={rd.id} value={rd.id}>
                          {rd.name} ({rd.routeType})
                        </option>
                      ))}
                    </select>
                  </td>
                  {WEEKDAY_KEYS.map((d) => (
                    <td key={d} className="px-1 py-2">
                      <select
                        value={row.defaultDriversByDay[d] ?? ""}
                        onChange={(e) =>
                          setTemplateDayDriver(
                            row.id,
                            d,
                            e.target.value ? e.target.value : null
                          )
                        }
                        className="w-full max-w-[9rem] rounded border border-cc-line px-1 py-1 text-xs"
                      >
                        <option value="">—</option>
                        {peopleAlpha.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </td>
                  ))}
                  <td className="px-2 py-2">
                    <button
                      type="button"
                      onClick={() => removeTemplateRow(row.id)}
                      className="text-xs text-red-700 underline"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={addTemplateRow}
            className="rounded border border-cc-navy px-3 py-1.5 text-sm text-cc-navy hover:bg-cc-navy/5"
          >
            Add schedule row
          </button>
          <button
            type="button"
            onClick={saveRoutesAndCatalog}
            className="rounded bg-cc-navy px-4 py-1.5 text-sm text-cc-paper hover:bg-cc-navy-deep"
          >
            Save catalog &amp; schedule rows
          </button>
        </div>
      </section>

      <section className="border-t border-cc-line pt-10">
        <h2 className="font-serif text-2xl text-cc-navy">Fill-in priority</h2>
        <ul className="mt-4 space-y-2 rounded border border-cc-line bg-cc-paper p-4">
          {data.settings.fillPriorityIds.map((id, idx) => {
            const p = data.people.find((x) => x.id === id);
            if (!p) return null;
            return (
              <li
                key={id}
                className="flex items-center justify-between gap-2 border-b border-cc-line/60 py-2 last:border-0"
              >
                <span>
                  <span className="text-cc-muted">{idx + 1}.</span> {p.name}{" "}
                  <span className="text-xs text-cc-muted">({roleLabel(p.role)})</span>
                </span>
                <span className="flex gap-1">
                  <button
                    type="button"
                    className="rounded border border-cc-line px-2 py-0.5 text-xs hover:bg-cc-cream"
                    onClick={() => move(id, -1)}
                    disabled={idx === 0}
                  >
                    Up
                  </button>
                  <button
                    type="button"
                    className="rounded border border-cc-line px-2 py-0.5 text-xs hover:bg-cc-cream"
                    onClick={() => move(id, 1)}
                    disabled={idx === data.settings.fillPriorityIds.length - 1}
                  >
                    Down
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          onClick={savePriority}
          className="mt-4 rounded bg-cc-gold px-4 py-2 text-sm font-medium text-white hover:bg-cc-navy"
        >
          Save fill-in priority
        </button>
      </section>

      <section className="border-t border-cc-line pt-10">
        <h2 className="font-serif text-2xl text-cc-navy">Announcements</h2>
        <p className="mt-2 text-sm text-cc-muted">
          Post from the Announcements page: it saves to the board (last 30 days), emails everyone with
          an address on file, and texts everyone with a mobile number (Twilio when configured).
        </p>
        <Link
          href="/announcements#post"
          className="mt-4 inline-block rounded border border-cc-navy px-4 py-2 text-sm font-medium text-cc-navy hover:bg-cc-navy/5"
        >
          Post an announcement
        </Link>
      </section>

      <section className="border-t border-cc-line pt-10">
        <h2 className="font-serif text-xl text-cc-navy">Email</h2>
        <p className="mt-2 text-sm text-cc-muted">
          Time off notifies <strong>ahoover@crystalcourier.com</strong> by default. Set{" "}
          <code className="rounded bg-cc-cream px-1">RESEND_API_KEY</code> and{" "}
          <code className="rounded bg-cc-cream px-1">RESEND_FROM</code> for delivery. Availability links
          use the same sender.
        </p>
      </section>
    </div>
  );
}

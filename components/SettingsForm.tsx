"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  compareRouteDefinitionsByDisplayOrder,
  compareSlotTemplatesByDisplayOrder,
} from "@/lib/route-display-order";
import { isActivePerson } from "@/lib/active-people";
import { normalizeWeeklyAvailability } from "@/lib/availability-helpers";
import { syncSlotTemplatesWithCatalog } from "@/lib/sync-catalog-templates";
import { activeRouteDefinitions } from "@/lib/route-catalog";
import { formatISODate, weekStartContaining } from "@/lib/week-utils";
import { ROLE_OPTIONS, roleLabel, roleNeedsProfileToken } from "@/lib/roles";
import type {
  AppData,
  PersonRole,
  RouteDefinition,
  RouteType,
  SlotTemplate,
  Vehicle,
  WeekdayKey,
} from "@/lib/types";
import { WEEKDAY_KEYS } from "@/lib/types";
import { emptyWeekdayIds, normalizeDefaultVehiclesByDay } from "@/lib/vehicles";

import {
  ROUTE_TYPE_CATALOG_OPTIONS,
  SHIFT_AVAILABILITY_ABBR,
  SHIFT_AVAILABILITY_ROUTE_TYPES,
} from "@/lib/route-types";
import { CollapsibleSection } from "./CollapsibleSection";

const WEEKDAY_LABELS: Record<WeekdayKey, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
};

const SHIFT_ABBR = SHIFT_AVAILABILITY_ABBR;

export function SettingsForm() {
  const [data, setData] = useState<AppData | null>(null);
  const [routeDefs, setRouteDefs] = useState<RouteDefinition[]>([]);
  const [templates, setTemplates] = useState<SlotTemplate[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
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
    hiredAt: formatISODate(weekStartContaining(new Date())),
  });

  const [newRoute, setNewRoute] = useState({
    name: "",
    routeType: "morning" as RouteType,
  });
  const [newVehicle, setNewVehicle] = useState({ name: "", plate: "" });

  const [terminateTarget, setTerminateTarget] = useState<{ id: string; name: string } | null>(
    null
  );
  const [terminateEffectiveDate, setTerminateEffectiveDate] = useState("");
  const [terminateBusy, setTerminateBusy] = useState(false);
  const [catalogBusy, setCatalogBusy] = useState(false);
  const [scheduleRowsEffectiveDate, setScheduleRowsEffectiveDate] = useState(
    formatISODate(weekStartContaining(new Date()))
  );

  const applyCatalogFromAppData = useCallback((d: AppData) => {
    setData(d);
    setRouteDefs(
      activeRouteDefinitions(d.settings.routeDefinitions).map((x) => ({ ...x }))
    );
    const activeIds = new Set(activeRouteDefinitions(d.settings.routeDefinitions).map((r) => r.id));
    setTemplates(
      d.settings.slotTemplates
        .filter((t) => activeIds.has(t.routeDefinitionId))
        .map((t) => ({
          ...t,
          defaultDriversByDay: { ...t.defaultDriversByDay },
          defaultVehiclesByDay: normalizeDefaultVehiclesByDay(t),
        }))
    );
    setVehicles((d.settings.vehicles ?? []).map((v) => ({ ...v })));
  }, []);

  const load = useCallback(async () => {
    const r = await fetch("/api/data");
    const d = (await r.json()) as AppData;
    applyCatalogFromAppData(d);
  }, [applyCatalogFromAppData]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!saved || err) return;
    const t = setTimeout(() => setSaved(null), 5000);
    return () => clearTimeout(t);
  }, [saved, err]);

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

  const persistRoutesAndCatalog = async (
    defs: RouteDefinition[],
    tpls: SlotTemplate[],
    options?: { slotTemplatesEffectiveDate?: string }
  ): Promise<boolean> => {
    if (!data) return false;
    setErr(null);
    setCatalogBusy(true);
    const syncedTemplates = syncSlotTemplatesWithCatalog(defs, tpls);
    setTemplates(syncedTemplates);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          routeDefinitions: defs,
          slotTemplates: syncedTemplates,
          ...(options?.slotTemplatesEffectiveDate
            ? { slotTemplatesEffectiveDate: options.slotTemplatesEffectiveDate }
            : {}),
        }),
      });
      if (!res.ok) {
        const j = await res.json();
        setErr(j.error ?? "Save failed");
        return false;
      }
      const next = (await res.json()) as AppData;
      applyCatalogFromAppData(next);
      return true;
    } catch {
      setErr("Save failed");
      return false;
    } finally {
      setCatalogBusy(false);
    }
  };

  const saveRoutesAndCatalog = async (options?: { slotTemplatesEffectiveDate?: string }) => {
    setSaved(null);
    const ok = await persistRoutesAndCatalog(routeDefs, templates, options);
    if (ok) {
      setSaved(
        options?.slotTemplatesEffectiveDate
          ? `Route catalog and schedule rows saved. Grid defaults apply from ${options.slotTemplatesEffectiveDate} forward; earlier dates are unchanged.`
          : "Route catalog and schedule rows saved. The current week on the schedule board was updated."
      );
    }
  };

  const saveScheduleRowsWithEffectiveDate = async () => {
    const effectiveDate = scheduleRowsEffectiveDate.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) {
      setErr("Enter a valid effective date (YYYY-MM-DD) for schedule row changes.");
      return;
    }
    await saveRoutesAndCatalog({ slotTemplatesEffectiveDate: effectiveDate });
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
        hiredAt: newPerson.hiredAt,
      }),
    });
    if (!res.ok) {
      const j = await res.json();
      setErr(j.error ?? "Failed to add");
      return;
    }
    setData(await res.json());
    setNewPerson({
      name: "",
      role: "full_time_driver",
      email: "",
      phone: "",
      hiredAt: formatISODate(weekStartContaining(new Date())),
    });
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

  const openTerminateDialog = (id: string) => {
    const name = data?.people.find((p) => p.id === id)?.name ?? "this person";
    setTerminateEffectiveDate(formatISODate(weekStartContaining(new Date())));
    setTerminateTarget({ id, name });
  };

  const confirmTerminate = async () => {
    if (!terminateTarget) return;
    const effectiveDate = terminateEffectiveDate.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) {
      setErr("Enter a valid effective date (YYYY-MM-DD).");
      return;
    }
    setErr(null);
    setTerminateBusy(true);
    try {
      const res = await fetch(`/api/people/${terminateTarget.id}/terminate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ effectiveDate }),
      });
      const j = await res.json();
      if (!res.ok) {
        setErr(j.error ?? "Termination failed");
        return;
      }
      const next = j as AppData;
      setData(next);
      setTemplates(
        next.settings.slotTemplates.map((t) => ({
          ...t,
          defaultDriversByDay: { ...t.defaultDriversByDay },
        }))
      );
      setSaved(
        `${terminateTarget.name} terminated effective ${effectiveDate}. Past schedule before that date is unchanged.`
      );
      setTerminateTarget(null);
    } catch {
      setErr("Termination failed — check your connection and try again.");
    } finally {
      setTerminateBusy(false);
    }
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
        updates: data.people.filter(isActivePerson).map((p) => ({
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

  const addRouteDefinition = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newRoute.name.trim();
    if (!name) return;
    const routeId = `rd-${Date.now()}`;
    const empty: Record<WeekdayKey, string | null> = {
      mon: null,
      tue: null,
      wed: null,
      thu: null,
      fri: null,
    };
    setRouteDefs((r) => [
      ...r,
      {
        id: routeId,
        name,
        routeType: newRoute.routeType,
      },
    ]);
    setTemplates((t) => [
      ...t,
      {
        id: `t-${Date.now()}`,
        routeDefinitionId: routeId,
        defaultDriversByDay: { ...empty },
        defaultVehiclesByDay: { ...empty },
      },
    ]);
    setNewRoute({ name: "", routeType: "morning" });
    setSaved(null);
  };

  const removeRouteDefinition = async (id: string) => {
    const rd = routeDefs.find((x) => x.id === id);
    const prevDefs = routeDefs;
    const prevTemplates = templates;
    const prevData = data;

    setRouteDefs((r) => r.filter((x) => x.id !== id));
    setTemplates((t) => t.filter((x) => x.routeDefinitionId !== id));
    setErr(null);
    setSaved(null);
    setCatalogBusy(true);

    try {
      const res = await fetch(`/api/settings/routes/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error ?? "Could not remove route");
      }
      applyCatalogFromAppData(json as AppData);
      setSaved(`"${rd?.name ?? "Route"}" removed from the catalog and schedule.`);
    } catch (e) {
      if (prevData) setData(prevData);
      setRouteDefs(prevDefs);
      setTemplates(prevTemplates);
      setErr(e instanceof Error ? e.message : "Could not remove route");
    } finally {
      setCatalogBusy(false);
    }
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
      { id: `t-${Date.now()}`, routeDefinitionId: first, defaultDriversByDay: { ...empty }, defaultVehiclesByDay: { ...empty } },
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

  const setTemplateDayVehicle = (rowId: string, day: WeekdayKey, vehicleId: string | null) => {
    setTemplates((t) =>
      t.map((x) =>
        x.id === rowId
          ? {
              ...x,
              defaultVehiclesByDay: {
                ...(x.defaultVehiclesByDay ?? emptyWeekdayIds()),
                [day]: vehicleId,
              },
            }
          : x
      )
    );
  };

  const saveFleet = async (nextVehicles: Vehicle[]) => {
    if (!data) return false;
    setErr(null);
    setCatalogBusy(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicles: nextVehicles }),
      });
      if (!res.ok) {
        const j = await res.json();
        setErr(j.error ?? "Save failed");
        return false;
      }
      applyCatalogFromAppData((await res.json()) as AppData);
      return true;
    } catch {
      setErr("Save failed");
      return false;
    } finally {
      setCatalogBusy(false);
    }
  };

  const addVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newVehicle.name.trim();
    if (!name) return;
    const plate = newVehicle.plate.trim();
    const next: Vehicle[] = [
      ...vehicles,
      { id: `veh-${Date.now()}`, name, ...(plate ? { plate } : {}) },
    ];
    setSaved(null);
    const ok = await saveFleet(next);
    if (ok) {
      setNewVehicle({ name: "", plate: "" });
      setSaved("Fleet saved.");
    }
  };

  const saveVehicleEdits = async () => {
    setSaved(null);
    const ok = await saveFleet(
      vehicles
        .map((v) => ({
          ...v,
          name: v.name.trim(),
          plate: v.plate?.trim() || undefined,
        }))
        .filter((v) => v.name)
    );
    if (ok) setSaved("Fleet saved.");
  };

  const removeVehicle = async (id: string) => {
    setSaved(null);
    const ok = await saveFleet(vehicles.filter((v) => v.id !== id));
    if (ok) {
      setTemplates((t) =>
        t.map((x) => {
          const days = { ...(x.defaultVehiclesByDay ?? emptyWeekdayIds()) };
          for (const d of WEEKDAY_KEYS) {
            if (days[d] === id) days[d] = null;
          }
          return { ...x, defaultVehiclesByDay: days };
        })
      );
      setSaved("Car removed from the fleet.");
    }
  };

  const routeDefsSorted = useMemo(
    () => routeDefs.slice().sort(compareRouteDefinitionsByDisplayOrder),
    [routeDefs]
  );

  const templatesSorted = useMemo(
    () =>
      templates
        .slice()
        .sort((a, b) => compareSlotTemplatesByDisplayOrder(a, b, routeDefs)),
    [templates, routeDefs]
  );

  if (!data) return <p className="text-cc-muted">Loading…</p>;

  const peopleAlpha = data.people
    .filter(isActivePerson)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="mx-auto max-w-6xl space-y-14">
      {terminateTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-cc-navy/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="terminate-dialog-title"
          onClick={() => !terminateBusy && setTerminateTarget(null)}
        >
          <div
            className="w-full max-w-md rounded border border-cc-line bg-cc-paper p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="terminate-dialog-title" className="font-serif text-xl text-cc-navy">
              Terminate {terminateTarget.name}
            </h2>
            <p className="mt-2 text-sm text-cc-muted">
              Shift availability, schedule row defaults, and fill-in priority are removed
              immediately. The schedule keeps this person&apos;s history before the effective date;
              on and after that date they are cleared from assignments.
            </p>
            <label className="mt-4 block text-sm font-medium text-cc-ink">
              Effective date on schedule
              <input
                type="date"
                value={terminateEffectiveDate}
                onChange={(e) => setTerminateEffectiveDate(e.target.value)}
                className="mt-1 w-full rounded border border-cc-line bg-white px-3 py-2 font-serif"
                disabled={terminateBusy}
              />
            </label>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                disabled={terminateBusy}
                onClick={() => setTerminateTarget(null)}
                className="rounded border border-cc-line px-4 py-2 text-sm text-cc-ink hover:bg-cc-cream"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={terminateBusy}
                onClick={() => void confirmTerminate()}
                className="rounded bg-red-800 px-4 py-2 text-sm text-white hover:bg-red-900 disabled:opacity-50"
              >
                {terminateBusy ? "Terminating…" : "Terminate"}
              </button>
            </div>
          </div>
        </div>
      )}
      {(saved || err) && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-cc-navy/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="settings-feedback-title"
          onClick={() => {
            setSaved(null);
            setErr(null);
          }}
        >
          <div
            className={`w-full max-w-md rounded border p-6 shadow-xl ${
              err ? "border-red-200 bg-red-50" : "border-green-200 bg-green-50"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="settings-feedback-title"
              className={`font-serif text-xl ${err ? "text-red-900" : "text-green-900"}`}
            >
              {err ? "Could not save" : "Saved"}
            </h2>
            <p className={`mt-2 text-sm ${err ? "text-red-800" : "text-green-900"}`}>
              {err ?? saved}
            </p>
            <button
              type="button"
              onClick={() => {
                setSaved(null);
                setErr(null);
              }}
              className={`mt-5 rounded px-4 py-2 text-sm ${
                err
                  ? "bg-red-800 text-white hover:bg-red-900"
                  : "bg-cc-navy text-cc-paper hover:bg-cc-navy-deep"
              }`}
            >
              OK
            </button>
          </div>
        </div>
      )}

      <section>
        <h1 className="font-serif text-3xl text-cc-navy">Settings</h1>
      </section>

      <CollapsibleSection title="Team roster" hint="Add, edit, and terminate team members.">
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
                    {(p.email || p.phone) ? (
                      <p className="text-xs text-cc-muted">
                        {p.email}
                        {p.email && p.phone ? " · " : ""}
                        {p.phone}
                      </p>
                    ) : (
                      <p className="text-xs text-amber-800">
                        No email or phone — open-shift and announcement notifications skip this person.
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
                        onClick={() => openTerminateDialog(p.id)}
                        className="text-sm text-red-700 underline"
                      >
                        Terminate
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
          <p className="text-xs text-cc-muted">
            Hire date is the first day they may appear on the schedule. Days before that are never
            backfilled, even if you set them as a default on schedule rows.
          </p>
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
            <label className="flex items-center gap-2 text-sm text-cc-ink">
              Hire date
              <input
                type="date"
                required
                value={newPerson.hiredAt}
                onChange={(e) => setNewPerson({ ...newPerson, hiredAt: e.target.value })}
                className="rounded border border-cc-line px-2 py-1 font-serif"
              />
            </label>
            <button type="submit" className="rounded bg-cc-gold px-3 py-1 text-sm text-white">
              Add
            </button>
          </div>
        </form>
      </CollapsibleSection>

      <CollapsibleSection title="Shift availability" hint="Which route types each person can cover each weekday.">
        <p className="mt-2 text-sm text-cc-muted">
          For each weekday, check the shift types someone can cover for fill-in suggestions and time-off
          requests. Opener and Closer do not conflict with other routes on the same day. Drivers can
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
                          {SHIFT_AVAILABILITY_ROUTE_TYPES.map((rt) => (
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
      </CollapsibleSection>

      <CollapsibleSection title="Route catalog" hint="Establish customer/route names and shift types.">
        <p className="mt-2 text-sm text-cc-muted">
          Establish an official route here. Adding a route also creates a matching row on the weekly
          grid below. Use <strong className="font-medium text-cc-ink">Remove</strong> to drop a route
          from the live catalog and schedule (past history is kept).
        </p>
        <div className="mt-4 space-y-2 rounded border border-cc-line bg-cc-paper p-4">
          {routeDefsSorted.map((rd) => (
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
                {ROUTE_TYPE_CATALOG_OPTIONS.map((rt) => (
                  <option key={rt.value} value={rt.value}>
                    {rt.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void removeRouteDefinition(rd.id)}
                disabled={catalogBusy}
                className="text-xs text-red-700 underline disabled:opacity-50"
              >
                Remove
              </button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              onClick={() => void saveRoutesAndCatalog()}
              disabled={catalogBusy}
              className="rounded bg-cc-navy px-4 py-1.5 text-sm text-cc-paper hover:bg-cc-navy-deep disabled:opacity-50"
            >
              {catalogBusy ? "Saving…" : "Save route catalog & grid"}
            </button>
          </div>
        </div>
        <form
          onSubmit={addRouteDefinition}
          className="mt-4 space-y-3 rounded border border-cc-line bg-white p-4"
        >
          <p className="text-sm font-medium text-cc-ink">Add route to catalog</p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-sm text-cc-ink">
              Route name
              <input
                required
                placeholder="e.g. Morning route 3"
                value={newRoute.name}
                onChange={(e) => setNewRoute({ ...newRoute, name: e.target.value })}
                className="min-w-[10rem] rounded border border-cc-line px-2 py-1"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-cc-ink">
              Shift type
              <select
                value={newRoute.routeType}
                onChange={(e) =>
                  setNewRoute({ ...newRoute, routeType: e.target.value as RouteType })
                }
                className="rounded border border-cc-line px-2 py-1"
              >
                {ROUTE_TYPE_CATALOG_OPTIONS.map((rt) => (
                  <option key={rt.value} value={rt.value}>
                    {rt.label}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="rounded bg-cc-gold px-3 py-1 text-sm text-white">
              Add
            </button>
          </div>
        </form>
      </CollapsibleSection>

      <CollapsibleSection title="Fleet" hint="Company cars assigned to routes on the schedule board.">
        <p className="mt-2 text-sm text-cc-muted">
          Establish a vehicle here. Then pick the default vehicle below in the “Schedule rows
          (weekly grid)” for each shift.
        </p>
        <div className="mt-4 overflow-x-auto rounded border border-cc-line bg-cc-paper">
          <table className="w-full min-w-[28rem] text-left text-sm">
            <thead>
              <tr className="border-b border-cc-line bg-cc-cream/50 text-xs uppercase text-cc-muted">
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Description</th>
                <th className="w-16" />
              </tr>
            </thead>
            <tbody>
              {vehicles.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-3 py-4 text-cc-muted">
                    No cars yet. Add one below.
                  </td>
                </tr>
              )}
              {vehicles.map((v) => (
                <tr key={v.id} className="border-b border-cc-line/60">
                  <td className="px-3 py-2">
                    <input
                      value={v.name}
                      onChange={(e) =>
                        setVehicles((list) =>
                          list.map((x) => (x.id === v.id ? { ...x, name: e.target.value } : x))
                        )
                      }
                      className="w-full min-w-[8rem] rounded border border-cc-line px-2 py-1"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={v.plate ?? ""}
                      onChange={(e) =>
                        setVehicles((list) =>
                          list.map((x) => (x.id === v.id ? { ...x, plate: e.target.value } : x))
                        )
                      }
                      placeholder="Optional notes"
                      className="w-full min-w-[7rem] rounded border border-cc-line px-2 py-1"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => void removeVehicle(v.id)}
                      disabled={catalogBusy}
                      className="text-xs text-red-700 underline disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          type="button"
          onClick={() => void saveVehicleEdits()}
          disabled={catalogBusy || vehicles.length === 0}
          className="mt-3 rounded bg-cc-navy px-4 py-1.5 text-sm text-cc-paper hover:bg-cc-navy-deep disabled:opacity-50"
        >
          {catalogBusy ? "Saving…" : "Save fleet"}
        </button>
        <form
          onSubmit={(e) => void addVehicle(e)}
          className="mt-4 space-y-3 rounded border border-cc-line bg-white p-4"
        >
          <p className="text-sm font-medium text-cc-ink">Add car</p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-sm text-cc-ink">
              Name
              <input
                required
                placeholder="e.g. Van 4"
                value={newVehicle.name}
                onChange={(e) => setNewVehicle({ ...newVehicle, name: e.target.value })}
                className="min-w-[10rem] rounded border border-cc-line px-2 py-1"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-cc-ink">
              Description
              <input
                placeholder="Optional notes"
                value={newVehicle.plate}
                onChange={(e) => setNewVehicle({ ...newVehicle, plate: e.target.value })}
                className="min-w-[8rem] rounded border border-cc-line px-2 py-1"
              />
            </label>
            <button type="submit" className="rounded bg-cc-gold px-3 py-1 text-sm text-white">
              Add
            </button>
          </div>
        </form>
      </CollapsibleSection>

      <CollapsibleSection title="Schedule rows (weekly grid)" hint="Default drivers and cars for each Mon–Fri schedule line.">
        <p className="mt-2 text-sm text-cc-muted">
          Each route has two lines: one for the default driver per weekday, and one for the default
          car per weekday. Leave a box blank for open that day. Set an effective date when saving so
          earlier schedule dates keep their existing assignments.
        </p>
        <div className="mt-4 overflow-x-auto rounded border border-cc-line bg-cc-paper">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead>
              <tr className="border-b border-cc-line bg-cc-cream/50 text-xs uppercase text-cc-muted">
                <th className="px-2 py-2">Route</th>
                <th className="px-2 py-2">Line</th>
                {WEEKDAY_KEYS.map((d) => (
                  <th key={d} className="px-1 py-2">
                    {WEEKDAY_LABELS[d]}
                  </th>
                ))}
                <th className="w-16" />
              </tr>
            </thead>
            <tbody>
              {templatesSorted.map((row) => (
                <Fragment key={row.id}>
                  <tr className="border-b border-cc-line/30">
                    <td className="px-2 py-2 align-top" rowSpan={2}>
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
                        {routeDefsSorted.map((rd) => (
                          <option key={rd.id} value={rd.id}>
                            {rd.name} ({rd.routeType})
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-2 text-xs font-medium uppercase tracking-wide text-cc-muted">
                      Driver
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
                    <td className="px-2 py-2 align-top" rowSpan={2}>
                      <button
                        type="button"
                        onClick={() => removeTemplateRow(row.id)}
                        className="text-xs text-red-700 underline"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                  <tr className="border-b border-cc-line/60 bg-cc-cream/25">
                    <td className="px-2 py-2 text-xs font-medium uppercase tracking-wide text-cc-muted">
                      Car
                    </td>
                    {WEEKDAY_KEYS.map((d) => (
                      <td key={d} className="px-1 py-2">
                        <select
                          value={row.defaultVehiclesByDay?.[d] ?? ""}
                          onChange={(e) =>
                            setTemplateDayVehicle(
                              row.id,
                              d,
                              e.target.value ? e.target.value : null
                            )
                          }
                          className="w-full max-w-[9rem] rounded border border-cc-line px-1 py-1 text-xs"
                        >
                          <option value="">—</option>
                          {vehicles.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.name}
                              {v.plate ? ` (${v.plate})` : ""}
                            </option>
                          ))}
                        </select>
                      </td>
                    ))}
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <button
            type="button"
            onClick={addTemplateRow}
            className="rounded border border-cc-navy px-3 py-1.5 text-sm text-cc-navy hover:bg-cc-navy/5"
          >
            Add schedule row
          </button>
          <label className="flex flex-col gap-1 text-sm text-cc-ink">
            Effective date
            <input
              type="date"
              value={scheduleRowsEffectiveDate}
              onChange={(e) => setScheduleRowsEffectiveDate(e.target.value)}
              className="rounded border border-cc-line px-2 py-1.5 font-serif"
            />
          </label>
          <button
            type="button"
            onClick={() => void saveScheduleRowsWithEffectiveDate()}
            disabled={catalogBusy}
            className="rounded bg-cc-navy px-4 py-1.5 text-sm text-cc-paper hover:bg-cc-navy-deep disabled:opacity-50"
          >
            {catalogBusy ? "Saving…" : "Save schedule rows & grid"}
          </button>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Fill-in priority" hint="Order used when suggesting coverage for open shifts.">
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
      </CollapsibleSection>

      <CollapsibleSection title="Announcements" hint="Post team-wide messages from the Announcements page.">
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
      </CollapsibleSection>

      <CollapsibleSection title="Email" hint="Who receives time-off notifications.">
        <p className="mt-2 text-sm text-cc-muted">
          Time off notifies <strong>ahoover@crystalcourier.com</strong> by default. Please notify
          Aaron to change this.
        </p>
      </CollapsibleSection>
      <p className="mt-12 border-t border-cc-line pt-6 text-sm text-cc-muted">
        <Link
          href="/activity"
          className="font-medium text-cc-navy underline decoration-cc-gold/50 hover:decoration-cc-gold"
        >
          Activity log
        </Link>
        {" — "}
        notifications, approvals, reminders, and other key site events.
      </p>

    </div>
  );
}

"use client";

import { useCallback, useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import type { RouteType, WeeklyShiftAvailability } from "@/lib/types";
import { WEEKDAY_KEYS, WeekdayKey } from "@/lib/types";
import {
  createDefaultWeeklyShiftAvailability,
  normalizeWeeklyAvailability,
} from "@/lib/availability-helpers";

const STORAGE_KEY = "cc_profile_token";

const ROUTE_TYPES: { value: RouteType; label: string }[] = [
  { value: "lab", label: "Lab" },
  { value: "morning", label: "Morning" },
  { value: "afternoon", label: "Afternoon" },
  { value: "allday", label: "All day" },
  { value: "office", label: "Office" },
];

const DAY_LABEL: Record<WeekdayKey, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
};

function MyAvailabilityInner() {
  const sp = useSearchParams();
  const [emailInput, setEmailInput] = useState("");
  const [linkMsg, setLinkMsg] = useState<string | null>(null);
  const [tokenInput, setTokenInput] = useState("");
  const [token, setToken] = useState("");
  const [name, setName] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [weekly, setWeekly] = useState<WeeklyShiftAvailability>(() =>
    createDefaultWeeklyShiftAvailability()
  );
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (t: string) => {
    if (!t.trim()) {
      setErr("Enter the link or token from your manager, or request a link by email below.");
      return;
    }
    setErr(null);
    setMsg(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/availability?token=${encodeURIComponent(t.trim())}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not load profile");
      setName(json.name);
      setRole(json.role);
      setWeekly(normalizeWeeklyAvailability(json.weeklyShiftAvailability));
      setToken(t.trim());
      try {
        localStorage.setItem(STORAGE_KEY, t.trim());
      } catch {
        /* ignore */
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
      setName(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const q = sp.get("t") || sp.get("token");
    if (q?.trim()) {
      const t = q.trim();
      setTokenInput(t);
      setToken(t);
      load(t);
      return;
    }
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      if (s?.trim()) {
        setTokenInput(s);
        setToken(s);
        load(s);
      }
    } catch {
      /* ignore */
    }
  }, [sp, load]);

  const sendEmailLink = async () => {
    setLinkMsg(null);
    setErr(null);
    if (!emailInput.trim()) {
      setErr("Enter the email address on file with the office.");
      return;
    }
    const res = await fetch("/api/availability/send-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: emailInput.trim(),
        baseUrl: typeof window !== "undefined" ? window.location.origin : "",
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setErr(json.error ?? "Could not send");
      return;
    }
    setLinkMsg("If that email matches a driver on file, a sign-in link was sent. Check your inbox.");
  };

  const save = async () => {
    setErr(null);
    setMsg(null);
    setLoading(true);
    try {
      const res = await fetch("/api/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, weeklyShiftAvailability: weekly }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      setMsg("Your availability was saved.");
      setWeekly(normalizeWeeklyAvailability(json.weeklyShiftAvailability));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  const toggle = (day: WeekdayKey, rt: RouteType) => {
    setWeekly((w) => {
      const n = normalizeWeeklyAvailability(w);
      const cur = n[day][rt] !== false;
      return { ...n, [day]: { ...n[day], [rt]: !cur } };
    });
  };

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-serif text-3xl text-cc-navy">My shift availability</h1>
      <p className="mt-2 text-sm text-cc-muted">
        Enter your work email to receive a secure link (no password to remember). The link opens this
        page with your profile. Then set each weekday and shift type you can work.
      </p>

      <div className="mt-6 rounded border border-cc-line bg-cc-paper p-4 shadow-sm">
        <p className="text-sm font-medium text-cc-ink">Email me a link</p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            type="email"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            placeholder="you@example.com"
            className="flex-1 rounded border border-cc-line bg-white px-3 py-2"
          />
          <button
            type="button"
            onClick={sendEmailLink}
            className="rounded bg-cc-navy px-4 py-2 text-sm text-cc-paper hover:bg-cc-navy-deep"
          >
            Send link
          </button>
        </div>
        {linkMsg && <p className="mt-2 text-sm text-green-800">{linkMsg}</p>}
      </div>

      <div className="mt-8 rounded border border-cc-line bg-cc-paper p-4 shadow-sm">
        <label className="block text-sm font-medium text-cc-ink">Or paste link / token</label>
        <textarea
          value={tokenInput}
          onChange={(e) => setTokenInput(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded border border-cc-line bg-white px-3 py-2 font-mono text-xs"
        />
        <button
          type="button"
          disabled={loading}
          onClick={() => {
            const t = tokenInput.trim();
            setToken(t);
            load(t);
          }}
          className="mt-2 rounded border border-cc-line px-4 py-2 text-sm hover:bg-cc-cream disabled:opacity-50"
        >
          Open profile
        </button>
      </div>

      {err && <p className="mt-4 text-sm text-red-700">{err}</p>}
      {msg && <p className="mt-4 text-sm text-green-800">{msg}</p>}

      {name && (
        <div className="mt-8 space-y-6">
          <p className="text-cc-ink">
            <strong>{name}</strong>
            {role && <span className="text-cc-muted"> ({role})</span>}
          </p>
          <p className="text-xs text-cc-muted">
            Checked = available for fill-in suggestions that day for that shift. Unchecked = do not
            suggest you.
          </p>
          {WEEKDAY_KEYS.map((day) => (
            <div key={day} className="rounded border border-cc-line bg-white p-4">
              <p className="font-medium text-cc-navy">{DAY_LABEL[day]}</p>
              <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                {ROUTE_TYPES.map(({ value, label }) => (
                  <li key={value}>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={normalizeWeeklyAvailability(weekly)[day][value] !== false}
                        onChange={() => toggle(day, value)}
                      />
                      {label}
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <button
            type="button"
            disabled={loading}
            onClick={save}
            className="rounded bg-cc-gold px-4 py-2 text-sm font-medium text-white hover:bg-cc-navy disabled:opacity-50"
          >
            Save availability
          </button>
        </div>
      )}
    </div>
  );
}

export default function MyAvailabilityPage() {
  return (
    <Suspense fallback={<p className="text-cc-muted">Loading…</p>}>
      <MyAvailabilityInner />
    </Suspense>
  );
}

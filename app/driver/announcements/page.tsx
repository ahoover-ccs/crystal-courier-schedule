"use client";

import { useCallback, useEffect, useState } from "react";
import { format, parseISO } from "date-fns";

type Announcement = {
  id: string;
  subject: string;
  body: string;
  createdAt: string;
  createdByName?: string;
};

async function fetchAnnouncements(): Promise<Announcement[]> {
  const r = await fetch("/api/announcements");
  const j = await r.json();
  return j.announcements ?? [];
}

export default function DriverAnnouncementsPage() {
  const [list, setList] = useState<Announcement[]>([]);
  const [listErr, setListErr] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    try {
      setListErr(null);
      setList(await fetchAnnouncements());
    } catch {
      setListErr("Could not load announcements.");
    }
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  return (
    <div className="mx-auto max-w-2xl">
      {listErr && (
        <p className="mb-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          {listErr}
        </p>
      )}
      <h1 className="font-serif text-3xl text-cc-navy">Announcements</h1>
      <p className="mt-2 text-sm text-cc-muted">Read-only organization announcements from management.</p>

      <h2 className="mt-8 font-serif text-xl text-cc-navy">Last 30 days</h2>
      <ul className="mt-4 space-y-6">
        {list.length === 0 && (
          <li className="text-cc-muted">No announcements in the last 30 days.</li>
        )}
        {list.map((a) => (
          <li key={a.id} className="rounded border border-cc-line bg-cc-paper p-5 shadow-sm">
            <p className="text-xs text-cc-muted">
              {format(parseISO(a.createdAt), "EEEE, MMMM d, yyyy 'at' h:mm a")}
              {a.createdByName ? ` · ${a.createdByName}` : ""}
            </p>
            <h3 className="mt-1 font-serif text-xl text-cc-navy">{a.subject}</h3>
            <p className="mt-3 whitespace-pre-wrap text-sm text-cc-ink">{a.body}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

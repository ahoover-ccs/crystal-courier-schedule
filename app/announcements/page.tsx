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

export default function AnnouncementsPage() {
  const [list, setList] = useState<Announcement[]>([]);
  const [listErr, setListErr] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);

  const loadList = useCallback(async () => {
    try {
      setListErr(null);
      setList(await fetchAnnouncements());
    } catch {
      setListErr("Could not load the list below — you can still post.");
    }
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const post = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setSaved(null);
    if (!subject.trim() || !body.trim()) {
      setErr("Subject and message are required.");
      return;
    }
    setPosting(true);
    try {
      const res = await fetch("/api/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: subject.trim(),
          body: body.trim(),
          createdByName: "Manager",
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        setErr(j.error ?? "Post failed");
        return;
      }
      setSubject("");
      setBody("");
      setSaved("Posted. Team was emailed (Resend when configured) and texted (Twilio when configured).");
      setList(await fetchAnnouncements());
    } catch {
      setErr("Could not post announcement.");
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      {listErr && (
        <p className="mb-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          {listErr}
        </p>
      )}
      <h1 className="font-serif text-3xl text-cc-navy">Announcements</h1>
      <p className="mt-2 text-sm text-cc-muted">
        Posts stay on this board for 30 days. Each post also emails the team and sends an SMS to
        everyone with a phone on file (same env vars as other notifications).
      </p>

      <section id="post" className="mt-10 scroll-mt-24 rounded border border-cc-line bg-cc-paper p-5 shadow-sm">
        <h2 className="font-serif text-xl text-cc-navy">Post for the organization</h2>
        <form onSubmit={post} className="mt-4 space-y-3">
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            className="w-full rounded border border-cc-line bg-white px-3 py-2 font-serif"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Message"
            rows={5}
            className="w-full rounded border border-cc-line bg-white px-3 py-2 font-serif"
          />
          {err && <p className="text-sm text-red-700">{err}</p>}
          {saved && <p className="text-sm text-green-800">{saved}</p>}
          <button
            type="submit"
            disabled={posting}
            className="rounded bg-cc-gold px-4 py-2 text-sm font-medium text-white hover:bg-cc-navy disabled:opacity-50"
          >
            {posting ? "Posting…" : "Post, email & text team"}
          </button>
        </form>
      </section>

      <h2 className="mt-12 font-serif text-xl text-cc-navy">Last 30 days</h2>
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

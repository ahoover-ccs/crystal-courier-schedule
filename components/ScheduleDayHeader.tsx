"use client";

import { format, parseISO } from "date-fns";
import { useState } from "react";
import type { ScheduleDayNote } from "@/lib/types";

const NOTE_CLASS =
  "mb-1 rounded px-1.5 py-1 text-left text-[11px] leading-snug bg-cc-sky/25 text-cc-ink ring-1 ring-cc-sky/40";

type Props = {
  date: string;
  note?: ScheduleDayNote;
  editable?: boolean;
  busy?: boolean;
  onSave?: (date: string, text: string) => Promise<void>;
};

export function ScheduleDayHeader({ date, note, editable, busy, onSave }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note?.body ?? "");

  const startEdit = () => {
    setDraft(note?.body ?? "");
    setEditing(true);
  };

  const cancel = () => {
    setDraft(note?.body ?? "");
    setEditing(false);
  };

  const save = async () => {
    if (!onSave) return;
    await onSave(date, draft);
    setEditing(false);
  };

  return (
    <div className="flex min-h-[3.25rem] flex-col bg-cc-navy px-1.5 py-1.5 text-cc-paper">
      {note?.body && !editing && (
        <p className={NOTE_CLASS} title={note.authorName ? `From ${note.authorName}` : undefined}>
          {note.body}
        </p>
      )}
      <div className="text-center text-xs font-medium">{format(parseISO(date), "EEE M/d")}</div>
      {editable && onSave && (
        <div className="mt-1">
          {editing ? (
            <div className="space-y-1" onClick={(e) => e.stopPropagation()}>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={2}
                placeholder="Note for the team…"
                className="w-full rounded border border-cc-line bg-white px-1.5 py-1 text-[11px] text-cc-ink"
                disabled={busy}
              />
              <div className="flex justify-center gap-2 text-[10px]">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void save()}
                  className="rounded bg-cc-gold px-2 py-0.5 text-white disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={cancel}
                  className="text-cc-cream/90 underline"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={startEdit}
              className="mx-auto block text-[10px] text-cc-cream/80 underline hover:text-white"
            >
              {note?.body ? "Edit note" : "Add note"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

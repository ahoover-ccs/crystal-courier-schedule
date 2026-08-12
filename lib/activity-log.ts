import type { ActivityLogEntry, AppData } from "./types";

const MAX_ENTRIES = 500;
const RETENTION_DAYS = 180;

export function pruneActivityLog(entries: ActivityLogEntry[]): ActivityLogEntry[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
  const cutoffISO = cutoff.toISOString();
  return entries
    .filter((e) => e.at >= cutoffISO)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, MAX_ENTRIES);
}

/** Append a site-wide activity log row (newest first). Mutates `data`. */
export function appendActivity(
  data: AppData,
  entry: {
    category: ActivityLogEntry["category"];
    summary: string;
    detail?: string;
    at?: string;
    id?: string;
  }
): void {
  const row: ActivityLogEntry = {
    id: entry.id ?? `act-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: entry.at ?? new Date().toISOString(),
    category: entry.category,
    summary: entry.summary,
    ...(entry.detail?.trim() ? { detail: entry.detail.trim() } : {}),
  };
  data.activityLog = pruneActivityLog([row, ...(data.activityLog ?? [])]);
}

/** Prefer persisted log; backfill once when the field is still missing. */
export function ensureActivityLog(data: AppData): ActivityLogEntry[] {
  if (data.activityLog !== undefined) {
    return pruneActivityLog(data.activityLog);
  }

  const entries: ActivityLogEntry[] = [];

  for (const o of data.openShifts ?? []) {
    for (let i = 0; i < (o.notificationLog ?? []).length; i++) {
      const n = o.notificationLog[i];
      entries.push({
        id: `legacy-os-${o.id}-${i}-${n.at}`,
        at: n.at,
        category: "open_shift",
        summary: `${o.label} · ${o.date}: ${n.message}`,
        detail: `channel: ${n.channel}`,
      });
    }
  }

  for (const r of data.nonDefaultShiftReminders ?? []) {
    entries.push({
      id: `legacy-nd-${r.key}`,
      at: r.sentAt,
      category: "reminder",
      summary: `Non-default shift reminder sent (${r.key})`,
    });
  }

  for (const a of data.announcements ?? []) {
    entries.push({
      id: `legacy-ann-${a.id}`,
      at: a.createdAt,
      category: "announcement",
      summary: `Announcement posted: ${a.subject}`,
      detail: a.createdByName ? `By ${a.createdByName}` : undefined,
    });
  }

  return pruneActivityLog(entries);
}

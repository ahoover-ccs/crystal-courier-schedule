import type { AppData, ScheduleDayNote } from "./types";

export function dayNoteForDate(data: AppData, date: string): ScheduleDayNote | undefined {
  return data.scheduleDayNotes?.find((n) => n.date === date);
}

export function upsertDayNote(
  data: AppData,
  date: string,
  body: string,
  authorName?: string
): void {
  const trimmed = body.trim();
  const rest = (data.scheduleDayNotes ?? []).filter((n) => n.date !== date);
  if (!trimmed) {
    data.scheduleDayNotes = rest.length ? rest : undefined;
    return;
  }
  const row: ScheduleDayNote = {
    date,
    body: trimmed,
    updatedAt: new Date().toISOString(),
    authorName: authorName?.trim() || undefined,
  };
  data.scheduleDayNotes = [...rest, row];
}

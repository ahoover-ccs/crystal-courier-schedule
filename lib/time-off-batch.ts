import type { TimeOffRequest } from "./types";

/**
 * Days from one form submit share `tof-{timestamp}-{index}`.
 * Older one-off rows stay their own batch.
 */
export function timeOffBatchKey(request: TimeOffRequest): string {
  const match = /^tof-(\d+)-\d+$/.exec(request.id);
  if (!match) return request.id;
  const routes = [...request.routeTypes].sort().join(",");
  return `${request.driverId}:${match[1]}:${routes}:${request.note ?? ""}`;
}

/** Pending days from the same submission as `request`, earliest date first. */
export function pendingTimeOffBatch(
  requests: TimeOffRequest[],
  request: TimeOffRequest
): TimeOffRequest[] {
  const key = timeOffBatchKey(request);
  return requests
    .filter((row) => row.status === "pending" && timeOffBatchKey(row) === key)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function groupTimeOffByBatch(requests: TimeOffRequest[]): TimeOffRequest[][] {
  const groups = new Map<string, TimeOffRequest[]>();
  for (const request of requests) {
    const key = timeOffBatchKey(request);
    const group = groups.get(key);
    if (group) group.push(request);
    else groups.set(key, [request]);
  }
  return [...groups.values()].map((group) =>
    group.slice().sort((a, b) => a.date.localeCompare(b.date))
  );
}

import { applyTimeOffRequestToBoard } from "./time-off-apply";
import type { AppData, TimeOffRequest } from "./types";

/** Apply one approved time-off row to slots (mutates `data`). Returns count of assignments cleared. */
export function applyApprovedTimeOffRequestToData(
  data: AppData,
  req: TimeOffRequest
): number {
  return applyTimeOffRequestToBoard(data, req);
}

import { Suspense } from "react";
import { ScheduleBoard } from "@/components/ScheduleBoard";

export default function SchedulePage() {
  return (
    <div>
      <h1 className="font-serif text-3xl text-cc-navy">Weekly route board</h1>
      <p className="mt-2 w-full text-cc-muted">
        Drag a name or car onto a cell to assign, drag a name between cells to move, or click a
        suggested name from the “Fill-in Suggestions” to assign to a route. Drag a name off of the
        grid to unassign a driver. Anything in navy blue is a default, anything in gold is a swap,
        and anything in light blue is pending.
      </p>
      <div className="mt-8">
        <Suspense fallback={<p className="text-cc-muted">Loading schedule…</p>}>
          <ScheduleBoard />
        </Suspense>
      </div>
    </div>
  );
}

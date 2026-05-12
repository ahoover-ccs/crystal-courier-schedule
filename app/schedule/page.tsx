import { ScheduleBoard } from "@/components/ScheduleBoard";

export default function SchedulePage() {
  return (
    <div>
      <h1 className="font-serif text-3xl text-cc-navy">Weekly route board</h1>
      <p className="mt-2 max-w-3xl text-cc-muted">
        Monday through Friday grid. Drag from the roster onto a cell to assign, drag a name between
        cells to move, or drop on the unassign area to clear. Overlapping route types on the same day
        are blocked (for example, all-day and morning cannot double-book).
      </p>
      <div className="mt-8">
        <ScheduleBoard />
      </div>
    </div>
  );
}

import { DriverScheduleBoard } from "@/components/DriverScheduleBoard";

export default function DriverSchedulePage() {
  return (
    <div>
      <h1 className="font-serif text-3xl text-cc-navy">Weekly route board (view only)</h1>
      <p className="mt-2 w-full text-cc-muted">
        This board is view only — contact management for assignment changes. Anything in navy blue is
        a default, anything in gold is a swap, and anything in light blue is pending.
      </p>
      <div className="mt-8">
        <DriverScheduleBoard />
      </div>
    </div>
  );
}

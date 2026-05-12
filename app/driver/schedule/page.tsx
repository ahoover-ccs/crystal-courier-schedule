import { DriverScheduleBoard } from "@/components/DriverScheduleBoard";

export default function DriverSchedulePage() {
  return (
    <div>
      <h1 className="font-serif text-3xl text-cc-navy">Weekly route board (view only)</h1>
      <p className="mt-2 max-w-3xl text-cc-muted">
        Driver view does not allow schedule editing. Contact management for assignment changes.
      </p>
      <div className="mt-8">
        <DriverScheduleBoard />
      </div>
    </div>
  );
}

import Link from "next/link";

export default function DriverPortalPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-xs uppercase tracking-[0.25em] text-cc-gold">Driver portal</p>
      <h1 className="mt-2 font-serif text-4xl text-cc-navy md:text-5xl">Crystal Courier driver tools</h1>
      <p className="mt-4 text-lg leading-relaxed text-cc-muted">
        Access your day-to-day tools here. The schedule page in this portal is view-only.
      </p>

      <div className="mt-10 flex flex-wrap gap-4">
        <Link
          href="/driver/schedule"
          className="rounded bg-cc-navy px-6 py-3 text-cc-paper shadow hover:bg-cc-navy-deep"
        >
          View schedule
        </Link>
        <Link
          href="/driver/open-shifts"
          className="rounded border border-cc-navy px-6 py-3 text-cc-navy hover:bg-cc-navy/5"
        >
          Open shifts
        </Link>
      </div>
    </div>
  );
}

import Link from "next/link";

export default function Home() {
  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-xs uppercase tracking-[0.25em] text-cc-gold">Crystal Courier Service</p>
      <h1 className="mt-2 font-serif text-4xl text-cc-navy md:text-5xl">
        Colorado courier scheduling
      </h1>
      <p className="mt-4 text-lg leading-relaxed text-cc-muted">
        Plan lab runs, morning and afternoon routes, and all-day routes for your team Monday through
        Friday. Drag drivers onto the board, handle time off as schedule gaps, and invite on-call
        team when the office can&apos;t cover.
      </p>
      <div className="mt-10 flex flex-wrap gap-4">
        <Link
          href="/management"
          className="rounded bg-cc-navy px-6 py-3 text-cc-paper shadow hover:bg-cc-navy-deep"
        >
          Management portal
        </Link>
        <Link
          href="/driver"
          className="rounded border border-cc-navy px-6 py-3 text-cc-navy hover:bg-cc-navy/5"
        >
          Driver portal
        </Link>
      </div>
      <ul className="mt-12 space-y-3 border-t border-cc-line pt-8 text-cc-muted">
        <li>
          <strong className="text-cc-ink">Route windows</strong> — Lab (7:00–9:00), morning
          (9:00–12:00), afternoon (12:30–17:00), all day (9:30–17:00). The tool blocks double-booking
          when times overlap.
        </li>
        <li>
          <strong className="text-cc-ink">Fill-in suggestions</strong> — Ordered in Settings
          (dispatchers first by default). Click a name to assign, or notify everyone not on the
          schedule that day (email and SMS when configured).
        </li>
        <li>
          <strong className="text-cc-ink">Open shifts</strong> — Team members can claim a posted
          shift; once claimed, it disappears for everyone else.
        </li>
      </ul>
    </div>
  );
}

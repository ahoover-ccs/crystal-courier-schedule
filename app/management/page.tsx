import Link from "next/link";

export default function ManagementPortalPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-xs uppercase tracking-[0.25em] text-cc-gold">Management portal</p>
      <h1 className="mt-2 font-serif text-4xl text-cc-navy md:text-5xl">Crystal Courier management tools</h1>
      <p className="mt-4 text-lg leading-relaxed text-cc-muted">
        Full access to scheduling operations, approvals, and settings.
      </p>

      <div className="mt-10 flex flex-wrap gap-4">
        <Link
          href="/schedule"
          className="rounded bg-cc-navy px-6 py-3 text-cc-paper shadow hover:bg-cc-navy-deep"
        >
          Open schedule board
        </Link>
        <Link
          href="/approvals"
          className="rounded border border-cc-navy px-6 py-3 text-cc-navy hover:bg-cc-navy/5"
        >
          Approvals needed
        </Link>
      </div>
    </div>
  );
}

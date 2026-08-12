"use client";

import { useState, type ReactNode } from "react";

type Props = {
  title: string;
  children: ReactNode;
  /** Optional short blurb always shown under the title when collapsed. */
  hint?: string;
  defaultOpen?: boolean;
  className?: string;
};

export function CollapsibleSection({
  title,
  children,
  hint,
  defaultOpen = false,
  className = "border-t border-cc-line pt-10",
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className={className}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-start justify-between gap-3 text-left"
      >
        <div className="min-w-0">
          <h2 className="font-serif text-2xl text-cc-navy">{title}</h2>
          {!open && hint && <p className="mt-1 text-sm text-cc-muted">{hint}</p>}
        </div>
        <span className="mt-1 shrink-0 rounded border border-cc-line bg-white px-3 py-1 text-xs font-medium text-cc-navy hover:bg-cc-cream/50">
          {open ? "Collapse" : "Expand"}
        </span>
      </button>
      {open && <div className="mt-2">{children}</div>}
    </section>
  );
}

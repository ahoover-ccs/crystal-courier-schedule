 "use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandLogo } from "./BrandLogo";

const managementLinks = [
  { href: "/", label: "Home" },
  { href: "/management", label: "Management portal" },
  { href: "/schedule", label: "Schedule" },
  { href: "/approvals", label: "Approvals needed" },
  { href: "/time-off", label: "Request time off" },
  { href: "/open-shifts", label: "Open shifts" },
  { href: "/my-availability", label: "My availability" },
  { href: "/announcements", label: "Announcements" },
  { href: "/settings", label: "Settings" },
];

const driverLinks = [
  { href: "/driver", label: "Driver portal" },
  { href: "/driver/schedule", label: "Schedule (view only)" },
  { href: "/driver/time-off", label: "Request time off" },
  { href: "/driver/open-shifts", label: "Open shifts" },
  { href: "/driver/my-availability", label: "My availability" },
  { href: "/driver/announcements", label: "Announcements" },
];

export function SiteNav() {
  const pathname = usePathname();
  const links = pathname.startsWith("/driver") ? driverLinks : managementLinks;

  return (
    <header className="border-b border-cc-line bg-cc-navy text-cc-paper shadow-sm">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <BrandLogo />
          <div className="hidden h-10 w-px bg-cc-line/40 sm:block" aria-hidden />
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-cc-gold-light">Route scheduling</p>
            <p className="font-serif text-lg text-cc-paper/90">Driver &amp; route board</p>
          </div>
        </div>
        <nav className="flex flex-wrap gap-2 sm:gap-4">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-sm px-2 py-1 text-sm text-cc-cream/90 underline-offset-4 hover:text-white hover:underline"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}

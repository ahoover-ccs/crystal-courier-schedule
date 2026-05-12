import { SiteNav } from "./SiteNav";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteNav />
      <div className="mx-auto min-h-[calc(100vh-5rem)] max-w-7xl px-4 py-8">{children}</div>
      <footer className="border-t border-cc-line bg-cc-paper py-6 text-center text-sm text-cc-muted">
        <p>
          Denver based · Mon–Fri operations · Questions?{" "}
          <a href="tel:3035342306" className="text-cc-navy underline">
            303-534-2306
          </a>
        </p>
      </footer>
    </>
  );
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/$/, "");
}

/** Host URL of this Next.js app (Render deploy). Used for token links like /my-availability. */
export function appPublicUrl(fallbackOrigin?: string): string {
  const fromEnv = process.env.APP_PUBLIC_URL?.trim();
  if (fromEnv) return stripTrailingSlash(fromEnv);
  if (fallbackOrigin) return stripTrailingSlash(fallbackOrigin);
  return "http://localhost:3000";
}

/**
 * Link shown in driver emails and SMS (announcements, open shifts, approvals, reminders).
 * Set DRIVER_PORTAL_URL to your employee schedule page (e.g. Google Sites).
 * Falls back to {APP_PUBLIC_URL}/schedule when unset.
 */
export function driverPortalUrl(fallbackOrigin?: string): string {
  const portal = process.env.DRIVER_PORTAL_URL?.trim();
  if (portal) return stripTrailingSlash(portal);
  return `${appPublicUrl(fallbackOrigin)}/schedule`;
}

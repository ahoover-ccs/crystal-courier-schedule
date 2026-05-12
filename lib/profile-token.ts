export function newProfileToken(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return (
      crypto.randomUUID().replace(/-/g, "") +
      crypto.randomUUID().replace(/-/g, "").slice(0, 12)
    );
  }
  return `tok-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

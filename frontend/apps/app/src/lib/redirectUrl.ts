/** Return a canonical browser-safe redirect target, or null for active schemes. */
export function safeRedirectUrl(value: string | undefined): string | null {
  if (!value) return null;

  try {
    const target = new URL(value);
    if (target.protocol !== "https:" && target.protocol !== "http:") return null;
    return target.href;
  } catch {
    return null;
  }
}

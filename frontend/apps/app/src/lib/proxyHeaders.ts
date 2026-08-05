/**
 * Build the small, explicit header allowlist used by the same-origin API proxy.
 *
 * Browser cookies and Authorization headers are deliberately never forwarded:
 * authentication comes only from the server-side httpOnly access cookie. The
 * idempotency key is application data, however, and must survive the proxy so a
 * timed-out create can be retried without producing a second campaign.
 */
export function buildProxyRequestHeaders(
  requestHeaders: Headers,
  accessToken?: string,
): Headers {
  const headers = new Headers();
  for (const name of ["content-type", "accept", "idempotency-key"]) {
    const value = requestHeaders.get(name);
    if (value) headers.set(name, value);
  }
  if (accessToken) headers.set("authorization", `Bearer ${accessToken}`);
  return headers;
}

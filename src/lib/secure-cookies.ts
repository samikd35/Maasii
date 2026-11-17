/** Public deployments default to Secure; only local development may use HTTP cookies. */
export function secureCookies(headers: Pick<Headers, "get">): boolean {
  if (headers.get("x-forwarded-proto") === "https") return true;
  const origin = process.env.MAASII_SITE_URL ? new URL(process.env.MAASII_SITE_URL) : undefined;
  if (origin?.protocol === "https:") return true;
  const host = origin?.hostname ?? headers.get("host")?.replace(/:\d+$/, "");
  return process.env.NODE_ENV === "production" && !["localhost", "127.0.0.1", "[::1]"].includes(host ?? "");
}

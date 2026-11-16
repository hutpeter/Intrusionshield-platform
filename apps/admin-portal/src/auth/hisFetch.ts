type Session = { token: string; tenantId: string; invalid?: () => void };
let session: Session | null = null;
export function setHisSession(value: Session | null) {
  session = value;
}
export function createHisFetch(
  current: () => Session | null,
  origin: () => string,
  send: typeof globalThis.fetch,
): typeof globalThis.fetch {
  return async (input, init) => {
    const base = origin(),
      url = new URL(
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
        base,
      );
    if (url.origin !== base || !/^\/api\/v1\/his(?:\/|$)/.test(url.pathname))
      return send(input, init);
    const active = current();
    if (!active) throw Error("Sign in again to use Athena.");
    const headers = new Headers(
      init?.headers ?? (input instanceof Request ? input.headers : undefined),
    );
    const supplied = headers.get("x-tenant-id");
    if (supplied && supplied.toLowerCase() !== active.tenantId.toLowerCase())
      throw Error("The requested client differs from your signed-in client.");
    headers.set("Authorization", "Bearer " + active.token);
    headers.set("x-tenant-id", active.tenantId);
    const response = await send(input, {
      ...init,
      headers,
      cache: "no-store",
      redirect: "error",
      credentials: "omit",
    });
    if (response.status === 401 && current()?.token === active.token)
      active.invalid?.();
    if (response.status === 403 || response.status === 503) {
      let code = "";
      try {
        code = (await response.clone().json()).error;
      } catch {}
      const messages: Record<string, string> = {
        ATHENA_ACCESS_REQUIRED:
          "Your account does not have permission for this Athena action. Contact your client administrator.",
        ATHENA_FACILITY_SCOPE_UNSUPPORTED:
          "Facility-limited Athena access is not configured. Ask your administrator to review your access.",
        ATHENA_AUTHORIZATION_UNAVAILABLE:
          "Athena account verification is unavailable. Try again shortly.",
        CLIENT_MISMATCH:
          "The requested client differs from your signed-in client.",
      };
      if (messages[code])
        return new Response(JSON.stringify({ error: messages[code], code }), {
          status: response.status,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
          },
        });
    }
    return response;
  };
}
export const hisFetch = createHisFetch(
  () => session,
  () => window.location.origin,
  (input, init) => globalThis.fetch(input, init),
);

# Ruby account browser sign-in

November 13, 2026 · MVP development increment

The separate account-mode web composition now supports username/password sign-in,
session expiry and local application logout. The existing `pnpm sterile:preview`
command continues to use its fictional profiles. It does not enable account mode
or acquire access to a real identity database.

## Implemented functionality

`services/sterile-processing/src/security/browser.ts` exports
`createSterileBrowserApp`. Configuration must explicitly provide an exact HTTPS
origin, a server-selected tenant/facility, facility name/time zone, workflow
repository, current Ruby identity repository, access directory, token verification
configuration and a `signIn` delegate. A missing dependency cannot select a demo
identity/store or downgrade to HTTP. The optional `webRoot` serves the built web
application and marks its entry document for account mode; there is no client
fallback from a failed account endpoint to demo access.

- **Sign-in:** `/auth/session` supplies a pre-login CSRF token in an opaque
  HttpOnly/Secure/SameSite=Strict `__Host-ruby-sterile` cookie session. POST
  `/auth/login` requires the exact Origin and CSRF token and accepts only username
  and password. Tenant, facility and role are not browser inputs. Credentials are
  delegated to Ruby; the resulting signed access token, current identity and
  facility access are checked before sign-in succeeds. Invalid credentials/access
  share a generic response. The form clears its password after every attempt.
- **Session:** successful login rotates cookie and CSRF token. Only a SHA-256
  cookie digest indexes the server-side session; the Ruby access token stays in
  server memory. No token, password or session ID is returned in JSON or placed
  in browser storage. Sessions expire absolutely after at most 30 minutes and
  never outlive the verified token. Activity does not silently extend the deadline.
- **Protected actions:** cookie-authenticated writes require Origin and CSRF.
  Supplied browser bearer headers are rejected. A private server-side bridge
  supplies the session's token to the existing bearer service; the API continues
  to check current identity, facility capability and granular permissions. UI
  affordances are not authorization. Current account disablement or facility
  revocation prevents further access; outages fail closed with safe errors.
- **Logout:** POST `/auth/logout` invalidates the authenticated server session
  and replaces its cookie with a fresh anonymous session. Replaying the previous
  cookie cannot access records. This is local application logout; it does not
  revoke every separately issued Ruby token or sign out other applications.
- **Web behavior:** account mode has localized ES/EN/FR credentials fields,
  signed-in identity display and generic invalid-login feedback instead of the
  demo role picker. Session loss unmounts the workspace and clears its records and
  drafts through the existing lifecycle. The expiry timer and focus recheck cover
  a suspended browser. The account screen does not display dummy-profile branding.

Login attempts are limited to ten per minute per socket IP, independently of new
anonymous cookies. There are at most 1,000 in-process sessions. This is an explicit
single-process implementation: restart/disposal loses sessions and requires a new
sign-in. It does not offer shared sessions, silent refresh, password recovery,
account enrollment or administration. A reverse proxy must preserve the exact
public Host and terminate trusted HTTPS; socket-based throttling behind a proxy
may group users together. Do not enable arbitrary forwarded-IP trust or log
credentials, cookies, authorization headers or sign-in request bodies.

## Connecting the existing Ruby authentication service

Use the existing `AuthenticationService` rather than creating another password
store. The delegate contract returns null for rejected credentials and throws for
service failures. For example, in the explicit host composition:

```ts
const browser = createSterileBrowserApp({
  origin: configuredHttpsOrigin,
  facilityId: serverSelectedFacilityId,
  facilityName: configuredFacilityName,
  timeZone: configuredFacilityTimeZone,
  webRoot: builtWebRoot,
  repository: workflowRepository,
  directory: sterileAccessDirectory,
  identities: rubyIdentityRepository,
  authentication: configuredRubyTokenVerification,
  signIn: async (input) => {
    try {
      return await rubyAuthenticationService.authenticate(input);
    } catch (error) {
      if (error instanceof AuthenticationError) return null;
      throw error;
    }
  },
});
// Host browser.app behind the configured HTTPS endpoint.
// On shutdown, stop accepting requests and call browser.dispose().
```

This is a composition example, not a new launch command. No real credentials,
identity service or production database was accessed. The current preview launcher
does not instantiate these dependencies. Configured account-service/runtime
wiring and authorized access administration remain necessary before a client can
sign in to a runnable pilot. Passwords/secrets must not be pasted into chat or
hardcoded in source. The local directory remains explicit enrollment/grants, not
central tenant entitlement integration.

## Verification and owner status

175 service tests and 89 web tests passed, including five new browser-auth service
tests and two account-mode web tests. Service and web builds passed. HTTPS Chromium
on isolated fictional identities verified invalid-password feedback/clearing,
successful sign-in, cookie security, no token browser storage, an attributed UI
write, reload, logout/re-login, disabled-account clearing, localization and mobile
layout. This used a test authentication delegate and temporary grants, not the
deployed Ruby password service. The existing large-chunk build warning remains.
Chromium also verified the existing HTTP dummy-preview role picker and login
still reach the dashboard without exposing account-mode credential fields.

No owner account-mode check is requested yet: the existing preview still has demo
profiles, and the account-service/runtime composition is not configured for the
owner's installation. Owner acceptance and real-service sign-in are pending.
Next: wire a runnable account composition and authorized access/role management;
then independent inspection and verified exception gaps. RSP-ISS-001 remains
unimplemented; these session checks do not satisfy person separation.

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAuth } from "./auth/AuthProvider.js";
type Context = {
  kind: "SUPERUSER" | "CLIENT_ADMIN" | "USER";
  tenantId: string;
  facilityIds: string[];
  productKeys: string[];
};
type User = {
  id: string;
  tenantId: string;
  username: string;
  email: string;
  displayName: string;
  kind: Context["kind"];
  status: string;
  personId: string | null;
  roleIds: string[];
  facilityIds: string[];
  productKeys: string[];
  version: number;
};
type Role = { id: string; name: string; permissions: string[] };
type Client = { id: string; displayName: string; status: string };
type Audit = {
  id: string;
  action: string;
  actorId: string;
  targetId: string;
  at: string;
  reason: string;
};
const empty = {
  username: "",
  email: "",
  displayName: "",
  kind: "USER",
  personId: "",
  facilityIds: "",
  productKeys: "",
  roleIds: [] as string[],
  reason: "",
  confirmed: false,
};
const split = (value: string) => value.split(/[\s,]+/).filter(Boolean);
const messages: Record<string, string> = {
  SIGN_IN_REQUIRED: "Sign in again to continue.",
  ACCOUNT_ADMIN_REQUIRED: "This account cannot manage client users.",
  SUPERUSER_REQUIRED:
    "Only a superuser can create or manage client administrators.",
  ACCOUNT_NOT_MANAGEABLE: "This account cannot be changed here.",
  STALE_ACCOUNT: "This account changed. Close the form, refresh and try again.",
  ROLE_NOT_DELEGATABLE:
    "A selected role is outside your administration authority.",
  ACCESS_NOT_DELEGATABLE:
    "Select only facilities and products assigned to you.",
  PERSON_MAPPING_IMMUTABLE:
    "An assigned person cannot be changed. Keep the existing mapping.",
  ACCOUNT_ALREADY_EXISTS:
    "That username or email already exists for this client.",
  CLIENT_UNAVAILABLE: "This client is unavailable.",
  ACCOUNT_ADMIN_UNAVAILABLE:
    "Account administration is unavailable. Check service setup or try again.",
  HTTPS_REQUIRED: "Open the secure administration URL to continue.",
  INVALID_FIELDS: "Some form fields are invalid.",
  INVALID_PROFILE: "Check the username, display name and email.",
  INVALID_ID:
    "An account or client identifier is invalid. Refresh and try again.",
  INVALID_PERSON_ID:
    "Person identifier must be an existing person UUID, or left blank.",
  INVALID_FACILITY_ID:
    "Facility identifiers must be existing facility UUIDs, or left blank.",
};
export function UsersPanel() {
  const { accessToken, identity, logout } = useAuth();
  const auditRequest = useRef<AbortController | null>(null);
  const personInput = useRef<HTMLInputElement | null>(null);
  const facilityInput = useRef<HTMLTextAreaElement | null>(null);
  const [identifierErrors, setIdentifierErrors] = useState<{
    personId?: string;
    facilityIds?: string;
  }>({});
  useEffect(() => () => auditRequest.current?.abort(), [accessToken]);
  const [context, setContext] = useState<Context | null>(null),
    [clients, setClients] = useState<Client[]>([]),
    [client, setClient] = useState(""),
    [users, setUsers] = useState<User[]>([]),
    [roles, setRoles] = useState<Role[]>([]),
    [audit, setAudit] = useState<Audit[]>([]),
    [offset, setOffset] = useState(0),
    [more, setMore] = useState(false),
    [nonce, setNonce] = useState(0);
  const [loading, setLoading] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [action, setAction] = useState<
      "create" | "access" | "status" | "setup" | "roles" | null
    >(null),
    [selected, setSelected] = useState<User | null>(null),
    [fields, setFields] = useState(empty),
    [link, setLink] = useState<{
      url: string;
      expiresAt: string;
      username: string;
      tenantId: string;
    } | null>(null);
  async function call<T>(
    path: string,
    signal?: AbortSignal,
    method = "GET",
    body?: unknown,
  ): Promise<T> {
    const r = await fetch("/api/v1/admin/accounts" + path, {
      method,
      headers: {
        Authorization: "Bearer " + accessToken,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal,
    });
    if (!r.ok) {
      let code = "ACCOUNT_ADMIN_UNAVAILABLE";
      try {
        code = (await r.json()).error ?? code;
      } catch {}
      if (r.status === 401) logout();
      throw Error(
        messages[code] ??
          "The request was rejected. Check the form and your assigned access.",
      );
    }
    return r.json();
  }
  useEffect(() => {
    const c = new AbortController();
    setContext(null);
    setClients([]);
    setClient("");
    setAction(null);
    setSelected(null);
    setLink(null);
    setError("");
    if (!accessToken) return () => c.abort();
    void (async () => {
      try {
        const ctx = await call<Context>("/context", c.signal);
        if (c.signal.aborted) return;
        setContext(ctx);
        if (ctx.kind !== "USER") {
          const rows = await call<Client[]>("/clients", c.signal);
          if (!c.signal.aborted) {
            setClients(rows);
            setClient(rows.find((x) => x.status === "ACTIVE")?.id ?? "");
          }
        }
      } catch (e) {
        if (!c.signal.aborted) setError((e as Error).message);
      }
    })();
    return () => c.abort();
  }, [accessToken]);
  useEffect(() => {
    const c = new AbortController();
    setUsers([]);
    setRoles([]);
    setAudit([]);
    setError("");
    if (!client) return () => c.abort();
    setLoading(true);
    void Promise.all([
      call<User[]>("/clients/" + client + "/users?offset=" + offset, c.signal),
      call<Role[]>("/clients/" + client + "/roles", c.signal),
    ])
      .then(([rows, catalog]) => {
        if (!c.signal.aborted) {
          setUsers(rows.slice(0, 50));
          setMore(rows.length > 50);
          setRoles(catalog);
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [client, offset, nonce, accessToken]);
  function close() {
    setIdentifierErrors({});
    setAction(null);
    setSelected(null);
    setFields(empty);
  }
  function begin(a: NonNullable<typeof action>, u?: User) {
    setLink(null);
    setError("");
    setIdentifierErrors({});
    setNotice("");
    setAction(a);
    setSelected(u ?? null);
    setFields(
      u
        ? {
            ...empty,
            username: u.username,
            email: u.email,
            displayName: u.displayName,
            kind: u.kind,
            personId: u.personId ?? "",
            facilityIds: u.facilityIds.join("\n"),
            productKeys: u.productKeys.join(", "),
            roleIds: u.roleIds,
          }
        : empty,
    );
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!action || saving || !fields.confirmed) return;
    if (action === "create" || action === "access") {
      const uuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const errors: typeof identifierErrors = {};
      if (fields.personId.trim() && !uuid.test(fields.personId.trim()))
        errors.personId =
          "Enter an existing person UUID, or leave this optional field blank.";
      if (split(fields.facilityIds).some((id) => !uuid.test(id)))
        errors.facilityIds =
          "Enter existing facility UUIDs, one per line, or leave this optional field blank. Names and job roles do not belong in this field.";
      setIdentifierErrors(errors);
      if (errors.personId || errors.facilityIds) {
        setError("Check the highlighted identifier field.");
        if (errors.personId) personInput.current?.focus();
        else facilityInput.current?.focus();
        return;
      }
    }
    setSaving(true);
    setError("");
    setLink(null);
    try {
      if (action === "roles") {
        await call("/clients/" + client + "/athena-roles", undefined, "POST", {
          reason: fields.reason,
        });
        close();
        setNotice(
          "Athena viewer and editor roles are ready. Assign a role to the intended users.",
        );
        setNonce((n) => n + 1);
        return;
      }
      const base = "/clients/" + client + "/users",
        grant = {
          kind: fields.kind,
          personId: fields.personId.trim() || null,
          facilityIds: split(fields.facilityIds),
          productKeys: split(fields.productKeys),
          roleIds: fields.roleIds,
          reason: fields.reason,
        };
      let result: { user: User; setupToken?: string; expiresAt?: string };
      if (action === "create")
        result = await call(base, undefined, "POST", {
          ...grant,
          username: fields.username,
          email: fields.email,
          displayName: fields.displayName,
        });
      else if (!selected) return;
      else if (action === "access")
        result = await call(
          base + "/" + selected.id + "/access",
          undefined,
          "PUT",
          { ...grant, version: selected.version },
        );
      else if (action === "status")
        result = await call(
          base + "/" + selected.id + "/status",
          undefined,
          "POST",
          {
            version: selected.version,
            enabled: selected.status === "DISABLED",
            reason: fields.reason,
          },
        );
      else
        result = await call(
          base + "/" + selected.id + "/setup",
          undefined,
          "POST",
          { version: selected.version, reason: fields.reason },
        );
      close();
      setNotice(
        action === "status"
          ? "Account status updated."
          : action === "access"
            ? "Account access updated."
            : "Private password setup link created.",
      );
      if (result.setupToken && result.expiresAt)
        setLink({
          url:
            window.location.origin +
            window.location.pathname +
            "#account-setup=" +
            result.setupToken,
          expiresAt: result.expiresAt,
          username: result.user.username,
          tenantId: result.user.tenantId,
        });
      setNonce((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  const manageable = (u: User) =>
    u.kind !== "SUPERUSER" &&
    u.id !== identity?.identityId &&
    (context?.kind === "SUPERUSER" || u.kind === "USER");
  const patch = (v: Partial<typeof empty>) => {
    setIdentifierErrors({});
    setError("");
    setFields((f) => ({ ...f, ...v, confirmed: false }));
  };
  if (context?.kind === "USER")
    return (
      <section>
        <h2>Users</h2>
        <p>
          Your account has no user-administration authority. Contact your client
          administrator.
        </p>
      </section>
    );
  return (
    <section className="account-management" aria-label="Account management">
      <h2>Users</h2>
      <p>
        {context?.kind === "SUPERUSER"
          ? "Manage client administrators and regular users across clients."
          : "Manage regular users within your client."}{" "}
        Users choose their own passwords through private, one-use links.
      </p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <label>
        Client{" "}
        <select
          aria-label="Client"
          value={client}
          disabled={saving || !!action || !context}
          onChange={(e) => {
            auditRequest.current?.abort();
            setAudit([]);
            setClient(e.target.value);
            setOffset(0);
            setLink(null);
            setNotice("");
          }}
        >
          <option value="">Choose a client</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.displayName} ({c.status})
            </option>
          ))}
        </select>
      </label>
      {context && !clients.length && (
        <p>
          No registered client is available. A superuser must complete client
          registration first.
        </p>
      )}
      <div>
        <button
          disabled={!client || loading || saving || !!action}
          onClick={() => setNonce((n) => n + 1)}
        >
          Refresh users
        </button>{" "}
        <button
          disabled={!client || saving || !!action}
          onClick={() => begin("create")}
        >
          Create account
        </button>
        {context?.kind === "SUPERUSER" && (
          <button
            disabled={!client || saving || !!action}
            onClick={() => begin("roles")}
          >
            Set up Athena roles
          </button>
        )}
      </div>
      {link && (
        <section aria-label="Private password setup link">
          <h3>Private setup link</h3>
          <p>
            Username: <strong>{link.username}</strong>
          </p>
          <p>
            Sign-in client ID: <code>{link.tenantId}</code>
          </p>
          <p>
            Share this link privately with the account owner. It expires{" "}
            {new Date(link.expiresAt).toLocaleString()} and can be used once. It
            will not be shown again after leaving this panel; issue a new link
            if needed.
          </p>
          <input
            aria-label="Private setup link"
            readOnly
            value={link.url}
            onFocus={(e) => e.target.select()}
            style={{ width: "100%" }}
          />
          <button onClick={() => setLink(null)}>Hide link</button>
        </section>
      )}
      {action && (
        <form onSubmit={submit}>
          <fieldset disabled={saving}>
            <legend>
              {action === "create"
                ? "Create account"
                : action === "access"
                  ? "Edit account access"
                  : action === "roles"
                    ? "Set up Athena roles"
                    : action === "setup"
                      ? "Issue password setup/reset link"
                      : selected?.status === "DISABLED"
                        ? "Re-enable account"
                        : "Disable account"}
            </legend>
            {selected && (
              <p>
                {selected.displayName} — {selected.username}
              </p>
            )}
            {action === "create" && (
              <>
                <label>
                  Display name{" "}
                  <input
                    required
                    maxLength={200}
                    value={fields.displayName}
                    onChange={(e) => patch({ displayName: e.target.value })}
                  />
                </label>
                <label>
                  Username{" "}
                  <input
                    required
                    maxLength={200}
                    autoComplete="off"
                    value={fields.username}
                    onChange={(e) => patch({ username: e.target.value })}
                  />
                </label>
                <label>
                  Email{" "}
                  <input
                    type="email"
                    required
                    maxLength={320}
                    value={fields.email}
                    onChange={(e) => patch({ email: e.target.value })}
                  />
                </label>
              </>
            )}
            {(action === "create" || action === "access") && (
              <>
                <label>
                  Account type{" "}
                  <select
                    aria-label="Account type"
                    value={fields.kind}
                    disabled={context?.kind !== "SUPERUSER"}
                    onChange={(e) => patch({ kind: e.target.value })}
                  >
                    <option value="USER">Regular user</option>
                    {context?.kind === "SUPERUSER" && (
                      <option value="CLIENT_ADMIN">Client administrator</option>
                    )}
                  </select>
                </label>
                <label>
                  Person identifier (optional){" "}
                  <input
                    ref={personInput}
                    aria-label="Person identifier (optional)"
                    aria-invalid={!!identifierErrors.personId}
                    aria-describedby="account-person-help account-person-error"
                    value={fields.personId}
                    readOnly={!!selected?.personId}
                    onChange={(e) => patch({ personId: e.target.value })}
                  />
                </label>
                <p
                  id="account-person-error"
                  role={identifierErrors.personId ? "alert" : undefined}
                >
                  {identifierErrors.personId}
                </p>
                <p id="account-person-help">
                  Leave blank unless linking an existing person record. If
                  provided, enter its UUID. Existing person mappings cannot be
                  changed here.
                </p>
                <fieldset>
                  <legend>Job roles</legend>
                  {roles.map((r) => (
                    <label key={r.id}>
                      <input
                        type="checkbox"
                        checked={fields.roleIds.includes(r.id)}
                        onChange={(e) =>
                          patch({
                            roleIds: e.target.checked
                              ? [...fields.roleIds, r.id]
                              : fields.roleIds.filter((x) => x !== r.id),
                            ...(e.target.checked &&
                            r.permissions.some((p) => p.startsWith("athena:"))
                              ? {
                                  productKeys: [
                                    ...new Set([
                                      ...split(fields.productKeys),
                                      "athena",
                                    ]),
                                  ].join(","),
                                }
                              : {}),
                          })
                        }
                      />
                      {r.name}
                    </label>
                  ))}
                  {!roles.length && (
                    <p>
                      No delegatable job roles are available for this client.
                    </p>
                  )}
                </fieldset>
                {context?.kind === "SUPERUSER" ? (
                  <>
                    <label>
                      Approved facility identifiers (optional, one per line){" "}
                      <textarea
                        ref={facilityInput}
                        aria-label="Approved facility identifiers (optional, one per line)"
                        aria-invalid={!!identifierErrors.facilityIds}
                        aria-describedby="account-facility-help account-facility-error"
                        placeholder="Existing facility UUIDs; leave blank if none"
                        value={fields.facilityIds}
                        onChange={(e) => patch({ facilityIds: e.target.value })}
                      />
                    </label>
                    <p
                      id="account-facility-error"
                      role={identifierErrors.facilityIds ? "alert" : undefined}
                    >
                      {identifierErrors.facilityIds}
                    </p>
                    <p id="account-facility-help">
                      Optional. Enter existing facility UUIDs, not names or job
                      roles.
                    </p>
                    <label>
                      Approved product keys (comma separated){" "}
                      <input
                        value={fields.productKeys}
                        onChange={(e) => patch({ productKeys: e.target.value })}
                      />
                    </label>
                  </>
                ) : (
                  <>
                    <fieldset>
                      <legend>Facilities</legend>
                      {context?.facilityIds.map((id) => (
                        <label key={id}>
                          <input
                            type="checkbox"
                            checked={split(fields.facilityIds).includes(id)}
                            onChange={(e) =>
                              patch({
                                facilityIds: (e.target.checked
                                  ? [...split(fields.facilityIds), id]
                                  : split(fields.facilityIds).filter(
                                      (x) => x !== id,
                                    )
                                ).join("\n"),
                              })
                            }
                          />
                          {id}
                        </label>
                      ))}
                    </fieldset>
                    <fieldset>
                      <legend>Products</legend>
                      {context?.productKeys.map((key) => (
                        <label key={key}>
                          <input
                            type="checkbox"
                            checked={split(fields.productKeys).includes(key)}
                            onChange={(e) =>
                              patch({
                                productKeys: (e.target.checked
                                  ? [...split(fields.productKeys), key]
                                  : split(fields.productKeys).filter(
                                      (x) => x !== key,
                                    )
                                ).join(","),
                              })
                            }
                          />
                          {key}
                        </label>
                      ))}
                    </fieldset>
                  </>
                )}
                <p>
                  Product assignments do not enable client subscriptions.
                  Product services must enforce their own access policy.
                </p>
              </>
            )}
            {action === "roles" && (
              <p>
                Create this client’s Athena viewer (read) and editor
                (read/create/edit) roles. This does not assign access to any
                user. These roles cover the whole client; facility-limited
                Athena access is not yet available.
              </p>
            )}
            {action === "setup" && (
              <p>
                The account will require password setup before its next sign-in.
                Previous setup links will stop working.
              </p>
            )}
            <label>
              Reason{" "}
              <input
                required
                maxLength={500}
                value={fields.reason}
                onChange={(e) => patch({ reason: e.target.value })}
              />
            </label>
            <label>
              <input
                type="checkbox"
                required
                checked={fields.confirmed}
                onChange={(e) =>
                  setFields((f) => ({ ...f, confirmed: e.target.checked }))
                }
              />
              {action === "create"
                ? "I confirm creation of this account."
                : action === "roles"
                  ? "I confirm Athena role setup."
                  : "I confirm this account change."}
            </label>
            <button disabled={!fields.confirmed}>
              {saving
                ? "Saving…"
                : action === "create"
                  ? "Create account"
                  : action === "roles"
                    ? "Set up Athena roles"
                    : "Save account change"}
            </button>
            <button type="button" onClick={close}>
              Cancel
            </button>
          </fieldset>
        </form>
      )}
      {loading ? (
        <p role="status">Loading users…</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Username</th>
                <th>Account type</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.displayName}</td>
                  <td>{u.username}</td>
                  <td>
                    {u.kind === "CLIENT_ADMIN"
                      ? "Client administrator"
                      : u.kind === "SUPERUSER"
                        ? "Superuser"
                        : "Regular user"}
                  </td>
                  <td>{u.status}</td>
                  <td>
                    {manageable(u) && (
                      <>
                        <button
                          disabled={saving || !!action}
                          onClick={() => begin("access", u)}
                        >
                          Edit access
                        </button>
                        <button
                          disabled={saving || !!action}
                          onClick={() => begin("status", u)}
                        >
                          {u.status === "DISABLED" ? "Re-enable" : "Disable"}
                        </button>
                        <button
                          disabled={
                            saving ||
                            !!action ||
                            u.status === "DISABLED" ||
                            u.status === "SUSPENDED"
                          }
                          onClick={() => begin("setup", u)}
                        >
                          Password setup/reset
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!users.length && client && <p>No accounts on this page.</p>}
        </div>
      )}
      <button
        disabled={offset === 0 || loading || saving || !!action}
        onClick={() => setOffset((n) => Math.max(0, n - 50))}
      >
        Previous users
      </button>
      <button
        disabled={!more || loading || saving || !!action}
        onClick={() => setOffset((n) => n + 50)}
      >
        Next users
      </button>
      <details
        onToggle={(e) => {
          auditRequest.current?.abort();
          if (e.currentTarget.open && client) {
            const controller = new AbortController();
            auditRequest.current = controller;
            void call<Audit[]>(
              "/clients/" + client + "/audit?offset=0",
              controller.signal,
            )
              .then((rows) => {
                if (!controller.signal.aborted) setAudit(rows);
              })
              .catch((error) => {
                if (!controller.signal.aborted) setError(error.message);
              });
          }
        }}
      >
        <summary>Account audit history</summary>
        <ol>
          {audit.slice(0, 50).map((a) => (
            <li key={a.id}>
              {new Date(a.at).toLocaleString()} — {a.action} — {a.reason} —
              actor {a.actorId}, account {a.targetId}
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}

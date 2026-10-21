import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useAuth } from "./auth/AuthProvider.js";

type Tenant = {
    id: string;
    code: string;
    displayName: string;
    countryCode: string;
    status: "ACTIVE" | "SUSPENDED" | "DISABLED";
    createdAt: string;
};

type TenantInput = {
    code: string;
    displayName: string;
    countryCode: string;
};

const emptyInput: TenantInput = { code: "", displayName: "", countryCode: "CA" };

function validate(input: TenantInput): string | null {
    if (!/^[a-zA-Z][a-zA-Z0-9_-]{1,79}$/.test(input.code)) {
        return "Client code must be 2–80 characters, start with a letter, and contain only letters, numbers, hyphens or underscores.";
    }
    if (input.displayName.trim().length < 2 || input.displayName.trim().length > 200) {
        return "Client name must contain 2–200 characters.";
    }
    if (!/^[A-Za-z]{2}$/.test(input.countryCode)) {
        return "Country must be a two-letter ISO country code (for example, CA).";
    }
    return null;
}

export function ClientsPanel() {
    const { accessToken } = useAuth();
    const [tenants, setTenants] = useState<Tenant[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [offset, setOffset] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);
    const [showCreate, setShowCreate] = useState(false);
    const [input, setInput] = useState<TenantInput>(emptyInput);
    const [creating, setCreating] = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    // Deliberately false: enabling writes requires a separate reviewed rollout.
    const createEnabled = false;

    const load = useCallback(async (signal?: AbortSignal) => {
        if (!accessToken) {
            setTenants([]);
            setHasMore(false);
            setLastLoadedAt(null);
            setError("Sign in to view clients.");
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const response = await fetch(`/api/v1/admin/tenants?limit=50&offset=${offset}`, {
                headers: { Authorization: `Bearer ${accessToken}` },
                signal
            });
            if (!response.ok) {
                if (response.status === 401) throw new Error("Your session has expired. Please sign in again.");
                if (response.status === 403) throw new Error("Your account does not have platform client-management permission.");
                if (response.status === 404) throw new Error("Tenant administration API is not enabled.");
                if (response.status === 503) throw new Error("Tenant administration is temporarily unavailable. Try again later.");
                throw new Error(`Unable to load clients (HTTP ${response.status}).`);
            }
            const body = await response.json() as { tenants: Tenant[] };
            if (!Array.isArray(body.tenants)) throw new Error("Invalid tenant response.");
            if (!signal?.aborted) {
                setTenants(body.tenants);
                setHasMore(body.tenants.length === 50);
                setLastLoadedAt(new Date());
            }
        } catch (caught) {
            if (!signal?.aborted) {
                setTenants([]);
                setHasMore(false);
                setLastLoadedAt(null);
                setError(caught instanceof Error ? caught.message : "Unable to load clients.");
            }
        } finally {
            if (!signal?.aborted) setLoading(false);
        }
    }, [accessToken, offset]);

    useEffect(() => {
        const controller = new AbortController();
        void load(controller.signal);
        return () => controller.abort();
    }, [load]);

    async function submitCreate(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setCreateError(null);
        setNotice(null);
        if (!createEnabled) {
            setCreateError("Tenant creation is unavailable until the security rollout is approved.");
            return;
        }
        if (!accessToken) {
            setCreateError("Sign in before creating a client.");
            return;
        }
        const normalized = {
            code: input.code.trim(),
            displayName: input.displayName.trim(),
            countryCode: input.countryCode.trim().toUpperCase()
        };
        const validationError = validate(normalized);
        if (validationError) {
            setCreateError(validationError);
            return;
        }
        setCreating(true);
        try {
            const response = await fetch("/api/v1/admin/tenants", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(normalized)
            });
            if (!response.ok) {
                if (response.status === 400) throw new Error("Client details were rejected. Check the code, name and country.");
                if (response.status === 401) throw new Error("Your session has expired. Please sign in again.");
                if (response.status === 403) throw new Error("You do not have permission to create clients.");
                if (response.status === 404) throw new Error("Tenant administration API is not enabled.");
                if (response.status === 409) throw new Error("A client with this code already exists.");
                if (response.status === 503) throw new Error("Tenant provisioning is currently unavailable.");
                throw new Error(`Unable to create client (HTTP ${response.status}).`);
            }
            const body = await response.json() as { tenant?: Tenant };
            if (response.status !== 201 || !body.tenant?.id) throw new Error("Unexpected tenant creation response.");
            setNotice(`Client ${body.tenant.displayName} created successfully.`);
            setShowCreate(false);
            setInput(emptyInput);
            if (offset !== 0) setOffset(0);
            else await load();
        } catch (caught) {
            setCreateError(caught instanceof Error ? caught.message : "Unable to create client.");
        } finally {
            setCreating(false);
        }
    }

    return (
        <section aria-label="Client management">
            <h2>Clients</h2>
            <p>View registered Ruby clients. New client onboarding will be enabled after security validation.</p>
            <div>
                <button type="button" onClick={() => void load()} disabled={loading}>
                    {loading ? "Loading…" : "Refresh clients"}
                </button>{" "}
                <button type="button" onClick={() => setShowCreate(value => !value)} aria-expanded={showCreate}>
                    {showCreate ? "Hide client form" : "New client (preview)"}
                </button>
            </div>
            {notice ? <p role="status">{notice}</p> : null}
            {showCreate ? (
                <form onSubmit={event => void submitCreate(event)}>
                    <h3>Create client</h3>
                    <p role="status">Preview only: tenant creation is disabled pending security approval.</p>
                    <div>
                        <label htmlFor="ruby-client-code">Client code</label>
                        <input id="ruby-client-code" value={input.code} maxLength={80}
                            onChange={event => setInput(value => ({ ...value, code: event.target.value }))}
                            autoComplete="off" required />
                    </div>
                    <div>
                        <label htmlFor="ruby-client-name">Client name</label>
                        <input id="ruby-client-name" value={input.displayName} maxLength={200}
                            onChange={event => setInput(value => ({ ...value, displayName: event.target.value }))}
                            required />
                    </div>
                    <div>
                        <label htmlFor="ruby-client-country">Country code</label>
                        <input id="ruby-client-country" value={input.countryCode} maxLength={2}
                            onChange={event => setInput(value => ({ ...value, countryCode: event.target.value }))}
                            required />
                    </div>
                    {createError ? <p role="alert">{createError}</p> : null}
                    <button type="submit" disabled={!createEnabled || creating}>
                        {creating ? "Creating…" : "Create client (not yet enabled)"}
                    </button>
                </form>
            ) : null}
            {error ? <p role="alert">{error}</p> : null}
            {!error && lastLoadedAt ? <p aria-live="polite">Last refreshed: {lastLoadedAt.toLocaleString()} · Page {Math.floor(offset / 50) + 1}</p> : null}
            {!error && !loading && tenants.length === 0 ? <p>No clients found.</p> : null}
            {tenants.length > 0 ? (
                <div style={{ overflowX: "auto" }}>
                    <table>
                        <thead><tr><th>Client</th><th>Code</th><th>Country</th><th>Status</th><th>Tenant ID</th></tr></thead>
                        <tbody>
                            {tenants.map(tenant => (
                                <tr key={tenant.id}>
                                    <td>{tenant.displayName}</td>
                                    <td>{tenant.code}</td>
                                    <td>{tenant.countryCode}</td>
                                    <td>{tenant.status}</td>
                                    <td><code>{tenant.id}</code></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : null}
            <div>
                <button type="button" disabled={loading || offset === 0} onClick={() => setOffset(value => Math.max(0, value - 50))}>Previous</button>{" "}
                <button type="button" disabled={loading || !hasMore} onClick={() => setOffset(value => value + 50)}>Next</button>
            </div>
        </section>
    );
}

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "./auth/AuthProvider.js";

type Tenant = {
    id: string;
    code: string;
    displayName: string;
    countryCode: string;
    status: "ACTIVE" | "SUSPENDED" | "DISABLED";
    createdAt: string;
};

export function ClientsPanel() {
    const { accessToken } = useAuth();
    const [tenants, setTenants] = useState<Tenant[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [offset, setOffset] = useState(0);
    const [hasMore, setHasMore] = useState(false);

    const load = useCallback(async (signal?: AbortSignal) => {
        if (!accessToken) {
            setTenants([]);
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
                throw new Error(`Unable to load clients (HTTP ${response.status}).`);
            }
            const body = await response.json() as { tenants: Tenant[] };
            if (!Array.isArray(body.tenants)) throw new Error("Invalid tenant response.");
            if (!signal?.aborted) {
                setTenants(body.tenants);
                setHasMore(body.tenants.length === 50);
            }
        } catch (caught) {
            if (!signal?.aborted) {
                setTenants([]);
                setHasMore(false);
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

    return (
        <section aria-label="Client management">
            <h2>Clients</h2>
            <p>View registered Ruby clients. New client onboarding will be enabled after security validation.</p>
            <button type="button" onClick={() => void load()} disabled={loading}>
                {loading ? "Loading…" : "Refresh clients"}
            </button>
            {error ? <p role="alert">{error}</p> : null}
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
                <button type="button" disabled={loading || offset === 0} onClick={() => setOffset(value => Math.max(0, value - 50))}>Previous</button>
                <button type="button" disabled={loading || !hasMore} onClick={() => setOffset(value => value + 50)}>Next</button>
            </div>
        </section>
    );
}

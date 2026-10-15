import { useEffect, useMemo, useState } from "react";
import "./EnergyContracts.css";

type ContractStatus = "DRAFT" | "ACTIVE" | "EXPIRING" | "EXPIRED" | "TERMINATED";
type MaintenanceStatus = "UPCOMING" | "DUE" | "OVERDUE" | "COMPLETED";

type ApiEnergyContract = {
    id: string;
    contractNumber: string;
    name: string;
    vendorName: string;
    contractType: string;
    siteId?: string;
    owner?: string;
    startDate: string;
    endDate: string;
    renewalDate?: string;
    noticeDate?: string;
    valueAmount?: number;
    currency?: string;
    rateDescription?: string;
    status: ContractStatus;
    description?: string;
    notes?: string;
};

type ApiMaintenanceActivity = {
    id: string;
    contractId: string;
    assetId?: string;
    activity: string;
    frequency?: string;
    nextDueDate?: string;
    responsibleParty?: string;
    sla?: string;
    status: MaintenanceStatus;
    lastCompletedAt?: string;
    notes?: string;
};


type ApiAsset = {
    id: string; siteId: string; code: string; name: string; assetType: string; status: string; manufacturer?: string; model?: string;
};

type ApiContractCoverage = {
    id: string; contractId: string; siteId?: string; assetId?: string; assetCode?: string; assetName?: string; assetType?: string; assetStatus?: string; createdAt: string;
};

export interface EnergyContractsProps {
    onBack: () => void;
    tenantId: string;
    baseUrl?: string;
}

const fmtDate = (value?: string) => {
    if (!value) return "—";
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return "—";
    const [, year, month, day] = match;
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    if (Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "short", day: "numeric" }).format(date);
};

const fmtValue = (contract: ApiEnergyContract) => {
    if (contract.valueAmount !== undefined && contract.valueAmount !== null) {
        try {
            return new Intl.NumberFormat("en-CA", {
                style: "currency",
                currency: contract.currency || "CAD",
                maximumFractionDigits: 2
            }).format(contract.valueAmount);
        } catch {
            return `${contract.valueAmount} ${contract.currency ?? ""}`.trim();
        }
    }
    return contract.rateDescription || "—";
};

export function EnergyContracts({ onBack, tenantId, baseUrl = "" }: EnergyContractsProps) {
    const [contracts, setContracts] = useState<ApiEnergyContract[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [maintenanceByContract, setMaintenanceByContract] = useState<Record<string, ApiMaintenanceActivity[]>>({});
    const [coverageByContract, setCoverageByContract] = useState<Record<string, ApiContractCoverage[]>>({});
    const [assets, setAssets] = useState<ApiAsset[]>([]);
    const [loading, setLoading] = useState(true);
    const [detailLoading, setDetailLoading] = useState(false);
    const [error, setError] = useState("");
    const [showNewContract, setShowNewContract] = useState(false);
    const [showNewActivity, setShowNewActivity] = useState(false);
    const [showAddAsset, setShowAddAsset] = useState(false);
    const [saving, setSaving] = useState(false);
    const prefix = `${baseUrl}/api/v1/energy`;
    const telemetryPrefix = `${baseUrl}/api/v1/telemetry`;

    useEffect(() => {
        const controller = new AbortController();
        async function loadContracts() {
            setLoading(true);
            try {
                const response = await fetch(`${prefix}/contracts`, {
                    headers: { "x-tenant-id": tenantId },
                    signal: controller.signal
                });
                if (!response.ok) throw new Error(`Contracts: HTTP ${response.status}`);
                const data = await response.json() as ApiEnergyContract[];
                if (!controller.signal.aborted) {
                    setContracts(data);
                    setError("");
                }
            } catch (cause) {
                if (!controller.signal.aborted) setError(String(cause));
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        }
        void loadContracts();
        return () => controller.abort();
    }, [prefix, tenantId]);

    useEffect(() => {
        const controller = new AbortController();
        async function loadAssets() {
            try {
                const response = await fetch(`${telemetryPrefix}/assets`, { headers: { "x-tenant-id": tenantId }, signal: controller.signal });
                if (!response.ok) throw new Error(`Assets: HTTP ${response.status}`);
                const data = await response.json() as ApiAsset[];
                if (!controller.signal.aborted) setAssets(data);
            } catch (cause) { if (!controller.signal.aborted) setError(String(cause)); }
        }
        void loadAssets();
        return () => controller.abort();
    }, [telemetryPrefix, tenantId]);

    useEffect(() => {
        if (!selectedId || maintenanceByContract[selectedId]) return;
        const controller = new AbortController();
        async function loadMaintenance() {
            setDetailLoading(true);
            try {
                const response = await fetch(`${prefix}/contracts/${selectedId}/maintenance`, {
                    headers: { "x-tenant-id": tenantId },
                    signal: controller.signal
                });
                if (!response.ok) throw new Error(`Maintenance: HTTP ${response.status}`);
                const data = await response.json() as ApiMaintenanceActivity[];
                if (!controller.signal.aborted) {
                    setMaintenanceByContract(previous => ({
                    ...previous,
                    [selectedId as string]: data
                }));
                    setError("");
                }
            } catch (cause) {
                if (!controller.signal.aborted) setError(String(cause));
            } finally {
                if (!controller.signal.aborted) setDetailLoading(false);
            }
        }
        void loadMaintenance();
        return () => controller.abort();
    }, [maintenanceByContract, prefix, selectedId, tenantId]);

    useEffect(() => {
        if (!selectedId || coverageByContract[selectedId]) return;
        const contractId = selectedId;
        const controller = new AbortController();
        async function loadCoverage() {
            try {
                const response = await fetch(`${prefix}/contracts/${contractId}/coverage`, { headers: { "x-tenant-id": tenantId }, signal: controller.signal });
                if (!response.ok) throw new Error(`Coverage: HTTP ${response.status}`);
                const data = await response.json() as ApiContractCoverage[];
                if (!controller.signal.aborted) setCoverageByContract(previous => ({ ...previous, [contractId]: data }));
            } catch (cause) { if (!controller.signal.aborted) setError(String(cause)); }
        }
        void loadCoverage();
        return () => controller.abort();
    }, [coverageByContract, prefix, selectedId, tenantId]);

    async function addCoveredAsset(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!selectedId) return;
        const contractId = selectedId;
        const form = new FormData(event.currentTarget);
        const assetId = String(form.get("coverageAssetId") ?? "").trim();
        if (!assetId) return;
        setSaving(true);
        try {
            const response = await fetch(`${prefix}/contracts/${contractId}/coverage`, {
                method: "POST", headers: { "Content-Type": "application/json", "x-tenant-id": tenantId }, body: JSON.stringify({ assetId })
            });
            if (!response.ok) throw new Error(`Add covered asset: HTTP ${response.status} ${await response.text()}`);
            const created = await response.json() as ApiContractCoverage;
            setCoverageByContract(previous => ({ ...previous, [contractId]: [...(previous[contractId] ?? []), created] }));
            setShowAddAsset(false); setError("");
        } catch (cause) { setError(String(cause)); } finally { setSaving(false); }
    }

    async function createContract(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const payload = {
            contractNumber: String(form.get("contractNumber") ?? "").trim(),
            name: String(form.get("name") ?? "").trim(),
            vendorName: String(form.get("vendorName") ?? "").trim(),
            contractType: String(form.get("contractType") ?? "").trim(),
            owner: String(form.get("owner") ?? "").trim() || undefined,
            startDate: String(form.get("startDate") ?? ""),
            endDate: String(form.get("endDate") ?? ""),
            renewalDate: String(form.get("renewalDate") ?? "") || undefined,
            noticeDate: String(form.get("noticeDate") ?? "") || undefined,
            valueAmount: form.get("valueAmount") ? Number(form.get("valueAmount")) : undefined,
            currency: String(form.get("currency") ?? "").trim() || undefined,
            rateDescription: String(form.get("rateDescription") ?? "").trim() || undefined,
            status: String(form.get("status") ?? "ACTIVE"),
            description: String(form.get("description") ?? "").trim() || undefined,
            notes: String(form.get("notes") ?? "").trim() || undefined
        };
        setSaving(true);
        try {
            const response = await fetch(`${prefix}/contracts`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-tenant-id": tenantId },
                body: JSON.stringify(payload)
            });
            if (!response.ok) throw new Error(`Create contract: HTTP ${response.status} ${await response.text()}`);
            const created = await response.json() as ApiEnergyContract;
            setContracts(previous => [...previous, created]);
            setShowNewContract(false);
            setSelectedId(created.id);
            setError("");
        } catch (cause) { setError(String(cause)); }
        finally { setSaving(false); }
    }

    async function createActivity(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!selectedId) return;
        const contractId = selectedId;
        const form = new FormData(event.currentTarget);
        const payload = {
            activity: String(form.get("activity") ?? "").trim(),
            assetId: String(form.get("assetId") ?? "").trim() || undefined,
            frequency: String(form.get("frequency") ?? "").trim() || undefined,
            nextDueDate: String(form.get("nextDueDate") ?? "") || undefined,
            responsibleParty: String(form.get("responsibleParty") ?? "").trim() || undefined,
            sla: String(form.get("sla") ?? "").trim() || undefined,
            status: String(form.get("status") ?? "UPCOMING"),
            lastCompletedAt: String(form.get("lastCompletedAt") ?? "") || undefined,
            notes: String(form.get("notes") ?? "").trim() || undefined
        };
        setSaving(true);
        try {
            const response = await fetch(`${prefix}/contracts/${contractId}/maintenance`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-tenant-id": tenantId },
                body: JSON.stringify(payload)
            });
            if (!response.ok) throw new Error(`Add activity: HTTP ${response.status} ${await response.text()}`);
            const created = await response.json() as ApiMaintenanceActivity;
            setMaintenanceByContract(previous => ({
                ...previous,
                [contractId]: [...(previous[contractId] ?? []), created]
            }));
            setShowNewActivity(false);
            setError("");
        } catch (cause) { setError(String(cause)); }
        finally { setSaving(false); }
    }

    const selected = useMemo(
        () => contracts.find(contract => contract.id === selectedId) ?? null,
        [contracts, selectedId]
    );
    const loadedMaintenance = Object.values(maintenanceByContract).flat();
    const due = loadedMaintenance.filter(item => item.status === "DUE").length;
    const overdue = loadedMaintenance.filter(item => item.status === "OVERDUE").length;
    const active = contracts.filter(contract => contract.status === "ACTIVE" || contract.status === "EXPIRING").length;
    const nextExpiry = contracts
        .filter(contract => contract.status !== "EXPIRED" && contract.status !== "TERMINATED")
        .map(contract => contract.endDate)
        .filter(Boolean)
        .sort()[0];

    if (selected) {
        const maintenance = maintenanceByContract[selected.id] ?? [];
        return <section className="energy-contracts">
            <header className="ec-page-header">
                <div>
                    <button className="ec-back" onClick={() => setSelectedId(null)}>← Contracts</button>
                    <p className="ec-eyebrow">Ruby EMS / BAS · Energy Contract Management</p>
                    <h1>{selected.name}</h1>
                    <p>{selected.contractNumber} · {selected.vendorName}</p>
                </div>
                <span className={`ec-status ${selected.status.toLowerCase()}`}>{selected.status.replaceAll("_", " ")}</span>
            </header>
            {error && <div className="ec-empty">{error}</div>}
            <div className="ec-detail-grid">
                <article className="ec-panel"><h2>Contract overview</h2><dl className="ec-definition-list">
                    <div><dt>Vendor</dt><dd>{selected.vendorName}</dd></div>
                    <div><dt>Type</dt><dd>{selected.contractType}</dd></div>
                    <div><dt>Site ID</dt><dd>{selected.siteId ?? "—"}</dd></div>
                    <div><dt>Owner</dt><dd>{selected.owner ?? "—"}</dd></div>
                    <div><dt>Start</dt><dd>{fmtDate(selected.startDate)}</dd></div>
                    <div><dt>Expiry</dt><dd>{fmtDate(selected.endDate)}</dd></div>
                    <div><dt>Renewal date</dt><dd>{fmtDate(selected.renewalDate)}</dd></div>
                    <div><dt>Notice date</dt><dd>{fmtDate(selected.noticeDate)}</dd></div>
                    <div><dt>Contract value / rate</dt><dd>{fmtValue(selected)}</dd></div>
                </dl><p className="ec-summary">{selected.description ?? selected.notes ?? "No contract summary recorded."}</p></article>
                <article className="ec-panel"><h2>Contract record</h2><div className="ec-contact"><strong>{selected.contractNumber}</strong><span>{selected.vendorName}</span><span>{selected.contractType}</span><span>{selected.rateDescription ?? "No rate description recorded"}</span></div><h2 className="ec-section-gap">Notes</h2><p className="ec-summary">{selected.notes ?? "No notes recorded."}</p></article>
            </div>
            <article className="ec-panel"><div className="ec-panel-heading"><div><h2>Covered assets</h2><p>Assets whose service or maintenance obligations are governed by this contract.</p></div><button type="button" onClick={() => setShowAddAsset(value => !value)}>+ Add asset</button></div>
                {showAddAsset && <form className="ec-form ec-coverage-form" onSubmit={addCoveredAsset}><label className="ec-form-wide"><span>Asset *</span><select name="coverageAssetId" required defaultValue=""><option value="" disabled>Select a Ruby BAS/EMS asset</option>{assets.filter(asset => !(coverageByContract[selected.id] ?? []).some(item => item.assetId === asset.id)).map(asset => <option key={asset.id} value={asset.id}>{asset.code} — {asset.name} ({asset.assetType})</option>)}</select></label><div className="ec-form-actions ec-form-wide"><button type="button" className="ec-secondary" onClick={() => setShowAddAsset(false)}>Cancel</button><button type="submit" disabled={saving}>{saving ? "Saving…" : "Add covered asset"}</button></div></form>}
                {(coverageByContract[selected.id] ?? []).length === 0 ? <div className="ec-empty">No BAS/EMS assets are linked to this contract yet.</div> : <div className="ec-asset-grid">{(coverageByContract[selected.id] ?? []).map(item => <div className="ec-asset-card" key={item.id}><div><strong>{item.assetCode ?? "Covered asset"}</strong><span>{item.assetName ?? item.assetId ?? "Site coverage"}</span></div><div className="ec-asset-meta"><span>{item.assetType ?? "Asset"}</span><span>{item.assetStatus ?? ""}</span></div></div>)}</div>}
            </article>
            <article className="ec-panel"><div className="ec-panel-heading"><div><h2>Maintenance obligations</h2><p>Live contractual maintenance records from Ruby Energy Contract Management.</p></div><button type="button" onClick={() => setShowNewActivity(value => !value)}>+ Add activity</button></div>
                {showNewActivity && <form className="ec-form" onSubmit={createActivity}>
                    <label><span>Activity *</span><input name="activity" required /></label>
                    <label><span>Frequency</span><input name="frequency" placeholder="Quarterly" /></label>
                    <label><span>Next due</span><input name="nextDueDate" type="date" /></label>
                    <label><span>Responsible party</span><input name="responsibleParty" /></label>
                    <label><span>SLA</span><input name="sla" /></label>
                    <label><span>Covered asset</span><select name="assetId" defaultValue=""><option value="">Contract-wide / no specific asset</option>{(coverageByContract[selected.id] ?? []).filter(item => item.assetId).map(item => <option key={item.id} value={item.assetId}>{item.assetCode ?? "Asset"} — {item.assetName ?? item.assetId}</option>)}</select></label>
                    <label><span>Status</span><select name="status" defaultValue="UPCOMING"><option>UPCOMING</option><option>DUE</option><option>OVERDUE</option><option>COMPLETED</option></select></label>
                    <label><span>Last completed</span><input name="lastCompletedAt" type="date" /></label>
                    <label className="ec-form-wide"><span>Notes</span><textarea name="notes" rows={3} /></label>
                    <div className="ec-form-actions ec-form-wide"><button type="button" className="ec-secondary" onClick={() => setShowNewActivity(false)}>Cancel</button><button type="submit" disabled={saving}>{saving ? "Saving…" : "Save activity"}</button></div>
                </form>}
                {detailLoading ? <div className="ec-empty">Loading maintenance activities…</div> : maintenance.length === 0 ? <div className="ec-empty">No maintenance obligations are recorded for this contract.</div> : <div className="ec-table-scroll"><table><thead><tr><th>Activity</th><th>Asset ID</th><th>Frequency</th><th>Next due</th><th>Responsible</th><th>SLA</th><th>Status</th></tr></thead><tbody>{maintenance.map(item => <tr key={item.id}><td><strong>{item.activity}</strong>{item.lastCompletedAt && <small>Last: {fmtDate(item.lastCompletedAt)}</small>}</td><td>{item.assetId ? (() => { const asset = assets.find(candidate => candidate.id === item.assetId); return asset ? `${asset.code} — ${asset.name}` : item.assetId; })() : "—"}</td><td>{item.frequency ?? "—"}</td><td>{fmtDate(item.nextDueDate)}</td><td>{item.responsibleParty ?? "—"}</td><td>{item.sla ?? "—"}</td><td><span className={`ec-maintenance ${item.status.toLowerCase()}`}>{item.status}</span></td></tr>)}</tbody></table></div>}
            </article>
        </section>;
    }

    return <section className="energy-contracts">
        <header className="ec-page-header"><div><button className="ec-back" onClick={onBack}>← BAS dashboard</button><p className="ec-eyebrow">Ruby EMS / BAS</p><h1>Energy Contract Management</h1><p>Manage energy, maintenance and service contracts across sites and assets.</p></div><button className="ec-primary" type="button" onClick={() => setShowNewContract(value => !value)}>+ New contract</button></header>
        {showNewContract && <article className="ec-panel"><div className="ec-panel-heading"><div><h2>New energy contract</h2><p>Create a tenant-scoped contract record.</p></div></div><form className="ec-form" onSubmit={createContract}>
            <label><span>Contract number *</span><input name="contractNumber" required /></label>
            <label><span>Contract name *</span><input name="name" required /></label>
            <label><span>Vendor *</span><input name="vendorName" required /></label>
            <label><span>Contract type *</span><input name="contractType" required placeholder="HVAC_MAINTENANCE" /></label>
            <label><span>Owner</span><input name="owner" /></label>
            <label><span>Status</span><select name="status" defaultValue="ACTIVE"><option>DRAFT</option><option>ACTIVE</option><option>EXPIRING</option><option>EXPIRED</option><option>TERMINATED</option></select></label>
            <label><span>Start date *</span><input name="startDate" type="date" required /></label>
            <label><span>End date *</span><input name="endDate" type="date" required /></label>
            <label><span>Renewal date</span><input name="renewalDate" type="date" /></label>
            <label><span>Notice date</span><input name="noticeDate" type="date" /></label>
            <label><span>Contract value</span><input name="valueAmount" type="number" min="0" step="0.01" /></label>
            <label><span>Currency</span><input name="currency" defaultValue="CAD" maxLength={3} /></label>
            <label className="ec-form-wide"><span>Rate / commercial terms</span><input name="rateDescription" /></label>
            <label className="ec-form-wide"><span>Description</span><textarea name="description" rows={3} /></label>
            <label className="ec-form-wide"><span>Notes</span><textarea name="notes" rows={3} /></label>
            <div className="ec-form-actions ec-form-wide"><button type="button" className="ec-secondary" onClick={() => setShowNewContract(false)}>Cancel</button><button type="submit" disabled={saving}>{saving ? "Saving…" : "Create contract"}</button></div>
        </form></article>}
        {error && <div className="ec-empty">{error}</div>}
        <div className="ec-metrics"><article><span>Active contracts</span><strong>{active}</strong></article><article><span>Maintenance due</span><strong>{due}</strong></article><article><span>Overdue activities</span><strong>{overdue}</strong></article><article><span>Next expiry</span><strong>{nextExpiry ? fmtDate(nextExpiry) : "—"}</strong></article></div>
        <article className="ec-panel"><div className="ec-panel-heading"><div><h2>Contracts</h2><p>Live portfolio of energy supply, service, maintenance and operations agreements.</p></div></div>
            {loading ? <div className="ec-empty">Loading energy contracts…</div> : contracts.length === 0 ? <div className="ec-empty">No energy contracts have been recorded for this tenant yet.</div> : <div className="ec-table-scroll"><table><thead><tr><th>Contract</th><th>Vendor</th><th>Type</th><th>Site</th><th>Expiry</th><th>Value / rate</th><th>Status</th><th></th></tr></thead><tbody>{contracts.map(contract => <tr key={contract.id}><td><strong>{contract.name}</strong><small>{contract.contractNumber}</small></td><td>{contract.vendorName}</td><td>{contract.contractType}</td><td>{contract.siteId ?? "—"}</td><td>{fmtDate(contract.endDate)}</td><td>{fmtValue(contract)}</td><td><span className={`ec-status ${contract.status.toLowerCase()}`}>{contract.status.replaceAll("_", " ")}</span></td><td><button className="ec-link" onClick={() => setSelectedId(contract.id)}>View details →</button></td></tr>)}</tbody></table></div>}
        </article>
    </section>;
}

import type { IDatabaseProvider } from "@intrusionshield/database";

export class TenantAuthorizationAudit {
    constructor(private readonly database: IDatabaseProvider) {}

    async record(identityId: string, tenantId: string, action: "READ" | "CREATE", allowed: boolean): Promise<void> {
        await this.database.execute(
            "INSERT INTO [Identity].[AuthorizationAudit] (TenantId, IdentityId, Resource, Action, Allowed, Reason) VALUES (@tenantId, @identityId, N'platform.tenants', @action, @allowed, @reason)",
            [
                { name: "tenantId", value: tenantId },
                { name: "identityId", value: identityId },
                { name: "action", value: action },
                { name: "allowed", value: allowed },
                { name: "reason", value: allowed ? "Permission granted" : "Permission denied" }
            ]
        );
    }
}

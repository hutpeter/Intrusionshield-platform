import type { IDatabaseProvider } from "@intrusionshield/database";

const validUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class TenantAuthorizationAudit {
    constructor(private readonly database: IDatabaseProvider) {}

    async record(identityId: string, tenantId: string, action: "READ" | "CREATE", allowed: boolean): Promise<void> {
        await this.database.execute(
            "INSERT INTO [Identity].[AuthorizationAudit] (TenantId, IdentityId, Resource, Action, Allowed, Reason) VALUES (@tenantId, @identityId, N'platform.tenants', @action, @allowed, @reason)",
            [
                { name: "tenantId", value: validUuid.test(tenantId) ? tenantId : null },
                { name: "identityId", value: validUuid.test(identityId) ? identityId : null },
                { name: "action", value: action },
                { name: "allowed", value: allowed },
                { name: "reason", value: allowed ? "Permission granted" : "Permission denied" }
            ]
        );
    }
}

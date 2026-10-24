
import type { IDatabaseProvider } from "@intrusionshield/database";

export interface UnresolvedTenantProvisioningAudit {
    Id: string;
    CorrelationId: string;
    ActorIdentityId: string;
    ActorTenantId: string;
    RequestedTenantCode: string;
    TargetTenantId: string | null;
    Status: string;
    StartedAt: Date;
    AgeMinutes: number;
}

/**
 * Read-only access to unresolved tenant provisioning operations.
 *
 * A stale STARTED record requires investigation.
 * It does not establish whether provisioning committed
 * or rolled back.
 */
export class TenantProvisioningReconciliation {
    constructor(
        private readonly database: IDatabaseProvider
    ) {}

    async listStale(
        staleMinutes = 15
    ): Promise<UnresolvedTenantProvisioningAudit[]> {
        if (
            !Number.isSafeInteger(staleMinutes) ||
            staleMinutes < 1 ||
            staleMinutes > 10080
        ) {
            throw new Error(
                "Stale threshold must be an integer between 1 and 10080 minutes."
            );
        }

        const result =
            await this.database.query<UnresolvedTenantProvisioningAudit>(
                `SELECT
                    Id,
                    CorrelationId,
                    ActorIdentityId,
                    ActorTenantId,
                    RequestedTenantCode,
                    TargetTenantId,
                    Status,
                    StartedAt,
                    DATEDIFF(
                        MINUTE,
                        StartedAt,
                        SYSUTCDATETIME()
                    ) AS AgeMinutes
                 FROM [Platform].[TenantProvisioningAudit]
                 WHERE
                    Status = N'STARTED'
                    AND Operation = N'CREATE'
                    AND StartedAt <= DATEADD(
                        MINUTE,
                        -@staleMinutes,
                        SYSUTCDATETIME()
                    )
                 ORDER BY StartedAt ASC`,
                [
                    {
                        name: "staleMinutes",
                        value: staleMinutes
                    }
                ]
            );

        return result.rows;
    }
}

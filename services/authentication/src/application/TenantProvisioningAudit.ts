
import { randomUUID } from "node:crypto";
import type { IDatabaseProvider } from "@intrusionshield/database";

export interface TenantProvisioningAuditContext {
    actorIdentityId: string;
    actorTenantId: string;
    correlationId: string;
}

export class TenantProvisioningAudit {
    constructor(
        private readonly database: IDatabaseProvider
    ) {}

    async start(
        context: TenantProvisioningAuditContext,
        requestedTenantCode: string
    ): Promise<string> {
        const auditId = randomUUID();

        const affectedRows = await this.database.execute(
            `INSERT INTO [Platform].[TenantProvisioningAudit]
                (
                    Id,
                    CorrelationId,
                    ActorIdentityId,
                    ActorTenantId,
                    RequestedTenantCode,
                    Operation,
                    Status
                )
             VALUES
                (
                    @id,
                    @correlationId,
                    @actorIdentityId,
                    @actorTenantId,
                    @requestedTenantCode,
                    N'CREATE',
                    N'STARTED'
                )`,
            [
                { name: "id", value: auditId },
                { name: "correlationId", value: context.correlationId },
                { name: "actorIdentityId", value: context.actorIdentityId },
                { name: "actorTenantId", value: context.actorTenantId },
                {
                    name: "requestedTenantCode",
                    value: requestedTenantCode
                }
            ]
        );

        if (affectedRows !== 1) {
            throw new Error(
                `Provisioning audit start insert affected ${affectedRows} rows; expected exactly one.`
            );
        }

        return auditId;
    }

    async succeed(
        auditId: string,
        targetTenantId: string
    ): Promise<void> {
        const affectedRows = await this.database.execute(
            `UPDATE [Platform].[TenantProvisioningAudit]
             SET
                Status = N'SUCCEEDED',
                TargetTenantId = @targetTenantId,
                CompletedAt = SYSUTCDATETIME(),
                FailureCode = NULL
             WHERE
                Id = @auditId
                AND Status = N'STARTED'`,
            [
                { name: "auditId", value: auditId },
                { name: "targetTenantId", value: targetTenantId }
            ]
        );

        if (affectedRows !== 1) {
            throw new Error(
                `Provisioning audit success update affected ${affectedRows} rows; expected exactly one.`
            );
        }
    }

    async fail(
        auditId: string,
        failureCode: string
    ): Promise<void> {
        const affectedRows = await this.database.execute(
            `UPDATE [Platform].[TenantProvisioningAudit]
             SET
                Status = N'FAILED',
                CompletedAt = SYSUTCDATETIME(),
                FailureCode = @failureCode
             WHERE
                Id = @auditId
                AND Status = N'STARTED'`,
            [
                { name: "auditId", value: auditId },
                { name: "failureCode", value: failureCode }
            ]
        );

        if (affectedRows !== 1) {
            throw new Error(
                `Provisioning audit failure update affected ${affectedRows} rows; expected exactly one.`
            );
        }
    }
}

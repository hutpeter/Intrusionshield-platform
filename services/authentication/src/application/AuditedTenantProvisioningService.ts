
import {
    validateTenantInput,
    type TenantRecord
} from "./SqlPlatformTenantRepository.js";

import {
    TenantProvisioningAudit,
    type TenantProvisioningAuditContext
} from "./TenantProvisioningAudit.js";

import { TenantProvisioningService } from "./TenantProvisioningService.js";
import { TenantTransactionOutcomeError } from "./TenantTransactionOutcomeError.js";

/**
 * Coordinates tenant provisioning with independently persisted
 * lifecycle auditing.
 *
 * IMPORTANT:
 * The audit repository must use a database provider that is
 * independent of the provisioning transaction.
 *
 * This class does not enable tenant creation.
 */
export class AuditedTenantProvisioningService {
    constructor(
        private readonly provisioning: TenantProvisioningService,
        private readonly audit: TenantProvisioningAudit
    ) {}

    async create(
        input: unknown,
        context: TenantProvisioningAuditContext
    ): Promise<TenantRecord> {
        const normalized = validateTenantInput(input);

        // Fail closed if the initial audit record cannot be written.
        const auditId = await this.audit.start(
            context,
            normalized.code
        );

        let tenant: TenantRecord;

        try {
            tenant = await this.provisioning.create(normalized);
            } catch (provisioningError) {
                // If rollback also failed, the database outcome is uncertain.
                // Preserve STARTED for investigation and reconciliation.
                if (provisioningError instanceof TenantTransactionOutcomeError) {
                    throw provisioningError;
                }

                try {
        await this.audit.fail(
            auditId,
            "TENANT_PROVISIONING_FAILED"
        );
            } catch (auditError) {
                throw new AggregateError(
                    [provisioningError, auditError],
                    "Tenant provisioning failed and its audit could not be finalized."
                );
            }

            throw provisioningError;
        }

        // Provisioning has committed at this point.
        // An audit failure must never be described as a rollback.
        await this.audit.succeed(auditId, tenant.id);

        return tenant;
    }
}

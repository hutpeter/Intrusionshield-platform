
import {
    SqlServerProvider,
    type DatabaseOptions
} from "@intrusionshield/database";

import { SqlEventOutboxRepository } from "@intrusionshield/event-persistence";
import { SqlTenantConfigurationRepository } from "@intrusionshield/tenant-configuration";

import { AuditedTenantProvisioningService } from "./AuditedTenantProvisioningService.js";
import { PlatformTenantAuthorization } from "./PlatformTenantAuthorization.js";
import { TenantAuthorizationAudit } from "./TenantAuthorizationAudit.js";
import { cleanupTenantAdminConnections } from "./cleanupTenantAdminConnections.js";
import { TenantProvisioningAudit } from "./TenantProvisioningAudit.js";
import { SqlPlatformTenantRepository } from "./SqlPlatformTenantRepository.js";
import { TenantProvisioningService } from "./TenantProvisioningService.js";

import type { TenantAdminApi } from "../routes/tenantAdmin.js";
import type { AccessTokenService } from "../security/AccessTokenService.js";
import { TenantProvisioningReconciliation } from "./TenantProvisioningReconciliation.js";

/**
 * Creates tenant administration dependencies.
 *
 * Read operations use the authentication service's existing
 * database provider.
 *
 * Tenant provisioning uses a dedicated database connection.
 * Provisioning lifecycle auditing uses a second, independent
 * connection so audit writes are not rolled back with the
 * provisioning transaction.
 *
 * SECURITY:
 * Tenant creation remains disabled until explicitly approved
 * following integration and security testing.
 */
export function createTenantAdminDependencies(
    options: DatabaseOptions,
    readDatabase: SqlServerProvider,
    accessTokenService: AccessTokenService
): TenantAdminApi {
    const authorization = new PlatformTenantAuthorization(
        readDatabase
    );

    const audit = new TenantAuthorizationAudit(
        readDatabase
    );

    const tenants = new SqlPlatformTenantRepository(
        readDatabase
    );
    const reconciliation = new TenantProvisioningReconciliation(
    readDatabase
    );

    return {
        accessTokenService,

    authorize: async (
        identityId,
        tenantId,
        action,
        resource = "platform.tenants"
    ) => {
        const allowed = await authorization.allowed(
            identityId,
            tenantId,
            action,
            resource
        );

        await audit.record(
            identityId,
            tenantId,
            action,
            allowed,
            resource
        );

    return allowed;
},

        list: (limit, offset) => tenants.list(limit, offset),
        listStaleProvisioning: (staleMinutes) =>
        reconciliation.listStale(staleMinutes),

        create: async (input, context) => {
            // SECURITY GUARD:
            // Tenant creation remains disabled until explicitly
            // approved following integration and security testing.
            if (true) {
                throw new Error(
                    "Tenant creation is not enabled."
                );
            }

            const writeDatabase = new SqlServerProvider(options);
            const auditDatabase = new SqlServerProvider(options);

            let operationError: unknown;
            let operationFailed = false;

            let createdTenant: Awaited<
                ReturnType<
                    AuditedTenantProvisioningService["create"]
                >
            > | undefined;

            try {
                await auditDatabase.connect();
                await writeDatabase.connect();

                const writer = new SqlPlatformTenantRepository(
                    writeDatabase
                );

                const settings =
                    new SqlTenantConfigurationRepository(
                        writeDatabase
                    );

                const outbox = new SqlEventOutboxRepository(
                    writeDatabase
                );

                const provisioning = new TenantProvisioningService(
                    writeDatabase,
                    writer,
                    settings,
                    outbox
                );

                const provisioningAudit = new TenantProvisioningAudit(
                    auditDatabase
                );

                const auditedProvisioning =
                    new AuditedTenantProvisioningService(
                        provisioning,
                        provisioningAudit
                    );

                createdTenant = await auditedProvisioning.create(
                    input,
                    context
                );
            } catch (error) {
                operationFailed = true;
                operationError = error;
            }

        // Always attempt cleanup of both connections.
        // Preserve the primary provisioning error if cleanup also fails.
        await cleanupTenantAdminConnections(
            writeDatabase,
            auditDatabase,
            operationFailed,
            operationError
        );

            if (createdTenant === undefined) {
                throw new Error(
                    "Tenant provisioning completed without returning a tenant."
                );
            }

            return createdTenant!;
        }
    };
}

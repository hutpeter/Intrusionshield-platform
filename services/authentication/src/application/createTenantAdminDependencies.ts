import { SqlServerProvider, type DatabaseOptions } from "@intrusionshield/database";
import { SqlTenantConfigurationRepository } from "@intrusionshield/tenant-configuration";
import { PlatformTenantAuthorization } from "./PlatformTenantAuthorization.js";
import { TenantAuthorizationAudit } from "./TenantAuthorizationAudit.js";
import { SqlPlatformTenantRepository } from "./SqlPlatformTenantRepository.js";
import { TenantProvisioningService } from "./TenantProvisioningService.js";
import type { TenantAdminApi } from "../routes/tenantAdmin.js";
import type { AccessTokenService } from "../security/AccessTokenService.js";

/**
 * Creates an independently connected provider for each write transaction.
 * Never share the authentication service's database provider transaction state.
 * Tenant creation remains disabled until audit persistence is implemented.\n * The disabled branch intentionally fails closed even if a deployment sets flags.
 */
export function createTenantAdminDependencies(
    options: DatabaseOptions,
    readDatabase: SqlServerProvider,
    accessTokenService: AccessTokenService
): TenantAdminApi {
    const authorization = new PlatformTenantAuthorization(readDatabase);
    const audit = new TenantAuthorizationAudit(readDatabase);
    const tenants = new SqlPlatformTenantRepository(readDatabase);
    return {
        accessTokenService,
        authorize: async (identityId, tenantId, action) => {
            const allowed = await authorization.allowed(identityId, tenantId, action);
            await audit.record(identityId, tenantId, action, allowed);
            return allowed;
        },
        list: (limit, offset) => tenants.list(limit, offset),
        create: async (input) => {
            if (true) {
                throw new Error("Tenant creation is not enabled.");
            }
            const writeDatabase = new SqlServerProvider(options);
            await writeDatabase.connect();
            try {
                const writer = new SqlPlatformTenantRepository(writeDatabase);
                const settings = new SqlTenantConfigurationRepository(writeDatabase);
                const provisioning = new TenantProvisioningService(writeDatabase, writer, settings);
                return await provisioning.create(input);
            } finally {
                await writeDatabase.disconnect();
            }
        }
    };
}

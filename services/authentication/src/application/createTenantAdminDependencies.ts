import { SqlServerProvider, type DatabaseOptions } from "@intrusionshield/database";
import { SqlTenantConfigurationRepository } from "@intrusionshield/tenant-configuration";
import { PlatformTenantAuthorization } from "./PlatformTenantAuthorization.js";
import { SqlPlatformTenantRepository } from "./SqlPlatformTenantRepository.js";
import { TenantProvisioningService } from "./TenantProvisioningService.js";
import type { TenantAdminApi } from "../routes/tenantAdmin.js";
import type { AccessTokenService } from "../security/AccessTokenService.js";

/**
 * Creates an independently connected provider for each write transaction.
 * Never share the authentication service's database provider transaction state.
 * Tenant creation remains disabled until audit persistence is implemented.
 */
export function createTenantAdminDependencies(
    options: DatabaseOptions,
    readDatabase: SqlServerProvider,
    accessTokenService: AccessTokenService
): TenantAdminApi {
    const authorization = new PlatformTenantAuthorization(readDatabase);
    const tenants = new SqlPlatformTenantRepository(readDatabase);
    return {
        accessTokenService,
        authorize: (identityId, tenantId, action) =>
            authorization.allowed(identityId, tenantId, action),
        list: (limit, offset) => tenants.list(limit, offset),
        create: async (input) => {
            if (process.env.RUBY_TENANT_ONBOARDING_WRITES !== "enabled") {
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

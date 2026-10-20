import type { IDatabaseProvider } from "@intrusionshield/database";
import type { TenantConfigurationRepository } from "@intrusionshield/tenant-configuration";
import {
    SqlPlatformTenantRepository,
    validateTenantInput,
    type TenantRecord
} from "./SqlPlatformTenantRepository.js";

/**
 * Creates the tenant registry entry and language configuration atomically.
 * Use a dedicated database provider for this operation: SqlServerProvider
 * transaction state is held on the provider instance.
 */
export class TenantProvisioningService {
    constructor(
        private readonly database: IDatabaseProvider,
        private readonly tenants: SqlPlatformTenantRepository,
        private readonly configuration: TenantConfigurationRepository
    ) {}

    async create(input: unknown): Promise<TenantRecord> {
        const normalized = validateTenantInput(input);
        await this.database.beginTransaction();
        try {
            const tenant = await this.tenants.create(normalized);
            const now = new Date();
            await this.configuration.create({
                tenantId: tenant.id,
                countryCode: tenant.countryCode,
                createdAt: now,
                updatedAt: now,
                version: 1
            });
            await this.database.commitTransaction();
            return tenant;
        } catch (error) {
            await this.database.rollbackTransaction();
            throw error;
        }
    }
}


import { randomUUID } from "node:crypto";

import type { IDatabaseProvider } from "@intrusionshield/database";
import type { IEvent } from "@intrusionshield/events";
import { SqlEventOutboxRepository } from "@intrusionshield/event-persistence";
import type { TenantConfigurationRepository } from "@intrusionshield/tenant-configuration";

import {
    SqlPlatformTenantRepository,
    validateTenantInput,
    type TenantRecord
} from "./SqlPlatformTenantRepository.js";
import { TenantTransactionOutcomeError } from "./TenantTransactionOutcomeError.js";

/**
 * Creates a tenant, its initial configuration, and a durable
 * tenant.created event within one SQL Server transaction.
 *
 * All repositories MUST use the same database provider instance.
 *
 * This service does not publish events or enable public tenant creation.
 */
export class TenantProvisioningService {
    constructor(
        private readonly database: IDatabaseProvider,
        private readonly tenants: SqlPlatformTenantRepository,
        private readonly configuration: TenantConfigurationRepository,
        private readonly outbox: SqlEventOutboxRepository
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

            const event: IEvent<{
                tenantId: string;
                code: string;
                displayName: string;
                countryCode: string;
            }> = {
                id: randomUUID(),
                type: "tenant.created",
                version: "1.0",
                timestamp: now,
                tenantId: tenant.id,
                source: "ruby.authentication",
                payload: {
                    tenantId: tenant.id,
                    code: tenant.code,
                    displayName: tenant.displayName,
                    countryCode: tenant.countryCode
                }
            };

            await this.outbox.append(event);

            await this.database.commitTransaction();

            return tenant;
        } catch (error) {
            try {
                await this.database.rollbackTransaction();
            } catch (rollbackError) {
                throw new TenantTransactionOutcomeError(
                    error,
                    rollbackError
                );
            }

            throw error;
        }
    }
}

import type {
    TenantInternationalizationSettings
} from "@intrusionshield/internationalization";

import type {
    SaveTenantInternationalizationRequest,
    TenantConfiguration,
    TenantConfigurationRepository,
    TenantInternationalizationSettingsProvider
} from "./types.js";

import {
    normalizeTenantInternationalization
} from "./validation.js";

export class TenantConfigurationService
implements TenantInternationalizationSettingsProvider {
    public constructor(
        private readonly repository:
            TenantConfigurationRepository
    ) {}

    public async get(
        tenantId: string
    ): Promise<TenantConfiguration | null> {
        return this.repository
            .findByTenantId(tenantId);
    }

    public async getInternationalizationSettings(
        tenantId: string
    ): Promise<TenantInternationalizationSettings | null> {
        const configuration =
            await this.repository
                .findByTenantId(tenantId);

        if (!configuration) {
            return null;
        }

        return {
            tenantId:
                configuration.tenantId,
            countryCode:
                configuration.countryCode,
            defaultLanguage:
                configuration.defaultLanguage,
            locale:
                configuration.locale,
            timeZone:
                configuration.timeZone
        };
    }

    public async saveInternationalizationSettings(
        tenantId: string,
        request: SaveTenantInternationalizationRequest
    ): Promise<TenantConfiguration> {
        if (!tenantId.trim()) {
            throw new Error(
                "tenantId is required."
            );
        }

        const normalized =
            normalizeTenantInternationalization(
                request
            );

        const existing =
            await this.repository
                .findByTenantId(tenantId);

        const now = new Date();

        if (!existing) {
            return this.repository.create({
                tenantId,
                ...normalized,
                createdAt: now,
                updatedAt: now,
                version: 1
            });
        }

        return this.repository.update({
            ...existing,
            ...normalized,
            updatedAt: now
        });
    }
}

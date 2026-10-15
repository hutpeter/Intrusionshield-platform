import type {
    LocaleIdentifier,
    SupportedLanguage,
    TenantInternationalizationSettings
} from "@intrusionshield/internationalization";

export interface TenantConfiguration {
    readonly tenantId: string;
    readonly countryCode?: string;
    readonly defaultLanguage?: SupportedLanguage;
    readonly locale?: LocaleIdentifier;
    readonly timeZone?: string;
    readonly createdAt: Date;
    readonly updatedAt: Date;
    readonly version: number;
}

export interface SaveTenantInternationalizationRequest {
    readonly countryCode?: string | null;
    readonly defaultLanguage?: string | null;
    readonly locale?: string | null;
    readonly timeZone?: string | null;
}

export interface TenantConfigurationRepository {
    findByTenantId(
        tenantId: string
    ): Promise<TenantConfiguration | null>;

    create(
        configuration: TenantConfiguration
    ): Promise<TenantConfiguration>;

    update(
        configuration: TenantConfiguration
    ): Promise<TenantConfiguration>;
}

/**
 * Structural provider contract used by authentication.
 * It intentionally matches the authentication service's provider contract
 * without creating a dependency from this package to authentication.
 */
export interface TenantInternationalizationSettingsProvider {
    getInternationalizationSettings(
        tenantId: string
    ): Promise<TenantInternationalizationSettings | null>;
}

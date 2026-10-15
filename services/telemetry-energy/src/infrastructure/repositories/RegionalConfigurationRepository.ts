import type {
    IDatabaseProvider
} from "@intrusionshield/database";

export interface CountryReference {
    readonly code: string;
    readonly alpha3Code: string;
    readonly name: string;
    readonly defaultCurrencyCode: string;
    readonly defaultLocale?: string;
}

export interface CurrencyReference {
    readonly code: string;
    readonly name: string;
    readonly symbol?: string;
    readonly decimalPlaces: number;
}

export interface AdministrativeRegionReference {
    readonly countryCode: string;
    readonly code: string;
    readonly name: string;
    readonly regionType?: string;
}

export interface ServiceAreaReference {
    readonly id: string;
    readonly countryCode: string;
    readonly regionCode: string;
    readonly code: string;
    readonly name: string;
}

export interface TenantRegionalConfiguration {
    readonly defaultCountryCode: string;
    readonly defaultCurrencyCode: string;
    readonly defaultLocale?: string;
    readonly defaultTimeZone?: string;
    readonly countries: readonly CountryReference[];
    readonly currencies: readonly CurrencyReference[];
    readonly administrativeRegions: readonly AdministrativeRegionReference[];
    readonly serviceAreas: readonly ServiceAreaReference[];
}

interface SettingsRow {
    readonly defaultCountryCode: string;
    readonly defaultCurrencyCode: string;
    readonly defaultLocale: string | null;
    readonly defaultTimeZone: string | null;
}

interface CountryRow {
    readonly code: string;
    readonly alpha3Code: string;
    readonly name: string;
    readonly defaultCurrencyCode: string;
    readonly defaultLocale: string | null;
}

interface CurrencyRow {
    readonly code: string;
    readonly name: string;
    readonly symbol: string | null;
    readonly decimalPlaces: number;
}

interface AdministrativeRegionRow {
    readonly countryCode: string;
    readonly code: string;
    readonly name: string;
    readonly regionType: string | null;
}

interface ServiceAreaRow {
    readonly id: string;
    readonly countryCode: string;
    readonly regionCode: string;
    readonly code: string;
    readonly name: string;
}

export class SqlRegionalConfigurationRepository {
    public constructor(
        private readonly database: IDatabaseProvider
    ) {}

    public async getTenantConfiguration(
        tenantId: string
    ): Promise<TenantRegionalConfiguration> {
        const settingsResult =
            await this.database.query<SettingsRow>(
                `SELECT
                    default_country_code AS defaultCountryCode,
                    default_currency_code AS defaultCurrencyCode,
                    default_locale AS defaultLocale,
                    default_time_zone AS defaultTimeZone
                 FROM Platform.TenantRegionalSettings
                 WHERE tenant_id = @tenantId`,
                [{ name: "tenantId", value: tenantId }]
            );

        if (settingsResult.rows.length === 0) {
            throw new Error(
                "Tenant regional configuration has not been completed. Configure it during tenant onboarding."
            );
        }

        const countryResult =
            await this.database.query<CountryRow>(
                `SELECT
                    c.code,
                    c.alpha3_code AS alpha3Code,
                    c.name,
                    c.default_currency_code AS defaultCurrencyCode,
                    c.default_locale AS defaultLocale
                 FROM Platform.TenantCountries tc
                 INNER JOIN Platform.Countries c
                    ON c.code = tc.country_code
                 WHERE tc.tenant_id = @tenantId
                   AND tc.enabled = 1
                   AND c.status = 'ACTIVE'
                 ORDER BY tc.display_order, c.name`,
                [{ name: "tenantId", value: tenantId }]
            );

        const currencyResult =
            await this.database.query<CurrencyRow>(
                `SELECT
                    c.code,
                    c.name,
                    c.symbol,
                    c.decimal_places AS decimalPlaces
                 FROM Platform.TenantCurrencies tc
                 INNER JOIN Platform.Currencies c
                    ON c.code = tc.currency_code
                 WHERE tc.tenant_id = @tenantId
                   AND tc.enabled = 1
                   AND c.status = 'ACTIVE'
                 ORDER BY tc.display_order, c.name`,
                [{ name: "tenantId", value: tenantId }]
            );

        const administrativeRegionResult =
            await this.database.query<AdministrativeRegionRow>(
                `SELECT
                    ar.country_code AS countryCode,
                    ar.code,
                    ar.name,
                    ar.region_type AS regionType
                 FROM Platform.TenantAdministrativeRegions tar
                 INNER JOIN Platform.AdministrativeRegions ar
                    ON ar.country_code = tar.country_code
                   AND ar.code = tar.region_code
                 WHERE tar.tenant_id = @tenantId
                   AND tar.enabled = 1
                   AND ar.status = 'ACTIVE'
                 ORDER BY tar.display_order, ar.name`,
                [{ name: "tenantId", value: tenantId }]
            );

        const serviceAreaResult =
            await this.database.query<ServiceAreaRow>(
                `SELECT
                    CONVERT(varchar(36), sa.id) AS id,
                    sa.country_code AS countryCode,
                    sa.region_code AS regionCode,
                    sa.code,
                    sa.name
                 FROM Platform.ServiceAreas sa
                 WHERE sa.tenant_id = @tenantId
                   AND sa.enabled = 1
                 ORDER BY sa.display_order, sa.name`,
                [{ name: "tenantId", value: tenantId }]
            );

        const settings = settingsResult.rows[0]!;

        return {
            defaultCountryCode: settings.defaultCountryCode.trim(),
            defaultCurrencyCode: settings.defaultCurrencyCode.trim(),
            defaultLocale: settings.defaultLocale ?? undefined,
            defaultTimeZone: settings.defaultTimeZone ?? undefined,
            countries: countryResult.rows.map(row => ({
                code: row.code.trim(),
                alpha3Code: row.alpha3Code.trim(),
                name: row.name,
                defaultCurrencyCode: row.defaultCurrencyCode.trim(),
                defaultLocale: row.defaultLocale ?? undefined
            })),
            currencies: currencyResult.rows.map(row => ({
                code: row.code.trim(),
                name: row.name,
                symbol: row.symbol ?? undefined,
                decimalPlaces: row.decimalPlaces
            })),
            administrativeRegions: administrativeRegionResult.rows.map(row => ({
                countryCode: row.countryCode.trim(),
                code: row.code,
                name: row.name,
                regionType: row.regionType ?? undefined
            })),
            serviceAreas: serviceAreaResult.rows.map(row => ({
                id: row.id,
                countryCode: row.countryCode.trim(),
                regionCode: row.regionCode,
                code: row.code,
                name: row.name
            }))
        };
    }

    public async validateSelection(
        tenantId: string,
        countryCode: string,
        currencyCode: string
    ): Promise<void> {
        const configuration =
            await this.getTenantConfiguration(tenantId);

        if (!configuration.countries.some(
            country => country.code === countryCode
        )) {
            throw new Error(
                `Country ${countryCode} is not enabled for this tenant.`
            );
        }

        if (!configuration.currencies.some(
            currency => currency.code === currencyCode
        )) {
            throw new Error(
                `Currency ${currencyCode} is not enabled for this tenant.`
            );
        }
    }

    public async validateGeography(
        tenantId: string,
        countryCode: string,
        administrativeRegionCode?: string,
        serviceAreaId?: string
    ): Promise<void> {
        const configuration =
            await this.getTenantConfiguration(tenantId);

        if (administrativeRegionCode && !configuration.administrativeRegions.some(
            region =>
                region.countryCode === countryCode &&
                region.code === administrativeRegionCode
        )) {
            throw new Error(
                `Region ${administrativeRegionCode} is not enabled for this tenant and country.`
            );
        }

        if (serviceAreaId && !configuration.serviceAreas.some(
            area =>
                area.id === serviceAreaId &&
                area.countryCode === countryCode &&
                (!administrativeRegionCode || area.regionCode === administrativeRegionCode)
        )) {
            throw new Error(
                "Service area is not enabled for the selected tenant, country, and region."
            );
        }
    }

}

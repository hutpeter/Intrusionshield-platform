import type {
    IDatabaseProvider
} from "@intrusionshield/database";

import type {
    TenantConfiguration,
    TenantConfigurationRepository
} from "./types.js";

interface TenantConfigurationRow {
    tenantId: string;
    countryCode: string | null;
    defaultLanguage: TenantConfiguration["defaultLanguage"] | null;
    locale: string | null;
    timeZone: string | null;
    createdAt: Date;
    updatedAt: Date;
    version: number;
}

export class SqlTenantConfigurationRepository
implements TenantConfigurationRepository {
    public constructor(
        private readonly database:
            IDatabaseProvider
    ) {}

    public async findByTenantId(
        tenantId: string
    ): Promise<TenantConfiguration | null> {
        const result =
            await this.database.query<
                TenantConfigurationRow
            >(
                `SELECT
                    tenant_id AS tenantId,
                    country_code AS countryCode,
                    default_language AS defaultLanguage,
                    locale,
                    time_zone AS timeZone,
                    created_at AS createdAt,
                    updated_at AS updatedAt,
                    version
                 FROM EIS.TenantConfigurations
                 WHERE tenant_id = @tenantId`,
                [
                    {
                        name: "tenantId",
                        value: tenantId
                    }
                ]
            );

        const row = result.rows[0];

        return row
            ? this.mapRow(row)
            : null;
    }

    public async create(
        configuration: TenantConfiguration
    ): Promise<TenantConfiguration> {
        await this.database.execute(
            `INSERT INTO EIS.TenantConfigurations
             (
                tenant_id,
                country_code,
                default_language,
                locale,
                time_zone,
                created_at,
                updated_at,
                version
             )
             VALUES
             (
                @tenantId,
                @countryCode,
                @defaultLanguage,
                @locale,
                @timeZone,
                @createdAt,
                @updatedAt,
                @version
             )`,
            this.parameters(configuration)
        );

        return configuration;
    }

    public async update(
        configuration: TenantConfiguration
    ): Promise<TenantConfiguration> {
        const nextVersion =
            configuration.version + 1;

        const rows =
            await this.database.execute(
                `UPDATE EIS.TenantConfigurations
                 SET
                    country_code = @countryCode,
                    default_language = @defaultLanguage,
                    locale = @locale,
                    time_zone = @timeZone,
                    updated_at = @updatedAt,
                    version = @nextVersion
                 WHERE tenant_id = @tenantId
                   AND version = @version`,
                [
                    ...this.parameters(
                        configuration
                    ),
                    {
                        name: "nextVersion",
                        value: nextVersion
                    }
                ]
            );

        if (rows !== 1) {
            throw new Error(
                "Tenant configuration was modified or does not exist."
            );
        }

        return {
            ...configuration,
            version: nextVersion
        };
    }

    private parameters(
        configuration: TenantConfiguration
    ) {
        return [
            {
                name: "tenantId",
                value: configuration.tenantId
            },
            {
                name: "countryCode",
                value:
                    configuration.countryCode ??
                    null
            },
            {
                name: "defaultLanguage",
                value:
                    configuration.defaultLanguage ??
                    null
            },
            {
                name: "locale",
                value:
                    configuration.locale ??
                    null
            },
            {
                name: "timeZone",
                value:
                    configuration.timeZone ??
                    null
            },
            {
                name: "createdAt",
                value: configuration.createdAt
            },
            {
                name: "updatedAt",
                value: configuration.updatedAt
            },
            {
                name: "version",
                value: configuration.version
            }
        ];
    }

    private mapRow(
        row: TenantConfigurationRow
    ): TenantConfiguration {
        return {
            tenantId: row.tenantId,
            countryCode:
                row.countryCode ??
                undefined,
            defaultLanguage:
                row.defaultLanguage ??
                undefined,
            locale:
                row.locale ??
                undefined,
            timeZone:
                row.timeZone ??
                undefined,
            createdAt:
                new Date(row.createdAt),
            updatedAt:
                new Date(row.updatedAt),
            version: row.version
        };
    }
}

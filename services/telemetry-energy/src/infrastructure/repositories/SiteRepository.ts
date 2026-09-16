import {
    normalizeUuid,
    type IDatabaseProvider
} from "@intrusionshield/database";

import {
    createSite,
    type Site,
    type SiteStatus
} from "@intrusionshield/telemetry";

export interface CreateSiteRepositoryInput {
    readonly tenantId: string;
    readonly code: string;
    readonly name: string;
    readonly description?: string;
    readonly timezone: string;
    readonly latitude?: number;
    readonly longitude?: number;
    readonly status?: SiteStatus;
}

export class SqlSiteRepository {
    public constructor(
        private readonly database: IDatabaseProvider
    ) {}

    public async create(
        input: CreateSiteRepositoryInput
    ): Promise<Site> {
        const site = createSite({
            tenantId: input.tenantId,
            code: input.code,
            name: input.name,
            description: input.description,
            timezone: input.timezone,
            latitude: input.latitude,
            longitude: input.longitude,
            status: input.status ?? "ACTIVE"
        });

        await this.database.execute(
            `INSERT INTO Telemetry.Sites
             (
                 id,
                 tenant_id,
                 code,
                 name,
                 description,
                 timezone,
                 latitude,
                 longitude,
                 status,
                 created_at,
                 updated_at,
                 version
             )
             VALUES
             (
                 @id,
                 @tenantId,
                 @code,
                 @name,
                 @description,
                 @timezone,
                 @latitude,
                 @longitude,
                 @status,
                 @createdAt,
                 @updatedAt,
                 @version
             )`,
            [
                { name: "id", value: site.id },
                { name: "tenantId", value: site.tenantId },
                { name: "code", value: site.code },
                { name: "name", value: site.name },
                {
                    name: "description",
                    value: site.description ?? null
                },
                {
                    name: "timezone",
                    value: site.timezone
                },
                {
                    name: "latitude",
                    value: site.latitude ?? null
                },
                {
                    name: "longitude",
                    value: site.longitude ?? null
                },
                { name: "status", value: site.status },
                {
                    name: "createdAt",
                    value: site.createdAt
                },
                {
                    name: "updatedAt",
                    value: site.updatedAt
                },
                {
                    name: "version",
                    value: site.version
                }
            ]
        );

        return site;
    }

    public async findById(
        id: string,
        tenantId: string
    ): Promise<Site | null> {
        const result =
            await this.database.query<SiteRow>(
                `SELECT
                     id,
                     tenant_id AS tenantId,
                     code,
                     name,
                     description,
                     timezone,
                     latitude,
                     longitude,
                     status,
                     created_at AS createdAt,
                     updated_at AS updatedAt,
                     version
                 FROM Telemetry.Sites
                 WHERE id = @id
                   AND tenant_id = @tenantId`,
                [
                    { name: "id", value: id },
                    {
                        name: "tenantId",
                        value: tenantId
                    }
                ]
            );

        const row = result.rows[0];

        return row
            ? mapSite(row)
            : null;
    }

    public async findAll(
        tenantId: string
    ): Promise<readonly Site[]> {
        const result =
            await this.database.query<SiteRow>(
                `SELECT
                     id,
                     tenant_id AS tenantId,
                     code,
                     name,
                     description,
                     timezone,
                     latitude,
                     longitude,
                     status,
                     created_at AS createdAt,
                     updated_at AS updatedAt,
                     version
                 FROM Telemetry.Sites
                 WHERE tenant_id = @tenantId
                 ORDER BY name, code`,
                [
                    {
                        name: "tenantId",
                        value: tenantId
                    }
                ]
            );

        return result.rows.map(mapSite);
    }
}

interface SiteRow {
    readonly id: string;
    readonly tenantId: string;
    readonly code: string;
    readonly name: string;
    readonly description: string | null;
    readonly timezone: string;
    readonly latitude: number | null;
    readonly longitude: number | null;
    readonly status: SiteStatus;
    readonly createdAt: Date;
    readonly updatedAt: Date;
    readonly version: number;
}

function mapSite(
    row: SiteRow
): Site {
    return {
        id: normalizeUuid(row.id),
        tenantId: normalizeUuid(row.tenantId),
        code: row.code,
        name: row.name,
        description:
            row.description ?? undefined,
        timezone: row.timezone,
        latitude:
            row.latitude ?? undefined,
        longitude:
            row.longitude ?? undefined,
        status: row.status,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        version: row.version
    };
}

import {
    normalizeUuid,
    type IDatabaseProvider
} from "@intrusionshield/database";

import {
    createEnergyFlow,
    type EnergyFlow,
    type EnergyFlowDirection
} from "@intrusionshield/energy";

export interface CreateEnergyFlowRepositoryInput {
    readonly tenantId: string;
    readonly siteId: string;
    readonly sourceAssetId?: string;
    readonly destinationAssetId?: string;
    readonly direction: EnergyFlowDirection;
    readonly powerKw: number;
    readonly energyKwh?: number;
    readonly observedAt: Date;
    readonly source: string;
}

export class SqlEnergyFlowRepository {
    public constructor(
        private readonly database: IDatabaseProvider
    ) {}

    public async create(
        input: CreateEnergyFlowRepositoryInput
    ): Promise<EnergyFlow> {
        const flow =
            createEnergyFlow({
                tenantId:
                    input.tenantId,
                siteId:
                    input.siteId,
                sourceAssetId:
                    input.sourceAssetId,
                destinationAssetId:
                    input.destinationAssetId,
                direction:
                    input.direction,
                powerKw:
                    input.powerKw,
                energyKwh:
                    input.energyKwh,
                observedAt:
                    input.observedAt,
                source:
                    input.source
            });

        await this.database.execute(
            `INSERT INTO Energy.Flows
             (
                 id,
                 tenant_id,
                 site_id,
                 source_asset_id,
                 destination_asset_id,
                 direction,
                 power_kw,
                 energy_kwh,
                 observed_at,
                 source,
                 created_at
             )
             VALUES
             (
                 @id,
                 @tenantId,
                 @siteId,
                 @sourceAssetId,
                 @destinationAssetId,
                 @direction,
                 @powerKw,
                 @energyKwh,
                 @observedAt,
                 @source,
                 @createdAt
             )`,
            [
                {
                    name: "id",
                    value: flow.id
                },
                {
                    name: "tenantId",
                    value: flow.tenantId
                },
                {
                    name: "siteId",
                    value: flow.siteId
                },
                {
                    name: "sourceAssetId",
                    value:
                        flow.sourceAssetId ??
                        null
                },
                {
                    name: "destinationAssetId",
                    value:
                        flow.destinationAssetId ??
                        null
                },
                {
                    name: "direction",
                    value: flow.direction
                },
                {
                    name: "powerKw",
                    value: flow.powerKw
                },
                {
                    name: "energyKwh",
                    value:
                        flow.energyKwh ??
                        null
                },
                {
                    name: "observedAt",
                    value: flow.observedAt
                },
                {
                    name: "source",
                    value: flow.source
                },
                {
                    name: "createdAt",
                    value: flow.createdAt
                }
            ]
        );

        return flow;
    }

    public async findById(
        id: string,
        tenantId: string
    ): Promise<EnergyFlow | null> {
        const result =
            await this.database.query<EnergyFlowRow>(
                `SELECT
                     id,
                     tenant_id AS tenantId,
                     site_id AS siteId,
                     source_asset_id
                         AS sourceAssetId,
                     destination_asset_id
                         AS destinationAssetId,
                     direction,
                     power_kw AS powerKw,
                     energy_kwh AS energyKwh,
                     observed_at AS observedAt,
                     source,
                     created_at AS createdAt
                 FROM Energy.Flows
                 WHERE id = @id
                   AND tenant_id = @tenantId`,
                [
                    {
                        name: "id",
                        value: id
                    },
                    {
                        name: "tenantId",
                        value: tenantId
                    }
                ]
            );

        const row =
            result.rows[0];

        return row
            ? mapEnergyFlow(row)
            : null;
    }

    public async findBySite(
        siteId: string,
        tenantId: string,
        limit = 100
    ): Promise<readonly EnergyFlow[]> {
        const safeLimit =
            normalizeLimit(limit);

        const result =
            await this.database.query<EnergyFlowRow>(
                `SELECT TOP (${safeLimit})
                     id,
                     tenant_id AS tenantId,
                     site_id AS siteId,
                     source_asset_id
                         AS sourceAssetId,
                     destination_asset_id
                         AS destinationAssetId,
                     direction,
                     power_kw AS powerKw,
                     energy_kwh AS energyKwh,
                     observed_at AS observedAt,
                     source,
                     created_at AS createdAt
                 FROM Energy.Flows
                 WHERE tenant_id = @tenantId
                   AND site_id = @siteId
                 ORDER BY observed_at DESC,
                          created_at DESC`,
                [
                    {
                        name: "tenantId",
                        value: tenantId
                    },
                    {
                        name: "siteId",
                        value: siteId
                    }
                ]
            );

        return result.rows.map(
            mapEnergyFlow
        );
    }
}

interface EnergyFlowRow {
    readonly id: string;
    readonly tenantId: string;
    readonly siteId: string;
    readonly sourceAssetId: string | null;
    readonly destinationAssetId: string | null;
    readonly direction: EnergyFlowDirection;
    readonly powerKw: number;
    readonly energyKwh: number | null;
    readonly observedAt: Date;
    readonly source: string;
    readonly createdAt: Date;
}

function mapEnergyFlow(
    row: EnergyFlowRow
): EnergyFlow {
    return {
        id:
            normalizeUuid(row.id),
        tenantId:
            normalizeUuid(row.tenantId),
        siteId:
            normalizeUuid(row.siteId),
        sourceAssetId:
            row.sourceAssetId
                ? normalizeUuid(
                    row.sourceAssetId
                )
                : undefined,
        destinationAssetId:
            row.destinationAssetId
                ? normalizeUuid(
                    row.destinationAssetId
                )
                : undefined,
        direction:
            row.direction,
        powerKw:
            Number(row.powerKw),
        energyKwh:
            row.energyKwh === null
                ? undefined
                : Number(
                    row.energyKwh
                ),
        observedAt:
            row.observedAt,
        source:
            row.source,
        createdAt:
            row.createdAt
    };
}

function normalizeLimit(
    limit: number
): number {
    if (
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 1000
    ) {
        throw new Error(
            "limit must be an integer between 1 and 1000."
        );
    }

    return limit;
}
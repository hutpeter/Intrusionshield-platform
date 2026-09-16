import {
    normalizeUuid,
    type IDatabaseProvider
} from "@intrusionshield/database";

import {
    createAsset,
    type Asset,
    type AssetStatus
} from "@intrusionshield/telemetry";

export interface CreateAssetRepositoryInput {
    readonly tenantId: string;
    readonly siteId: string;
    readonly parentAssetId?: string;
    readonly code: string;
    readonly name: string;
    readonly assetType: string;
    readonly manufacturer?: string;
    readonly model?: string;
    readonly serialNumber?: string;
    readonly status?: AssetStatus;
}

export class SqlAssetRepository {
    public constructor(
        private readonly database: IDatabaseProvider
    ) {}

    public async create(
        input: CreateAssetRepositoryInput
    ): Promise<Asset> {
        const asset = createAsset({
            tenantId: input.tenantId,
            siteId: input.siteId,
            parentAssetId: input.parentAssetId,
            code: input.code,
            name: input.name,
            assetType: input.assetType,
            manufacturer: input.manufacturer,
            model: input.model,
            serialNumber: input.serialNumber,
            status: input.status ?? "ACTIVE"
        });

        await this.database.execute(
            `INSERT INTO Telemetry.Assets
             (
                 id,
                 tenant_id,
                 site_id,
                 parent_asset_id,
                 code,
                 name,
                 asset_type,
                 manufacturer,
                 model,
                 serial_number,
                 status,
                 created_at,
                 updated_at,
                 version
             )
             VALUES
             (
                 @id,
                 @tenantId,
                 @siteId,
                 @parentAssetId,
                 @code,
                 @name,
                 @assetType,
                 @manufacturer,
                 @model,
                 @serialNumber,
                 @status,
                 @createdAt,
                 @updatedAt,
                 @version
             )`,
            [
                { name: "id", value: asset.id },
                { name: "tenantId", value: asset.tenantId },
                { name: "siteId", value: asset.siteId },
                {
                    name: "parentAssetId",
                    value: asset.parentAssetId ?? null
                },
                { name: "code", value: asset.code },
                { name: "name", value: asset.name },
                { name: "assetType", value: asset.assetType },
                {
                    name: "manufacturer",
                    value: asset.manufacturer ?? null
                },
                {
                    name: "model",
                    value: asset.model ?? null
                },
                {
                    name: "serialNumber",
                    value: asset.serialNumber ?? null
                },
                { name: "status", value: asset.status },
                { name: "createdAt", value: asset.createdAt },
                { name: "updatedAt", value: asset.updatedAt },
                { name: "version", value: asset.version }
            ]
        );

        return asset;
    }

    public async findById(
        id: string,
        tenantId: string
    ): Promise<Asset | null> {
        const result = await this.database.query<AssetRow>(
            `SELECT
                 id,
                 tenant_id AS tenantId,
                 site_id AS siteId,
                 parent_asset_id AS parentAssetId,
                 code,
                 name,
                 asset_type AS assetType,
                 manufacturer,
                 model,
                 serial_number AS serialNumber,
                 status,
                 created_at AS createdAt,
                 updated_at AS updatedAt,
                 version
             FROM Telemetry.Assets
             WHERE id = @id
               AND tenant_id = @tenantId`,
            [
                { name: "id", value: id },
                { name: "tenantId", value: tenantId }
            ]
        );

        const row = result.rows[0];

        return row ? mapAsset(row) : null;
    }

    public async findBySite(
        siteId: string,
        tenantId: string
    ): Promise<readonly Asset[]> {
        const result = await this.database.query<AssetRow>(
            `SELECT
                 id,
                 tenant_id AS tenantId,
                 site_id AS siteId,
                 parent_asset_id AS parentAssetId,
                 code,
                 name,
                 asset_type AS assetType,
                 manufacturer,
                 model,
                 serial_number AS serialNumber,
                 status,
                 created_at AS createdAt,
                 updated_at AS updatedAt,
                 version
             FROM Telemetry.Assets
             WHERE tenant_id = @tenantId
               AND site_id = @siteId
             ORDER BY name, code`,
            [
                { name: "tenantId", value: tenantId },
                { name: "siteId", value: siteId }
            ]
        );

        return result.rows.map(mapAsset);
    }
}

interface AssetRow {
    readonly id: string;
    readonly tenantId: string;
    readonly siteId: string;
    readonly parentAssetId: string | null;
    readonly code: string;
    readonly name: string;
    readonly assetType: string;
    readonly manufacturer: string | null;
    readonly model: string | null;
    readonly serialNumber: string | null;
    readonly status: AssetStatus;
    readonly createdAt: Date;
    readonly updatedAt: Date;
    readonly version: number;
}

function mapAsset(row: AssetRow): Asset {
    return {
        id: normalizeUuid(row.id),
        tenantId: normalizeUuid(row.tenantId),
        siteId: normalizeUuid(row.siteId),
        parentAssetId: row.parentAssetId
            ? normalizeUuid(row.parentAssetId)
            : undefined,
        code: row.code,
        name: row.name,
        assetType: row.assetType,
        manufacturer: row.manufacturer ?? undefined,
        model: row.model ?? undefined,
        serialNumber: row.serialNumber ?? undefined,
        status: row.status,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        version: row.version
    };
}

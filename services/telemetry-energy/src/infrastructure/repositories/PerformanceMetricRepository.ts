import {
    normalizeUuid,
    type IDatabaseProvider
} from "@intrusionshield/database";

import {
    createPerformanceMetric,
    type PerformanceMetric
} from "@intrusionshield/energy";

export interface CreatePerformanceMetricRepositoryInput {
    readonly tenantId: string;
    readonly siteId: string;
    readonly assetId?: string;
    readonly metricCode: string;
    readonly value: number;
    readonly unit?: string;
    readonly periodStart: Date;
    readonly periodEnd: Date;
    readonly source: string;
}

export class SqlPerformanceMetricRepository {
    public constructor(
        private readonly database: IDatabaseProvider
    ) {}

    public async create(
        input: CreatePerformanceMetricRepositoryInput
    ): Promise<PerformanceMetric> {
        const metric = createPerformanceMetric(input);

        await this.database.execute(
            `INSERT INTO Energy.PerformanceMetrics
             (
                 id,
                 tenant_id,
                 site_id,
                 asset_id,
                 metric_code,
                 metric_value,
                 unit,
                 period_start,
                 period_end,
                 source,
                 calculated_at,
                 created_at
             )
             VALUES
             (
                 @id,
                 @tenantId,
                 @siteId,
                 @assetId,
                 @metricCode,
                 @value,
                 @unit,
                 @periodStart,
                 @periodEnd,
                 @source,
                 @calculatedAt,
                 @createdAt
             )`,
            [
                { name: "id", value: metric.id },
                { name: "tenantId", value: metric.tenantId },
                { name: "siteId", value: metric.siteId },
                { name: "assetId", value: metric.assetId ?? null },
                { name: "metricCode", value: metric.metricCode },
                { name: "value", value: metric.value },
                { name: "unit", value: metric.unit ?? null },
                { name: "periodStart", value: metric.periodStart },
                { name: "periodEnd", value: metric.periodEnd },
                { name: "source", value: metric.source },
                { name: "calculatedAt", value: metric.calculatedAt },
                { name: "createdAt", value: metric.calculatedAt }
            ]
        );

        return metric;
    }

    public async findBySite(
        tenantId: string,
        siteId: string,
        limit = 100
    ): Promise<readonly PerformanceMetric[]> {
        if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
            throw new Error("limit must be an integer between 1 and 1000.");
        }

        const result =
            await this.database.query<PerformanceMetricRow>(
                `SELECT TOP (${limit})
                     id,
                     tenant_id AS tenantId,
                     site_id AS siteId,
                     asset_id AS assetId,
                     metric_code AS metricCode,
                     metric_value AS value,
                     unit,
                     period_start AS periodStart,
                     period_end AS periodEnd,
                     source,
                     calculated_at AS calculatedAt
                 FROM Energy.PerformanceMetrics
                 WHERE tenant_id = @tenantId
                   AND site_id = @siteId
                 ORDER BY calculated_at DESC, metric_code`,
                [
                    { name: "tenantId", value: tenantId },
                    { name: "siteId", value: siteId }
                ]
            );

        return result.rows.map(mapMetric);
    }
}

interface PerformanceMetricRow {
    readonly id: string;
    readonly tenantId: string;
    readonly siteId: string;
    readonly assetId: string | null;
    readonly metricCode: string;
    readonly value: number;
    readonly unit: string | null;
    readonly periodStart: Date;
    readonly periodEnd: Date;
    readonly source: string;
    readonly calculatedAt: Date;
}

function mapMetric(
    row: PerformanceMetricRow
): PerformanceMetric {
    return {
        id: normalizeUuid(row.id),
        tenantId: normalizeUuid(row.tenantId),
        siteId: normalizeUuid(row.siteId),
        assetId:
            row.assetId === null
                ? undefined
                : normalizeUuid(row.assetId),
        metricCode: row.metricCode,
        value: Number(row.value),
        unit: row.unit ?? undefined,
        periodStart: row.periodStart,
        periodEnd: row.periodEnd,
        source: row.source,
        calculatedAt: row.calculatedAt
    };
}

import type {
    IDatabaseProvider
} from "@intrusionshield/database";

import type {
    PerformanceMetric
} from "@intrusionshield/energy";

import {
    SqlPerformanceMetricRepository
} from "../infrastructure/repositories/PerformanceMetricRepository.js";

export interface CalculatePerformanceInput {
    readonly tenantId: string;
    readonly siteId: string;
    readonly periodStart: Date;
    readonly periodEnd: Date;
}

interface AggregateRow {
    readonly value: number | null;
}

export class PerformanceEngine {
    public constructor(
        private readonly database: IDatabaseProvider,
        private readonly metrics: SqlPerformanceMetricRepository
    ) {}

    public async calculate(
        input: CalculatePerformanceInput
    ): Promise<readonly PerformanceMetric[]> {
        if (input.periodEnd <= input.periodStart) {
            throw new Error("periodEnd must be later than periodStart.");
        }

        const periodHours =
            (input.periodEnd.getTime() - input.periodStart.getTime()) /
            3_600_000;

        const [
            solarEnergy,
            peakPv,
            loadEnergy,
            gridImport,
            gridExport,
            batterySocMin,
            batterySocMax
        ] = await Promise.all([
            this.sumFlowEnergy(input, "source", "SOLAR_PV_ARRAY"),
            this.aggregateReading(input, "solar.pv.ac_power", "MAX"),
            this.sumFlowEnergy(input, "destination", "SITE_LOAD"),
            this.sumDirectionEnergy(input, "IMPORT"),
            this.sumDirectionEnergy(input, "EXPORT"),
            this.aggregateReading(input, "battery.state_of_charge", "MIN"),
            this.aggregateReading(input, "battery.state_of_charge", "MAX")
        ]);

        const capacityKw =
            await this.getSolarCapacityKw(input.tenantId, input.siteId);

        const capacityFactor =
            capacityKw > 0 && periodHours > 0
                ? (solarEnergy / (capacityKw * periodHours)) * 100
                : 0;

        const definitions = [
            ["solar.production.energy", solarEnergy, "kWh"],
            ["solar.peak_power", peakPv, "kW"],
            ["solar.capacity_factor", capacityFactor, "%"],
            ["site.load.energy", loadEnergy, "kWh"],
            ["grid.import.energy", gridImport, "kWh"],
            ["grid.export.energy", gridExport, "kWh"],
            ["battery.soc.minimum", batterySocMin, "%"],
            ["battery.soc.maximum", batterySocMax, "%"]
        ] as const;

        const created: PerformanceMetric[] = [];

        for (const [metricCode, value, unit] of definitions) {
            created.push(
                await this.metrics.create({
                    tenantId: input.tenantId,
                    siteId: input.siteId,
                    metricCode,
                    value: round(value, 6),
                    unit,
                    periodStart: input.periodStart,
                    periodEnd: input.periodEnd,
                    source: "eis.performance-engine"
                })
            );
        }

        return created;
    }

    private async sumFlowEnergy(
        input: CalculatePerformanceInput,
        side: "source" | "destination",
        assetType: string
    ): Promise<number> {
        const column =
            side === "source"
                ? "source_asset_id"
                : "destination_asset_id";

        const result =
            await this.database.query<AggregateRow>(
                `SELECT SUM(CAST(f.energy_kwh AS FLOAT)) AS value
                 FROM Energy.Flows f
                 INNER JOIN Telemetry.Assets a
                    ON a.id = f.${column}
                   AND a.tenant_id = f.tenant_id
                 WHERE f.tenant_id = @tenantId
                   AND f.site_id = @siteId
                   AND a.asset_type = @assetType
                   AND f.observed_at >= @periodStart
                   AND f.observed_at < @periodEnd`,
                [
                    { name: "tenantId", value: input.tenantId },
                    { name: "siteId", value: input.siteId },
                    { name: "assetType", value: assetType },
                    { name: "periodStart", value: input.periodStart },
                    { name: "periodEnd", value: input.periodEnd }
                ]
            );

        return Number(result.rows[0]?.value ?? 0);
    }

    private async sumDirectionEnergy(
        input: CalculatePerformanceInput,
        direction: "IMPORT" | "EXPORT"
    ): Promise<number> {
        const result =
            await this.database.query<AggregateRow>(
                `SELECT SUM(CAST(energy_kwh AS FLOAT)) AS value
                 FROM Energy.Flows
                 WHERE tenant_id = @tenantId
                   AND site_id = @siteId
                   AND direction = @direction
                   AND observed_at >= @periodStart
                   AND observed_at < @periodEnd`,
                [
                    { name: "tenantId", value: input.tenantId },
                    { name: "siteId", value: input.siteId },
                    { name: "direction", value: direction },
                    { name: "periodStart", value: input.periodStart },
                    { name: "periodEnd", value: input.periodEnd }
                ]
            );

        return Number(result.rows[0]?.value ?? 0);
    }

    private async aggregateReading(
        input: CalculatePerformanceInput,
        measurementCode: string,
        aggregate: "MIN" | "MAX"
    ): Promise<number> {
        const result =
            await this.database.query<AggregateRow>(
                `SELECT ${aggregate}(CAST(r.numeric_value AS FLOAT)) AS value
                 FROM Telemetry.Readings r
                 INNER JOIN Telemetry.MeasurementDefinitions m
                    ON m.id = r.measurement_definition_id
                   AND m.tenant_id = r.tenant_id
                 WHERE r.tenant_id = @tenantId
                   AND r.site_id = @siteId
                   AND m.code = @measurementCode
                   AND r.numeric_value IS NOT NULL
                   AND r.observed_at >= @periodStart
                   AND r.observed_at < @periodEnd`,
                [
                    { name: "tenantId", value: input.tenantId },
                    { name: "siteId", value: input.siteId },
                    { name: "measurementCode", value: measurementCode },
                    { name: "periodStart", value: input.periodStart },
                    { name: "periodEnd", value: input.periodEnd }
                ]
            );

        return Number(result.rows[0]?.value ?? 0);
    }

    private async getSolarCapacityKw(
        tenantId: string,
        siteId: string
    ): Promise<number> {
        const result =
            await this.database.query<AggregateRow>(
                `SELECT MAX(CAST(m.maximum_value AS FLOAT)) AS value
                 FROM Telemetry.MeasurementDefinitions m
                 INNER JOIN Telemetry.Readings r
                    ON r.measurement_definition_id = m.id
                   AND r.tenant_id = m.tenant_id
                 WHERE r.tenant_id = @tenantId
                   AND r.site_id = @siteId
                   AND m.code = 'solar.pv.ac_power'`,
                [
                    { name: "tenantId", value: tenantId },
                    { name: "siteId", value: siteId }
                ]
            );

        return Number(result.rows[0]?.value ?? 0);
    }
}

function round(
    value: number,
    decimals: number
): number {
    const factor = 10 ** decimals;
    return Math.round((value + Number.EPSILON) * factor) / factor;
}

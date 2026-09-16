import {
    normalizeUuid,
    type IDatabaseProvider
} from "@intrusionshield/database";

import {
    createTelemetryReading,
    type TelemetryQuality,
    type TelemetryReading
} from "@intrusionshield/telemetry";

export interface CreateTelemetryReadingRepositoryInput {
    readonly tenantId: string;
    readonly siteId: string;
    readonly deviceId: string;
    readonly measurementDefinitionId: string;
    readonly observedAt: Date;
    readonly numericValue?: number;
    readonly booleanValue?: boolean;
    readonly stringValue?: string;
    readonly quality?: TelemetryQuality;
    readonly source: string;
    readonly receivedAt?: Date;
}

export class SqlTelemetryRepository {
    public constructor(
        private readonly database: IDatabaseProvider
    ) {}

    public async create(
        input: CreateTelemetryReadingRepositoryInput
    ): Promise<TelemetryReading> {
        const reading =
            createTelemetryReading({
                tenantId: input.tenantId,
                siteId: input.siteId,
                deviceId: input.deviceId,
                measurementDefinitionId:
                    input.measurementDefinitionId,
                observedAt: input.observedAt,
                numericValue:
                    input.numericValue,
                booleanValue:
                    input.booleanValue,
                stringValue:
                    input.stringValue,
                quality:
                    input.quality ?? "GOOD",
                source: input.source,
                receivedAt:
                    input.receivedAt
            });

        await this.database.execute(
            `INSERT INTO Telemetry.Readings
             (
                 id,
                 tenant_id,
                 site_id,
                 device_id,
                 measurement_definition_id,
                 observed_at,
                 received_at,
                 numeric_value,
                 boolean_value,
                 string_value,
                 quality,
                 source
             )
             VALUES
             (
                 @id,
                 @tenantId,
                 @siteId,
                 @deviceId,
                 @measurementDefinitionId,
                 @observedAt,
                 @receivedAt,
                 @numericValue,
                 @booleanValue,
                 @stringValue,
                 @quality,
                 @source
             )`,
            [
                {
                    name: "id",
                    value: reading.id
                },
                {
                    name: "tenantId",
                    value: reading.tenantId
                },
                {
                    name: "siteId",
                    value: reading.siteId
                },
                {
                    name: "deviceId",
                    value: reading.deviceId
                },
                {
                    name: "measurementDefinitionId",
                    value:
                        reading.measurementDefinitionId
                },
                {
                    name: "observedAt",
                    value: reading.observedAt
                },
                {
                    name: "receivedAt",
                    value: reading.receivedAt
                },
                {
                    name: "numericValue",
                    value:
                        reading.numericValue ?? null
                },
                {
                    name: "booleanValue",
                    value:
                        reading.booleanValue ?? null
                },
                {
                    name: "stringValue",
                    value:
                        reading.stringValue ?? null
                },
                {
                    name: "quality",
                    value: reading.quality
                },
                {
                    name: "source",
                    value: reading.source
                }
            ]
        );

        return reading;
    }

    public async bySite(
        siteId: string,
        tenantId: string
    ): Promise<readonly TelemetryReading[]> {
        const result =
            await this.database.query<TelemetryReadingRow>(
                `SELECT TOP (100)
                     id,
                     tenant_id AS tenantId,
                     site_id AS siteId,
                     device_id AS deviceId,
                     measurement_definition_id
                         AS measurementDefinitionId,
                     observed_at AS observedAt,
                     received_at AS receivedAt,
                     numeric_value AS numericValue,
                     boolean_value AS booleanValue,
                     string_value AS stringValue,
                     quality,
                     source
                 FROM Telemetry.Readings
                 WHERE tenant_id = @tenantId
                   AND site_id = @siteId
                 ORDER BY observed_at DESC`,
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
            mapTelemetryReading
        );
    }
}

interface TelemetryReadingRow {
    readonly id: string;
    readonly tenantId: string;
    readonly siteId: string;
    readonly deviceId: string;
    readonly measurementDefinitionId: string;
    readonly observedAt: Date;
    readonly receivedAt: Date;
    readonly numericValue: number | null;
    readonly booleanValue: boolean | null;
    readonly stringValue: string | null;
    readonly quality: TelemetryQuality;
    readonly source: string;
}

function mapTelemetryReading(
    row: TelemetryReadingRow
): TelemetryReading {
    return {
        id: normalizeUuid(row.id),
        tenantId:
            normalizeUuid(row.tenantId),
        siteId:
            normalizeUuid(row.siteId),
        deviceId:
            normalizeUuid(row.deviceId),
        measurementDefinitionId:
            normalizeUuid(
                row.measurementDefinitionId
            ),
        observedAt: row.observedAt,
        receivedAt: row.receivedAt,
        numericValue:
            row.numericValue ?? undefined,
        booleanValue:
            row.booleanValue ?? undefined,
        stringValue:
            row.stringValue ?? undefined,
        quality: row.quality,
        source: row.source
    };
}
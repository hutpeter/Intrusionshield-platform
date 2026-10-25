
import {
    normalizeUuid,
    type IDatabaseProvider,
    type SqlParameter
} from "@intrusionshield/database";

import type {
    TelemetryQuality,
    TelemetryReading
} from "@intrusionshield/telemetry";

export interface TelemetryHistoryQuery {
    readonly tenantId: string;
    readonly siteId: string;
    readonly deviceId?: string;
    readonly measurementDefinitionId?: string;
    readonly from?: Date;
    readonly to?: Date;
    readonly page?: number;
    readonly pageSize?: number;
}

export interface TelemetryHistoryResult {
    readonly items: readonly TelemetryReading[];
    readonly page: number;
    readonly pageSize: number;
    readonly hasMore: boolean;
}

interface TelemetryHistoryRow {
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

export class SqlTelemetryHistoryRepository {
    public constructor(
        private readonly database: IDatabaseProvider
    ) {}

    public async queryHistory(
        input: TelemetryHistoryQuery
    ): Promise<TelemetryHistoryResult> {
        const page = input.page ?? 1;
        const pageSize = input.pageSize ?? 100;

        if (!input.tenantId || !input.siteId) {
            throw new Error(
                "tenantId and siteId are required."
            );
        }

        if (
            !Number.isSafeInteger(page) ||
            page < 1
        ) {
            throw new Error(
                "page must be a positive integer."
            );
        }

        if (
            !Number.isSafeInteger(pageSize) ||
            pageSize < 1 ||
            pageSize > 500
        ) {
            throw new Error(
                "pageSize must be between 1 and 500."
            );
        }

        const offset = (page - 1) * pageSize;

        if (!Number.isSafeInteger(offset)) {
            throw new Error(
                "Pagination offset is too large."
            );
        }

        if (
            input.from !== undefined &&
            !Number.isFinite(input.from.getTime())
        ) {
            throw new Error(
                "from must be a valid date."
            );
        }

        if (
            input.to !== undefined &&
            !Number.isFinite(input.to.getTime())
        ) {
            throw new Error(
                "to must be a valid date."
            );
        }

        if (
            input.from &&
            input.to &&
            input.from.getTime() > input.to.getTime()
        ) {
            throw new Error(
                "from cannot be later than to."
            );
        }

        const filters: string[] = [
            "tenant_id = @tenantId",
            "site_id = @siteId"
        ];

        const parameters: SqlParameter[] = [
            {
                name: "tenantId",
                value: input.tenantId
            },
            {
                name: "siteId",
                value: input.siteId
            }
        ];

        if (input.deviceId) {
            filters.push(
                "device_id = @deviceId"
            );
            parameters.push({
                name: "deviceId",
                value: input.deviceId
            });
        }

        if (input.measurementDefinitionId) {
            filters.push(
                "measurement_definition_id = @measurementDefinitionId"
            );
            parameters.push({
                name: "measurementDefinitionId",
                value: input.measurementDefinitionId
            });
        }

        if (input.from) {
            filters.push(
                "observed_at >= @from"
            );
            parameters.push({
                name: "from",
                value: input.from
            });
        }

        if (input.to) {
            filters.push(
                "observed_at <= @to"
            );
            parameters.push({
                name: "to",
                value: input.to
            });
        }

        parameters.push(
            {
                name: "offset",
                value: offset
            },
            {
                name: "fetchCount",
                value: pageSize + 1
            }
        );

        const result =
            await this.database.query<TelemetryHistoryRow>(
                `SELECT
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
                 WHERE ${filters.join(" AND ")}
                 ORDER BY
                    observed_at DESC,
                    id DESC
                 OFFSET @offset ROWS
                 FETCH NEXT @fetchCount ROWS ONLY`,
                parameters
            );

        const hasMore =
            result.rows.length > pageSize;

        const items = result.rows
            .slice(0, pageSize)
            .map(mapHistoryRow);

        return {
            items,
            page,
            pageSize,
            hasMore
        };
    }
}

function mapHistoryRow(
    row: TelemetryHistoryRow
): TelemetryReading {
    return {
        id: normalizeUuid(row.id),
        tenantId: normalizeUuid(row.tenantId),
        siteId: normalizeUuid(row.siteId),
        deviceId: normalizeUuid(row.deviceId),
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

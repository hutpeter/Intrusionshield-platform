import {
    normalizeUuid,
    type IDatabaseProvider
} from "@intrusionshield/database";

import {
    createMeasurementDefinition,
    type MeasurementDataType,
    type MeasurementDefinition
} from "@intrusionshield/telemetry";

export interface CreateMeasurementDefinitionRepositoryInput {
    readonly tenantId: string;
    readonly code: string;
    readonly name: string;
    readonly description?: string;
    readonly unit?: string;
    readonly dataType: MeasurementDataType;
    readonly minimumValue?: number;
    readonly maximumValue?: number;
}

export class SqlMeasurementDefinitionRepository {
    public constructor(
        private readonly database: IDatabaseProvider
    ) {}

    public async create(
        input: CreateMeasurementDefinitionRepositoryInput
    ): Promise<MeasurementDefinition> {
        const definition =
            createMeasurementDefinition({
                tenantId: input.tenantId,
                code: input.code,
                name: input.name,
                description: input.description,
                unit: input.unit,
                dataType: input.dataType,
                minimumValue: input.minimumValue,
                maximumValue: input.maximumValue
            });

        await this.database.execute(
            `INSERT INTO Telemetry.MeasurementDefinitions
             (
                 id,
                 tenant_id,
                 code,
                 name,
                 description,
                 unit,
                 data_type,
                 minimum_value,
                 maximum_value,
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
                 @unit,
                 @dataType,
                 @minimumValue,
                 @maximumValue,
                 @createdAt,
                 @updatedAt,
                 @version
             )`,
            [
                { name: "id", value: definition.id },
                {
                    name: "tenantId",
                    value: definition.tenantId
                },
                { name: "code", value: definition.code },
                { name: "name", value: definition.name },
                {
                    name: "description",
                    value: definition.description ?? null
                },
                {
                    name: "unit",
                    value: definition.unit ?? null
                },
                {
                    name: "dataType",
                    value: definition.dataType
                },
                {
                    name: "minimumValue",
                    value: definition.minimumValue ?? null
                },
                {
                    name: "maximumValue",
                    value: definition.maximumValue ?? null
                },
                {
                    name: "createdAt",
                    value: definition.createdAt
                },
                {
                    name: "updatedAt",
                    value: definition.updatedAt
                },
                {
                    name: "version",
                    value: definition.version
                }
            ]
        );

        return definition;
    }

    public async findById(
        id: string,
        tenantId: string
    ): Promise<MeasurementDefinition | null> {
        const result =
            await this.database.query<MeasurementDefinitionRow>(
                `SELECT
                     id,
                     tenant_id AS tenantId,
                     code,
                     name,
                     description,
                     unit,
                     data_type AS dataType,
                     minimum_value AS minimumValue,
                     maximum_value AS maximumValue,
                     created_at AS createdAt,
                     updated_at AS updatedAt,
                     version
                 FROM Telemetry.MeasurementDefinitions
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
            ? mapMeasurementDefinition(row)
            : null;
    }

    public async findAll(
        tenantId: string
    ): Promise<readonly MeasurementDefinition[]> {
        const result =
            await this.database.query<MeasurementDefinitionRow>(
                `SELECT
                     id,
                     tenant_id AS tenantId,
                     code,
                     name,
                     description,
                     unit,
                     data_type AS dataType,
                     minimum_value AS minimumValue,
                     maximum_value AS maximumValue,
                     created_at AS createdAt,
                     updated_at AS updatedAt,
                     version
                 FROM Telemetry.MeasurementDefinitions
                 WHERE tenant_id = @tenantId
                 ORDER BY code, name`,
                [
                    {
                        name: "tenantId",
                        value: tenantId
                    }
                ]
            );

        return result.rows.map(
            mapMeasurementDefinition
        );
    }
}

interface MeasurementDefinitionRow {
    readonly id: string;
    readonly tenantId: string;
    readonly code: string;
    readonly name: string;
    readonly description: string | null;
    readonly unit: string | null;
    readonly dataType: MeasurementDataType;
    readonly minimumValue: number | null;
    readonly maximumValue: number | null;
    readonly createdAt: Date;
    readonly updatedAt: Date;
    readonly version: number;
}

function mapMeasurementDefinition(
    row: MeasurementDefinitionRow
): MeasurementDefinition {
    return {
        id: normalizeUuid(row.id),
        tenantId: normalizeUuid(row.tenantId),
        code: row.code,
        name: row.name,
        description: row.description ?? undefined,
        unit: row.unit ?? undefined,
        dataType: row.dataType,
        minimumValue:
            row.minimumValue ?? undefined,
        maximumValue:
            row.maximumValue ?? undefined,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        version: row.version
    };
}

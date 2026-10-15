import {
    normalizeUuid,
    type IDatabaseProvider
} from "@intrusionshield/database";

export type TelemetryStoragePolicyScope =
    | "TENANT"
    | "SITE"
    | "DEVICE"
    | "MEASUREMENT";

export interface TelemetryStoragePolicy {
    readonly id: string;
    readonly tenantId: string;
    readonly scopeType:
        TelemetryStoragePolicyScope;
    readonly siteId?: string;
    readonly deviceId?: string;
    readonly measurementDefinitionId?: string;
    readonly enabled: boolean;
    readonly storageIntervalSeconds: number;
    readonly createdBy: string;
    readonly updatedBy: string;
    readonly createdAt: Date;
    readonly updatedAt: Date;
    readonly version: number;
}

export interface CreateTelemetryStoragePolicyInput {
    readonly tenantId: string;
    readonly scopeType:
        TelemetryStoragePolicyScope;
    readonly siteId?: string;
    readonly deviceId?: string;
    readonly measurementDefinitionId?: string;
    readonly enabled: boolean;
    readonly storageIntervalSeconds: number;
    readonly createdBy: string;
}

export interface UpdateTelemetryStoragePolicyInput {
    readonly id: string;
    readonly tenantId: string;
    readonly version: number;
    readonly enabled: boolean;
    readonly storageIntervalSeconds: number;
    readonly updatedBy: string;
}

export interface DeleteTelemetryStoragePolicyInput {
    readonly id: string;
    readonly tenantId: string;
    readonly version: number;
}

export interface ResolveTelemetryStoragePolicyInput {
    readonly tenantId: string;
    readonly siteId: string;
    readonly deviceId: string;
    readonly measurementDefinitionId: string;
}

export interface EffectiveTelemetryStoragePolicy {
    readonly source:
        | TelemetryStoragePolicyScope
        | "PLATFORM_DEFAULT";
    readonly policyId?: string;
    readonly enabled: boolean;
    readonly storageIntervalSeconds: number;
}

export type TelemetryStoragePolicyUpdateResult =
    | {
        readonly outcome: "UPDATED";
        readonly policy:
            TelemetryStoragePolicy;
    }
    | {
        readonly outcome: "NOT_FOUND";
    }
    | {
        readonly outcome: "VERSION_CONFLICT";
    };

export type TelemetryStoragePolicyDeleteResult =
    | {
        readonly outcome: "DELETED";
    }
    | {
        readonly outcome: "NOT_FOUND";
    }
    | {
        readonly outcome: "VERSION_CONFLICT";
    };

const DEFAULT_STORAGE_INTERVAL_SECONDS = 60;

const policyColumns = `
    id,
    tenant_id AS tenantId,
    scope_type AS scopeType,
    site_id AS siteId,
    device_id AS deviceId,
    measurement_definition_id
        AS measurementDefinitionId,
    enabled,
    storage_interval_seconds
        AS storageIntervalSeconds,
    created_by AS createdBy,
    updated_by AS updatedBy,
    created_at AS createdAt,
    updated_at AS updatedAt,
    version
`;

export class SqlTelemetryStoragePolicyRepository {
    public constructor(
        private readonly database: IDatabaseProvider
    ) {}

    public async create(
        input: CreateTelemetryStoragePolicyInput
    ): Promise<TelemetryStoragePolicy> {
        validateStorageInterval(
            input.storageIntervalSeconds
        );

        validatePolicyScope(input);

        const id =
            crypto.randomUUID();

        const now =
            new Date();

        await this.database.execute(
            `INSERT INTO Telemetry.StoragePolicies
             (
                 id,
                 tenant_id,
                 scope_type,
                 site_id,
                 device_id,
                 measurement_definition_id,
                 enabled,
                 storage_interval_seconds,
                 created_by,
                 updated_by,
                 created_at,
                 updated_at,
                 version
             )
             VALUES
             (
                 @id,
                 @tenantId,
                 @scopeType,
                 @siteId,
                 @deviceId,
                 @measurementDefinitionId,
                 @enabled,
                 @storageIntervalSeconds,
                 @createdBy,
                 @updatedBy,
                 @createdAt,
                 @updatedAt,
                 1
             )`,
            [
                {
                    name: "id",
                    value: id
                },
                {
                    name: "tenantId",
                    value: input.tenantId
                },
                {
                    name: "scopeType",
                    value: input.scopeType
                },
                {
                    name: "siteId",
                    value:
                        input.siteId ?? null
                },
                {
                    name: "deviceId",
                    value:
                        input.deviceId ?? null
                },
                {
                    name: "measurementDefinitionId",
                    value:
                        input.measurementDefinitionId ??
                        null
                },
                {
                    name: "enabled",
                    value: input.enabled
                },
                {
                    name: "storageIntervalSeconds",
                    value:
                        input.storageIntervalSeconds
                },
                {
                    name: "createdBy",
                    value: input.createdBy
                },
                {
                    name: "updatedBy",
                    value: input.createdBy
                },
                {
                    name: "createdAt",
                    value: now
                },
                {
                    name: "updatedAt",
                    value: now
                }
            ]
        );

        const created =
            await this.getById(
                id,
                input.tenantId
            );

        if (!created) {
            throw new Error(
                "Telemetry storage policy was created but could not be retrieved."
            );
        }

        return created;
    }

    public async list(
        tenantId: string
    ): Promise<
        readonly TelemetryStoragePolicy[]
    > {
        const result =
            await this.database.query<
                TelemetryStoragePolicyRow
            >(
                `SELECT
                     ${policyColumns}
                 FROM Telemetry.StoragePolicies
                 WHERE tenant_id = @tenantId
                 ORDER BY
                     CASE scope_type
                         WHEN N'TENANT' THEN 1
                         WHEN N'SITE' THEN 2
                         WHEN N'DEVICE' THEN 3
                         WHEN N'MEASUREMENT' THEN 4
                         ELSE 100
                     END,
                     updated_at DESC`,
                [
                    {
                        name: "tenantId",
                        value: tenantId
                    }
                ]
            );

        return result.rows.map(
            mapTelemetryStoragePolicy
        );
    }

    public async getById(
        id: string,
        tenantId: string
    ): Promise<
        TelemetryStoragePolicy | undefined
    > {
        const result =
            await this.database.query<
                TelemetryStoragePolicyRow
            >(
                `SELECT
                     ${policyColumns}
                 FROM Telemetry.StoragePolicies
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
            ? mapTelemetryStoragePolicy(row)
            : undefined;
    }

    public async update(
        input: UpdateTelemetryStoragePolicyInput
    ): Promise<
        TelemetryStoragePolicyUpdateResult
    > {
        validateStorageInterval(
            input.storageIntervalSeconds
        );

        const existing =
            await this.getById(
                input.id,
                input.tenantId
            );

        if (!existing) {
            return {
                outcome: "NOT_FOUND"
            };
        }

        if (
            existing.version !==
            input.version
        ) {
            return {
                outcome: "VERSION_CONFLICT"
            };
        }

        const updatedAt =
            new Date();

        await this.database.execute(
            `UPDATE Telemetry.StoragePolicies
             SET enabled = @enabled,
                 storage_interval_seconds =
                     @storageIntervalSeconds,
                 updated_by = @updatedBy,
                 updated_at = @updatedAt,
                 version = version + 1
             WHERE id = @id
               AND tenant_id = @tenantId
               AND version = @version`,
            [
                {
                    name: "enabled",
                    value: input.enabled
                },
                {
                    name: "storageIntervalSeconds",
                    value:
                        input.storageIntervalSeconds
                },
                {
                    name: "updatedBy",
                    value: input.updatedBy
                },
                {
                    name: "updatedAt",
                    value: updatedAt
                },
                {
                    name: "id",
                    value: input.id
                },
                {
                    name: "tenantId",
                    value: input.tenantId
                },
                {
                    name: "version",
                    value: input.version
                }
            ]
        );

        const updated =
            await this.getById(
                input.id,
                input.tenantId
            );

        if (!updated) {
            return {
                outcome: "NOT_FOUND"
            };
        }

        if (
            updated.version !==
            input.version + 1
        ) {
            return {
                outcome: "VERSION_CONFLICT"
            };
        }

        return {
            outcome: "UPDATED",
            policy: updated
        };
    }

    public async delete(
        input: DeleteTelemetryStoragePolicyInput
    ): Promise<
        TelemetryStoragePolicyDeleteResult
    > {
        const existing =
            await this.getById(
                input.id,
                input.tenantId
            );

        if (!existing) {
            return {
                outcome: "NOT_FOUND"
            };
        }

        if (
            existing.version !==
            input.version
        ) {
            return {
                outcome: "VERSION_CONFLICT"
            };
        }

        await this.database.execute(
            `DELETE FROM Telemetry.StoragePolicies
             WHERE id = @id
               AND tenant_id = @tenantId
               AND version = @version`,
            [
                {
                    name: "id",
                    value: input.id
                },
                {
                    name: "tenantId",
                    value: input.tenantId
                },
                {
                    name: "version",
                    value: input.version
                }
            ]
        );

        const remaining =
            await this.getById(
                input.id,
                input.tenantId
            );

        if (remaining) {
            return {
                outcome: "VERSION_CONFLICT"
            };
        }

        return {
            outcome: "DELETED"
        };
    }

    public async resolve(
        input: ResolveTelemetryStoragePolicyInput
    ): Promise<EffectiveTelemetryStoragePolicy> {
        const result =
            await this.database.query<
                TelemetryStoragePolicyRow
            >(
                `SELECT TOP (1)
                     ${policyColumns}
                 FROM Telemetry.StoragePolicies
                 WHERE tenant_id = @tenantId
                   AND
                   (
                       (
                           scope_type = N'MEASUREMENT'
                           AND site_id = @siteId
                           AND device_id = @deviceId
                           AND measurement_definition_id =
                               @measurementDefinitionId
                       )
                       OR
                       (
                           scope_type = N'MEASUREMENT'
                           AND site_id = @siteId
                           AND device_id IS NULL
                           AND measurement_definition_id =
                               @measurementDefinitionId
                       )
                       OR
                       (
                           scope_type = N'MEASUREMENT'
                           AND site_id IS NULL
                           AND device_id IS NULL
                           AND measurement_definition_id =
                               @measurementDefinitionId
                       )
                       OR
                       (
                           scope_type = N'DEVICE'
                           AND site_id = @siteId
                           AND device_id = @deviceId
                           AND measurement_definition_id
                               IS NULL
                       )
                       OR
                       (
                           scope_type = N'SITE'
                           AND site_id = @siteId
                           AND device_id IS NULL
                           AND measurement_definition_id
                               IS NULL
                       )
                       OR
                       (
                           scope_type = N'TENANT'
                           AND site_id IS NULL
                           AND device_id IS NULL
                           AND measurement_definition_id
                               IS NULL
                       )
                   )
                 ORDER BY
                     CASE
                         WHEN scope_type = N'MEASUREMENT'
                              AND site_id = @siteId
                              AND device_id = @deviceId
                             THEN 1

                         WHEN scope_type = N'MEASUREMENT'
                              AND site_id = @siteId
                              AND device_id IS NULL
                             THEN 2

                         WHEN scope_type = N'MEASUREMENT'
                              AND site_id IS NULL
                              AND device_id IS NULL
                             THEN 3

                         WHEN scope_type = N'DEVICE'
                             THEN 4

                         WHEN scope_type = N'SITE'
                             THEN 5

                         WHEN scope_type = N'TENANT'
                             THEN 6

                         ELSE 100
                     END`,
                [
                    {
                        name: "tenantId",
                        value: input.tenantId
                    },
                    {
                        name: "siteId",
                        value: input.siteId
                    },
                    {
                        name: "deviceId",
                        value: input.deviceId
                    },
                    {
                        name: "measurementDefinitionId",
                        value:
                            input.measurementDefinitionId
                    }
                ]
            );

        const row =
            result.rows[0];

        if (!row) {
            return {
                source: "PLATFORM_DEFAULT",
                enabled: true,
                storageIntervalSeconds:
                    DEFAULT_STORAGE_INTERVAL_SECONDS
            };
        }

        const policy =
            mapTelemetryStoragePolicy(row);

        return {
            source: policy.scopeType,
            policyId: policy.id,
            enabled: policy.enabled,
            storageIntervalSeconds:
                policy.storageIntervalSeconds
        };
    }
}

interface TelemetryStoragePolicyRow {
    readonly id: string;
    readonly tenantId: string;
    readonly scopeType:
        TelemetryStoragePolicyScope;
    readonly siteId: string | null;
    readonly deviceId: string | null;
    readonly measurementDefinitionId:
        string | null;
    readonly enabled: boolean;
    readonly storageIntervalSeconds: number;
    readonly createdBy: string;
    readonly updatedBy: string;
    readonly createdAt: Date;
    readonly updatedAt: Date;
    readonly version: number;
}

function validateStorageInterval(
    storageIntervalSeconds: number
): void {
    if (
        !Number.isInteger(
            storageIntervalSeconds
        ) ||
        storageIntervalSeconds < 1 ||
        storageIntervalSeconds > 604800
    ) {
        throw new Error(
            "storageIntervalSeconds must be an integer between 1 and 604800."
        );
    }
}

function validatePolicyScope(
    input: CreateTelemetryStoragePolicyInput
): void {
    if (
        input.scopeType === "TENANT"
    ) {
        if (
            input.siteId ||
            input.deviceId ||
            input.measurementDefinitionId
        ) {
            throw new Error(
                "TENANT policy cannot specify siteId, deviceId, or measurementDefinitionId."
            );
        }

        return;
    }

    if (
        input.scopeType === "SITE"
    ) {
        if (
            !input.siteId ||
            input.deviceId ||
            input.measurementDefinitionId
        ) {
            throw new Error(
                "SITE policy requires siteId and cannot specify deviceId or measurementDefinitionId."
            );
        }

        return;
    }

    if (
        input.scopeType === "DEVICE"
    ) {
        if (
            !input.siteId ||
            !input.deviceId ||
            input.measurementDefinitionId
        ) {
            throw new Error(
                "DEVICE policy requires siteId and deviceId and cannot specify measurementDefinitionId."
            );
        }

        return;
    }

    if (
        input.scopeType === "MEASUREMENT"
    ) {
        if (
            !input.measurementDefinitionId
        ) {
            throw new Error(
                "MEASUREMENT policy requires measurementDefinitionId."
            );
        }

        if (
            input.deviceId &&
            !input.siteId
        ) {
            throw new Error(
                "MEASUREMENT policy cannot specify deviceId without siteId."
            );
        }

        return;
    }

    throw new Error(
        "Unsupported telemetry storage policy scope."
    );
}

function mapTelemetryStoragePolicy(
    row: TelemetryStoragePolicyRow
): TelemetryStoragePolicy {
    return {
        id:
            normalizeUuid(row.id),
        tenantId:
            normalizeUuid(row.tenantId),
        scopeType:
            row.scopeType,
        siteId:
            row.siteId
                ? normalizeUuid(row.siteId)
                : undefined,
        deviceId:
            row.deviceId
                ? normalizeUuid(row.deviceId)
                : undefined,
        measurementDefinitionId:
            row.measurementDefinitionId
                ? normalizeUuid(
                    row.measurementDefinitionId
                )
                : undefined,
        enabled:
            row.enabled,
        storageIntervalSeconds:
            row.storageIntervalSeconds,
        createdBy:
            row.createdBy,
        updatedBy:
            row.updatedBy,
        createdAt:
            row.createdAt,
        updatedAt:
            row.updatedAt,
        version:
            row.version
    };
}
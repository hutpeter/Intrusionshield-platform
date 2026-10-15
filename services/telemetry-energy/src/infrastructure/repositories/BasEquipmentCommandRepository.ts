import {
    normalizeUuid,
    type IDatabaseProvider
} from "@intrusionshield/database";

export type BasEquipmentCommandStatus =
    | "PENDING"
    | "ACCEPTED"
    | "EXECUTED"
    | "VERIFIED"
    | "FAILED";

export interface BasEquipmentCommand {
    readonly id: string;
    readonly tenantId: string;
    readonly siteId: string;
    readonly assetId?: string;
    readonly deviceId?: string;
    readonly commandType: string;
    readonly commandPayload: Record<string, unknown>;
    readonly status: BasEquipmentCommandStatus;
    readonly requestedBy?: string;
    readonly correlationId?: string;
    readonly requestedAt: Date;
    readonly acceptedAt?: Date;
    readonly executedAt?: Date;
    readonly verifiedAt?: Date;
    readonly failedAt?: Date;
    readonly failureCode?: string;
    readonly failureMessage?: string;
    readonly createdAt: Date;
    readonly updatedAt: Date;
    readonly version: number;
}

export interface CreateBasEquipmentCommandInput {
    readonly tenantId: string;
    readonly siteId: string;
    readonly assetId?: string;
    readonly deviceId?: string;
    readonly commandType: string;
    readonly commandPayload: Record<string, unknown>;
    readonly requestedBy?: string;
    readonly correlationId?: string;
}

export interface TransitionBasEquipmentCommandInput {
    readonly id: string;
    readonly tenantId: string;
    readonly version: number;
}

export interface FailBasEquipmentCommandInput
    extends TransitionBasEquipmentCommandInput {
    readonly failureCode?: string;
    readonly failureMessage?: string;
}

export type BasEquipmentCommandUpdateResult =
    | {
          readonly status: "UPDATED";
          readonly command: BasEquipmentCommand;
      }
    | {
          readonly status: "NOT_FOUND";
      }
    | {
          readonly status: "CONFLICT";
      }
    | {
          readonly status: "INVALID_STATE";
          readonly command: BasEquipmentCommand;
      };

export class SqlBasEquipmentCommandRepository {
    public constructor(
        private readonly database: IDatabaseProvider
    ) {}

    public async create(
        input: CreateBasEquipmentCommandInput
    ): Promise<BasEquipmentCommand> {
        const commandType =
            normalizeRequiredString(
                input.commandType,
                "commandType"
            );

        validatePayload(
            input.commandPayload
        );

        const id =
            crypto.randomUUID();

        const now =
            new Date();

        await this.database.execute(
            `INSERT INTO Energy.BasEquipmentCommands
             (
                 id,
                 tenant_id,
                 site_id,
                 asset_id,
                 device_id,
                 command_type,
                 command_payload,
                 status,
                 requested_by,
                 correlation_id,
                 requested_at,
                 created_at,
                 updated_at,
                 version
             )
             VALUES
             (
                 @id,
                 @tenantId,
                 @siteId,
                 @assetId,
                 @deviceId,
                 @commandType,
                 @commandPayload,
                 'PENDING',
                 @requestedBy,
                 @correlationId,
                 @requestedAt,
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
                    name: "siteId",
                    value: input.siteId
                },
                {
                    name: "assetId",
                    value:
                        input.assetId ??
                        null
                },
                {
                    name: "deviceId",
                    value:
                        input.deviceId ??
                        null
                },
                {
                    name: "commandType",
                    value: commandType
                },
                {
                    name: "commandPayload",
                    value:
                        JSON.stringify(
                            input.commandPayload
                        )
                },
                {
                    name: "requestedBy",
                    value:
                        normalizeOptionalString(
                            input.requestedBy
                        ) ??
                        null
                },
                {
                    name: "correlationId",
                    value:
                        input.correlationId ??
                        null
                },
                {
                    name: "requestedAt",
                    value: now
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
            await this.findById(
                id,
                input.tenantId
            );

        if (!created) {
            throw new Error(
                "BAS equipment command was created but could not be reloaded."
            );
        }

        return created;
    }

    public async findById(
        id: string,
        tenantId: string
    ): Promise<BasEquipmentCommand | null> {
        const result =
            await this.database.query<BasEquipmentCommandRow>(
                `${selectCommand}
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
            ? mapCommand(row)
            : null;
    }

    public async findPendingBySite(
        siteId: string,
        tenantId: string,
        limit = 100
    ): Promise<readonly BasEquipmentCommand[]> {
        const safeLimit =
            normalizeLimit(limit);

        const result =
            await this.database.query<BasEquipmentCommandRow>(
                `${selectTopCommand(safeLimit)}
                 WHERE tenant_id = @tenantId
                   AND site_id = @siteId
                   AND status = 'PENDING'
                 ORDER BY requested_at ASC,
                          created_at ASC`,
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
            mapCommand
        );
    }

    public async findBySite(
        siteId: string,
        tenantId: string,
        limit = 100
    ): Promise<readonly BasEquipmentCommand[]> {
        const safeLimit =
            normalizeLimit(limit);

        const result =
            await this.database.query<BasEquipmentCommandRow>(
                `${selectTopCommand(safeLimit)}
                 WHERE tenant_id = @tenantId
                   AND site_id = @siteId
                 ORDER BY requested_at DESC,
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
            mapCommand
        );
    }

    public async accept(
        input: TransitionBasEquipmentCommandInput
    ): Promise<BasEquipmentCommandUpdateResult> {
        return this.transition(
            input,
            "PENDING",
            "ACCEPTED"
        );
    }

    public async execute(
        input: TransitionBasEquipmentCommandInput
    ): Promise<BasEquipmentCommandUpdateResult> {
        return this.transition(
            input,
            "ACCEPTED",
            "EXECUTED"
        );
    }

    public async verify(
        input: TransitionBasEquipmentCommandInput
    ): Promise<BasEquipmentCommandUpdateResult> {
        return this.transition(
            input,
            "EXECUTED",
            "VERIFIED"
        );
    }

    public async fail(
        input: FailBasEquipmentCommandInput
    ): Promise<BasEquipmentCommandUpdateResult> {
        const existing =
            await this.findById(
                input.id,
                input.tenantId
            );

        if (!existing) {
            return {
                status: "NOT_FOUND"
            };
        }

        if (
            existing.status !== "PENDING" &&
            existing.status !== "ACCEPTED"
        ) {
            return {
                status: "INVALID_STATE",
                command: existing
            };
        }

        if (
            existing.version !==
            input.version
        ) {
            return {
                status: "CONFLICT"
            };
        }

        const now =
            new Date();

        const result =
            await this.database.execute(
                `UPDATE Energy.BasEquipmentCommands
                 SET status = 'FAILED',
                     failed_at = @failedAt,
                     failure_code = @failureCode,
                     failure_message = @failureMessage,
                     updated_at = @updatedAt,
                     version = version + 1
                 WHERE id = @id
                   AND tenant_id = @tenantId
                   AND version = @version
                   AND status IN (
                       'PENDING',
                       'ACCEPTED'
                   )`,
                [
                    {
                        name: "failedAt",
                        value: now
                    },
                    {
                        name: "failureCode",
                        value:
                            normalizeOptionalString(
                                input.failureCode
                            ) ??
                            null
                    },
                    {
                        name: "failureMessage",
                        value:
                            normalizeOptionalString(
                                input.failureMessage
                            ) ??
                            null
                    },
                    {
                        name: "updatedAt",
                        value: now
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

        if (
            getRowsAffected(result) === 0
        ) {
            return this.classifyUpdateFailure(
                input.id,
                input.tenantId,
                input.version,
                [
                    "PENDING",
                    "ACCEPTED"
                ]
            );
        }

        return this.loadUpdated(
            input.id,
            input.tenantId
        );
    }

    private async transition(
        input: TransitionBasEquipmentCommandInput,
        expectedStatus:
            | "PENDING"
            | "ACCEPTED"
            | "EXECUTED",
        nextStatus:
            | "ACCEPTED"
            | "EXECUTED"
            | "VERIFIED"
    ): Promise<BasEquipmentCommandUpdateResult> {
        const existing =
            await this.findById(
                input.id,
                input.tenantId
            );

        if (!existing) {
            return {
                status: "NOT_FOUND"
            };
        }

        if (
            existing.status !==
            expectedStatus
        ) {
            return {
                status: "INVALID_STATE",
                command: existing
            };
        }

        if (
            existing.version !==
            input.version
        ) {
            return {
                status: "CONFLICT"
            };
        }

        const now =
            new Date();

        let timestampColumn:
            | "accepted_at"
            | "executed_at"
            | "verified_at";

        let timestampParameter:
            | "acceptedAt"
            | "executedAt"
            | "verifiedAt";

        if (nextStatus === "ACCEPTED") {
            timestampColumn =
                "accepted_at";

            timestampParameter =
                "acceptedAt";
        } else if (
            nextStatus === "EXECUTED"
        ) {
            timestampColumn =
                "executed_at";

            timestampParameter =
                "executedAt";
        } else {
            timestampColumn =
                "verified_at";

            timestampParameter =
                "verifiedAt";
        }

        const result =
            await this.database.execute(
                `UPDATE Energy.BasEquipmentCommands
                 SET status = '${nextStatus}',
                     ${timestampColumn} = @${timestampParameter},
                     updated_at = @updatedAt,
                     version = version + 1
                 WHERE id = @id
                   AND tenant_id = @tenantId
                   AND version = @version
                   AND status = @expectedStatus`,
                [
                    {
                        name: timestampParameter,
                        value: now
                    },
                    {
                        name: "updatedAt",
                        value: now
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
                    },
                    {
                        name: "expectedStatus",
                        value: expectedStatus
                    }
                ]
            );

        if (
            getRowsAffected(result) === 0
        ) {
            return this.classifyUpdateFailure(
                input.id,
                input.tenantId,
                input.version,
                [
                    expectedStatus
                ]
            );
        }

        return this.loadUpdated(
            input.id,
            input.tenantId
        );
    }

    private async classifyUpdateFailure(
        id: string,
        tenantId: string,
        version: number,
        validStatuses:
            readonly BasEquipmentCommandStatus[]
    ): Promise<BasEquipmentCommandUpdateResult> {
        const command =
            await this.findById(
                id,
                tenantId
            );

        if (!command) {
            return {
                status: "NOT_FOUND"
            };
        }

        if (
            !validStatuses.includes(
                command.status
            )
        ) {
            return {
                status: "INVALID_STATE",
                command
            };
        }

        if (
            command.version !== version
        ) {
            return {
                status: "CONFLICT"
            };
        }

        return {
            status: "CONFLICT"
        };
    }

    private async loadUpdated(
        id: string,
        tenantId: string
    ): Promise<BasEquipmentCommandUpdateResult> {
        const command =
            await this.findById(
                id,
                tenantId
            );

        if (!command) {
            return {
                status: "NOT_FOUND"
            };
        }

        return {
            status: "UPDATED",
            command
        };
    }
}

interface BasEquipmentCommandRow {
    readonly id: string;
    readonly tenantId: string;
    readonly siteId: string;
    readonly assetId: string | null;
    readonly deviceId: string | null;
    readonly commandType: string;
    readonly commandPayload: string;
    readonly status: BasEquipmentCommandStatus;
    readonly requestedBy: string | null;
    readonly correlationId: string | null;
    readonly requestedAt: Date;
    readonly acceptedAt: Date | null;
    readonly executedAt: Date | null;
    readonly verifiedAt: Date | null;
    readonly failedAt: Date | null;
    readonly failureCode: string | null;
    readonly failureMessage: string | null;
    readonly createdAt: Date;
    readonly updatedAt: Date;
    readonly version: number;
}

const commandColumns =
    `id,
     tenant_id AS tenantId,
     site_id AS siteId,
     asset_id AS assetId,
     device_id AS deviceId,
     command_type AS commandType,
     command_payload AS commandPayload,
     status,
     requested_by AS requestedBy,
     correlation_id AS correlationId,
     requested_at AS requestedAt,
     accepted_at AS acceptedAt,
     executed_at AS executedAt,
     verified_at AS verifiedAt,
     failed_at AS failedAt,
     failure_code AS failureCode,
     failure_message AS failureMessage,
     created_at AS createdAt,
     updated_at AS updatedAt,
     version`;

const selectCommand =
    `SELECT
         ${commandColumns}
     FROM Energy.BasEquipmentCommands`;

function selectTopCommand(
    limit: number
): string {
    return `SELECT TOP (${limit})
                ${commandColumns}
            FROM Energy.BasEquipmentCommands`;
}

function mapCommand(
    row: BasEquipmentCommandRow
): BasEquipmentCommand {
    return {
        id:
            normalizeUuid(row.id),
        tenantId:
            normalizeUuid(row.tenantId),
        siteId:
            normalizeUuid(row.siteId),
        assetId:
            row.assetId
                ? normalizeUuid(
                    row.assetId
                )
                : undefined,
        deviceId:
            row.deviceId
                ? normalizeUuid(
                    row.deviceId
                )
                : undefined,
        commandType:
            row.commandType,
        commandPayload:
            parsePayload(
                row.commandPayload
            ),
        status:
            row.status,
        requestedBy:
            row.requestedBy ??
            undefined,
        correlationId:
            row.correlationId
                ? normalizeUuid(
                    row.correlationId
                )
                : undefined,
        requestedAt:
            row.requestedAt,
        acceptedAt:
            row.acceptedAt ??
            undefined,
        executedAt:
            row.executedAt ??
            undefined,
        verifiedAt:
            row.verifiedAt ??
            undefined,
        failedAt:
            row.failedAt ??
            undefined,
        failureCode:
            row.failureCode ??
            undefined,
        failureMessage:
            row.failureMessage ??
            undefined,
        createdAt:
            row.createdAt,
        updatedAt:
            row.updatedAt,
        version:
            Number(row.version)
    };
}

function parsePayload(
    value: string
): Record<string, unknown> {
    const parsed: unknown =
        JSON.parse(value);

    if (
        typeof parsed !== "object" ||
        parsed === null ||
        Array.isArray(parsed)
    ) {
        throw new Error(
            "Stored BAS command payload must be a JSON object."
        );
    }

    return parsed as Record<string, unknown>;
}

function validatePayload(
    value: Record<string, unknown>
): void {
    if (
        typeof value !== "object" ||
        value === null ||
        Array.isArray(value)
    ) {
        throw new Error(
            "commandPayload must be a JSON object."
        );
    }
}

function normalizeRequiredString(
    value: string,
    property: string
): string {
    const normalized =
        value.trim();

    if (!normalized) {
        throw new Error(
            `${property} is required.`
        );
    }

    return normalized;
}

function normalizeOptionalString(
    value: string | undefined
): string | undefined {
    if (value === undefined) {
        return undefined;
    }

    const normalized =
        value.trim();

    return normalized ||
        undefined;
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

function getRowsAffected(
    result: unknown
): number | undefined {
    if (
        typeof result !== "object" ||
        result === null
    ) {
        return undefined;
    }

    const candidate =
        result as {
            rowsAffected?: unknown;
        };

    if (
        typeof candidate.rowsAffected ===
        "number"
    ) {
        return candidate.rowsAffected;
    }

    if (
        Array.isArray(
            candidate.rowsAffected
        )
    ) {
        return candidate.rowsAffected.reduce(
            (total, value) =>
                total +
                (
                    typeof value === "number"
                        ? value
                        : 0
                ),
            0
        );
    }

    return undefined;
}
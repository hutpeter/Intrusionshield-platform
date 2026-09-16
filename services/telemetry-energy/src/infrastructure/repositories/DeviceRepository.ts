import {
    normalizeUuid,
    type IDatabaseProvider
} from "@intrusionshield/database";

import {
    createDevice,
    type Device,
    type DeviceStatus
} from "@intrusionshield/telemetry";

export interface CreateDeviceRepositoryInput {
    readonly tenantId: string;
    readonly siteId: string;
    readonly assetId?: string;
    readonly code: string;
    readonly name: string;
    readonly deviceType: string;
    readonly manufacturer?: string;
    readonly model?: string;
    readonly serialNumber?: string;
    readonly protocol?: string;
    readonly externalDeviceId?: string;
    readonly status?: DeviceStatus;
}

export interface UpdateDeviceRepositoryInput {
    readonly id: string;
    readonly tenantId: string;
    readonly siteId: string;
    readonly assetId?: string;
    readonly code: string;
    readonly name: string;
    readonly deviceType: string;
    readonly manufacturer?: string;
    readonly model?: string;
    readonly serialNumber?: string;
    readonly protocol?: string;
    readonly externalDeviceId?: string;
    readonly status: DeviceStatus;
    readonly lastSeenAt?: Date;
    readonly version: number;
}

export type UpdateDeviceResult =
    | {
          readonly status: "UPDATED";
          readonly device: Device;
      }
    | {
          readonly status: "NOT_FOUND";
      }
    | {
          readonly status: "CONFLICT";
      };

export class SqlDeviceRepository {
    public constructor(
        private readonly database: IDatabaseProvider
    ) {}

    public async create(
        input: CreateDeviceRepositoryInput
    ): Promise<Device> {
        const device = createDevice({
            tenantId: input.tenantId,
            siteId: input.siteId,
            assetId: input.assetId,
            code: input.code,
            name: input.name,
            deviceType: input.deviceType,
            manufacturer: input.manufacturer,
            model: input.model,
            serialNumber: input.serialNumber,
            protocol: input.protocol,
            externalDeviceId:
                input.externalDeviceId,
            status: input.status ?? "ONLINE"
        });

        await this.database.execute(
            `INSERT INTO Telemetry.Devices
             (
                 id,
                 tenant_id,
                 site_id,
                 asset_id,
                 code,
                 name,
                 device_type,
                 manufacturer,
                 model,
                 serial_number,
                 protocol,
                 external_identifier,
                 status,
                 last_seen_at,
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
                 @code,
                 @name,
                 @deviceType,
                 @manufacturer,
                 @model,
                 @serialNumber,
                 @protocol,
                 @externalDeviceId,
                 @status,
                 @lastSeenAt,
                 @createdAt,
                 @updatedAt,
                 @version
             )`,
            [
                {
                    name: "id",
                    value: device.id
                },
                {
                    name: "tenantId",
                    value: device.tenantId
                },
                {
                    name: "siteId",
                    value: device.siteId
                },
                {
                    name: "assetId",
                    value:
                        device.assetId ?? null
                },
                {
                    name: "code",
                    value: device.code
                },
                {
                    name: "name",
                    value: device.name
                },
                {
                    name: "deviceType",
                    value: device.deviceType
                },
                {
                    name: "manufacturer",
                    value:
                        device.manufacturer ??
                        null
                },
                {
                    name: "model",
                    value:
                        device.model ?? null
                },
                {
                    name: "serialNumber",
                    value:
                        device.serialNumber ??
                        null
                },
                {
                    name: "protocol",
                    value:
                        device.protocol ?? null
                },
                {
                    name: "externalDeviceId",
                    value:
                        device.externalDeviceId ??
                        null
                },
                {
                    name: "status",
                    value: device.status
                },
                {
                    name: "lastSeenAt",
                    value:
                        device.lastSeenAt ?? null
                },
                {
                    name: "createdAt",
                    value: device.createdAt
                },
                {
                    name: "updatedAt",
                    value: device.updatedAt
                },
                {
                    name: "version",
                    value: device.version
                }
            ]
        );

        return device;
    }

    public async findById(
        id: string,
        tenantId: string
    ): Promise<Device | null> {
        const result =
            await this.database.query<DeviceRow>(
                `SELECT
                     id,
                     tenant_id AS tenantId,
                     site_id AS siteId,
                     asset_id AS assetId,
                     code,
                     name,
                     device_type AS deviceType,
                     manufacturer,
                     model,
                     serial_number AS serialNumber,
                     protocol,
                     external_identifier
                         AS externalDeviceId,
                     status,
                     last_seen_at AS lastSeenAt,
                     created_at AS createdAt,
                     updated_at AS updatedAt,
                     version
                 FROM Telemetry.Devices
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

        const row = result.rows[0];

        return row
            ? mapDevice(row)
            : null;
    }

    public async findBySite(
        siteId: string,
        tenantId: string
    ): Promise<readonly Device[]> {
        const result =
            await this.database.query<DeviceRow>(
                `SELECT
                     id,
                     tenant_id AS tenantId,
                     site_id AS siteId,
                     asset_id AS assetId,
                     code,
                     name,
                     device_type AS deviceType,
                     manufacturer,
                     model,
                     serial_number AS serialNumber,
                     protocol,
                     external_identifier
                         AS externalDeviceId,
                     status,
                     last_seen_at AS lastSeenAt,
                     created_at AS createdAt,
                     updated_at AS updatedAt,
                     version
                 FROM Telemetry.Devices
                 WHERE tenant_id = @tenantId
                   AND site_id = @siteId
                 ORDER BY name, code`,
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
            mapDevice
        );
    }

    public async update(
        input: UpdateDeviceRepositoryInput
    ): Promise<UpdateDeviceResult> {
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

        const updatedAt = new Date();
        const nextVersion =
            input.version + 1;

        const affectedRows =
            await this.database.execute(
                `UPDATE Telemetry.Devices
                 SET
                     site_id = @siteId,
                     asset_id = @assetId,
                     code = @code,
                     name = @name,
                     device_type = @deviceType,
                     manufacturer = @manufacturer,
                     model = @model,
                     serial_number = @serialNumber,
                     protocol = @protocol,
                     external_identifier =
                         @externalDeviceId,
                     status = @status,
                     last_seen_at = @lastSeenAt,
                     updated_at = @updatedAt,
                     version = @nextVersion
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
                        name: "siteId",
                        value: input.siteId
                    },
                    {
                        name: "assetId",
                        value:
                            input.assetId ?? null
                    },
                    {
                        name: "code",
                        value: input.code
                    },
                    {
                        name: "name",
                        value: input.name
                    },
                    {
                        name: "deviceType",
                        value:
                            input.deviceType
                    },
                    {
                        name: "manufacturer",
                        value:
                            input.manufacturer ??
                            null
                    },
                    {
                        name: "model",
                        value:
                            input.model ?? null
                    },
                    {
                        name: "serialNumber",
                        value:
                            input.serialNumber ??
                            null
                    },
                    {
                        name: "protocol",
                        value:
                            input.protocol ?? null
                    },
                    {
                        name: "externalDeviceId",
                        value:
                            input.externalDeviceId ??
                            null
                    },
                    {
                        name: "status",
                        value: input.status
                    },
                    {
                        name: "lastSeenAt",
                        value:
                            input.lastSeenAt ??
                            null
                    },
                    {
                        name: "updatedAt",
                        value: updatedAt
                    },
                    {
                        name: "nextVersion",
                        value: nextVersion
                    },
                    {
                        name: "version",
                        value: input.version
                    }
                ]
            );

        if (affectedRows === 0) {
            const stillExists =
                await this.findById(
                    input.id,
                    input.tenantId
                );

            return {
                status: stillExists
                    ? "CONFLICT"
                    : "NOT_FOUND"
            };
        }

        const updated =
            await this.findById(
                input.id,
                input.tenantId
            );

        if (!updated) {
            return {
                status: "NOT_FOUND"
            };
        }

        return {
            status: "UPDATED",
            device: updated
        };
    }
}

interface DeviceRow {
    readonly id: string;
    readonly tenantId: string;
    readonly siteId: string;
    readonly assetId: string | null;
    readonly code: string;
    readonly name: string;
    readonly deviceType: string;
    readonly manufacturer: string | null;
    readonly model: string | null;
    readonly serialNumber: string | null;
    readonly protocol: string | null;
    readonly externalDeviceId:
        string | null;
    readonly status: DeviceStatus;
    readonly lastSeenAt: Date | null;
    readonly createdAt: Date;
    readonly updatedAt: Date;
    readonly version: number;
}

function mapDevice(
    row: DeviceRow
): Device {
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
        code: row.code,
        name: row.name,
        deviceType: row.deviceType,
        manufacturer:
            row.manufacturer ??
            undefined,
        model:
            row.model ??
            undefined,
        serialNumber:
            row.serialNumber ??
            undefined,
        protocol:
            row.protocol ??
            undefined,
        externalDeviceId:
            row.externalDeviceId ??
            undefined,
        status: row.status,
        lastSeenAt:
            row.lastSeenAt ??
            undefined,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        version: row.version
    };
}
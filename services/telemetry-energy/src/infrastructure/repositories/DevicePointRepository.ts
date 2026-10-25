import { randomUUID } from "node:crypto";
import { normalizeUuid, type IDatabaseProvider } from "@intrusionshield/database";

export interface DevicePoint {
    readonly id: string;
    readonly tenantId: string;
    readonly siteId: string;
    readonly deviceId: string;
    readonly measurementDefinitionId: string;
    readonly code: string;
    readonly name: string;
    readonly description?: string;
    readonly enabled: boolean;
    readonly pollIntervalSeconds?: number;
    readonly protocolAddress?: string;
    readonly protocolConfiguration?: Readonly<Record<string, unknown>>;
    readonly createdAt: Date;
    readonly updatedAt: Date;
    readonly version: number;
}

export interface CreateDevicePointInput {
    readonly tenantId: string;
    readonly siteId: string;
    readonly deviceId: string;
    readonly measurementDefinitionId: string;
    readonly code: string;
    readonly name: string;
    readonly description?: string;
    readonly enabled?: boolean;
    readonly pollIntervalSeconds?: number;
    readonly protocolAddress?: string;
    readonly protocolConfiguration?: Readonly<Record<string, unknown>>;
}

export interface UpdateDevicePointInput extends CreateDevicePointInput {
    readonly id: string;
    readonly version: number;
}

export type UpdateDevicePointResult =
    | { readonly status: "UPDATED"; readonly point: DevicePoint }
    | { readonly status: "NOT_FOUND" | "CONFLICT" };

interface DevicePointRow {
    readonly id: string;
    readonly tenantId: string;
    readonly siteId: string;
    readonly deviceId: string;
    readonly measurementDefinitionId: string;
    readonly code: string;
    readonly name: string;
    readonly description: string | null;
    readonly enabled: boolean;
    readonly pollIntervalSeconds: number | null;
    readonly protocolAddress: string | null;
    readonly protocolConfiguration: string | null;
    readonly createdAt: Date;
    readonly updatedAt: Date;
    readonly version: number;
}

const columns = `id, tenant_id AS tenantId, site_id AS siteId,
    device_id AS deviceId, measurement_definition_id AS measurementDefinitionId,
    code, name, description, enabled,
    poll_interval_seconds AS pollIntervalSeconds,
    protocol_address AS protocolAddress,
    protocol_configuration AS protocolConfiguration,
    created_at AS createdAt, updated_at AS updatedAt, version`;

function validate(input: CreateDevicePointInput): void {
    for (const key of ["tenantId", "siteId", "deviceId", "measurementDefinitionId"] as const) {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input[key])) {
            throw new Error(`Invalid ${key}`);
        }
    }
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,99}$/.test(input.code)) {
        throw new Error("Invalid device point code");
    }
    if (!input.name.trim() || input.name.length > 200) {
        throw new Error("Invalid device point name");
    }
    if (input.description !== undefined && input.description.length > 1000) {
        throw new Error("Device point description exceeds 1000 characters");
    }
    if (input.protocolAddress !== undefined && input.protocolAddress.length > 250) {
        throw new Error("Protocol address exceeds 250 characters");
    }
    if (input.pollIntervalSeconds !== undefined &&
        (!Number.isInteger(input.pollIntervalSeconds) || input.pollIntervalSeconds < 1 || input.pollIntervalSeconds > 86400)) {
        throw new Error("Polling interval must be an integer between 1 and 86400 seconds");
    }
    if (input.protocolConfiguration !== undefined &&
        (input.protocolConfiguration === null || Array.isArray(input.protocolConfiguration) ||
         typeof input.protocolConfiguration !== "object")) {
        throw new Error("Protocol configuration must be a JSON object");
    }
}

function params(input: CreateDevicePointInput): { name: string; value: unknown }[] {
    return [
        { name: "tenantId", value: input.tenantId },
        { name: "siteId", value: input.siteId },
        { name: "deviceId", value: input.deviceId },
        { name: "measurementDefinitionId", value: input.measurementDefinitionId },
        { name: "code", value: input.code },
        { name: "name", value: input.name },
        { name: "description", value: input.description ?? null },
        { name: "enabled", value: input.enabled ?? true },
        { name: "pollIntervalSeconds", value: input.pollIntervalSeconds ?? null },
        { name: "protocolAddress", value: input.protocolAddress ?? null },
        { name: "protocolConfiguration", value: input.protocolConfiguration === undefined ? null : JSON.stringify(input.protocolConfiguration) }
    ];
}

function map(row: DevicePointRow): DevicePoint {
    return {
        id: normalizeUuid(row.id),
        tenantId: normalizeUuid(row.tenantId),
        siteId: normalizeUuid(row.siteId),
        deviceId: normalizeUuid(row.deviceId),
        measurementDefinitionId: normalizeUuid(row.measurementDefinitionId),
        code: row.code,
        name: row.name,
        description: row.description ?? undefined,
        enabled: Boolean(row.enabled),
        pollIntervalSeconds: row.pollIntervalSeconds ?? undefined,
        protocolAddress: row.protocolAddress ?? undefined,
        protocolConfiguration: row.protocolConfiguration ? JSON.parse(row.protocolConfiguration) as Record<string, unknown> : undefined,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        version: row.version
    };
}

export class SqlDevicePointRepository {
    public constructor(private readonly database: IDatabaseProvider) {}

    public async create(input: CreateDevicePointInput): Promise<DevicePoint> {
        validate(input);
        const id = randomUUID();
        const now = new Date();
        await this.database.execute(
            `INSERT INTO Telemetry.DevicePoints
             (id, tenant_id, site_id, device_id, measurement_definition_id,
              code, name, description, enabled, poll_interval_seconds,
              protocol_address, protocol_configuration, created_at, updated_at, version)
             VALUES (@id, @tenantId, @siteId, @deviceId, @measurementDefinitionId,
              @code, @name, @description, @enabled, @pollIntervalSeconds,
              @protocolAddress, @protocolConfiguration, @now, @now, 1)`,
            [...params(input), { name: "id", value: id }, { name: "now", value: now }]
        );
        const point = await this.findById(id, input.tenantId);
        if (!point) throw new Error("Created device point could not be read back");
        return point;
    }

    public async findById(id: string, tenantId: string): Promise<DevicePoint | null> {
        const result = await this.database.query<DevicePointRow>(
            `SELECT ${columns} FROM Telemetry.DevicePoints WHERE id = @id AND tenant_id = @tenantId`,
            [{ name: "id", value: id }, { name: "tenantId", value: tenantId }]
        );
        return result.rows[0] ? map(result.rows[0]) : null;
    }

    public async findByDevice(deviceId: string, tenantId: string): Promise<readonly DevicePoint[]> {
        const result = await this.database.query<DevicePointRow>(
            `SELECT ${columns} FROM Telemetry.DevicePoints
             WHERE tenant_id = @tenantId AND device_id = @deviceId ORDER BY code`,
            [{ name: "tenantId", value: tenantId }, { name: "deviceId", value: deviceId }]
        );
        return result.rows.map(map);
    }

    public async update(input: UpdateDevicePointInput): Promise<UpdateDevicePointResult> {
        validate(input);
        if (!Number.isInteger(input.version) || input.version < 1) {
            throw new Error("Invalid device point version");
        }
        const affected = await this.database.execute(
            `UPDATE Telemetry.DevicePoints SET
              site_id = @siteId, device_id = @deviceId,
              measurement_definition_id = @measurementDefinitionId,
              code = @code, name = @name, description = @description,
              enabled = @enabled, poll_interval_seconds = @pollIntervalSeconds,
              protocol_address = @protocolAddress,
              protocol_configuration = @protocolConfiguration,
              updated_at = @now, version = version + 1
             WHERE id = @id AND tenant_id = @tenantId AND version = @version`,
            [...params(input), { name: "id", value: input.id },
             { name: "version", value: input.version }, { name: "now", value: new Date() }]
        );
        if (affected === 0) {
            const existing = await this.findById(input.id, input.tenantId);
            return { status: existing ? "CONFLICT" : "NOT_FOUND" };
        }
        const point = await this.findById(input.id, input.tenantId);
        if (!point) return { status: "NOT_FOUND" };
        return { status: "UPDATED", point };
    }
}

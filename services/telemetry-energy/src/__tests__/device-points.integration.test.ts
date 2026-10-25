import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { getDatabaseConfiguration } from "@intrusionshield/config";
import { SqlServerProvider, type IDatabaseProvider } from "@intrusionshield/database";
import { SqlSiteRepository } from "../infrastructure/repositories/SiteRepository.js";
import { SqlDeviceRepository } from "../infrastructure/repositories/DeviceRepository.js";
import { SqlMeasurementDefinitionRepository } from "../infrastructure/repositories/MeasurementDefinitionRepository.js";
import {
    SqlDevicePointRepository,
    type CreateDevicePointInput
} from "../infrastructure/repositories/DevicePointRepository.js";

const enabled = process.env.TELEMETRY_ENERGY_INTEGRATION_TESTS === "true";
const describeIntegration = enabled ? describe : describe.skip;

describeIntegration("Device points SQL Server integration", () => {
    let database: IDatabaseProvider;
    let points: SqlDevicePointRepository;
    let transactionStarted = false;

    const tenantId = randomUUID();
    const otherTenantId = randomUUID();
    let input: CreateDevicePointInput;

    beforeAll(async () => {
        const config = getDatabaseConfiguration();
        if (!config.username || !config.password) {
            throw new Error("SQL Server integration tests require database credentials.");
        }
        if (config.database.toLowerCase() !== "intrusionshield") {
            throw new Error(`Refusing device-point integration tests on unexpected database: ${config.database}`);
        }

        database = new SqlServerProvider({
            server: config.server,
            port: config.port,
            database: config.database,
            user: config.username,
            password: config.password,
            encrypt: config.encrypt,
            trustServerCertificate: config.trustServerCertificate
        });
        await database.connect();
        await database.beginTransaction();
        transactionStarted = true;

        points = new SqlDevicePointRepository(database);
        const sites = new SqlSiteRepository(database);
        const devices = new SqlDeviceRepository(database);
        const definitions = new SqlMeasurementDefinitionRepository(database);

        const site = await sites.create({
            tenantId,
            code: `POINT-SITE-${randomUUID()}`,
            name: "Device point integration site",
            timezone: "UTC",
            status: "ACTIVE"
        });
        const device = await devices.create({
            tenantId,
            siteId: site.id,
            code: `POINT-DEVICE-${randomUUID()}`,
            name: "Device point integration device",
            deviceType: "SENSOR",
            protocol: "MODBUS_TCP"
        });
        const definition = await definitions.create({
            tenantId,
            code: `point.temperature.${randomUUID()}`,
            name: "Device point temperature",
            unit: "C",
            dataType: "NUMBER"
        });
        input = {
            tenantId,
            siteId: site.id,
            deviceId: device.id,
            measurementDefinitionId: definition.id,
            code: "TEMP_01",
            name: "Supply temperature",
            enabled: true,
            pollIntervalSeconds: 60,
            protocolAddress: "holding:40001",
            protocolConfiguration: { registerType: "holding", address: 0, dataType: "int16" }
        };
    }, 30000);

    afterAll(async () => {
        if (!database) return;
        try {
            if (transactionStarted) {
                await database.rollbackTransaction();
                transactionStarted = false;
            }
        } finally {
            await database.disconnect();
        }
    }, 30000);

    it("creates and reads a point with protocol configuration", async () => {
        const created = await points.create(input);
        expect(created.id).toBeTruthy();
        expect(created.tenantId).toBe(tenantId);
        expect(created.deviceId).toBe(input.deviceId);
        expect(created.version).toBe(1);
        expect(created.pollIntervalSeconds).toBe(60);
        expect(created.protocolConfiguration).toEqual(input.protocolConfiguration);

        const persisted = await points.findById(created.id, tenantId);
        expect(persisted?.code).toBe("TEMP_01");
        expect(persisted?.enabled).toBe(true);
    });

    it("filters by tenant and device", async () => {
        const visible = await points.findByDevice(input.deviceId, tenantId);
        expect(visible.some((point) => point.code === input.code)).toBe(true);
        expect(await points.findByDevice(input.deviceId, otherTenantId)).toEqual([]);
        expect(await points.findByDevice(randomUUID(), tenantId)).toEqual([]);
    });

    it("rejects duplicate codes on the same device", async () => {
        await expect(points.create(input)).rejects.toThrow();
    });

    it("rejects a cross-tenant device or measurement reference", async () => {
        await expect(points.create({
            ...input,
            tenantId: otherTenantId,
            code: "FOREIGN_TENANT"
        })).rejects.toThrow();
    });

    it("updates a point and rejects stale versions", async () => {
        const existing = (await points.findByDevice(input.deviceId, tenantId))
            .find((point) => point.code === input.code);
        if (!existing) throw new Error("Expected point was not found");

        const updateInput = {
            ...input,
            id: existing.id,
            version: existing.version,
            name: "Updated supply temperature",
            pollIntervalSeconds: 30
        };
        const result = await points.update(updateInput);
        expect(result.status).toBe("UPDATED");
        if (result.status !== "UPDATED") throw new Error("Update did not succeed");
        expect(result.point.version).toBe(existing.version + 1);
        expect(result.point.name).toBe("Updated supply temperature");
        expect(result.point.pollIntervalSeconds).toBe(30);

        const stale = await points.update(updateInput);
        expect(stale).toEqual({ status: "CONFLICT" });
    });

    it("does not expose or update a point through another tenant", async () => {
        const existing = (await points.findByDevice(input.deviceId, tenantId))[0];
        if (!existing) throw new Error("Expected point was not found");
        expect(await points.findById(existing.id, otherTenantId)).toBeNull();
        const result = await points.update({
            ...input,
            tenantId: otherTenantId,
            id: existing.id,
            version: existing.version
        });
        expect(result).toEqual({ status: "NOT_FOUND" });
    });
});

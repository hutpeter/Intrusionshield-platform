import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { getDatabaseConfiguration } from "@intrusionshield/config";
import { SqlServerProvider, type IDatabaseProvider } from "@intrusionshield/database";
import { SqlSiteRepository } from "../infrastructure/repositories/SiteRepository.js";
import { SqlDeviceRepository } from "../infrastructure/repositories/DeviceRepository.js";
import { SqlMeasurementDefinitionRepository } from "../infrastructure/repositories/MeasurementDefinitionRepository.js";
import { SqlTelemetryHistoryRepository } from "../infrastructure/repositories/TelemetryHistoryRepository.js";

const enabled = process.env.TELEMETRY_ENERGY_INTEGRATION_TESTS === "true";
const describeIntegration = enabled ? describe : describe.skip;

describeIntegration("Telemetry history SQL Server integration", () => {
    let database: IDatabaseProvider;
    let history: SqlTelemetryHistoryRepository;
    const tenantId = randomUUID();
    const otherTenantId = randomUUID();
    let siteId: string | undefined;
    let deviceId: string | undefined;
    let measurementDefinitionId: string | undefined;
    let transactionStarted = false;

    beforeAll(async () => {
        const config = getDatabaseConfiguration();
        if (!config.username || !config.password) {
            throw new Error("SQL Server integration tests require configured database credentials.");
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
        // Keep all test fixtures uncommitted; rollback removes them together.
        await database.beginTransaction();
        transactionStarted = true;
        history = new SqlTelemetryHistoryRepository(database);
        const sites = new SqlSiteRepository(database);
        const devices = new SqlDeviceRepository(database);
        const measurements = new SqlMeasurementDefinitionRepository(database);

        const site = await sites.create({
            tenantId, code: `HIST-${randomUUID()}`, name: "History integration test",
            timezone: "UTC", status: "ACTIVE"
        });
        siteId = site.id;
        const device = await devices.create({
            tenantId, siteId, code: `HIST-DEV-${randomUUID()}`,
            name: "History test device", deviceType: "SENSOR", protocol: "SIMULATOR"
        });
        deviceId = device.id;
        const definition = await measurements.create({
            tenantId, code: `hist.test.${randomUUID()}`,
            name: "History test temperature", unit: "C", dataType: "NUMBER"
        });
        measurementDefinitionId = definition.id;

        for (const [index, timestamp] of [
            "2026-10-20T10:00:00.000Z",
            "2026-10-20T11:00:00.000Z",
            "2026-10-20T12:00:00.000Z"
        ].entries()) {
            const id = randomUUID();
            await database.execute(
                `INSERT INTO Telemetry.Readings
                 (id, tenant_id, site_id, device_id, measurement_definition_id,
                  observed_at, received_at, numeric_value, boolean_value,
                  string_value, quality, source)
                 VALUES (@id, @tenantId, @siteId, @deviceId, @measurementDefinitionId,
                         @observedAt, @receivedAt, @numericValue, NULL, NULL, @quality, @source)`,
                [
                    { name: "id", value: id },
                    { name: "tenantId", value: tenantId },
                    { name: "siteId", value: siteId },
                    { name: "deviceId", value: deviceId },
                    { name: "measurementDefinitionId", value: measurementDefinitionId },
                    { name: "observedAt", value: new Date(timestamp) },
                    { name: "receivedAt", value: new Date(timestamp) },
                    { name: "numericValue", value: index + 20 },
                    { name: "quality", value: "GOOD" },
                    { name: "source", value: "integration.telemetry-history" }
                ]
            );
        }
    }, 30000);

    afterAll(async () => {
        if (!database) return;
        try {
            if (transactionStarted) {
                // Roll back test-only inserts instead of deleting devices one by one.
                // This also runs when a test assertion fails.
                await database.rollbackTransaction();
                transactionStarted = false;
            }
        } finally {
            // Disconnect even if rollback fails; provider also attempts rollback
            // of an active transaction when disconnecting.
            await database.disconnect();
        }
    }, 30000);

    it("retrieves seeded readings with stable pagination", async () => {
        const first = await history.queryHistory({
            tenantId, siteId: siteId!, page: 1, pageSize: 2
        });
        expect(first.items).toHaveLength(2);
        expect(first.hasMore).toBe(true);
        expect(first.items[0]?.numericValue).toBe(22);
        expect(first.items[1]?.numericValue).toBe(21);

        const second = await history.queryHistory({
            tenantId, siteId: siteId!, page: 2, pageSize: 2
        });
        expect(second.items).toHaveLength(1);
        expect(second.hasMore).toBe(false);
        expect(second.items[0]?.numericValue).toBe(20);
    });

    it("enforces tenant isolation against SQL Server", async () => {
        const result = await history.queryHistory({
            tenantId: otherTenantId, siteId: siteId!, page: 1, pageSize: 10
        });
        expect(result.items).toHaveLength(0);
    });

    it("filters observation dates, device and measurement", async () => {
        const result = await history.queryHistory({
            tenantId, siteId: siteId!, deviceId,
            measurementDefinitionId,
            from: new Date("2026-10-20T10:30:00.000Z"),
            to: new Date("2026-10-20T11:30:00.000Z"),
            page: 1, pageSize: 10
        });
        expect(result.items).toHaveLength(1);
        expect(result.items[0]?.numericValue).toBe(21);
        expect(result.items[0]?.deviceId).toBe(deviceId);
    });

    it("excludes another device identifier", async () => {
        const result = await history.queryHistory({
            tenantId, siteId: siteId!, deviceId: randomUUID(),
            page: 1, pageSize: 10
        });
        expect(result.items).toHaveLength(0);
    });
});

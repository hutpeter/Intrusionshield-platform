import { randomUUID } from "node:crypto";

import {
    afterAll,
    beforeAll,
    describe,
    expect,
    it
} from "@jest/globals";

import {
    getDatabaseConfiguration
} from "@intrusionshield/config";

import {
    SqlServerProvider,
    type IDatabaseProvider
} from "@intrusionshield/database";

import {
    SqlAssetRepository
} from "../infrastructure/repositories/AssetRepository.js";

import {
    SqlDeviceRepository
} from "../infrastructure/repositories/DeviceRepository.js";

import {
    SqlMeasurementDefinitionRepository
} from "../infrastructure/repositories/MeasurementDefinitionRepository.js";

import {
    SqlSiteRepository
} from "../infrastructure/repositories/SiteRepository.js";

import {
    SqlTelemetryRepository
} from "../infrastructure/repositories/TelemetryRepository.js";

const integrationEnabled =
    process.env.TELEMETRY_ENERGY_INTEGRATION_TESTS === "true";

const describeIntegration =
    integrationEnabled
        ? describe
        : describe.skip;

describeIntegration(
    "EIS Telemetry & Energy SQL Server integration",
    () => {
        let database: IDatabaseProvider;

        let sites: SqlSiteRepository;
        let assets: SqlAssetRepository;
        let devices: SqlDeviceRepository;
        let measurements:
            SqlMeasurementDefinitionRepository;
        let telemetry: SqlTelemetryRepository;

        const tenantA =
            randomUUID();

        const tenantB =
            randomUUID();

        let siteId: string;
        let parentAssetId: string;
        let childAssetId: string;
        let deviceId: string;
        let measurementDefinitionId: string;
        let readingId: string;

        beforeAll(
            async () => {
                const configuration =
                    getDatabaseConfiguration();

                if (!configuration.username) {
                    throw new Error(
                        "DB_USERNAME or DB_USER must be supplied for Telemetry & Energy integration tests."
                    );
                }

                if (!configuration.password) {
                    throw new Error(
                        "DB_PASSWORD must be supplied for Telemetry & Energy integration tests."
                    );
                }

                database =
                    new SqlServerProvider({
                        server:
                            configuration.server,
                        port:
                            configuration.port,
                        database:
                            configuration.database,
                        user:
                            configuration.username,
                        password:
                            configuration.password,
                        encrypt:
                            configuration.encrypt,
                        trustServerCertificate:
                            configuration
                                .trustServerCertificate
                    });

                await database.connect();

                sites =
                    new SqlSiteRepository(
                        database
                    );

                assets =
                    new SqlAssetRepository(
                        database
                    );

                devices =
                    new SqlDeviceRepository(
                        database
                    );

                measurements =
                    new SqlMeasurementDefinitionRepository(
                        database
                    );

                telemetry =
                    new SqlTelemetryRepository(
                        database
                    );
            }
        );

        afterAll(
            async () => {
                if (database?.isConnected()) {
                    await database.disconnect();
                }
            }
        );

        it(
            "creates and reads a tenant-isolated Site",
            async () => {
                const created =
                    await sites.create({
                        tenantId:
                            tenantA,
                        code:
                            `INT-SITE-${randomUUID()}`,
                        name:
                            "Integration Solar Site",
                        description:
                            "Telemetry integration test site",
                        timezone:
                            "America/Moncton",
                        latitude:
                            47.0289,
                        longitude:
                            -65.5019,
                        status:
                            "ACTIVE"
                    });

                siteId =
                    created.id;

                expect(created.tenantId)
                    .toBe(tenantA);

                expect(created.version)
                    .toBe(1);

                const persisted =
                    await sites.findById(
                        siteId,
                        tenantA
                    );

                expect(persisted)
                    .not.toBeNull();

                expect(persisted?.id)
                    .toBe(siteId);

                expect(persisted?.timezone)
                    .toBe(
                        "America/Moncton"
                    );

                expect(persisted?.latitude)
                    .toBeCloseTo(
                        47.0289,
                        4
                    );

                expect(persisted?.longitude)
                    .toBeCloseTo(
                        -65.5019,
                        4
                    );

                const inaccessible =
                    await sites.findById(
                        siteId,
                        tenantB
                    );

                expect(inaccessible)
                    .toBeNull();
            }
        );

        it(
            "creates parent and child Assets and preserves the hierarchy",
            async () => {
                const parent =
                    await assets.create({
                        tenantId:
                            tenantA,
                        siteId,
                        code:
                            `INT-PV-${randomUUID()}`,
                        name:
                            "Integration PV Array",
                        assetType:
                            "SOLAR_PV_ARRAY",
                        manufacturer:
                            "EIS Integration",
                        status:
                            "ACTIVE"
                    });

                parentAssetId =
                    parent.id;

                const child =
                    await assets.create({
                        tenantId:
                            tenantA,
                        siteId,
                        parentAssetId,
                        code:
                            `INT-INV-ASSET-${randomUUID()}`,
                        name:
                            "Integration Inverter Asset",
                        assetType:
                            "SOLAR_INVERTER",
                        manufacturer:
                            "EIS Integration",
                        status:
                            "ACTIVE"
                    });

                childAssetId =
                    child.id;

                expect(
                    child.parentAssetId
                ).toBe(
                    parentAssetId
                );

                const persisted =
                    await assets.findById(
                        childAssetId,
                        tenantA
                    );

                expect(persisted)
                    .not.toBeNull();

                expect(
                    persisted?.parentAssetId
                ).toBe(
                    parentAssetId
                );

                const siteAssets =
                    await assets.findBySite(
                        siteId,
                        tenantA
                    );

                expect(
                    siteAssets.some(
                        (asset) =>
                            asset.id ===
                            parentAssetId
                    )
                ).toBe(true);

                expect(
                    siteAssets.some(
                        (asset) =>
                            asset.id ===
                            childAssetId
                    )
                ).toBe(true);

                const inaccessible =
                    await assets.findById(
                        childAssetId,
                        tenantB
                    );

                expect(inaccessible)
                    .toBeNull();
            }
        );

        it(
            "creates a Device and persists its Asset assignment",
            async () => {
                const created =
                    await devices.create({
                        tenantId:
                            tenantA,
                        siteId,
                        code:
                            `INT-DEVICE-${randomUUID()}`,
                        name:
                            "Integration Solar Inverter",
                        deviceType:
                            "SOLAR_INVERTER",
                        protocol:
                            "SIMULATOR",
                        externalDeviceId:
                            `INT-EXT-${randomUUID()}`,
                        status:
                            "ONLINE"
                    });

                deviceId =
                    created.id;

                expect(created.assetId)
                    .toBeUndefined();

                expect(created.version)
                    .toBe(1);

                const update =
                    await devices.update({
                        id:
                            deviceId,
                        tenantId:
                            tenantA,
                        siteId,
                        assetId:
                            parentAssetId,
                        code:
                            created.code,
                        name:
                            created.name,
                        deviceType:
                            created.deviceType,
                        manufacturer:
                            created.manufacturer,
                        model:
                            created.model,
                        serialNumber:
                            created.serialNumber,
                        protocol:
                            created.protocol,
                        externalDeviceId:
                            created.externalDeviceId,
                        status:
                            created.status,
                        lastSeenAt:
                            created.lastSeenAt,
                        version:
                            created.version
                    });

                expect(update.status)
                    .toBe("UPDATED");

                if (
                    update.status !==
                    "UPDATED"
                ) {
                    throw new Error(
                        "Device update did not succeed."
                    );
                }

                expect(
                    update.device.assetId
                ).toBe(
                    parentAssetId
                );

                expect(
                    update.device.version
                ).toBe(2);

                const persisted =
                    await devices.findById(
                        deviceId,
                        tenantA
                    );

                expect(persisted)
                    .not.toBeNull();

                expect(
                    persisted?.assetId
                ).toBe(
                    parentAssetId
                );

                expect(
                    persisted?.version
                ).toBe(2);

                const inaccessible =
                    await devices.findById(
                        deviceId,
                        tenantB
                    );

                expect(inaccessible)
                    .toBeNull();
            }
        );

        it(
            "rejects a stale Device version",
            async () => {
                const current =
                    await devices.findById(
                        deviceId,
                        tenantA
                    );

                expect(current)
                    .not.toBeNull();

                if (!current) {
                    throw new Error(
                        "Integration device was not found."
                    );
                }

                const firstUpdate =
                    await devices.update({
                        id:
                            current.id,
                        tenantId:
                            current.tenantId,
                        siteId:
                            current.siteId,
                        assetId:
                            current.assetId,
                        code:
                            current.code,
                        name:
                            "Integration Solar Inverter Updated",
                        deviceType:
                            current.deviceType,
                        manufacturer:
                            current.manufacturer,
                        model:
                            current.model,
                        serialNumber:
                            current.serialNumber,
                        protocol:
                            current.protocol,
                        externalDeviceId:
                            current.externalDeviceId,
                        status:
                            current.status,
                        lastSeenAt:
                            current.lastSeenAt,
                        version:
                            current.version
                    });

                expect(firstUpdate.status)
                    .toBe("UPDATED");

                const staleUpdate =
                    await devices.update({
                        id:
                            current.id,
                        tenantId:
                            current.tenantId,
                        siteId:
                            current.siteId,
                        assetId:
                            current.assetId,
                        code:
                            current.code,
                        name:
                            "This update must fail",
                        deviceType:
                            current.deviceType,
                        manufacturer:
                            current.manufacturer,
                        model:
                            current.model,
                        serialNumber:
                            current.serialNumber,
                        protocol:
                            current.protocol,
                        externalDeviceId:
                            current.externalDeviceId,
                        status:
                            current.status,
                        lastSeenAt:
                            current.lastSeenAt,
                        version:
                            current.version
                    });

                expect(staleUpdate.status)
                    .toBe("CONFLICT");
            }
        );

        it(
            "does not allow another tenant to update the Device",
            async () => {
                const current =
                    await devices.findById(
                        deviceId,
                        tenantA
                    );

                expect(current)
                    .not.toBeNull();

                if (!current) {
                    throw new Error(
                        "Integration device was not found."
                    );
                }

                const result =
                    await devices.update({
                        id:
                            current.id,
                        tenantId:
                            tenantB,
                        siteId:
                            current.siteId,
                        assetId:
                            current.assetId,
                        code:
                            current.code,
                        name:
                            current.name,
                        deviceType:
                            current.deviceType,
                        manufacturer:
                            current.manufacturer,
                        model:
                            current.model,
                        serialNumber:
                            current.serialNumber,
                        protocol:
                            current.protocol,
                        externalDeviceId:
                            current.externalDeviceId,
                        status:
                            current.status,
                        lastSeenAt:
                            current.lastSeenAt,
                        version:
                            current.version
                    });

                expect(result.status)
                    .toBe("NOT_FOUND");
            }
        );

        it(
            "creates and reads a Measurement Definition",
            async () => {
                const created =
                    await measurements.create({
                        tenantId:
                            tenantA,
                        code:
                            `solar.pv.ac_power.${randomUUID()}`,
                        name:
                            "PV AC Power Integration",
                        description:
                            "Integration measurement",
                        unit:
                            "kW",
                        dataType:
                            "NUMBER",
                        minimumValue:
                            0,
                        maximumValue:
                            3.75
                    });

                measurementDefinitionId =
                    created.id;

                expect(created.version)
                    .toBe(1);

                const persisted =
                    await measurements.findById(
                        measurementDefinitionId,
                        tenantA
                    );

                expect(persisted)
                    .not.toBeNull();

                expect(persisted?.unit)
                    .toBe("kW");

                expect(persisted?.dataType)
                    .toBe("NUMBER");

                expect(
                    persisted?.minimumValue
                ).toBe(0);

                expect(
                    persisted?.maximumValue
                ).toBe(3.75);

                const inaccessible =
                    await measurements.findById(
                        measurementDefinitionId,
                        tenantB
                    );

                expect(inaccessible)
                    .toBeNull();
            }
        );

        it(
            "persists and reads a typed Telemetry Reading",
            async () => {
                const observedAt =
                    new Date(
                        "2026-09-15T12:34:56.123Z"
                    );

                const receivedAt =
                    new Date(
                        "2026-09-15T12:34:57.456Z"
                    );

                const created =
                    await telemetry.create({
                        tenantId:
                            tenantA,
                        siteId,
                        deviceId,
                        measurementDefinitionId,
                        observedAt,
                        numericValue:
                            2.85,
                        quality:
                            "GOOD",
                        source:
                            "integration.miramichi",
                        receivedAt
                    });

                readingId =
                    created.id;

                expect(created.numericValue)
                    .toBe(2.85);

                expect(created.booleanValue)
                    .toBeUndefined();

                expect(created.stringValue)
                    .toBeUndefined();

                expect(created.source)
                    .toBe(
                        "integration.miramichi"
                    );

                expect(
                    created.observedAt.toISOString()
                ).toBe(
                    observedAt.toISOString()
                );

                expect(
                    created.receivedAt.toISOString()
                ).toBe(
                    receivedAt.toISOString()
                );

                const persisted =
                    await telemetry.bySite(
                        siteId,
                        tenantA
                    );

                const reading =
                    persisted.find(
                        (item) =>
                            item.id === readingId
                    );

                expect(reading)
                    .toBeDefined();

                expect(
                    reading?.numericValue
                ).toBe(2.85);

                expect(
                    reading?.quality
                ).toBe("GOOD");

                expect(
                    reading?.source
                ).toBe(
                    "integration.miramichi"
                );

                expect(
                    reading?.observedAt
                        .toISOString()
                ).toBe(
                    observedAt.toISOString()
                );

                expect(
                    reading?.receivedAt
                        .toISOString()
                ).toBe(
                    receivedAt.toISOString()
                );
            }
        );

        it(
            "enforces tenant isolation for Telemetry Reading queries",
            async () => {
                const inaccessible =
                    await telemetry.bySite(
                        siteId,
                        tenantB
                    );

                expect(
                    inaccessible.some(
                        (reading) =>
                            reading.id ===
                            readingId
                    )
                ).toBe(false);
            }
        );
    }
);
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
    SqlEnergyFlowRepository
} from "../infrastructure/repositories/EnergyFlowRepository.js";

import {
    SqlSiteRepository
} from "../infrastructure/repositories/SiteRepository.js";

const integrationEnabled =
    process.env.TELEMETRY_ENERGY_INTEGRATION_TESTS === "true";

const describeIntegration =
    integrationEnabled
        ? describe
        : describe.skip;

describeIntegration(
    "EIS Energy Flow SQL Server integration",
    () => {
        let database: IDatabaseProvider;
        let sites: SqlSiteRepository;
        let assets: SqlAssetRepository;
        let flows: SqlEnergyFlowRepository;

        const tenantA = randomUUID();
        const tenantB = randomUUID();

        let siteId: string;
        let pvAssetId: string;
        let loadAssetId: string;
        let flowId: string;

        beforeAll(async () => {
            const configuration =
                getDatabaseConfiguration();

            if (!configuration.username) {
                throw new Error(
                    "DB_USERNAME or DB_USER must be supplied for Energy Flow integration tests."
                );
            }

            if (!configuration.password) {
                throw new Error(
                    "DB_PASSWORD must be supplied for Energy Flow integration tests."
                );
            }

            database =
                new SqlServerProvider({
                    server: configuration.server,
                    port: configuration.port,
                    database: configuration.database,
                    user: configuration.username,
                    password: configuration.password,
                    encrypt: configuration.encrypt,
                    trustServerCertificate:
                        configuration.trustServerCertificate
                });

            await database.connect();

            sites =
                new SqlSiteRepository(database);

            assets =
                new SqlAssetRepository(database);

            flows =
                new SqlEnergyFlowRepository(database);

            const site =
                await sites.create({
                    tenantId: tenantA,
                    code:
                        `ENERGY-SITE-${randomUUID()}`,
                    name:
                        "Energy Flow Integration Site",
                    timezone:
                        "America/Moncton",
                    status:
                        "ACTIVE"
                });

            siteId = site.id;

            const pvAsset =
                await assets.create({
                    tenantId: tenantA,
                    siteId,
                    code:
                        `PV-${randomUUID()}`,
                    name:
                        "Integration PV Array",
                    assetType:
                        "SOLAR_PV_ARRAY",
                    status:
                        "ACTIVE"
                });

            pvAssetId = pvAsset.id;

            const loadAsset =
                await assets.create({
                    tenantId: tenantA,
                    siteId,
                    code:
                        `LOAD-${randomUUID()}`,
                    name:
                        "Integration Site Load",
                    assetType:
                        "SITE_LOAD",
                    status:
                        "ACTIVE"
                });

            loadAssetId = loadAsset.id;
        });

        afterAll(async () => {
            if (database?.isConnected()) {
                await database.disconnect();
            }
        });

        it(
            "creates and reads an Energy Flow with exact values and timestamps",
            async () => {
                const observedAt =
                    new Date(
                        "2026-09-16T10:15:30.456Z"
                    );

                const created =
                    await flows.create({
                        tenantId: tenantA,
                        siteId,
                        sourceAssetId:
                            pvAssetId,
                        destinationAssetId:
                            loadAssetId,
                        direction:
                            "TRANSFER",
                        powerKw:
                            2.85,
                        energyKwh:
                            1.425,
                        observedAt,
                        source:
                            "integration.miramichi"
                    });

                flowId = created.id;

                expect(
                    created.sourceAssetId
                ).toBe(pvAssetId);

                expect(
                    created.destinationAssetId
                ).toBe(loadAssetId);

                expect(created.direction)
                    .toBe("TRANSFER");

                expect(created.powerKw)
                    .toBe(2.85);

                expect(created.energyKwh)
                    .toBe(1.425);

                expect(
                    created.observedAt
                        .toISOString()
                ).toBe(
                    observedAt.toISOString()
                );

                expect(created.source)
                    .toBe(
                        "integration.miramichi"
                    );

                const persisted =
                    await flows.findById(
                        flowId,
                        tenantA
                    );

                expect(persisted)
                    .not.toBeNull();

                expect(
                    persisted?.sourceAssetId
                ).toBe(pvAssetId);

                expect(
                    persisted?.destinationAssetId
                ).toBe(loadAssetId);

                expect(
                    persisted?.direction
                ).toBe("TRANSFER");

                expect(
                    persisted?.powerKw
                ).toBeCloseTo(2.85, 10);

                expect(
                    persisted?.energyKwh
                ).toBeCloseTo(1.425, 10);

                expect(
                    persisted?.observedAt
                        .toISOString()
                ).toBe(
                    observedAt.toISOString()
                );

                expect(
                    persisted?.source
                ).toBe(
                    "integration.miramichi"
                );
            }
        );

        it(
            "returns Energy Flows for the correct tenant and site",
            async () => {
                const siteFlows =
                    await flows.findBySite(
                        siteId,
                        tenantA
                    );

                expect(
                    siteFlows.some(
                        (flow) =>
                            flow.id === flowId
                    )
                ).toBe(true);

                const inaccessible =
                    await flows.findBySite(
                        siteId,
                        tenantB
                    );

                expect(
                    inaccessible.some(
                        (flow) =>
                            flow.id === flowId
                    )
                ).toBe(false);
            }
        );

        it(
            "enforces tenant isolation for Energy Flow lookup",
            async () => {
                const inaccessible =
                    await flows.findById(
                        flowId,
                        tenantB
                    );

                expect(inaccessible)
                    .toBeNull();
            }
        );
    }
);

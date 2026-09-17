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
    SqlPerformanceMetricRepository
} from "../infrastructure/repositories/PerformanceMetricRepository.js";

const integrationEnabled =
    process.env.TELEMETRY_ENERGY_INTEGRATION_TESTS === "true";

const describeIntegration =
    integrationEnabled ? describe : describe.skip;

describeIntegration(
    "EIS performance metric SQL integration",
    () => {
        let database: IDatabaseProvider;
        let repository: SqlPerformanceMetricRepository;

        const tenantId =
            "73c28616-633a-46b5-bd4d-2ad7971af02c";
        const siteId =
            "138c8b96-04ae-402d-93f9-89b3677734e1";

        beforeAll(async () => {
            const configuration =
                getDatabaseConfiguration();

            if (
                !configuration.username ||
                !configuration.password
            ) {
                throw new Error(
                    "Database credentials are required."
                );
            }

            database = new SqlServerProvider({
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

            repository =
                new SqlPerformanceMetricRepository(
                    database
                );
        });

        afterAll(async () => {
            await database.disconnect();
        });

        it(
            "persists and reads the metric source",
            async () => {
                const periodEnd = new Date();
                const periodStart =
                    new Date(periodEnd.getTime() - 3_600_000);

                const created =
                    await repository.create({
                        tenantId,
                        siteId,
                        metricCode:
                            "integration.performance.source",
                        value: 12.345678,
                        unit: "test",
                        periodStart,
                        periodEnd,
                        source:
                            "integration.performance-test"
                    });

                const metrics =
                    await repository.findBySite(
                        tenantId,
                        siteId,
                        1000
                    );

                const found = metrics.find(
                    (metric) =>
                        metric.id === created.id
                );

                expect(found).toBeDefined();
                expect(found?.source).toBe(
                    "integration.performance-test"
                );
                expect(found?.value).toBeCloseTo(
                    12.345678,
                    6
                );
            }
        );
    }
);

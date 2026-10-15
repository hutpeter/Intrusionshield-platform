import {
    getConfiguration,
    resetConfiguration
} from "../configuration.js";

describe(
    "configuration immutability",
    () => {
        beforeEach(() => {
            resetConfiguration();
        });

        afterEach(() => {
            resetConfiguration();
        });

        it(
            "returns the same cached configuration instance",
            () => {
                const first = getConfiguration();
                const second = getConfiguration();

                expect(second).toBe(first);
            }
        );

        it(
            "deeply freezes the configuration",
            () => {
                const configuration = getConfiguration();

                expect(
                    Object.isFrozen(configuration)
                ).toBe(true);

                expect(
                    Object.isFrozen(configuration.application)
                ).toBe(true);

                expect(
                    Object.isFrozen(configuration.database)
                ).toBe(true);

                expect(
                    Object.isFrozen(configuration.database.pool)
                ).toBe(true);

                expect(
                    Object.isFrozen(configuration.logging)
                ).toBe(true);

                expect(
                    Object.isFrozen(configuration.logging.file)
                ).toBe(true);

                expect(
                    Object.isFrozen(configuration.logging.audit)
                ).toBe(true);

                expect(
                    Object.isFrozen(configuration.features)
                ).toBe(true);
            }
        );

        it(
            "creates a new configuration after reset",
            () => {
                const first = getConfiguration();

                resetConfiguration();

                const second = getConfiguration();

                expect(second).not.toBe(first);
            }
        );
    }
);

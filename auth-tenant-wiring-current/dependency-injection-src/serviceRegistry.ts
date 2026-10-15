/**
 * IntrusionShield Dependency Injection
 *
 * Service Registration Module
 *
 * The DI container owns application composition and wiring.
 * Concrete implementations are registered here while consumers
 * depend on abstractions.
 */

import { Container } from "./container.js";
import { TOKENS } from "./tokens.js";

import {
    getConfiguration
} from "@intrusionshield/config";

import type {
    Configuration
} from "@intrusionshield/config";

import {
    DatabaseManager,
    SqlServerProvider
} from "@intrusionshield/database";

import {
    EventBus
} from "@intrusionshield/events";

import {
    AIUsageRepository,
    AIPerformanceRepository,
    AIPolicyEvaluationRepository,
    AIRequestLogRepository
} from "@intrusionshield/repositories";

import type {
    IAIUsageRepository,
    IAIPerformanceRepository,
    IAIPolicyEvaluationRepository,
    IAIRequestLogRepository
} from "@intrusionshield/repositories";


export function registerServices(
    container: Container
): void {

    /*
     * -------------------------------------------------------------------------
     * Configuration
     * -------------------------------------------------------------------------
     *
     * Configuration is owned by @intrusionshield/config.
     * DI must not recreate or partially duplicate the configuration contract.
     */

    container.register(
        TOKENS.CONFIG,
        (): Configuration => {
            return getConfiguration();
        }
    );


    /*
     * -------------------------------------------------------------------------
     * Logger
     * -------------------------------------------------------------------------
     */

    container.register(
        TOKENS.LOGGER,
        () => {

            return {

                info(
                    message: string,
                    metadata?: unknown
                ): void {
                    console.log(
                        "[INFO]",
                        message,
                        metadata ?? ""
                    );
                },

                warn(
                    message: string,
                    metadata?: unknown
                ): void {
                    console.warn(
                        "[WARN]",
                        message,
                        metadata ?? ""
                    );
                },

                error(
                    message: string,
                    error?: unknown
                ): void {
                    console.error(
                        "[ERROR]",
                        message,
                        error ?? ""
                    );
                }

            };
        }
    );


    /*
     * -------------------------------------------------------------------------
     * Event Bus
     * -------------------------------------------------------------------------
     */

    container.register(
        TOKENS.EVENT_BUS,
        (container) => {

            const logger =
                container.resolve<{
                    info(
                        message: string,
                        metadata?: unknown
                    ): void;

                    warn(
                        message: string,
                        metadata?: unknown
                    ): void;

                    error(
                        message: string,
                        error?: unknown
                    ): void;
                }>(
                    TOKENS.LOGGER
                );

            return new EventBus(
                logger
            );
        }
    );


    /*
     * -------------------------------------------------------------------------
     * Database
     * -------------------------------------------------------------------------
     *
     * DatabaseManager is the platform database abstraction.
     *
     * Construction does not establish a connection.
     * Application bootstrap owns connection lifecycle.
     */

    container.register(
        TOKENS.DATABASE,
        (container) => {

            const configuration =
                container.resolve<Configuration>(
                    TOKENS.CONFIG
                );

            const databaseConfiguration =
                configuration.database;

            if (
                databaseConfiguration.username === undefined ||
                databaseConfiguration.password === undefined
            ) {
                throw new Error(
                    "Database username and password are required."
                );
            }

            const provider =
                new SqlServerProvider({
                    server:
                        databaseConfiguration.server,

                    port:
                        databaseConfiguration.port,

                    database:
                        databaseConfiguration.database,

                    user:
                        databaseConfiguration.username,

                    password:
                        databaseConfiguration.password,

                    encrypt:
                        databaseConfiguration.encrypt,

                    trustServerCertificate:
                        databaseConfiguration.trustServerCertificate
                });

            return new DatabaseManager(
                provider
            );
        }
    );


    /*
     * -------------------------------------------------------------------------
     * AI Usage Repository
     * -------------------------------------------------------------------------
     */

    container.register(
        TOKENS.AI_USAGE_REPOSITORY,
        (container): IAIUsageRepository => {

            const database =
                container.resolve<DatabaseManager>(
                    TOKENS.DATABASE
                );

            return new AIUsageRepository(
                database
            );
        }
    );


    /*
     * -------------------------------------------------------------------------
     * AI Performance Repository
     * -------------------------------------------------------------------------
     */

    container.register(
        TOKENS.AI_PERFORMANCE_REPOSITORY,
        (container): IAIPerformanceRepository => {

            const database =
                container.resolve<DatabaseManager>(
                    TOKENS.DATABASE
                );

            return new AIPerformanceRepository(
                database
            );
        }
    );


    /*
     * -------------------------------------------------------------------------
     * AI Policy Evaluation Repository
     * -------------------------------------------------------------------------
     */

    container.register(
        TOKENS.AI_POLICY_EVALUATION_REPOSITORY,
        (container): IAIPolicyEvaluationRepository => {

            const database =
                container.resolve<DatabaseManager>(
                    TOKENS.DATABASE
                );

            return new AIPolicyEvaluationRepository(
                database
            );
        }
    );


    /*
     * -------------------------------------------------------------------------
     * AI Request Log Repository
     * -------------------------------------------------------------------------
     */

    container.register(
        TOKENS.AI_REQUEST_LOG_REPOSITORY,
        (container): IAIRequestLogRepository => {

            const database =
                container.resolve<DatabaseManager>(
                    TOKENS.DATABASE
                );

            return new AIRequestLogRepository(
                database
            );
        }
    );


    /*
     * -------------------------------------------------------------------------
     * Authentication Service
     * -------------------------------------------------------------------------
     *
     * Actual implementation will be registered when the authentication
     * service composition is introduced.
     */

    container.register(
        TOKENS.AUTH_SERVICE,
        () => null
    );


    /*
     * -------------------------------------------------------------------------
     * Workflow Service
     * -------------------------------------------------------------------------
     */

    container.register(
        TOKENS.WORKFLOW_SERVICE,
        () => null
    );


    /*
     * -------------------------------------------------------------------------
     * AI Service
     * -------------------------------------------------------------------------
     */

    container.register(
        TOKENS.AI_SERVICE,
        () => null
    );


    /*
     * -------------------------------------------------------------------------
     * Compliance Service
     * -------------------------------------------------------------------------
     */

    container.register(
        TOKENS.COMPLIANCE_SERVICE,
        () => null
    );


    /*
     * -------------------------------------------------------------------------
     * Analytics Service
     * -------------------------------------------------------------------------
     */

    container.register(
        TOKENS.ANALYTICS_SERVICE,
        () => null
    );
}
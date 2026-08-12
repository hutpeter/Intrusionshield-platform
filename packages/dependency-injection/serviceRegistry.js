/**
 * IntrusionShield Dependency Injection
 *
 * Service Registration Module
 *
 * This file is responsible for registering
 * all globally available platform services.
 *
 * Services should depend on abstractions,
 * not concrete implementations.
 */


import { Container } from "./container";

import { TOKENS } from "./tokens";



/*
 * Core Platform Services
 */

import {
    EventBus
} from "@intrusionshield/events";



/*
 * Future imports:
 *
 * import { ConfigurationService }
 * from "@intrusionshield/config";
 *
 * import { LoggerService }
 * from "@intrusionshield/logging";
 *
 * import { DatabaseService }
 * from "@intrusionshield/database";
 *
 */



export function registerServices(
    container: Container
): void {



    /*
    |--------------------------------------------------------------------------
    | Configuration
    |--------------------------------------------------------------------------
    */


    container.register(
        TOKENS.CONFIG,
        () => {


            return {

                environment:
                    process.env.NODE_ENV ??
                    "development",


                version:
                    process.env.APP_VERSION ??
                    "1.0.0"

            };


        }
    );





    /*
    |--------------------------------------------------------------------------
    | Logger
    |--------------------------------------------------------------------------
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
    |--------------------------------------------------------------------------
    | Event Bus
    |--------------------------------------------------------------------------
    */


    container.register(
        TOKENS.EVENT_BUS,

        (container) => {


            const logger =
                container.resolve(
                    TOKENS.LOGGER
                );


            return new EventBus(
                logger
            );


        }
    );







    /*
    |--------------------------------------------------------------------------
    | Database
    |--------------------------------------------------------------------------
    |
    | SQL Server implementation will
    | eventually move into its own package:
    |
    | @intrusionshield/database
    |
    */


    container.register(
        TOKENS.DATABASE,

        () => {


            return {


                connect:
                    async (): Promise<void> => {


                        console.log(
                            "Database connection initialized"
                        );


                    },



                disconnect:
                    async (): Promise<void> => {


                        console.log(
                            "Database connection closed"
                        );


                    }


            };


        }
    );







    /*
    |--------------------------------------------------------------------------
    | Authentication Service
    |--------------------------------------------------------------------------
    |
    | Placeholder registration.
    |
    | Actual implementation:
    |
    | services/authentication
    |
    */


    container.register(
        TOKENS.AUTH_SERVICE,

        () => {


            return null;


        }
    );







    /*
    |--------------------------------------------------------------------------
    | Workflow Service
    |--------------------------------------------------------------------------
    */


    container.register(
        TOKENS.WORKFLOW_SERVICE,

        () => {


            return null;


        }
    );







    /*
    |--------------------------------------------------------------------------
    | AI Service
    |--------------------------------------------------------------------------
    */


    container.register(
        TOKENS.AI_SERVICE,

        () => {


            return null;


        }
    );







    /*
    |--------------------------------------------------------------------------
    | Compliance Service
    |--------------------------------------------------------------------------
    */


    container.register(
        TOKENS.COMPLIANCE_SERVICE,

        () => {


            return null;


        }
    );







    /*
    |--------------------------------------------------------------------------
    | Analytics Service
    |--------------------------------------------------------------------------
    */


    container.register(
        TOKENS.ANALYTICS_SERVICE,

        () => {


            return null;


        }
    );


}
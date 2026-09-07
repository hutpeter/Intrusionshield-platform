import { createApp } from "./app.js";

import {
    Container,
    registerServices,
    TOKENS
} from "@intrusionshield/di";

import type {
    Configuration
} from "@intrusionshield/config";

import {
    DatabaseManager
} from "@intrusionshield/database";


export async function bootstrap(): Promise<void> {

    console.log(
        "Starting IntrusionShield Platform..."
    );


    /*
     * Initialize dependency container
     */

    const container =
        new Container();

    registerServices(
        container
    );


    /*
     * Resolve configuration
     */

    const configuration =
        container.resolve<Configuration>(
            TOKENS.CONFIG
        );


    /*
     * Initialize database connection
     *
     * DatabaseManager construction does not
     * establish a connection. Connection lifecycle
     * is explicitly controlled by the application.
     */

    const database =
        container.resolve<DatabaseManager>(
            TOKENS.DATABASE
        );

    await database.connect();


    /*
     * Initialize application
     */

    const app =
        createApp();


    /*
     * Start HTTP service
     */

    app.listen(
        configuration.application.port,
        () => {

            console.log(
                `API Gateway listening on port ${configuration.application.port}`
            );

        }
    );

}
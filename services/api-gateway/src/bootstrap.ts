import { createApp } from "./app.js";
import { serviceRegistry } from "@intrusionshield/di";
import { config } from "@intrusionshield/config";


export async function bootstrap() {


    console.log(
        "Starting IntrusionShield Platform..."
    );


    /*
        Initialize dependency container
    */

    await serviceRegistry.initialize();



    /*
        Initialize application
    */

    const app = createApp();



    /*
        Start HTTP service
    */

    app.listen(
        config.application.port,
        () => {

            console.log(
                `API Gateway listening on port ${config.application.port}`
            );

        }
    );

}
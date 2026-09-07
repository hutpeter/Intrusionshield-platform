import { bootstrap } from "./bootstrap.js";

async function start() {
    try {
        await bootstrap();

        console.log(
            "IntrusionShield API Gateway started successfully"
        );

    } catch (error) {

        console.error(
            "Fatal startup error:",
            error
        );

        process.exit(1);
    }
}


start();
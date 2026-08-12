import express from "express";

import {
    lifecycleMiddleware
} from "./lifecycle.js";


export function createApp() {


    const app = express();


    app.use(
        express.json()
    );


    /*
        Application lifecycle
    */

    app.use(
        lifecycleMiddleware
    );


    /*
        Health endpoint
    */

    app.get(
        "/health",
        (_, res)=>{

            res.json({
                status:"healthy",
                service:"IntrusionShield API Gateway",
                timestamp:new Date()
            });

        }
    );


    return app;

}
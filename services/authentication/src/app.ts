import express from "express";
import { createTenantAdminRouter, type TenantAdminApi } from "./routes/tenantAdmin.js";

import type {
    Express
} from "express";

import {
    createAuthenticationRouter,
    type AuthenticationApiServices
} from "./routes/index.js";

export function createApp(
    services?: AuthenticationApiServices,
    tenantAdmin?: TenantAdminApi
): Express {
    const app = express();

    app.disable("x-powered-by");

    app.use(
        express.json({
            limit: "256kb"
        })
    );

    app.get(
        "/health",
        (_request, response) => {
            response.status(200).json({
                service: "authentication",
                status: "ok"
            });
        }
    );

    if (services) {
        app.use(
            "/api/v1/auth",
            createAuthenticationRouter(
                services
            )
        );
    }

    if (tenantAdmin) {
        app.use("/api/v1/admin", createTenantAdminRouter(tenantAdmin));
    }

    app.use(
        (
            error: unknown,
            _request: express.Request,
            response: express.Response,
            _next: express.NextFunction
        ) => {
            const message =
                error instanceof Error
                    ? error.message
                    : "Internal server error";

            const status =
                /required|invalid|unsupported/i
                    .test(message)
                    ? 400
                    : 500;

            response
                .status(status)
                .json({
                    error: message
                });
        }
    );

    return app;
}

import { createAccountAdminRouter, type AccountAdminApi } from "./routes/accountAdmin.js";
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
    tenantAdmin?: TenantAdminApi,
    accountAdmin?: AccountAdminApi
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

    if (accountAdmin) {
        app.use("/api/v1/admin", (request, response, next) => {
            const local = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(request.socket.remoteAddress ?? "");
            if (!request.secure && !(accountAdmin.allowInsecureLoopback && local)) {
                response.status(403).json({ error: "HTTPS_REQUIRED" }); return;
            }
            next();
        });
        // Existing client routes retain their own RBAC checks, with current session revocation.
        app.use("/api/v1/admin/tenants", async (request, response, next) => {
            try {
                const match = /^Bearer ([^\s]+)$/i.exec(request.header("authorization") ?? "");
                if (!match) throw new Error("Missing token");
                const claims = accountAdmin.tokens.verify(match[1]!);
                if (claims.identityType !== "USER") throw new Error("Invalid identity");
                await accountAdmin.accounts.context({ tenantId: claims.tenantId, id: claims.sub, sessionVersion: claims.sessionVersion });
                next();
            } catch { response.status(401).json({ error: "SIGN_IN_REQUIRED" }); }
        });
    }

    if (tenantAdmin) {
        app.use("/api/v1/admin", createTenantAdminRouter(tenantAdmin));
    }

    if (accountAdmin) app.use("/api/v1/admin/accounts", createAccountAdminRouter(accountAdmin));

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

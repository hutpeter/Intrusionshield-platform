import {
    Router
} from "express";

import type {
    Request,
    Response
} from "express";

import {
    AuthenticationError,
    AuthenticationService
} from "../application/AuthenticationService.js";

import {
    AccessTokenService
} from "../security/AccessTokenService.js";

export interface AuthenticationApiServices {
    readonly authenticationService:
        AuthenticationService;
    readonly accessTokenService:
        AccessTokenService;
}

function bearerToken(
    request: Request
): string | null {
    const header =
        request.header("authorization");

    if (!header) {
        return null;
    }

    const match =
        /^Bearer\s+(.+)$/i.exec(header);

    return match?.[1] ?? null;
}

export function createAuthenticationRouter(
    services: AuthenticationApiServices
): Router {
    const router = Router();

    router.post(
        "/login",
        async (
            request: Request,
            response: Response
        ) => {
            const tenantId =
                typeof request.body?.tenantId ===
                "string"
                    ? request.body.tenantId.trim()
                    : "";

            const username =
                typeof request.body?.username ===
                "string"
                    ? request.body.username.trim()
                    : "";

            const password =
                typeof request.body?.password ===
                "string"
                    ? request.body.password
                    : "";

            if (
                !tenantId ||
                !username ||
                !password
            ) {
                response.status(400).json({
                    error:
                        "tenantId, username and password are required."
                });

                return;
            }

            try {
                const result =
                    await services
                        .authenticationService
                        .authenticate({
                            tenantId,
                            username,
                            password
                        });

                response
                    .status(200)
                    .json(result);
            } catch (error) {
                if (
                    error instanceof
                    AuthenticationError
                ) {
                    response.status(401).json({
                        error:
                            "Authentication failed."
                    });

                    return;
                }

                throw error;
            }
        }
    );

    router.put(
        "/me/language",
        async (
            request: Request,
            response: Response
        ) => {
            const token =
                bearerToken(request);

            if (!token) {
                response.status(401).json({
                    error:
                        "Bearer access token is required."
                });

                return;
            }

            let claims;

            try {
                claims =
                    services
                        .accessTokenService
                        .verify(token);
            } catch {
                response.status(401).json({
                    error:
                        "Access token is invalid or expired."
                });

                return;
            }

            const supplied =
                request.body?.language;

            if (
                supplied !== null &&
                typeof supplied !== "string"
            ) {
                response.status(400).json({
                    error:
                        "language must be a supported language string or null."
                });

                return;
            }

            await services
                .authenticationService
                .setPreferredLanguage(
                    claims.tenantId,
                    claims.sub,
                    supplied
                );

            response
                .status(204)
                .send();
        }
    );

    return router;
}

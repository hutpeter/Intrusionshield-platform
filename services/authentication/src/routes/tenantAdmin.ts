
import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";

import type { AccessTokenService } from "../security/AccessTokenService.js";
import type { UnresolvedTenantProvisioningAudit } from "../application/TenantProvisioningReconciliation.js";

import {
    TenantConflictError,
    TenantValidationError,
    validateTenantInput,
    type TenantRecord
} from "../application/SqlPlatformTenantRepository.js";

export interface TenantCreationContext {
    actorIdentityId: string;
    actorTenantId: string;
    correlationId: string;
}

type TenantAdminResource =
    | "platform.tenants"
    | "platform.tenant-provisioning-audit";

export interface TenantAdminApi {
    accessTokenService: AccessTokenService;

    authorize(
        identityId: string,
        tenantId: string,
        action: "READ" | "CREATE",
        resource?: TenantAdminResource
    ): Promise<boolean>;

    list(
        limit: number,
        offset: number
    ): Promise<TenantRecord[]>;

    listStaleProvisioning(
        staleMinutes: number
    ): Promise<UnresolvedTenantProvisioningAudit[]>;

    create(
        input: ReturnType<typeof validateTenantInput>,
        context: TenantCreationContext
    ): Promise<TenantRecord>;
}

export function createTenantAdminRouter(
    services: TenantAdminApi
): Router {
    const router = Router();

    async function authorized(
        request: Request,
        action: "READ" | "CREATE",
        resource: TenantAdminResource = "platform.tenants"
    ): Promise<
        | {
            status: 200;
            identityId: string;
            tenantId: string;
        }
        | {
            status: 401 | 403 | 503;
        }
    > {
        const match = /^Bearer\s+(.+)$/i.exec(
            request.header("authorization") ?? ""
        );

        if (!match) {
            return { status: 401 };
        }

        let claims;

        try {
            claims = services.accessTokenService.verify(
                match[1]!
            );
        } catch {
            return { status: 401 };
        }

        try {
            const permitted = await services.authorize(
                claims.sub,
                claims.tenantId,
                action,
                resource
            );

            if (!permitted) {
                return { status: 403 };
            }
        } catch {
            return { status: 503 };
        }

        return {
            status: 200,
            identityId: claims.sub,
            tenantId: claims.tenantId
        };
    }

    function sendAuthorizationError(
        res: Response,
        status: 401 | 403 | 503
    ): void {
        res.status(status).json({
            error:
                status === 401
                    ? "UNAUTHORIZED"
                    : status === 403
                        ? "FORBIDDEN"
                        : "AUTHORIZATION_UNAVAILABLE"
        });
    }

    router.get("/tenants", async (req, res) => {
        const auth = await authorized(req, "READ");

        if (auth.status !== 200) {
            sendAuthorizationError(res, auth.status);
            return;
        }

        const limit = Number(req.query.limit ?? 50);
        const offset = Number(req.query.offset ?? 0);

        if (
            !Number.isInteger(limit) ||
            limit < 1 ||
            limit > 100 ||
            !Number.isInteger(offset) ||
            offset < 0
        ) {
            res.status(400).json({
                error: "INVALID_PAGINATION"
            });
            return;
        }

        try {
            res.json({
                tenants: await services.list(
                    limit,
                    offset
                )
            });
        } catch {
            res.status(503).json({
                error: "TENANT_STORE_UNAVAILABLE"
            });
        }
    });

    router.get("/tenants/reconciliation", async (req, res) => {
        const auth = await authorized(
            req,
            "READ",
            "platform.tenant-provisioning-audit"
        );

        if (auth.status !== 200) {
            sendAuthorizationError(res, auth.status);
            return;
        }

        const rawThreshold = req.query.staleMinutes;

        const staleMinutes =
            rawThreshold === undefined
                ? 15
                : typeof rawThreshold === "string" &&
                    /^\d+$/.test(rawThreshold)
                    ? Number(rawThreshold)
                    : NaN;

        if (
            !Number.isSafeInteger(staleMinutes) ||
            staleMinutes < 1 ||
            staleMinutes > 10080
        ) {
            res.status(400).json({
                error: "INVALID_STALE_THRESHOLD"
            });
            return;
        }

        try {
            const audits =
                await services.listStaleProvisioning(
                    staleMinutes
                );

            res.json({ audits });
        } catch {
            res.status(503).json({
                error: "RECONCILIATION_UNAVAILABLE"
            });
        }
    });

    router.post("/tenants", async (req, res) => {
        const auth = await authorized(req, "CREATE");

        if (auth.status !== 200) {
            sendAuthorizationError(res, auth.status);
            return;
        }

        const context: TenantCreationContext = {
            actorIdentityId: auth.identityId,
            actorTenantId: auth.tenantId,
            correlationId: randomUUID()
        };

        try {
            const input = validateTenantInput(
                req.body
            );

            const tenant = await services.create(
                input,
                context
            );

            res.status(201).json({
                tenant
            });
        } catch (error) {
            if (error instanceof TenantValidationError) {
                res.status(400).json({
                    error: "INVALID_TENANT",
                    message: error.message
                });
            } else if (error instanceof TenantConflictError) {
                res.status(409).json({
                    error: "TENANT_CODE_EXISTS"
                });
            } else {
                res.status(503).json({
                    error: "TENANT_PROVISIONING_UNAVAILABLE"
                });
            }
        }
    });

    return router;
}

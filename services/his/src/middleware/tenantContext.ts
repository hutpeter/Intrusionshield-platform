import type { RequestHandler } from "express";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const tenantContext: RequestHandler = (req, res, next) => {
  const tenantId = req.header("x-tenant-id");

  if (!tenantId || !UUID_PATTERN.test(tenantId)) {
    res.status(400).json({ error: "A valid x-tenant-id header is required." });
    return;
  }

  res.locals.tenantId = tenantId;
  next();
};

export function getTenantId(res: { locals: Record<string, unknown> }): string {
  const tenantId = res.locals.tenantId;
  if (typeof tenantId !== "string") {
    throw new Error("Tenant context is not available");
  }
  return tenantId;
}

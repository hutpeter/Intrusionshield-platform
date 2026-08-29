import { describe, expect, it, jest } from "@jest/globals";
import { DefaultLicenseService } from "./service.js";
import type { License, LicenseRepository } from "./types.js";

const license: License = {
  id: "lic-1",
  tenantId: "tenant-1",
  licenseNumber: "DS-001",
  type: "SUBSCRIPTION",
  status: "ACTIVE",
  effectiveFrom: new Date("2026-01-01T00:00:00Z"),
  effectiveUntil: new Date("2027-01-01T00:00:00Z")
};

describe("DefaultLicenseService", () => {
  it("rejects an invalid effective window", async () => {
    const repository = {} as LicenseRepository;
    const service = new DefaultLicenseService(repository);
    await expect(service.create({ ...license, effectiveUntil: license.effectiveFrom })).rejects.toThrow("effectiveUntil");
  });

  it("delegates active license lookup", async () => {
    const repository: LicenseRepository = {
      findById: jest.fn(),
      findActiveForTenant: jest.fn().mockResolvedValue(license),
      listForTenant: jest.fn(),
      save: jest.fn(),
      setStatus: jest.fn()
    };
    const service = new DefaultLicenseService(repository);
    await expect(service.isActive("tenant-1", new Date("2026-06-01T00:00:00Z"))).resolves.toBe(true);
  });
});

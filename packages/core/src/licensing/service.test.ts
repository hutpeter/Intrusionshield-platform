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

function createRepository(
  overrides: Partial<LicenseRepository> = {}
): LicenseRepository {
  return {
    findById: jest.fn(),
    findActiveForTenant: jest.fn(),
    listForTenant: jest.fn(),
    save: jest.fn(),
    setStatus: jest.fn(),
    ...overrides
  };
}

describe("DefaultLicenseService", () => {
  it("delegates get to the repository", async () => {
    const findById = jest.fn<LicenseRepository["findById"]>()
      .mockResolvedValue(license);

    const repository = createRepository({
      findById
    });

    const service = new DefaultLicenseService(repository);

    await expect(service.get("lic-1")).resolves.toBe(license);

    expect(findById).toHaveBeenCalledWith("lic-1");
    expect(findById).toHaveBeenCalledTimes(1);
  });

  it("delegates listForTenant to the repository", async () => {
    const licenses = [license];

    const listForTenant = jest.fn<LicenseRepository["listForTenant"]>()
      .mockResolvedValue(licenses);

    const repository = createRepository({
      listForTenant
    });

    const service = new DefaultLicenseService(repository);

    await expect(
      service.listForTenant("tenant-1")
    ).resolves.toBe(licenses);

    expect(listForTenant).toHaveBeenCalledWith("tenant-1");
    expect(listForTenant).toHaveBeenCalledTimes(1);
  });

  it("creates a valid license through the repository", async () => {
    const save = jest.fn<LicenseRepository["save"]>()
      .mockResolvedValue(undefined);

    const repository = createRepository({
      save
    });

    const service = new DefaultLicenseService(repository);

    await expect(service.create(license)).resolves.toBeUndefined();

    expect(save).toHaveBeenCalledWith(license);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("rejects a license without an id", async () => {
    const repository = createRepository();
    const service = new DefaultLicenseService(repository);

    await expect(
      service.create({
        ...license,
        id: ""
      })
    ).rejects.toThrow(
      "License id, tenantId, and licenseNumber are required"
    );

    expect(repository.save).not.toHaveBeenCalled();
  });

  it("rejects a license without a tenant id", async () => {
    const repository = createRepository();
    const service = new DefaultLicenseService(repository);

    await expect(
      service.create({
        ...license,
        tenantId: ""
      })
    ).rejects.toThrow(
      "License id, tenantId, and licenseNumber are required"
    );

    expect(repository.save).not.toHaveBeenCalled();
  });

  it("rejects a license without a license number", async () => {
    const repository = createRepository();
    const service = new DefaultLicenseService(repository);

    await expect(
      service.create({
        ...license,
        licenseNumber: ""
      })
    ).rejects.toThrow(
      "License id, tenantId, and licenseNumber are required"
    );

    expect(repository.save).not.toHaveBeenCalled();
  });

  it("rejects an effective window where effectiveUntil equals effectiveFrom", async () => {
    const repository = createRepository();
    const service = new DefaultLicenseService(repository);

    await expect(
      service.create({
        ...license,
        effectiveUntil: license.effectiveFrom
      })
    ).rejects.toThrow(
      "License effectiveUntil must be after effectiveFrom"
    );

    expect(repository.save).not.toHaveBeenCalled();
  });

  it("rejects an effective window where effectiveUntil precedes effectiveFrom", async () => {
    const repository = createRepository();
    const service = new DefaultLicenseService(repository);

    await expect(
      service.create({
        ...license,
        effectiveUntil: new Date("2025-12-31T00:00:00Z")
      })
    ).rejects.toThrow(
      "License effectiveUntil must be after effectiveFrom"
    );

    expect(repository.save).not.toHaveBeenCalled();
  });

  it("allows a license with no effectiveUntil", async () => {
    const save = jest.fn<LicenseRepository["save"]>()
      .mockResolvedValue(undefined);

    const repository = createRepository({
      save
    });

    const service = new DefaultLicenseService(repository);
    const perpetualLicense = {
      ...license,
      effectiveUntil: null
    };

    await expect(
      service.create(perpetualLicense)
    ).resolves.toBeUndefined();

    expect(save).toHaveBeenCalledWith(perpetualLicense);
  });

  it("changes the status of an existing license", async () => {
    const findById = jest.fn<LicenseRepository["findById"]>()
      .mockResolvedValue(license);

    const setStatus = jest.fn<LicenseRepository["setStatus"]>()
      .mockResolvedValue(undefined);

    const repository = createRepository({
      findById,
      setStatus
    });

    const service = new DefaultLicenseService(repository);

    await expect(
      service.setStatus("lic-1", "SUSPENDED")
    ).resolves.toBeUndefined();

    expect(findById).toHaveBeenCalledWith("lic-1");
    expect(setStatus).toHaveBeenCalledWith(
      "lic-1",
      "SUSPENDED"
    );
  });

  it("rejects a status change when the license does not exist", async () => {
    const findById = jest.fn<LicenseRepository["findById"]>()
      .mockResolvedValue(null);

    const setStatus = jest.fn<LicenseRepository["setStatus"]>()
      .mockResolvedValue(undefined);

    const repository = createRepository({
      findById,
      setStatus
    });

    const service = new DefaultLicenseService(repository);

    await expect(
      service.setStatus("missing-license", "SUSPENDED")
    ).rejects.toThrow("License not found");

    expect(setStatus).not.toHaveBeenCalled();
  });

  it("returns true when the repository returns an active license", async () => {
    const at = new Date("2026-06-01T00:00:00Z");

    const findActiveForTenant =
      jest.fn<LicenseRepository["findActiveForTenant"]>()
        .mockResolvedValue(license);

    const repository = createRepository({
      findActiveForTenant
    });

    const service = new DefaultLicenseService(repository);

    await expect(
      service.isActive("tenant-1", at)
    ).resolves.toBe(true);

    expect(findActiveForTenant).toHaveBeenCalledWith(
      "tenant-1",
      at
    );
  });

  it("returns false when no active license is found", async () => {
    const at = new Date("2026-06-01T00:00:00Z");

    const findActiveForTenant =
      jest.fn<LicenseRepository["findActiveForTenant"]>()
        .mockResolvedValue(null);

    const repository = createRepository({
      findActiveForTenant
    });

    const service = new DefaultLicenseService(repository);

    await expect(
      service.isActive("tenant-1", at)
    ).resolves.toBe(false);
  });

  it("returns false when the repository returns a non-active license", async () => {
    const suspendedLicense: License = {
      ...license,
      status: "SUSPENDED"
    };

    const findActiveForTenant =
      jest.fn<LicenseRepository["findActiveForTenant"]>()
        .mockResolvedValue(suspendedLicense);

    const repository = createRepository({
      findActiveForTenant
    });

    const service = new DefaultLicenseService(repository);

    await expect(
      service.isActive("tenant-1")
    ).resolves.toBe(false);
  });
});
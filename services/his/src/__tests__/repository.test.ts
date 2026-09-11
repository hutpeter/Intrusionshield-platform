import { describe, expect, it, jest } from "@jest/globals";
import type { IDatabaseProvider } from "@intrusionshield/database";
import {
  SqlFacilityRepository,
  SqlPatientRepository,
  SqlPersonRepository,
  SqlPractitionerRepository
} from "../infrastructure/repositories/index.js";

function createDatabaseMock(): jest.Mocked<IDatabaseProvider> {
  return {
    connect: jest.fn(),
    disconnect: jest.fn(),
    query: jest.fn(),
    execute: jest.fn(),
    beginTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    isConnected: jest.fn()
  };
}

const dates = {
  created: new Date("2026-01-01T10:00:00.000Z"),
  updated: new Date("2026-01-02T10:00:00.000Z"),
  birth: new Date("1980-05-10T00:00:00.000Z"),
  registration: new Date("2026-01-01T00:00:00.000Z"),
  effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
  effectiveUntil: new Date("2027-01-01T00:00:00.000Z"),
  issued: new Date("2026-01-01T00:00:00.000Z"),
  expires: new Date("2027-01-01T00:00:00.000Z")
};

describe("SqlPersonRepository", () => {
  it("returns null when the person does not exist for the tenant", async () => {
    const database = createDatabaseMock();
    database.query.mockResolvedValueOnce({ rows: [] });

    const repository = new SqlPersonRepository(database);

    const result = await repository.findById("person-1", "tenant-a");

    expect(result).toBeNull();
    expect(database.query).toHaveBeenCalledTimes(1);

    const [sql, parameters] = database.query.mock.calls[0];

    expect(sql).toContain("WHERE id = @id");
    expect(sql).toContain("tenant_id = @tenantId");
    expect(parameters).toEqual([
      { name: "id", value: "person-1" },
      { name: "tenantId", value: "tenant-a" }
    ]);
  });

  it("maps the person and tenant-scoped child records correctly", async () => {
    const database = createDatabaseMock();

    database.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: "person-1",
            tenantId: "tenant-a",
            firstName: "Jane",
            middleName: null,
            lastName: "Doe",
            preferredName: "Jane",
            dateOfBirth: dates.birth,
            sex: "FEMALE",
            gender: "Female",
            status: "ACTIVE",
            contactEmail: "jane@example.com",
            contactPhone: "555-1000",
            contactMobilePhone: null,
            createdAt: dates.created,
            updatedAt: dates.updated,
            version: 3
          }
        ]
      })
      .mockResolvedValueOnce({
        rows: [
          { system: "MRN", value: "MRN-001" },
          { system: "OHIP", value: "OHIP-001" }
        ]
      })
      .mockResolvedValueOnce({
        rows: [
          {
            line1: "123 Main Street",
            line2: "Suite 4",
            city: "Ottawa",
            provinceOrState: "ON",
            postalCode: "K1A 0A1",
            country: "CA"
          }
        ]
      });

    const repository = new SqlPersonRepository(database);

    const result = await repository.findById("person-1", "tenant-a");

    expect(result).toEqual({
      id: "person-1",
      tenantId: "tenant-a",
      firstName: "Jane",
      lastName: "Doe",
      preferredName: "Jane",
      dateOfBirth: dates.birth,
      sex: "FEMALE",
      gender: "Female",
      identifiers: [
        { system: "MRN", value: "MRN-001" },
        { system: "OHIP", value: "OHIP-001" }
      ],
      contactInformation: {
        email: "jane@example.com",
        phone: "555-1000",
        mobilePhone: undefined
      },
      addresses: [
        {
          line1: "123 Main Street",
          line2: "Suite 4",
          city: "Ottawa",
          provinceOrState: "ON",
          postalCode: "K1A 0A1",
          country: "CA"
        }
      ],
      status: "ACTIVE",
      createdAt: dates.created,
      updatedAt: dates.updated,
      version: 3
    });

    expect(database.query).toHaveBeenCalledTimes(3);

    for (const [, parameters] of database.query.mock.calls) {
      expect(parameters).toEqual([
        { name: "id", value: "person-1" },
        { name: "tenantId", value: "tenant-a" }
      ]);
    }
  });

  it("creates a person and its child records in a transaction", async () => {
    const database = createDatabaseMock();
    database.execute.mockResolvedValue(1);

    const person = {
      id: "person-1",
      tenantId: "tenant-a",
      firstName: "Jane",
      lastName: "Doe",
      sex: "FEMALE" as const,
      identifiers: [
        { system: "MRN", value: "MRN-001" },
        { system: "OHIP", value: "OHIP-001" }
      ],
      addresses: [
        {
          line1: "123 Main Street",
          city: "Ottawa",
          provinceOrState: "ON",
          postalCode: "K1A 0A1",
          country: "CA"
        }
      ],
      status: "ACTIVE" as const,
      createdAt: dates.created,
      updatedAt: dates.updated,
      version: 1
    };

    const repository = new SqlPersonRepository(database);

    const result = await repository.create(person);

    expect(result).toBe(person);
    expect(database.beginTransaction).toHaveBeenCalledTimes(1);
    expect(database.commitTransaction).toHaveBeenCalledTimes(1);
    expect(database.rollbackTransaction).not.toHaveBeenCalled();
    expect(database.execute).toHaveBeenCalledTimes(4);

    for (const [, parameters] of database.execute.mock.calls) {
      expect(parameters).toEqual(
        expect.arrayContaining([
          { name: "tenantId", value: "tenant-a" }
        ])
      );
    }
  });

  it("rolls back a person creation when a child insert fails", async () => {
    const database = createDatabaseMock();

    database.execute
      .mockResolvedValueOnce(1)
      .mockRejectedValueOnce(new Error("identifier insert failed"));

    const person = {
      id: "person-1",
      tenantId: "tenant-a",
      firstName: "Jane",
      lastName: "Doe",
      sex: "FEMALE" as const,
      identifiers: [{ system: "MRN", value: "MRN-001" }],
      addresses: [],
      status: "ACTIVE" as const,
      createdAt: dates.created,
      updatedAt: dates.updated,
      version: 1
    };

    const repository = new SqlPersonRepository(database);

    await expect(repository.create(person)).rejects.toThrow(
      "identifier insert failed"
    );

    expect(database.beginTransaction).toHaveBeenCalledTimes(1);
    expect(database.commitTransaction).not.toHaveBeenCalled();
    expect(database.rollbackTransaction).toHaveBeenCalledTimes(1);
  });

  it("updates a person using tenant and optimistic concurrency checks", async () => {
    const database = createDatabaseMock();
    database.execute.mockResolvedValue(1);

    const person = {
      id: "person-1",
      tenantId: "tenant-a",
      firstName: "Jane",
      lastName: "Smith",
      sex: "FEMALE" as const,
      identifiers: [{ system: "MRN", value: "MRN-002" }],
      addresses: [],
      status: "ACTIVE" as const,
      createdAt: dates.created,
      updatedAt: dates.updated,
      version: 3
    };

    const repository = new SqlPersonRepository(database);

    const result = await repository.update(person);

    expect(result.version).toBe(4);
    expect(result.id).toBe(person.id);
    expect(result.tenantId).toBe(person.tenantId);

    const updateCall = database.execute.mock.calls[0];

    expect(updateCall[0]).toContain("tenant_id = @tenantId");
    expect(updateCall[0]).toContain("version = @version");
    expect(updateCall[1]).toEqual(
      expect.arrayContaining([
        { name: "id", value: "person-1" },
        { name: "tenantId", value: "tenant-a" },
        { name: "version", value: 3 },
        { name: "nextVersion", value: 4 }
      ])
    );

    expect(database.beginTransaction).toHaveBeenCalledTimes(1);
    expect(database.commitTransaction).toHaveBeenCalledTimes(1);
    expect(database.rollbackTransaction).not.toHaveBeenCalled();
  });

  it("rolls back when person optimistic concurrency fails", async () => {
    const database = createDatabaseMock();
    database.execute.mockResolvedValueOnce(0);

    const person = {
      id: "person-1",
      tenantId: "tenant-a",
      firstName: "Jane",
      lastName: "Smith",
      sex: "FEMALE" as const,
      identifiers: [],
      addresses: [],
      status: "ACTIVE" as const,
      createdAt: dates.created,
      updatedAt: dates.updated,
      version: 3
    };

    const repository = new SqlPersonRepository(database);

    await expect(repository.update(person)).rejects.toThrow(
      "Person was modified or does not exist"
    );

    expect(database.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(database.commitTransaction).not.toHaveBeenCalled();
    expect(database.execute).toHaveBeenCalledTimes(1);
  });
});

describe("SqlPatientRepository", () => {
  it("returns null for a patient outside the requested tenant", async () => {
    const database = createDatabaseMock();
    database.query.mockResolvedValueOnce({ rows: [] });

    const repository = new SqlPatientRepository(database);

    const result = await repository.findById("patient-1", "tenant-b");

    expect(result).toBeNull();

    const [sql, parameters] = database.query.mock.calls[0];

    expect(sql).toContain("tenant_id = @tenantId");
    expect(parameters).toEqual([
      { name: "id", value: "patient-1" },
      { name: "tenantId", value: "tenant-b" }
    ]);
  });

  it("maps patient communication preferences and emergency contacts", async () => {
    const database = createDatabaseMock();

    database.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: "patient-1",
            tenantId: "tenant-a",
            personId: "person-1",
            medicalRecordNumber: "MRN-001",
            patientNumber: "PAT-001",
            status: "ACTIVE",
            registrationDate: dates.registration,
            deceasedDate: null,
            preferredLanguage: "en-CA",
            preferredContactMethod: "SMS",
            createdAt: dates.created,
            updatedAt: dates.updated,
            version: 2
          }
        ]
      })
      .mockResolvedValueOnce({
        rows: [
          { personId: "person-2" },
          { personId: "person-3" }
        ]
      });

    const repository = new SqlPatientRepository(database);

    const result = await repository.findById("patient-1", "tenant-a");

    expect(result).toEqual({
      id: "patient-1",
      tenantId: "tenant-a",
      personId: "person-1",
      medicalRecordNumber: "MRN-001",
      patientNumber: "PAT-001",
      status: "ACTIVE",
      registrationDate: dates.registration,
      deceasedDate: undefined,
      communicationPreferences: {
        preferredLanguage: "en-CA",
        preferredContactMethod: "SMS"
      },
      emergencyContactPersonIds: ["person-2", "person-3"],
      createdAt: dates.created,
      updatedAt: dates.updated,
      version: 2
    });
  });

  it("creates a patient and emergency contacts transactionally", async () => {
    const database = createDatabaseMock();
    database.execute.mockResolvedValue(1);

    const patient = {
      id: "patient-1",
      tenantId: "tenant-a",
      personId: "person-1",
      medicalRecordNumber: "MRN-001",
      patientNumber: "PAT-001",
      status: "ACTIVE" as const,
      registrationDate: dates.registration,
      communicationPreferences: {
        preferredLanguage: "en-CA",
        preferredContactMethod: "SMS" as const
      },
      emergencyContactPersonIds: ["person-2", "person-3"],
      createdAt: dates.created,
      updatedAt: dates.updated,
      version: 1
    };

    const repository = new SqlPatientRepository(database);

    const result = await repository.create(patient);

    expect(result).toBe(patient);
    expect(database.beginTransaction).toHaveBeenCalledTimes(1);
    expect(database.commitTransaction).toHaveBeenCalledTimes(1);
    expect(database.rollbackTransaction).not.toHaveBeenCalled();
    expect(database.execute).toHaveBeenCalledTimes(3);
  });

  it("rolls back when patient emergency contact insertion fails", async () => {
    const database = createDatabaseMock();

    database.execute
      .mockResolvedValueOnce(1)
      .mockRejectedValueOnce(new Error("contact insert failed"));

    const patient = {
      id: "patient-1",
      tenantId: "tenant-a",
      personId: "person-1",
      medicalRecordNumber: "MRN-001",
      patientNumber: "PAT-001",
      status: "ACTIVE" as const,
      registrationDate: dates.registration,
      emergencyContactPersonIds: ["person-2"],
      createdAt: dates.created,
      updatedAt: dates.updated,
      version: 1
    };

    const repository = new SqlPatientRepository(database);

    await expect(repository.create(patient)).rejects.toThrow(
      "contact insert failed"
    );

    expect(database.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(database.commitTransaction).not.toHaveBeenCalled();
  });

  it("updates a patient with optimistic concurrency and increments version", async () => {
    const database = createDatabaseMock();
    database.execute.mockResolvedValue(1);

    const patient = {
      id: "patient-1",
      tenantId: "tenant-a",
      personId: "person-1",
      medicalRecordNumber: "MRN-001",
      patientNumber: "PAT-001",
      status: "ACTIVE" as const,
      registrationDate: dates.registration,
      emergencyContactPersonIds: ["person-2"],
      createdAt: dates.created,
      updatedAt: dates.updated,
      version: 4
    };

    const repository = new SqlPatientRepository(database);

    const result = await repository.update(patient);

    expect(result.version).toBe(5);

    const updateCall = database.execute.mock.calls[0];

    expect(updateCall[0]).toContain("tenant_id = @tenantId");
    expect(updateCall[0]).toContain("version = @version");
    expect(updateCall[1]).toEqual(
      expect.arrayContaining([
        { name: "tenantId", value: "tenant-a" },
        { name: "version", value: 4 },
        { name: "nextVersion", value: 5 }
      ])
    );

    expect(database.commitTransaction).toHaveBeenCalledTimes(1);
  });

  it("rolls back when patient optimistic concurrency fails", async () => {
    const database = createDatabaseMock();
    database.execute.mockResolvedValueOnce(0);

    const patient = {
      id: "patient-1",
      tenantId: "tenant-a",
      personId: "person-1",
      medicalRecordNumber: "MRN-001",
      patientNumber: "PAT-001",
      status: "ACTIVE" as const,
      registrationDate: dates.registration,
      emergencyContactPersonIds: [],
      createdAt: dates.created,
      updatedAt: dates.updated,
      version: 4
    };

    const repository = new SqlPatientRepository(database);

    await expect(repository.update(patient)).rejects.toThrow(
      "Patient was modified or does not exist"
    );

    expect(database.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(database.commitTransaction).not.toHaveBeenCalled();
  });
});

describe("SqlPractitionerRepository", () => {
  it("maps practitioner, licenses, and specialties", async () => {
    const database = createDatabaseMock();

    database.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: "practitioner-1",
            tenantId: "tenant-a",
            personId: "person-1",
            practitionerNumber: "PRAC-001",
            practitionerType: "PHYSICIAN",
            status: "ACTIVE",
            effectiveFrom: dates.effectiveFrom,
            effectiveUntil: dates.effectiveUntil,
            createdAt: dates.created,
            updatedAt: dates.updated,
            version: 2
          }
        ]
      })
      .mockResolvedValueOnce({
        rows: [
          {
            jurisdiction: "ON",
            licenseNumber: "LIC-001",
            issuedAt: dates.issued,
            expiresAt: dates.expires
          }
        ]
      })
      .mockResolvedValueOnce({
        rows: [
          { specialty: "Cardiology" },
          { specialty: "Internal Medicine" }
        ]
      });

    const repository = new SqlPractitionerRepository(database);

    const result = await repository.findById(
      "practitioner-1",
      "tenant-a"
    );

    expect(result).toEqual({
      id: "practitioner-1",
      tenantId: "tenant-a",
      personId: "person-1",
      practitionerNumber: "PRAC-001",
      practitionerType: "PHYSICIAN",
      status: "ACTIVE",
      effectiveFrom: dates.effectiveFrom,
      effectiveUntil: dates.effectiveUntil,
      licenses: [
        {
          jurisdiction: "ON",
          licenseNumber: "LIC-001",
          issuedAt: dates.issued,
          expiresAt: dates.expires
        }
      ],
      specialties: ["Cardiology", "Internal Medicine"],
      createdAt: dates.created,
      updatedAt: dates.updated,
      version: 2
    });

    for (const [, parameters] of database.query.mock.calls) {
      expect(parameters).toEqual([
        { name: "id", value: "practitioner-1" },
        { name: "tenantId", value: "tenant-a" }
      ]);
    }
  });

  it("creates a practitioner with the tenant ID and version", async () => {
    const database = createDatabaseMock();
    database.execute.mockResolvedValue(1);

    const practitioner = {
      id: "practitioner-1",
      tenantId: "tenant-a",
      personId: "person-1",
      practitionerNumber: "PRAC-001",
      practitionerType: "PHYSICIAN" as const,
      status: "ACTIVE" as const,
      licenses: [],
      specialties: ["Cardiology"],
      effectiveFrom: dates.effectiveFrom,
      createdAt: dates.created,
      updatedAt: dates.updated,
      version: 1
    };

    const repository = new SqlPractitionerRepository(database);

    const result = await repository.create(practitioner);

    expect(result).toBe(practitioner);

    const [sql, parameters] = database.execute.mock.calls[0];

    expect(sql).toContain("tenant_id");
    expect(parameters).toEqual(
      expect.arrayContaining([
        { name: "tenantId", value: "tenant-a" },
        { name: "version", value: 1 }
      ])
    );
  });

  it("updates a practitioner with tenant and optimistic concurrency checks", async () => {
    const database = createDatabaseMock();
    database.execute.mockResolvedValue(1);

    const practitioner = {
      id: "practitioner-1",
      tenantId: "tenant-a",
      personId: "person-1",
      practitionerNumber: "PRAC-001",
      practitionerType: "PHYSICIAN" as const,
      status: "ACTIVE" as const,
      licenses: [],
      specialties: [],
      effectiveFrom: dates.effectiveFrom,
      createdAt: dates.created,
      updatedAt: dates.updated,
      version: 2
    };

    const repository = new SqlPractitionerRepository(database);

    const result = await repository.update(practitioner);

    expect(result.version).toBe(3);

    const [sql, parameters] = database.execute.mock.calls[0];

    expect(sql).toContain("tenant_id = @tenantId");
    expect(sql).toContain("version = @version");

    expect(parameters).toEqual(
      expect.arrayContaining([
        { name: "tenantId", value: "tenant-a" },
        { name: "version", value: 2 },
        { name: "nextVersion", value: 3 }
      ])
    );
  });

  it("rejects a practitioner update when optimistic concurrency fails", async () => {
    const database = createDatabaseMock();
    database.execute.mockResolvedValue(0);

    const practitioner = {
      id: "practitioner-1",
      tenantId: "tenant-a",
      personId: "person-1",
      practitionerNumber: "PRAC-001",
      practitionerType: "PHYSICIAN" as const,
      status: "ACTIVE" as const,
      licenses: [],
      specialties: [],
      effectiveFrom: dates.effectiveFrom,
      createdAt: dates.created,
      updatedAt: dates.updated,
      version: 2
    };

    const repository = new SqlPractitionerRepository(database);

    await expect(repository.update(practitioner)).rejects.toThrow(
      "Practitioner was modified or does not exist"
    );
  });
});

describe("SqlFacilityRepository", () => {
  it("maps a facility and optional nested information correctly", async () => {
    const database = createDatabaseMock();

    database.query.mockResolvedValueOnce({
      rows: [
        {
          id: "facility-1",
          tenantId: "tenant-a",
          parentFacilityId: "facility-parent",
          facilityType: "HOSPITAL",
          code: "HOSP-001",
          name: "General Hospital",
          description: "Main hospital",
          addressLine1: "100 Hospital Road",
          addressLine2: "Building A",
          addressCity: "Ottawa",
          addressProvinceOrState: "ON",
          addressPostalCode: "K1A 0A1",
          addressCountry: "CA",
          contactEmail: "hospital@example.com",
          contactPhone: "555-1000",
          contactMobilePhone: null,
          status: "ACTIVE",
          createdAt: dates.created,
          updatedAt: dates.updated,
          version: 2
        }
      ]
    });

    const repository = new SqlFacilityRepository(database);

    const result = await repository.findById("facility-1", "tenant-a");

    expect(result).toEqual({
      id: "facility-1",
      tenantId: "tenant-a",
      parentFacilityId: "facility-parent",
      facilityType: "HOSPITAL",
      code: "HOSP-001",
      name: "General Hospital",
      description: "Main hospital",
      address: {
        line1: "100 Hospital Road",
        line2: "Building A",
        city: "Ottawa",
        provinceOrState: "ON",
        postalCode: "K1A 0A1",
        country: "CA"
      },
      contactInformation: {
        email: "hospital@example.com",
        phone: "555-1000",
        mobilePhone: undefined
      },
      status: "ACTIVE",
      createdAt: dates.created,
      updatedAt: dates.updated,
      version: 2
    });

    const [sql, parameters] = database.query.mock.calls[0];

    expect(sql).toContain("tenant_id = @tenantId");
    expect(parameters).toEqual([
      { name: "id", value: "facility-1" },
      { name: "tenantId", value: "tenant-a" }
    ]);
  });

  it("creates a facility with tenant-scoped parameters", async () => {
    const database = createDatabaseMock();
    database.execute.mockResolvedValue(1);

    const facility = {
      id: "facility-1",
      tenantId: "tenant-a",
      facilityType: "CLINIC" as const,
      code: "CLINIC-001",
      name: "Primary Care Clinic",
      status: "ACTIVE" as const,
      createdAt: dates.created,
      updatedAt: dates.updated,
      version: 1
    };

    const repository = new SqlFacilityRepository(database);

    const result = await repository.create(facility);

    expect(result).toBe(facility);

    const [sql, parameters] = database.execute.mock.calls[0];

    expect(sql).toContain("tenant_id");
    expect(parameters).toEqual(
      expect.arrayContaining([
        { name: "tenantId", value: "tenant-a" },
        { name: "id", value: "facility-1" },
        { name: "version", value: 1 }
      ])
    );
  });

  it("updates a facility with tenant and optimistic concurrency checks", async () => {
    const database = createDatabaseMock();
    database.execute.mockResolvedValue(1);

    const facility = {
      id: "facility-1",
      tenantId: "tenant-a",
      facilityType: "CLINIC" as const,
      code: "CLINIC-001",
      name: "Updated Clinic",
      status: "ACTIVE" as const,
      createdAt: dates.created,
      updatedAt: dates.updated,
      version: 5
    };

    const repository = new SqlFacilityRepository(database);

    const result = await repository.update(facility);

    expect(result.version).toBe(6);

    const [sql, parameters] = database.execute.mock.calls[0];

    expect(sql).toContain("tenant_id = @tenantId");
    expect(sql).toContain("version = @version");

    expect(parameters).toEqual(
      expect.arrayContaining([
        { name: "tenantId", value: "tenant-a" },
        { name: "version", value: 5 },
        { name: "nextVersion", value: 6 }
      ])
    );
  });

  it("rejects a facility update when optimistic concurrency fails", async () => {
    const database = createDatabaseMock();
    database.execute.mockResolvedValue(0);

    const facility = {
      id: "facility-1",
      tenantId: "tenant-a",
      facilityType: "CLINIC" as const,
      code: "CLINIC-001",
      name: "Updated Clinic",
      status: "ACTIVE" as const,
      createdAt: dates.created,
      updatedAt: dates.updated,
      version: 5
    };

    const repository = new SqlFacilityRepository(database);

    await expect(repository.update(facility)).rejects.toThrow(
      "Facility was modified or does not exist"
    );
  });
});

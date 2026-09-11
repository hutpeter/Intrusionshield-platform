import { describe, expect, it } from "@jest/globals";
import {
  createFacility,
  createPatient,
  createPerson,
  createPractitioner
} from "@intrusionshield/his";

const tenantId = "11111111-1111-1111-1111-111111111111";

describe("HIS domain entities", () => {
  describe("Person", () => {
    it("creates a valid person", () => {
      const person = createPerson({
        id: "22222222-2222-2222-2222-222222222222",
        tenantId,
        version: 1,
        firstName: "John",
        lastName: "Smith",
        sex: "MALE",
        identifiers: [
          {
            system: "MRN",
            value: "MRN-1001"
          }
        ],
        addresses: []
      });

      expect(person.firstName).toBe("John");
      expect(person.lastName).toBe("Smith");
      expect(person.tenantId).toBe(tenantId);
      expect(person.version).toBe(1);
    });

    it("rejects a missing first name", () => {
      expect(() =>
        createPerson({
          id: "22222222-2222-2222-2222-222222222222",
          tenantId,
          version: 1,
          firstName: " ",
          lastName: "Smith",
          sex: "MALE",
          identifiers: [],
          addresses: []
        })
      ).toThrow("firstName is required");
    });

    it("rejects a missing last name", () => {
      expect(() =>
        createPerson({
          id: "22222222-2222-2222-2222-222222222222",
          tenantId,
          version: 1,
          firstName: "John",
          lastName: " ",
          sex: "MALE",
          identifiers: [],
          addresses: []
        })
      ).toThrow("lastName is required");
    });

    it("rejects invalid identifiers", () => {
      expect(() =>
        createPerson({
          id: "22222222-2222-2222-2222-222222222222",
          tenantId,
          version: 1,
          firstName: "John",
          lastName: "Smith",
          sex: "MALE",
          identifiers: [
            {
              system: "",
              value: "MRN-1001"
            }
          ],
          addresses: []
        })
      ).toThrow("person identifiers require system and value");
    });

    it("returns a frozen entity", () => {
      const person = createPerson({
        id: "22222222-2222-2222-2222-222222222222",
        tenantId,
        version: 1,
        firstName: "John",
        lastName: "Smith",
        sex: "MALE",
        identifiers: [],
        addresses: []
      });

      expect(Object.isFrozen(person)).toBe(true);
    });
  });

  describe("Patient", () => {
    it("creates a valid patient", () => {
      const patient = createPatient({
        id: "33333333-3333-3333-3333-333333333333",
        tenantId,
        version: 1,
        personId: "22222222-2222-2222-2222-222222222222",
        medicalRecordNumber: "MRN-1001",
        patientNumber: "PAT-1001",
        status: "ACTIVE",
        registrationDate: new Date("2026-01-01T00:00:00.000Z"),
        emergencyContactPersonIds: []
      });

      expect(patient.personId).toBe(
        "22222222-2222-2222-2222-222222222222"
      );
      expect(patient.medicalRecordNumber).toBe("MRN-1001");
      expect(patient.patientNumber).toBe("PAT-1001");
    });

    it("rejects a missing person id", () => {
      expect(() =>
        createPatient({
          id: "33333333-3333-3333-3333-333333333333",
          tenantId,
          version: 1,
          personId: " ",
          medicalRecordNumber: "MRN-1001",
          patientNumber: "PAT-1001",
          status: "ACTIVE",
          registrationDate: new Date("2026-01-01T00:00:00.000Z"),
          emergencyContactPersonIds: []
        })
      ).toThrow("personId is required");
    });

    it("rejects a missing medical record number", () => {
      expect(() =>
        createPatient({
          id: "33333333-3333-3333-3333-333333333333",
          tenantId,
          version: 1,
          personId: "22222222-2222-2222-2222-222222222222",
          medicalRecordNumber: " ",
          patientNumber: "PAT-1001",
          status: "ACTIVE",
          registrationDate: new Date("2026-01-01T00:00:00.000Z"),
          emergencyContactPersonIds: []
        })
      ).toThrow("medicalRecordNumber is required");
    });

    it("rejects a missing patient number", () => {
      expect(() =>
        createPatient({
          id: "33333333-3333-3333-3333-333333333333",
          tenantId,
          version: 1,
          personId: "22222222-2222-2222-2222-222222222222",
          medicalRecordNumber: "MRN-1001",
          patientNumber: " ",
          status: "ACTIVE",
          registrationDate: new Date("2026-01-01T00:00:00.000Z"),
          emergencyContactPersonIds: []
        })
      ).toThrow("patientNumber is required");
    });

    it("rejects a future registration date", () => {
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000);

      expect(() =>
        createPatient({
          id: "33333333-3333-3333-3333-333333333333",
          tenantId,
          version: 1,
          personId: "22222222-2222-2222-2222-222222222222",
          medicalRecordNumber: "MRN-1001",
          patientNumber: "PAT-1001",
          status: "ACTIVE",
          registrationDate: futureDate,
          emergencyContactPersonIds: []
        })
      ).toThrow("registrationDate cannot be in the future");
    });
  });

  describe("Practitioner", () => {
    it("creates a valid practitioner", () => {
      const practitioner = createPractitioner({
        id: "44444444-4444-4444-4444-444444444444",
        tenantId,
        version: 1,
        personId: "22222222-2222-2222-2222-222222222222",
        practitionerNumber: "PRAC-1001",
        practitionerType: "PHYSICIAN",
        status: "ACTIVE",
        licenses: [],
        specialties: ["CARDIOLOGY"],
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z")
      });

      expect(practitioner.personId).toBe(
        "22222222-2222-2222-2222-222222222222"
      );
      expect(practitioner.practitionerNumber).toBe("PRAC-1001");
      expect(practitioner.practitionerType).toBe("PHYSICIAN");
    });

    it("rejects a missing person id", () => {
      expect(() =>
        createPractitioner({
          id: "44444444-4444-4444-4444-444444444444",
          tenantId,
          version: 1,
          personId: " ",
          practitionerNumber: "PRAC-1001",
          practitionerType: "PHYSICIAN",
          status: "ACTIVE",
          licenses: [],
          specialties: [],
          effectiveFrom: new Date("2026-01-01T00:00:00.000Z")
        })
      ).toThrow("personId is required");
    });

    it("rejects a missing practitioner number", () => {
      expect(() =>
        createPractitioner({
          id: "44444444-4444-4444-4444-444444444444",
          tenantId,
          version: 1,
          personId: "22222222-2222-2222-2222-222222222222",
          practitionerNumber: " ",
          practitionerType: "PHYSICIAN",
          status: "ACTIVE",
          licenses: [],
          specialties: [],
          effectiveFrom: new Date("2026-01-01T00:00:00.000Z")
        })
      ).toThrow("practitionerNumber is required");
    });

    it("rejects an invalid effective date range", () => {
      const effectiveFrom = new Date("2026-06-01T00:00:00.000Z");
      const effectiveUntil = new Date("2026-05-01T00:00:00.000Z");

      expect(() =>
        createPractitioner({
          id: "44444444-4444-4444-4444-444444444444",
          tenantId,
          version: 1,
          personId: "22222222-2222-2222-2222-222222222222",
          practitionerNumber: "PRAC-1001",
          practitionerType: "PHYSICIAN",
          status: "ACTIVE",
          licenses: [],
          specialties: [],
          effectiveFrom,
          effectiveUntil
        })
      ).toThrow("effectiveUntil must be after effectiveFrom");
    });
  });

  describe("Facility", () => {
    it("creates a valid facility", () => {
      const facility = createFacility({
        id: "55555555-5555-5555-5555-555555555555",
        tenantId,
        version: 1,
        facilityType: "HOSPITAL",
        code: "HOSP-001",
        name: "General Hospital",
        status: "ACTIVE"
      });

      expect(facility.code).toBe("HOSP-001");
      expect(facility.name).toBe("General Hospital");
      expect(facility.facilityType).toBe("HOSPITAL");
    });

    it("rejects a missing facility code", () => {
      expect(() =>
        createFacility({
          id: "55555555-5555-5555-5555-555555555555",
          tenantId,
          version: 1,
          facilityType: "HOSPITAL",
          code: " ",
          name: "General Hospital",
          status: "ACTIVE"
        })
      ).toThrow("code is required");
    });

    it("rejects a missing facility name", () => {
      expect(() =>
        createFacility({
          id: "55555555-5555-5555-5555-555555555555",
          tenantId,
          version: 1,
          facilityType: "HOSPITAL",
          code: "HOSP-001",
          name: " ",
          status: "ACTIVE"
        })
      ).toThrow("name is required");
    });

    it("rejects a facility from being its own parent", () => {
      const facilityId = "55555555-5555-5555-5555-555555555555";

      expect(() =>
        createFacility({
          id: facilityId,
          tenantId,
          version: 1,
          parentFacilityId: facilityId,
          facilityType: "UNIT",
          code: "UNIT-001",
          name: "Unit 1",
          status: "ACTIVE"
        })
      ).toThrow("facility cannot be its own parent");
    });
  });
});
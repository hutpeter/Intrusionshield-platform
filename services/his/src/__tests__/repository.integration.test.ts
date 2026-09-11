import { randomUUID } from "node:crypto";

import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it
} from "@jest/globals";

import { getDatabaseConfiguration } from "@intrusionshield/config";
import type { IDatabaseProvider } from "@intrusionshield/database";
import { SqlServerProvider } from "@intrusionshield/database";

import type {
  Facility,
  Patient,
  Person,
  Practitioner
} from "@intrusionshield/his";

import { SqlPersonRepository } from "../infrastructure/repositories/PersonRepository.js";
import { SqlPatientRepository } from "../infrastructure/repositories/PatientRepository.js";
import { SqlPractitionerRepository } from "../infrastructure/repositories/PractitionerRepository.js";
import { SqlFacilityRepository } from "../infrastructure/repositories/FacilityRepository.js";

const integrationEnabled =
  process.env.HIS_INTEGRATION_TESTS === "true";

const describeIntegration =
  integrationEnabled ? describe : describe.skip;

describeIntegration(
  "HIS repository integration tests against SQL Server",
  () => {
    let database: IDatabaseProvider;

    let personRepository: SqlPersonRepository;
    let patientRepository: SqlPatientRepository;
    let practitionerRepository: SqlPractitionerRepository;
    let facilityRepository: SqlFacilityRepository;

    const tenantA = randomUUID();
    const tenantB = randomUUID();

    const personAId = randomUUID();
    const personBId = randomUUID();

    const patientId = randomUUID();
    const practitionerId = randomUUID();
    const facilityId = randomUUID();

    let emergencyContactId: string;

    beforeAll(async () => {
      const configuration = getDatabaseConfiguration();

      if (!configuration.username) {
        throw new Error(
          "DB_USERNAME or DB_USER must be supplied for HIS integration tests."
        );
      }

      if (!configuration.password) {
        throw new Error(
          "DB_PASSWORD must be supplied for HIS integration tests."
        );
      }

      database = new SqlServerProvider({
        server: configuration.server,
        port: configuration.port,
        database: configuration.database,
        user: configuration.username,
        password: configuration.password,
        encrypt: configuration.encrypt,
        trustServerCertificate:
          configuration.trustServerCertificate
      });

      await database.connect();

      personRepository =
        new SqlPersonRepository(database);

      patientRepository =
        new SqlPatientRepository(database);

      practitionerRepository =
        new SqlPractitionerRepository(database);

      facilityRepository =
        new SqlFacilityRepository(database);
    });

    afterAll(async () => {
      if (!database || !database.isConnected()) {
        return;
      }

      try {
        await database.execute(
          `DELETE FROM HIS.PatientEmergencyContacts
           WHERE tenant_id IN (@tenantA, @tenantB)`,
          [
            { name: "tenantA", value: tenantA },
            { name: "tenantB", value: tenantB }
          ]
        );

        await database.execute(
          `DELETE FROM HIS.PractitionerLicenses
           WHERE tenant_id IN (@tenantA, @tenantB)`,
          [
            { name: "tenantA", value: tenantA },
            { name: "tenantB", value: tenantB }
          ]
        );

        await database.execute(
          `DELETE FROM HIS.PractitionerSpecialties
           WHERE tenant_id IN (@tenantA, @tenantB)`,
          [
            { name: "tenantA", value: tenantA },
            { name: "tenantB", value: tenantB }
          ]
        );

        await database.execute(
          `DELETE FROM HIS.PersonIdentifiers
           WHERE tenant_id IN (@tenantA, @tenantB)`,
          [
            { name: "tenantA", value: tenantA },
            { name: "tenantB", value: tenantB }
          ]
        );

        await database.execute(
          `DELETE FROM HIS.PersonAddresses
           WHERE tenant_id IN (@tenantA, @tenantB)`,
          [
            { name: "tenantA", value: tenantA },
            { name: "tenantB", value: tenantB }
          ]
        );

        await database.execute(
          `DELETE FROM HIS.Patients
           WHERE tenant_id IN (@tenantA, @tenantB)`,
          [
            { name: "tenantA", value: tenantA },
            { name: "tenantB", value: tenantB }
          ]
        );

        await database.execute(
          `DELETE FROM HIS.Practitioners
           WHERE tenant_id IN (@tenantA, @tenantB)`,
          [
            { name: "tenantA", value: tenantA },
            { name: "tenantB", value: tenantB }
          ]
        );

        await database.execute(
          `DELETE FROM HIS.Facilities
           WHERE tenant_id IN (@tenantA, @tenantB)`,
          [
            { name: "tenantA", value: tenantA },
            { name: "tenantB", value: tenantB }
          ]
        );

        await database.execute(
          `DELETE FROM HIS.Persons
           WHERE tenant_id IN (@tenantA, @tenantB)`,
          [
            { name: "tenantA", value: tenantA },
            { name: "tenantB", value: tenantB }
          ]
        );
      } finally {
        await database.disconnect();
      }
    });

    it(
      "creates and reads a Person with identifiers, address, and contact information",
      async () => {
        const now = new Date();

        const person: Person = {
          id: personAId,
          tenantId: tenantA,
          firstName: "Alice",
          middleName: "Marie",
          lastName: "Integration",
          preferredName: "Ali",
          dateOfBirth:
            new Date("1990-05-15T00:00:00.000Z"),
          sex: "FEMALE",
          gender: "Female",
          identifiers: [
            {
              system: "health-card",
              value: "INT-HC-001"
            }
          ],
          contactInformation: {
            email: "alice.integration@example.com",
            phone: "555-0100",
            mobilePhone: "555-0101"
          },
          addresses: [
            {
              line1: "100 Main Street",
              city: "Ottawa",
              provinceOrState: "Ontario",
              postalCode: "K1A 0A1",
              country: "Canada"
            }
          ],
          status: "ACTIVE",
          createdAt: now,
          updatedAt: now,
          version: 1
        };

        await personRepository.create(person);

        const loaded =
          await personRepository.findById(
            personAId,
            tenantA
          );

        expect(loaded).not.toBeNull();
        expect(loaded?.id).toBe(personAId);
        expect(loaded?.tenantId).toBe(tenantA);
        expect(loaded?.firstName).toBe("Alice");
        expect(loaded?.middleName).toBe("Marie");
        expect(loaded?.lastName).toBe("Integration");
        expect(loaded?.preferredName).toBe("Ali");
        expect(loaded?.sex).toBe("FEMALE");
        expect(loaded?.gender).toBe("Female");

        expect(loaded?.identifiers).toEqual([
          {
            system: "health-card",
            value: "INT-HC-001"
          }
        ]);

        expect(loaded?.contactInformation).toEqual({
          email: "alice.integration@example.com",
          phone: "555-0100",
          mobilePhone: "555-0101"
        });

        expect(loaded?.addresses).toEqual([
          {
            line1: "100 Main Street",
            city: "Ottawa",
            provinceOrState: "Ontario",
            postalCode: "K1A 0A1",
            country: "Canada"
          }
        ]);
      }
    );

    it(
      "updates a Person and replaces identifiers and addresses",
      async () => {
        const loaded =
          await personRepository.findById(
            personAId,
            tenantA
          );

        expect(loaded).not.toBeNull();

        const updated =
          await personRepository.update({
            ...loaded!,
            firstName: "Alicia",
            preferredName: "Lia",
            identifiers: [
              {
                system: "health-card",
                value: "INT-HC-002"
              }
            ],
            addresses: [
              {
                line1: "200 Queen Street",
                line2: "Suite 400",
                city: "Ottawa",
                provinceOrState: "Ontario",
                postalCode: "K1P 1J1",
                country: "Canada"
              }
            ],
            updatedAt: new Date()
          });

        expect(updated.version).toBe(2);

        const reloaded =
          await personRepository.findById(
            personAId,
            tenantA
          );

        expect(reloaded?.firstName).toBe("Alicia");
        expect(reloaded?.preferredName).toBe("Lia");

        expect(reloaded?.identifiers).toEqual([
          {
            system: "health-card",
            value: "INT-HC-002"
          }
        ]);

        expect(reloaded?.addresses).toEqual([
          {
            line1: "200 Queen Street",
            line2: "Suite 400",
            city: "Ottawa",
            provinceOrState: "Ontario",
            postalCode: "K1P 1J1",
            country: "Canada"
          }
        ]);
      }
    );

    it(
      "enforces tenant isolation for Person reads",
      async () => {
        const now = new Date();

        const personB: Person = {
          id: personBId,
          tenantId: tenantB,
          firstName: "Bob",
          lastName: "Tenant",
          sex: "MALE",
          identifiers: [],
          addresses: [],
          status: "ACTIVE",
          createdAt: now,
          updatedAt: now,
          version: 1
        };

        await personRepository.create(personB);

        const tenantAResult =
          await personRepository.findById(
            personBId,
            tenantA
          );

        const tenantBResult =
          await personRepository.findById(
            personBId,
            tenantB
          );

        expect(tenantAResult).toBeNull();
        expect(tenantBResult).not.toBeNull();
        expect(tenantBResult?.tenantId).toBe(
          tenantB
        );
      }
    );

    it(
      "creates, reads, and updates a Patient with emergency contacts",
      async () => {
        emergencyContactId = randomUUID();

        const now = new Date();

        const emergencyContact: Person = {
          id: emergencyContactId,
          tenantId: tenantA,
          firstName: "Emergency",
          lastName: "Contact",
          sex: "UNKNOWN",
          identifiers: [],
          addresses: [],
          status: "ACTIVE",
          createdAt: now,
          updatedAt: now,
          version: 1
        };

        await personRepository.create(
          emergencyContact
        );

        const patient: Patient = {
          id: patientId,
          tenantId: tenantA,
          personId: personAId,
          medicalRecordNumber:
            "INT-PATIENT-MRN",
          patientNumber:
            "INT-PATIENT-001",
          status: "ACTIVE",
          registrationDate: now,
          communicationPreferences: {
            preferredLanguage: "en",
            preferredContactMethod: "EMAIL"
          },
          emergencyContactPersonIds: [
            emergencyContactId
          ],
          createdAt: now,
          updatedAt: now,
          version: 1
        };

        await patientRepository.create(patient);

        const loaded =
          await patientRepository.findById(
            patientId,
            tenantA
          );

        expect(loaded).not.toBeNull();

        expect(
          loaded?.medicalRecordNumber
        ).toBe("INT-PATIENT-MRN");

        expect(
          loaded?.patientNumber
        ).toBe("INT-PATIENT-001");

        expect(
          loaded?.communicationPreferences
        ).toEqual({
          preferredLanguage: "en",
          preferredContactMethod: "EMAIL"
        });

        expect(
          loaded?.emergencyContactPersonIds
        ).toEqual([emergencyContactId]);

        const updated =
          await patientRepository.update({
            ...loaded!,
            patientNumber:
              "INT-PATIENT-002",
            status: "INACTIVE",
            emergencyContactPersonIds: [],
            updatedAt: new Date()
          });

        expect(updated.version).toBe(2);

        const reloaded =
          await patientRepository.findById(
            patientId,
            tenantA
          );

        expect(
          reloaded?.patientNumber
        ).toBe("INT-PATIENT-002");

        expect(reloaded?.status).toBe(
          "INACTIVE"
        );

        expect(
          reloaded?.emergencyContactPersonIds
        ).toEqual([]);
      }
    );

    it(
      "creates, reads, and updates a Practitioner with licenses and specialties",
      async () => {
        const now = new Date();

        const practitioner: Practitioner = {
          id: practitionerId,
          tenantId: tenantA,
          personId: personAId,
          practitionerNumber:
            "INT-PRACT-001",
          practitionerType: "PHYSICIAN",
          status: "ACTIVE",
          licenses: [
            {
              jurisdiction: "Ontario",
              licenseNumber:
                "INT-LIC-001",
              issuedAt:
                new Date(
                  "2025-01-01T00:00:00.000Z"
                ),
              expiresAt:
                new Date(
                  "2027-01-01T00:00:00.000Z"
                )
            }
          ],
          specialties: [
            "Internal Medicine",
            "Emergency Medicine"
          ],
          effectiveFrom:
            new Date(
              "2025-01-01T00:00:00.000Z"
            ),
          effectiveUntil:
            new Date(
              "2030-12-31T00:00:00.000Z"
            ),
          createdAt: now,
          updatedAt: now,
          version: 1
        };

        await practitionerRepository.create(
          practitioner
        );

        const loaded =
          await practitionerRepository.findById(
            practitionerId,
            tenantA
          );

        expect(loaded).not.toBeNull();

        expect(
          loaded?.practitionerNumber
        ).toBe("INT-PRACT-001");

        expect(
          loaded?.licenses
        ).toEqual([
          {
            jurisdiction: "Ontario",
            licenseNumber:
              "INT-LIC-001",
            issuedAt:
              new Date(
                "2025-01-01T00:00:00.000Z"
              ),
            expiresAt:
              new Date(
                "2027-01-01T00:00:00.000Z"
              )
          }
        ]);

        expect(
          loaded?.specialties
        ).toEqual([
          "Emergency Medicine",
          "Internal Medicine"
        ]);

        const updated =
          await practitionerRepository.update({
            ...loaded!,
            practitionerNumber:
              "INT-PRACT-002",
            specialties: ["Cardiology"],
            licenses: [
              {
                jurisdiction: "Ontario",
                licenseNumber:
                  "INT-LIC-002",
                issuedAt:
                  new Date(
                    "2026-01-01T00:00:00.000Z"
                  ),
                expiresAt:
                  new Date(
                    "2028-01-01T00:00:00.000Z"
                  )
              }
            ],
            updatedAt: new Date()
          });

        expect(updated.version).toBe(2);

        const reloaded =
          await practitionerRepository.findById(
            practitionerId,
            tenantA
          );

        expect(
          reloaded?.practitionerNumber
        ).toBe("INT-PRACT-002");

        expect(reloaded?.licenses).toHaveLength(
          1
        );

        expect(
          reloaded?.licenses[0]
        ).toEqual({
          jurisdiction: "Ontario",
          licenseNumber: "INT-LIC-002",
          issuedAt:
            new Date(
              "2026-01-01T00:00:00.000Z"
            ),
          expiresAt:
            new Date(
              "2028-01-01T00:00:00.000Z"
            )
        });

        expect(
          reloaded?.specialties
        ).toEqual(["Cardiology"]);
      }
    );

    it(
      "creates, reads, and updates a Facility including complete address round-trip",
      async () => {
        const now = new Date();

        const facility: Facility = {
          id: facilityId,
          tenantId: tenantA,
          facilityType: "HOSPITAL",
          code: "INT-FAC-001",
          name: "Integration Hospital",
          description:
            "HIS integration test facility",
          address: {
            line1: "500 Hospital Road",
            line2: "Building A",
            city: "Ottawa",
            provinceOrState: "Ontario",
            postalCode: "K1G 5W1",
            country: "Canada"
          },
          contactInformation: {
            email:
              "hospital.integration@example.com",
            phone: "555-0200",
            mobilePhone: "555-0201"
          },
          status: "ACTIVE",
          createdAt: now,
          updatedAt: now,
          version: 1
        };

        await facilityRepository.create(
          facility
        );

        const loaded =
          await facilityRepository.findById(
            facilityId,
            tenantA
          );

        expect(loaded).not.toBeNull();
        expect(loaded?.code).toBe(
          "INT-FAC-001"
        );
        expect(loaded?.name).toBe(
          "Integration Hospital"
        );

        expect(loaded?.address).toEqual({
          line1: "500 Hospital Road",
          line2: "Building A",
          city: "Ottawa",
          provinceOrState: "Ontario",
          postalCode: "K1G 5W1",
          country: "Canada"
        });

        expect(
          loaded?.contactInformation
        ).toEqual({
          email:
            "hospital.integration@example.com",
          phone: "555-0200",
          mobilePhone: "555-0201"
        });

        const updated =
          await facilityRepository.update({
            ...loaded!,
            name: "Updated Integration Hospital",
            description:
              "Updated HIS integration facility",
            updatedAt: new Date()
          });

        expect(updated.version).toBe(2);

        const reloaded =
          await facilityRepository.findById(
            facilityId,
            tenantA
          );

        expect(reloaded?.name).toBe(
          "Updated Integration Hospital"
        );

        expect(
          reloaded?.description
        ).toBe(
          "Updated HIS integration facility"
        );
      }
    );

    it(
      "enforces optimistic concurrency for Person updates",
      async () => {
        const loaded =
          await personRepository.findById(
            personAId,
            tenantA
          );

        expect(loaded).not.toBeNull();

        const staleVersion = {
          ...loaded!,
          version: 1,
          firstName: "Stale"
        };

        await expect(
          personRepository.update(
            staleVersion
          )
        ).rejects.toThrow(
          "Person was modified or does not exist"
        );
      }
    );

    it(
      "enforces tenant isolation across Patient, Practitioner, and Facility",
      async () => {
        const patientFromOtherTenant =
          await patientRepository.findById(
            patientId,
            tenantB
          );

        const practitionerFromOtherTenant =
          await practitionerRepository.findById(
            practitionerId,
            tenantB
          );

        const facilityFromOtherTenant =
          await facilityRepository.findById(
            facilityId,
            tenantB
          );

        expect(
          patientFromOtherTenant
        ).toBeNull();

        expect(
          practitionerFromOtherTenant
        ).toBeNull();

        expect(
          facilityFromOtherTenant
        ).toBeNull();
      }
    );
  }
);

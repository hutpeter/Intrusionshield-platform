import { randomUUID } from "node:crypto";

import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it
} from "@jest/globals";

import {
  getDatabaseConfiguration
} from "@intrusionshield/config";

import type {
  IDatabaseProvider
} from "@intrusionshield/database";

import {
  SqlServerProvider
} from "@intrusionshield/database";

import type {
  Patient,
  Person,
  Practitioner
} from "@intrusionshield/his";

import {
  SqlPatientRepository
} from "../infrastructure/repositories/PatientRepository.js";

import {
  SqlPersonRepository
} from "../infrastructure/repositories/PersonRepository.js";

import {
  SqlPractitionerRepository
} from "../infrastructure/repositories/PractitionerRepository.js";

const integrationEnabled =
  process.env.HIS_INTEGRATION_TESTS === "true";

const describeIntegration =
  integrationEnabled
    ? describe
    : describe.skip;

describeIntegration(
  "HIS Person list integration tests against SQL Server",
  () => {
    let database: IDatabaseProvider;

    let personRepository:
      SqlPersonRepository;

    let patientRepository:
      SqlPatientRepository;

    let practitionerRepository:
      SqlPractitionerRepository;

    const tenantA = randomUUID();
    const tenantB = randomUUID();

    /*
     * Keep role-derivation records in their own tenant
     * so they do not alter the totals expected by the
     * existing pagination/search tests.
     */
    const roleTenant = randomUUID();

    const uniqueToken =
      randomUUID()
        .replaceAll("-", "")
        .slice(0, 12)
        .toUpperCase();

    const createTestPerson = (
      tenantId: string,
      firstName: string,
      lastName: string,
      status: Person["status"],
      identifier: string
    ): Person => {
      const now = new Date();

      return {
        id: randomUUID(),
        tenantId,
        firstName,
        lastName,
        sex: "UNKNOWN",
        identifiers: [
          {
            system: "MRN",
            value: identifier
          }
        ],
        addresses: [],
        status,
        createdAt: now,
        updatedAt: now,
        version: 1
      };
    };

    const createTestPatient = (
      tenantId: string,
      personId: string,
      sequence: string
    ): Patient => {
      const now = new Date();

      return {
        id: randomUUID(),
        tenantId,
        personId,
        medicalRecordNumber:
          `ROLE-MRN-${uniqueToken}-${sequence}`,
        patientNumber:
          `ROLE-PAT-${uniqueToken}-${sequence}`,
        status: "ACTIVE",
        registrationDate: now,
        emergencyContactPersonIds: [],
        createdAt: now,
        updatedAt: now,
        version: 1
      };
    };

    const createTestPractitioner = (
      tenantId: string,
      personId: string,
      sequence: string
    ): Practitioner => {
      const now = new Date();

      return {
        id: randomUUID(),
        tenantId,
        personId,
        practitionerNumber:
          `ROLE-PRAC-${uniqueToken}-${sequence}`,
        practitionerType: "PHYSICIAN",
        status: "ACTIVE",
        licenses: [],
        specialties: [],
        effectiveFrom: now,
        createdAt: now,
        updatedAt: now,
        version: 1
      };
    };

    let personOnlyId: string;
    let patientOnlyPersonId: string;
    let practitionerOnlyPersonId: string;
    let patientPractitionerPersonId: string;

    beforeAll(async () => {
      const configuration =
        getDatabaseConfiguration();

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

      /*
       * Existing Person-list test data.
       */
      await personRepository.create(
        createTestPerson(
          tenantA,
          "Alice",
          "Alpha",
          "ACTIVE",
          `ATHENA-${uniqueToken}-001`
        )
      );

      await personRepository.create(
        createTestPerson(
          tenantA,
          "Benjamin",
          "Bravo",
          "ACTIVE",
          `ATHENA-${uniqueToken}-002`
        )
      );

      await personRepository.create(
        createTestPerson(
          tenantA,
          "Charlotte",
          "Charlie",
          "INACTIVE",
          `ATHENA-${uniqueToken}-003`
        )
      );

      await personRepository.create(
        createTestPerson(
          tenantA,
          "Daniel",
          "Delta",
          "DECEASED",
          `ATHENA-${uniqueToken}-004`
        )
      );

      await personRepository.create(
        createTestPerson(
          tenantA,
          "Evelyn",
          "Echo",
          "ACTIVE",
          `ATHENA-${uniqueToken}-005`
        )
      );

      /*
       * Create another Person in another tenant
       * containing the same searchable token.
       *
       * This validates that collection searches
       * cannot leak records across tenants.
       */
      await personRepository.create(
        createTestPerson(
          tenantB,
          "External",
          "Tenant",
          "ACTIVE",
          `ATHENA-${uniqueToken}-OTHER`
        )
      );

      /*
       * -------------------------------------------------
       * Role derivation fixtures
       * -------------------------------------------------
       *
       * These records deliberately live in roleTenant
       * rather than tenantA so the original list tests
       * remain deterministic.
       */

      const personOnly =
        createTestPerson(
          roleTenant,
          "Person",
          "Only",
          "ACTIVE",
          `ROLE-${uniqueToken}-PERSON`
        );

      const patientOnlyPerson =
        createTestPerson(
          roleTenant,
          "Patient",
          "Only",
          "ACTIVE",
          `ROLE-${uniqueToken}-PATIENT`
        );

      const practitionerOnlyPerson =
        createTestPerson(
          roleTenant,
          "Practitioner",
          "Only",
          "ACTIVE",
          `ROLE-${uniqueToken}-PRACTITIONER`
        );

      const patientPractitionerPerson =
        createTestPerson(
          roleTenant,
          "Dual",
          "Role",
          "ACTIVE",
          `ROLE-${uniqueToken}-DUAL`
        );

      personOnlyId = personOnly.id;

      patientOnlyPersonId =
        patientOnlyPerson.id;

      practitionerOnlyPersonId =
        practitionerOnlyPerson.id;

      patientPractitionerPersonId =
        patientPractitionerPerson.id;

      await personRepository.create(
        personOnly
      );

      await personRepository.create(
        patientOnlyPerson
      );

      await personRepository.create(
        practitionerOnlyPerson
      );

      await personRepository.create(
        patientPractitionerPerson
      );

      /*
       * Patient-only Person.
       */
      await patientRepository.create(
        createTestPatient(
          roleTenant,
          patientOnlyPerson.id,
          "001"
        )
      );

      /*
       * Practitioner-only Person.
       */
      await practitionerRepository.create(
        createTestPractitioner(
          roleTenant,
          practitionerOnlyPerson.id,
          "001"
        )
      );

      /*
       * Dual-role Person.
       */
      await patientRepository.create(
        createTestPatient(
          roleTenant,
          patientPractitionerPerson.id,
          "002"
        )
      );

      await practitionerRepository.create(
        createTestPractitioner(
          roleTenant,
          patientPractitionerPerson.id,
          "002"
        )
      );
    });

    afterAll(async () => {
      if (!database) {
        return;
      }

      /*
       * Remove relationship/domain records first
       * because they reference HIS.Persons.
       */
      await database.execute(
        `DELETE FROM HIS.PatientEmergencyContacts
         WHERE tenant_id = @tenantId`,
        [
          {
            name: "tenantId",
            value: roleTenant
          }
        ]
      );

      await database.execute(
        `DELETE FROM HIS.PractitionerLicenses
         WHERE tenant_id = @tenantId`,
        [
          {
            name: "tenantId",
            value: roleTenant
          }
        ]
      );

      await database.execute(
        `DELETE FROM HIS.PractitionerSpecialties
         WHERE tenant_id = @tenantId`,
        [
          {
            name: "tenantId",
            value: roleTenant
          }
        ]
      );

      await database.execute(
        `DELETE FROM HIS.Patients
         WHERE tenant_id = @tenantId`,
        [
          {
            name: "tenantId",
            value: roleTenant
          }
        ]
      );

      await database.execute(
        `DELETE FROM HIS.Practitioners
         WHERE tenant_id = @tenantId`,
        [
          {
            name: "tenantId",
            value: roleTenant
          }
        ]
      );

      /*
       * Remove Person-owned child records and
       * Persons for every test tenant.
       */
      for (const tenantId of [
        tenantA,
        tenantB,
        roleTenant
      ]) {
        await database.execute(
          `DELETE FROM HIS.PersonIdentifiers
           WHERE tenant_id = @tenantId`,
          [
            {
              name: "tenantId",
              value: tenantId
            }
          ]
        );

        await database.execute(
          `DELETE FROM HIS.PersonAddresses
           WHERE tenant_id = @tenantId`,
          [
            {
              name: "tenantId",
              value: tenantId
            }
          ]
        );

        await database.execute(
          `DELETE FROM HIS.Persons
           WHERE tenant_id = @tenantId`,
          [
            {
              name: "tenantId",
              value: tenantId
            }
          ]
        );
      }

      await database.disconnect();
    });

    it(
      "returns paginated Persons with correct totals",
      async () => {
        const firstPage =
          await personRepository.findAll({
            tenantId: tenantA,
            page: 1,
            pageSize: 2
          });

        expect(firstPage.page).toBe(1);
        expect(firstPage.pageSize).toBe(2);
        expect(firstPage.total).toBe(5);
        expect(firstPage.totalPages).toBe(3);
        expect(firstPage.items).toHaveLength(2);

        expect(
          firstPage.items.map(
            (person) => person.lastName
          )
        ).toEqual([
          "Alpha",
          "Bravo"
        ]);

        const secondPage =
          await personRepository.findAll({
            tenantId: tenantA,
            page: 2,
            pageSize: 2
          });

        expect(secondPage.page).toBe(2);
        expect(secondPage.pageSize).toBe(2);
        expect(secondPage.total).toBe(5);
        expect(secondPage.totalPages).toBe(3);
        expect(secondPage.items).toHaveLength(2);

        expect(
          secondPage.items.map(
            (person) => person.lastName
          )
        ).toEqual([
          "Charlie",
          "Delta"
        ]);

        const thirdPage =
          await personRepository.findAll({
            tenantId: tenantA,
            page: 3,
            pageSize: 2
          });

        expect(thirdPage.items).toHaveLength(1);

        expect(
          thirdPage.items[0]?.lastName
        ).toBe("Echo");
      }
    );

    it(
      "searches Persons by name",
      async () => {
        const result =
          await personRepository.findAll({
            tenantId: tenantA,
            page: 1,
            pageSize: 25,
            search: "Benjamin"
          });

        expect(result.total).toBe(1);
        expect(result.items).toHaveLength(1);

        expect(
          result.items[0]?.firstName
        ).toBe("Benjamin");

        expect(
          result.items[0]?.lastName
        ).toBe("Bravo");
      }
    );

    it(
      "searches Persons by identifier",
      async () => {
        const identifier =
          `ATHENA-${uniqueToken}-003`;

        const result =
          await personRepository.findAll({
            tenantId: tenantA,
            page: 1,
            pageSize: 25,
            search: identifier
          });

        expect(result.total).toBe(1);
        expect(result.items).toHaveLength(1);

        expect(
          result.items[0]?.firstName
        ).toBe("Charlotte");

        expect(
          result.items[0]?.primaryIdentifier
        ).toBe(identifier);
      }
    );

    it(
      "filters Persons by status",
      async () => {
        const activeResult =
          await personRepository.findAll({
            tenantId: tenantA,
            page: 1,
            pageSize: 25,
            status: "ACTIVE"
          });

        expect(activeResult.total).toBe(3);

        expect(
          activeResult.items.every(
            (person) =>
              person.status === "ACTIVE"
          )
        ).toBe(true);

        const inactiveResult =
          await personRepository.findAll({
            tenantId: tenantA,
            page: 1,
            pageSize: 25,
            status: "INACTIVE"
          });

        expect(inactiveResult.total).toBe(1);

        expect(
          inactiveResult.items[0]?.lastName
        ).toBe("Charlie");

        const deceasedResult =
          await personRepository.findAll({
            tenantId: tenantA,
            page: 1,
            pageSize: 25,
            status: "DECEASED"
          });

        expect(deceasedResult.total).toBe(1);

        expect(
          deceasedResult.items[0]?.lastName
        ).toBe("Delta");
      }
    );

    it(
      "enforces tenant isolation for Person collection queries",
      async () => {
        const tenantAResult =
          await personRepository.findAll({
            tenantId: tenantA,
            page: 1,
            pageSize: 25,
            search: uniqueToken
          });

        expect(tenantAResult.total).toBe(5);

        expect(
          tenantAResult.items.some(
            (person) =>
              person.lastName === "Tenant"
          )
        ).toBe(false);

        const tenantBResult =
          await personRepository.findAll({
            tenantId: tenantB,
            page: 1,
            pageSize: 25,
            search: uniqueToken
          });

        expect(tenantBResult.total).toBe(1);

        expect(
          tenantBResult.items[0]?.firstName
        ).toBe("External");

        expect(
          tenantBResult.items[0]?.lastName
        ).toBe("Tenant");
      }
    );

    it(
      "combines search and status filters",
      async () => {
        const result =
          await personRepository.findAll({
            tenantId: tenantA,
            page: 1,
            pageSize: 25,
            search: uniqueToken,
            status: "ACTIVE"
          });

        expect(result.total).toBe(3);

        expect(
          result.items.map(
            (person) => person.lastName
          )
        ).toEqual([
          "Alpha",
          "Bravo",
          "Echo"
        ]);
      }
    );

    it(
      "returns an empty collection when no Persons match",
      async () => {
        const result =
          await personRepository.findAll({
            tenantId: tenantA,
            page: 1,
            pageSize: 25,
            search:
              `DOES-NOT-EXIST-${randomUUID()}`
          });

        expect(result.items).toEqual([]);
        expect(result.total).toBe(0);
        expect(result.totalPages).toBe(0);
      }
    );

    it(
      "derives Person roles from Patient and Practitioner relationships",
      async () => {
        const result =
          await personRepository.findAll({
            tenantId: roleTenant,
            page: 1,
            pageSize: 25
          });

        expect(result.total).toBe(4);
        expect(result.items).toHaveLength(4);

        const byId =
          new Map(
            result.items.map(
              (person) => [
                person.id,
                person
              ]
            )
          );

        expect(
          byId.get(personOnlyId)?.roles
        ).toEqual([]);

        expect(
          byId.get(patientOnlyPersonId)
            ?.roles
        ).toEqual([
          "PATIENT"
        ]);

        expect(
          byId.get(practitionerOnlyPersonId)
            ?.roles
        ).toEqual([
          "PRACTITIONER"
        ]);

        expect(
          byId.get(
            patientPractitionerPersonId
          )?.roles
        ).toEqual([
          "PATIENT",
          "PRACTITIONER"
        ]);
      }
    );

    it(
      "does not derive roles from another tenant",
      async () => {
        /*
         * The repository's EXISTS predicates must
         * match both person_id and tenant_id.
         *
         * Every returned role therefore belongs
         * only to the requested tenant.
         */
        const tenantAResult =
          await personRepository.findAll({
            tenantId: tenantA,
            page: 1,
            pageSize: 25
          });

        expect(
          tenantAResult.items.every(
            (person) =>
              person.roles.length === 0
          )
        ).toBe(true);
      }
    );
  }
);
import {
  randomUUID
} from "node:crypto";

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
  Person
} from "@intrusionshield/his";

import {
  SqlPersonRepository
} from "../infrastructure/repositories/PersonRepository.js";

const integrationEnabled =
  process.env.HIS_INTEGRATION_TESTS ===
  "true";

const describeIntegration =
  integrationEnabled
    ? describe
    : describe.skip;

describeIntegration(
  "HIS Person facility list integration tests against SQL Server",
  () => {
    let database:
      IDatabaseProvider;

    let personRepository:
      SqlPersonRepository;

    const tenantA =
      randomUUID();

    const tenantB =
      randomUUID();

    const uniqueToken =
      randomUUID()
        .replaceAll("-", "")
        .slice(0, 12)
        .toUpperCase();

    const personWithPrimaryFacility =
      createTestPerson(
        tenantA,
        "Amanda",
        "FacilityPrimary",
        `FACILITY-${uniqueToken}-PERSON-001`
      );

    const personWithNoFacility =
      createTestPerson(
        tenantA,
        "Brian",
        "NoFacility",
        `FACILITY-${uniqueToken}-PERSON-002`
      );

    const personWithExpiredFacility =
      createTestPerson(
        tenantA,
        "Caroline",
        "ExpiredFacility",
        `FACILITY-${uniqueToken}-PERSON-003`
      );

    const personWithInactiveFacility =
      createTestPerson(
        tenantA,
        "David",
        "InactiveFacility",
        `FACILITY-${uniqueToken}-PERSON-004`
      );

    const otherTenantPerson =
      createTestPerson(
        tenantB,
        "External",
        "FacilityTenant",
        `FACILITY-${uniqueToken}-OTHER`
      );

    const primaryFacilityId =
      randomUUID();

    const secondaryFacilityId =
      randomUUID();

    const expiredFacilityId =
      randomUUID();

    const inactiveFacilityId =
      randomUUID();

    const otherTenantFacilityId =
      randomUUID();

    beforeAll(
      async () => {
        const configuration =
          getDatabaseConfiguration();

        if (
          !configuration.username
        ) {
          throw new Error(
            "DB_USERNAME or DB_USER must be supplied for HIS integration tests."
          );
        }

        if (
          !configuration.password
        ) {
          throw new Error(
            "DB_PASSWORD must be supplied for HIS integration tests."
          );
        }

        database =
          new SqlServerProvider({
            server:
              configuration.server,

            port:
              configuration.port,

            database:
              configuration.database,

            user:
              configuration.username,

            password:
              configuration.password,

            encrypt:
              configuration.encrypt,

            trustServerCertificate:
              configuration
                .trustServerCertificate
          });

        await database.connect();

        personRepository =
          new SqlPersonRepository(
            database
          );

        await personRepository.create(
          personWithPrimaryFacility
        );

        await personRepository.create(
          personWithNoFacility
        );

        await personRepository.create(
          personWithExpiredFacility
        );

        await personRepository.create(
          personWithInactiveFacility
        );

        await personRepository.create(
          otherTenantPerson
        );

        await insertFacility({
          id:
            primaryFacilityId,

          tenantId:
            tenantA,

          code:
            `PRIMARY-${uniqueToken}`,

          name:
            `Athena Primary Hospital ${uniqueToken}`,

          status:
            "ACTIVE"
        });

        await insertFacility({
          id:
            secondaryFacilityId,

          tenantId:
            tenantA,

          code:
            `SECONDARY-${uniqueToken}`,

          name:
            `Athena Secondary Clinic ${uniqueToken}`,

          status:
            "ACTIVE"
        });

        await insertFacility({
          id:
            expiredFacilityId,

          tenantId:
            tenantA,

          code:
            `EXPIRED-${uniqueToken}`,

          name:
            `Athena Expired Facility ${uniqueToken}`,

          status:
            "ACTIVE"
        });

        await insertFacility({
          id:
            inactiveFacilityId,

          tenantId:
            tenantA,

          code:
            `INACTIVE-${uniqueToken}`,

          name:
            `Athena Inactive Facility ${uniqueToken}`,

          status:
            "INACTIVE"
        });

        await insertFacility({
          id:
            otherTenantFacilityId,

          tenantId:
            tenantB,

          code:
            `OTHER-${uniqueToken}`,

          name:
            `Athena Other Tenant Hospital ${uniqueToken}`,

          status:
            "ACTIVE"
        });

        const now =
          new Date();

        const yesterday =
          new Date(
            now.getTime() -
              24 *
                60 *
                60 *
                1000
          );

        const lastWeek =
          new Date(
            now.getTime() -
              7 *
                24 *
                60 *
                60 *
                1000
          );

        const tomorrow =
          new Date(
            now.getTime() +
              24 *
                60 *
                60 *
                1000
          );

        /*
         * Amanda has two active affiliations.
         *
         * The secondary Facility is newer,
         * but the primary Facility must win
         * because is_primary takes precedence.
         */
        await insertAffiliation({
          tenantId:
            tenantA,

          personId:
            personWithPrimaryFacility.id,

          facilityId:
            primaryFacilityId,

          affiliationType:
            "PATIENT_CARE",

          isPrimary:
            true,

          effectiveFrom:
            lastWeek
        });

        await insertAffiliation({
          tenantId:
            tenantA,

          personId:
            personWithPrimaryFacility.id,

          facilityId:
            secondaryFacilityId,

          affiliationType:
            "GENERAL",

          isPrimary:
            false,

          effectiveFrom:
            yesterday
        });

        /*
         * Caroline has an affiliation,
         * but it ended yesterday.
         */
        await insertAffiliation({
          tenantId:
            tenantA,

          personId:
            personWithExpiredFacility.id,

          facilityId:
            expiredFacilityId,

          affiliationType:
            "PATIENT_CARE",

          isPrimary:
            true,

          effectiveFrom:
            lastWeek,

          effectiveUntil:
            yesterday
        });

        /*
         * David has a current affiliation
         * to an inactive Facility.
         *
         * Inactive Facilities must not be
         * displayed as the current primary
         * Facility in the Person list.
         */
        await insertAffiliation({
          tenantId:
            tenantA,

          personId:
            personWithInactiveFacility.id,

          facilityId:
            inactiveFacilityId,

          affiliationType:
            "GENERAL",

          isPrimary:
            true,

          effectiveFrom:
            lastWeek
        });

        /*
         * Tenant B contains a completely
         * separate Person / Facility pair.
         */
        await insertAffiliation({
          tenantId:
            tenantB,

          personId:
            otherTenantPerson.id,

          facilityId:
            otherTenantFacilityId,

          affiliationType:
            "GENERAL",

          isPrimary:
            true,

          effectiveFrom:
            lastWeek
        });

        /*
         * Sanity check that our effective
         * date calculations are sensible.
         */
        expect(
          yesterday.getTime()
        ).toBeLessThan(
          tomorrow.getTime()
        );
      }
    );

    afterAll(
      async () => {
        if (!database) {
          return;
        }

        for (
          const tenantId
          of [
            tenantA,
            tenantB
          ]
        ) {
          await database.execute(
            `DELETE FROM HIS.PersonFacilityAffiliations
             WHERE tenant_id = @tenantId`,
            [
              {
                name:
                  "tenantId",

                value:
                  tenantId
              }
            ]
          );

          await database.execute(
            `DELETE FROM HIS.PatientEmergencyContacts
             WHERE tenant_id = @tenantId`,
            [
              {
                name:
                  "tenantId",

                value:
                  tenantId
              }
            ]
          );

          await database.execute(
            `DELETE FROM HIS.PractitionerLicenses
             WHERE tenant_id = @tenantId`,
            [
              {
                name:
                  "tenantId",

                value:
                  tenantId
              }
            ]
          );

          await database.execute(
            `DELETE FROM HIS.PractitionerSpecialties
             WHERE tenant_id = @tenantId`,
            [
              {
                name:
                  "tenantId",

                value:
                  tenantId
              }
            ]
          );

          await database.execute(
            `DELETE FROM HIS.Patients
             WHERE tenant_id = @tenantId`,
            [
              {
                name:
                  "tenantId",

                value:
                  tenantId
              }
            ]
          );

          await database.execute(
            `DELETE FROM HIS.Practitioners
             WHERE tenant_id = @tenantId`,
            [
              {
                name:
                  "tenantId",

                value:
                  tenantId
              }
            ]
          );

          await database.execute(
            `DELETE FROM HIS.PersonIdentifiers
             WHERE tenant_id = @tenantId`,
            [
              {
                name:
                  "tenantId",

                value:
                  tenantId
              }
            ]
          );

          await database.execute(
            `DELETE FROM HIS.PersonAddresses
             WHERE tenant_id = @tenantId`,
            [
              {
                name:
                  "tenantId",

                value:
                  tenantId
              }
            ]
          );

          await database.execute(
            `DELETE FROM HIS.Persons
             WHERE tenant_id = @tenantId`,
            [
              {
                name:
                  "tenantId",

                value:
                  tenantId
              }
            ]
          );

          await database.execute(
            `DELETE FROM HIS.Facilities
             WHERE tenant_id = @tenantId`,
            [
              {
                name:
                  "tenantId",

                value:
                  tenantId
              }
            ]
          );
        }

        await database.disconnect();
      }
    );

    it(
      "returns the active primary Facility for a Person",
      async () => {
        const result =
          await personRepository.findAll({
            tenantId:
              tenantA,

            page:
              1,

            pageSize:
              25,

            search:
              personWithPrimaryFacility
                .lastName
          });

        expect(
          result.total
        ).toBe(1);

        expect(
          result.items
        ).toHaveLength(1);

        const person =
          result.items[0];

        expect(
          person?.id
        ).toBe(
          personWithPrimaryFacility.id
        );

        expect(
          person?.primaryFacilityId
        ).toBe(
          primaryFacilityId
        );

        expect(
          person?.primaryFacilityName
        ).toBe(
          `Athena Primary Hospital ${uniqueToken}`
        );
      }
    );

    it(
      "prefers an explicitly primary Facility over a newer secondary Facility",
      async () => {
        const result =
          await personRepository.findAll({
            tenantId:
              tenantA,

            page:
              1,

            pageSize:
              25,

            search:
              personWithPrimaryFacility
                .lastName
          });

        const person =
          result.items[0];

        expect(
          person
            ?.primaryFacilityName
        ).toBe(
          `Athena Primary Hospital ${uniqueToken}`
        );

        expect(
          person
            ?.primaryFacilityName
        ).not.toBe(
          `Athena Secondary Clinic ${uniqueToken}`
        );
      }
    );

    it(
      "returns no Facility for a Person without an affiliation",
      async () => {
        const result =
          await personRepository.findAll({
            tenantId:
              tenantA,

            page:
              1,

            pageSize:
              25,

            search:
              personWithNoFacility
                .lastName
          });

        expect(
          result.total
        ).toBe(1);

        expect(
          result.items[0]
            ?.primaryFacilityId
        ).toBeUndefined();

        expect(
          result.items[0]
            ?.primaryFacilityName
        ).toBeUndefined();
      }
    );

    it(
      "does not return an expired Facility affiliation",
      async () => {
        const result =
          await personRepository.findAll({
            tenantId:
              tenantA,

            page:
              1,

            pageSize:
              25,

            search:
              personWithExpiredFacility
                .lastName
          });

        expect(
          result.total
        ).toBe(1);

        expect(
          result.items[0]
            ?.primaryFacilityId
        ).toBeUndefined();

        expect(
          result.items[0]
            ?.primaryFacilityName
        ).toBeUndefined();
      }
    );

    it(
      "does not return an inactive Facility",
      async () => {
        const result =
          await personRepository.findAll({
            tenantId:
              tenantA,

            page:
              1,

            pageSize:
              25,

            search:
              personWithInactiveFacility
                .lastName
          });

        expect(
          result.total
        ).toBe(1);

        expect(
          result.items[0]
            ?.primaryFacilityId
        ).toBeUndefined();

        expect(
          result.items[0]
            ?.primaryFacilityName
        ).toBeUndefined();
      }
    );

    it(
      "searches Persons by current Facility name",
      async () => {
        const result =
          await personRepository.findAll({
            tenantId:
              tenantA,

            page:
              1,

            pageSize:
              25,

            search:
              `Athena Primary Hospital ${uniqueToken}`
          });

        expect(
          result.total
        ).toBe(1);

        expect(
          result.items
        ).toHaveLength(1);

        expect(
          result.items[0]?.id
        ).toBe(
          personWithPrimaryFacility.id
        );

        expect(
          result.items[0]
            ?.primaryFacilityName
        ).toBe(
          `Athena Primary Hospital ${uniqueToken}`
        );
      }
    );

    it(
      "does not match expired Facility names during Person search",
      async () => {
        const result =
          await personRepository.findAll({
            tenantId:
              tenantA,

            page:
              1,

            pageSize:
              25,

            search:
              `Athena Expired Facility ${uniqueToken}`
          });

        expect(
          result.total
        ).toBe(0);

        expect(
          result.items
        ).toEqual([]);
      }
    );

    it(
      "enforces tenant isolation for Facility-backed Person queries",
      async () => {
        const tenantAResult =
          await personRepository.findAll({
            tenantId:
              tenantA,

            page:
              1,

            pageSize:
              25,

            search:
              `Athena Other Tenant Hospital ${uniqueToken}`
          });

        expect(
          tenantAResult.total
        ).toBe(0);

        expect(
          tenantAResult.items
        ).toEqual([]);

        const tenantBResult =
          await personRepository.findAll({
            tenantId:
              tenantB,

            page:
              1,

            pageSize:
              25,

            search:
              `Athena Other Tenant Hospital ${uniqueToken}`
          });

        expect(
          tenantBResult.total
        ).toBe(1);

        expect(
          tenantBResult.items
        ).toHaveLength(1);

        expect(
          tenantBResult.items[0]?.id
        ).toBe(
          otherTenantPerson.id
        );

        expect(
          tenantBResult.items[0]
            ?.primaryFacilityId
        ).toBe(
          otherTenantFacilityId
        );

        expect(
          tenantBResult.items[0]
            ?.primaryFacilityName
        ).toBe(
          `Athena Other Tenant Hospital ${uniqueToken}`
        );
      }
    );

    async function insertFacility(
      facility: {
        id: string;
        tenantId: string;
        code: string;
        name: string;

        status:
          | "ACTIVE"
          | "INACTIVE";
      }
    ): Promise<void> {
      const now =
        new Date();

      await database.execute(
        `INSERT INTO HIS.Facilities
         (
           id,
           tenant_id,
           parent_facility_id,
           facility_type,
           code,
           name,
           description,
           address_line1,
           address_line2,
           address_city,
           address_province_or_state,
           address_postal_code,
           address_country,
           contact_email,
           contact_phone,
           contact_mobile_phone,
           status,
           created_at,
           updated_at,
           version
         )
         VALUES
         (
           @id,
           @tenantId,
           NULL,
           @facilityType,
           @code,
           @name,
           NULL,
           NULL,
           NULL,
           NULL,
           NULL,
           NULL,
           NULL,
           NULL,
           NULL,
           NULL,
           @status,
           @createdAt,
           @updatedAt,
           @version
         )`,
        [
          {
            name:
              "id",

            value:
              facility.id
          },
          {
            name:
              "tenantId",

            value:
              facility.tenantId
          },
          {
            name:
              "facilityType",

            value:
              "HOSPITAL"
          },
          {
            name:
              "code",

            value:
              facility.code
          },
          {
            name:
              "name",

            value:
              facility.name
          },
          {
            name:
              "status",

            value:
              facility.status
          },
          {
            name:
              "createdAt",

            value:
              now
          },
          {
            name:
              "updatedAt",

            value:
              now
          },
          {
            name:
              "version",

            value:
              1
          }
        ]
      );
    }

    async function insertAffiliation(
      affiliation: {
        tenantId: string;
        personId: string;
        facilityId: string;

        affiliationType:
          | "PATIENT_CARE"
          | "PRACTITIONER_ASSIGNMENT"
          | "GENERAL";

        isPrimary: boolean;

        effectiveFrom:
          Date;

        effectiveUntil?:
          Date;
      }
    ): Promise<void> {
      const now =
        new Date();

      await database.execute(
        `INSERT INTO HIS.PersonFacilityAffiliations
         (
           id,
           tenant_id,
           person_id,
           facility_id,
           affiliation_type,
           is_primary,
           effective_from,
           effective_until,
           created_at,
           updated_at,
           version
         )
         VALUES
         (
           @id,
           @tenantId,
           @personId,
           @facilityId,
           @affiliationType,
           @isPrimary,
           @effectiveFrom,
           @effectiveUntil,
           @createdAt,
           @updatedAt,
           @version
         )`,
        [
          {
            name:
              "id",

            value:
              randomUUID()
          },
          {
            name:
              "tenantId",

            value:
              affiliation.tenantId
          },
          {
            name:
              "personId",

            value:
              affiliation.personId
          },
          {
            name:
              "facilityId",

            value:
              affiliation.facilityId
          },
          {
            name:
              "affiliationType",

            value:
              affiliation
                .affiliationType
          },
          {
            name:
              "isPrimary",

            value:
              affiliation.isPrimary
                ? 1
                : 0
          },
          {
            name:
              "effectiveFrom",

            value:
              affiliation
                .effectiveFrom
          },
          {
            name:
              "effectiveUntil",

            value:
              affiliation
                .effectiveUntil ??
              null
          },
          {
            name:
              "createdAt",

            value:
              now
          },
          {
            name:
              "updatedAt",

            value:
              now
          },
          {
            name:
              "version",

            value:
              1
          }
        ]
      );
    }
  }
);

function createTestPerson(
  tenantId: string,
  firstName: string,
  lastName: string,
  identifier: string
): Person {
  const now =
    new Date();

  return {
    id:
      randomUUID(),

    tenantId,

    firstName,

    lastName,

    sex:
      "UNKNOWN",

    identifiers: [
      {
        system:
          "MRN",

        value:
          identifier
      }
    ],

    addresses:
      [],

    status:
      "ACTIVE",

    createdAt:
      now,

    updatedAt:
      now,

    version:
      1
  };
}
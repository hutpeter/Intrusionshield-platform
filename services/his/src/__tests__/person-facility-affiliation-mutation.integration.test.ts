import { randomUUID } from "node:crypto";

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it
} from "@jest/globals";

import { getDatabaseConfiguration } from "@intrusionshield/config";
import type { IDatabaseProvider } from "@intrusionshield/database";
import { SqlServerProvider } from "@intrusionshield/database";
import type { Person } from "@intrusionshield/his";

import { SqlPersonRepository } from "../infrastructure/repositories/PersonRepository.js";

const integrationEnabled =
  process.env.HIS_INTEGRATION_TESTS === "true";

const describeIntegration =
  integrationEnabled ? describe : describe.skip;

describeIntegration(
  "Person Facility affiliation integration tests against SQL Server",
  () => {
    let database: IDatabaseProvider;
    let personRepository: SqlPersonRepository;

    const tenantA = randomUUID();
    const tenantB = randomUUID();

    const personAId = randomUUID();
    const personBId = randomUUID();

    const facilityAId = randomUUID();
    const facilityBId = randomUUID();
    const inactiveFacilityId = randomUUID();
    const tenantBFacilityId = randomUUID();

    const personA: Person = {
      id: personAId,
      tenantId: tenantA,
      firstName: "Facility",
      lastName: "Affiliation Test",
      sex: "UNKNOWN",
      identifiers: [],
      addresses: [],
      status: "ACTIVE",
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 1
    };

    const personB: Person = {
      id: personBId,
      tenantId: tenantB,
      firstName: "Other Tenant",
      lastName: "Person",
      sex: "UNKNOWN",
      identifiers: [],
      addresses: [],
      status: "ACTIVE",
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 1
    };

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

      await personRepository.create(personA);
      await personRepository.create(personB);

      await insertFacility(
        database,
        {
          id: facilityAId,
          tenantId: tenantA,
          code: `INT-FAC-A-${facilityAId.slice(0, 8)}`,
          name: "Integration Facility A",
          status: "ACTIVE"
        }
      );

      await insertFacility(
        database,
        {
          id: facilityBId,
          tenantId: tenantA,
          code: `INT-FAC-B-${facilityBId.slice(0, 8)}`,
          name: "Integration Facility B",
          status: "ACTIVE"
        }
      );

      await insertFacility(
        database,
        {
          id: inactiveFacilityId,
          tenantId: tenantA,
          code: `INT-FAC-I-${inactiveFacilityId.slice(0, 8)}`,
          name: "Integration Inactive Facility",
          status: "INACTIVE"
        }
      );

      await insertFacility(
        database,
        {
          id: tenantBFacilityId,
          tenantId: tenantB,
          code: `INT-FAC-X-${tenantBFacilityId.slice(0, 8)}`,
          name: "Integration Other Tenant Facility",
          status: "ACTIVE"
        }
      );
    });

    beforeEach(async () => {
      await database.execute(
        `DELETE FROM HIS.PersonFacilityAffiliations
         WHERE person_id = @personId
           AND tenant_id = @tenantId`,
        [
          {
            name: "personId",
            value: personAId
          },
          {
            name: "tenantId",
            value: tenantA
          }
        ]
      );
    });

    afterAll(async () => {
      if (!database) {
        return;
      }

      try {
        await database.execute(
          `DELETE FROM HIS.PersonFacilityAffiliations
           WHERE
             (person_id = @personAId AND tenant_id = @tenantA)
             OR
             (person_id = @personBId AND tenant_id = @tenantB)`,
          [
            {
              name: "personAId",
              value: personAId
            },
            {
              name: "tenantA",
              value: tenantA
            },
            {
              name: "personBId",
              value: personBId
            },
            {
              name: "tenantB",
              value: tenantB
            }
          ]
        );

        await database.execute(
          `DELETE FROM HIS.Facilities
           WHERE
             (tenant_id = @tenantA AND id IN (
               @facilityAId,
               @facilityBId,
               @inactiveFacilityId
             ))
             OR
             (tenant_id = @tenantB AND id = @tenantBFacilityId)`,
          [
            {
              name: "tenantA",
              value: tenantA
            },
            {
              name: "tenantB",
              value: tenantB
            },
            {
              name: "facilityAId",
              value: facilityAId
            },
            {
              name: "facilityBId",
              value: facilityBId
            },
            {
              name: "inactiveFacilityId",
              value: inactiveFacilityId
            },
            {
              name: "tenantBFacilityId",
              value: tenantBFacilityId
            }
          ]
        );

        await database.execute(
          `DELETE FROM HIS.Persons
           WHERE
             (tenant_id = @tenantA AND id = @personAId)
             OR
             (tenant_id = @tenantB AND id = @personBId)`,
          [
            {
              name: "tenantA",
              value: tenantA
            },
            {
              name: "personAId",
              value: personAId
            },
            {
              name: "tenantB",
              value: tenantB
            },
            {
              name: "personBId",
              value: personBId
            }
          ]
        );
      } finally {
        await database.disconnect();
      }
    });

    it(
      "lists only active Facility options from the current tenant",
      async () => {
        const options =
          await personRepository.listFacilityOptions(
            tenantA
          );

        const optionIds =
          new Set(
            options.map((option) => option.id)
          );

        expect(
          optionIds.has(facilityAId)
        ).toBe(true);

        expect(
          optionIds.has(facilityBId)
        ).toBe(true);

        expect(
          optionIds.has(inactiveFacilityId)
        ).toBe(false);

        expect(
          optionIds.has(tenantBFacilityId)
        ).toBe(false);
      }
    );

    it(
      "creates and reads an active primary Facility affiliation",
      async () => {
        const saved =
          await personRepository.replaceFacilityAffiliations(
            personAId,
            tenantA,
            [
              {
                facilityId: facilityAId,
                affiliationType:
                  "PATIENT_CARE",
                isPrimary: true
              }
            ]
          );

        expect(saved).toHaveLength(1);

        expect(saved[0]).toMatchObject({
          facilityId: facilityAId,
          affiliationType:
            "PATIENT_CARE",
          isPrimary: true
        });

        const reloaded =
          await personRepository.listFacilityAffiliations(
            personAId,
            tenantA
          );

        expect(reloaded).toHaveLength(1);

        expect(reloaded[0]).toMatchObject({
          facilityId: facilityAId,
          affiliationType:
            "PATIENT_CARE",
          isPrimary: true
        });
      }
    );

    it(
      "replaces an affiliation type and preserves the previous row as history",
      async () => {
        await personRepository.replaceFacilityAffiliations(
          personAId,
          tenantA,
          [
            {
              facilityId: facilityAId,
              affiliationType:
                "PATIENT_CARE",
              isPrimary: true
            }
          ]
        );

        await personRepository.replaceFacilityAffiliations(
          personAId,
          tenantA,
          [
            {
              facilityId: facilityAId,
              affiliationType:
                "GENERAL",
              isPrimary: true
            }
          ]
        );

        const active =
          await personRepository.listFacilityAffiliations(
            personAId,
            tenantA
          );

        expect(active).toHaveLength(1);

        expect(active[0]).toMatchObject({
          facilityId: facilityAId,
          affiliationType:
            "GENERAL",
          isPrimary: true
        });

        const history =
          await database.query<{
            affiliationType: string;
            effectiveUntil: Date | null;
          }>(
            `SELECT
               affiliation_type AS affiliationType,
               effective_until AS effectiveUntil
             FROM HIS.PersonFacilityAffiliations
             WHERE person_id = @personId
               AND tenant_id = @tenantId
             ORDER BY created_at, id`,
            [
              {
                name: "personId",
                value: personAId
              },
              {
                name: "tenantId",
                value: tenantA
              }
            ]
          );

        expect(history.rows).toHaveLength(2);

        const previous =
          history.rows.find(
            (row) =>
              row.affiliationType ===
              "PATIENT_CARE"
          );

        const current =
          history.rows.find(
            (row) =>
              row.affiliationType ===
              "GENERAL"
          );

        expect(previous).toBeDefined();
        expect(
          previous?.effectiveUntil
        ).not.toBeNull();

        expect(current).toBeDefined();
        expect(
          current?.effectiveUntil
        ).toBeNull();
      }
    );

    it(
      "supports multiple active affiliations with exactly one primary",
      async () => {
        const saved =
          await personRepository.replaceFacilityAffiliations(
            personAId,
            tenantA,
            [
              {
                facilityId: facilityAId,
                affiliationType:
                  "PATIENT_CARE",
                isPrimary: true
              },
              {
                facilityId: facilityBId,
                affiliationType:
                  "GENERAL",
                isPrimary: false
              }
            ]
          );

        expect(saved).toHaveLength(2);

        expect(
          saved.filter(
            (affiliation) =>
              affiliation.isPrimary
          )
        ).toHaveLength(1);

        expect(
          saved.find(
            (affiliation) =>
              affiliation.isPrimary
          )?.facilityId
        ).toBe(facilityAId);
      }
    );

    it(
      "changes the primary Facility and the Person list reflects the new primary",
      async () => {
        await personRepository.replaceFacilityAffiliations(
          personAId,
          tenantA,
          [
            {
              facilityId: facilityAId,
              affiliationType:
                "PATIENT_CARE",
              isPrimary: true
            },
            {
              facilityId: facilityBId,
              affiliationType:
                "GENERAL",
              isPrimary: false
            }
          ]
        );

        await personRepository.replaceFacilityAffiliations(
          personAId,
          tenantA,
          [
            {
              facilityId: facilityAId,
              affiliationType:
                "PATIENT_CARE",
              isPrimary: false
            },
            {
              facilityId: facilityBId,
              affiliationType:
                "GENERAL",
              isPrimary: true
            }
          ]
        );

        const result =
          await personRepository.findAll({
            tenantId: tenantA,
            page: 1,
            pageSize: 25
          });

        const person =
          result.items.find(
            (item) =>
              item.id === personAId
          );

        expect(person).toBeDefined();

        expect(
          person?.primaryFacilityId
        ).toBe(facilityBId);

        expect(
          person?.primaryFacilityName
        ).toBe(
          "Integration Facility B"
        );
      }
    );

    it(
      "removes active affiliations by end-dating them rather than deleting history",
      async () => {
        await personRepository.replaceFacilityAffiliations(
          personAId,
          tenantA,
          [
            {
              facilityId: facilityAId,
              affiliationType:
                "PATIENT_CARE",
              isPrimary: true
            }
          ]
        );

        await personRepository.replaceFacilityAffiliations(
          personAId,
          tenantA,
          []
        );

        const active =
          await personRepository.listFacilityAffiliations(
            personAId,
            tenantA
          );

        expect(active).toHaveLength(0);

        const history =
          await database.query<{
            total: number | bigint;
            ended: number | bigint;
          }>(
            `SELECT
               COUNT_BIG(*) AS total,
               SUM(
                 CASE
                   WHEN effective_until IS NOT NULL
                   THEN 1
                   ELSE 0
                 END
               ) AS ended
             FROM HIS.PersonFacilityAffiliations
             WHERE person_id = @personId
               AND tenant_id = @tenantId`,
            [
              {
                name: "personId",
                value: personAId
              },
              {
                name: "tenantId",
                value: tenantA
              }
            ]
          );

        expect(
          Number(history.rows[0]?.total ?? 0)
        ).toBe(1);

        expect(
          Number(history.rows[0]?.ended ?? 0)
        ).toBe(1);
      }
    );

    it(
      "rejects duplicate active Facility relationships",
      async () => {
        await expect(
          personRepository.replaceFacilityAffiliations(
            personAId,
            tenantA,
            [
              {
                facilityId: facilityAId,
                affiliationType:
                  "PATIENT_CARE",
                isPrimary: true
              },
              {
                facilityId: facilityAId,
                affiliationType:
                  "PATIENT_CARE",
                isPrimary: false
              }
            ]
          )
        ).rejects.toThrow(
          "Duplicate active Facility affiliations are not allowed."
        );
      }
    );

    it(
      "rejects more than one primary active Facility affiliation",
      async () => {
        await expect(
          personRepository.replaceFacilityAffiliations(
            personAId,
            tenantA,
            [
              {
                facilityId: facilityAId,
                affiliationType:
                  "PATIENT_CARE",
                isPrimary: true
              },
              {
                facilityId: facilityBId,
                affiliationType:
                  "GENERAL",
                isPrimary: true
              }
            ]
          )
        ).rejects.toThrow(
          "Only one active Facility affiliation can be primary."
        );
      }
    );

    it(
      "rejects inactive Facilities",
      async () => {
        await expect(
          personRepository.replaceFacilityAffiliations(
            personAId,
            tenantA,
            [
              {
                facilityId:
                  inactiveFacilityId,
                affiliationType:
                  "GENERAL",
                isPrimary: true
              }
            ]
          )
        ).rejects.toThrow(
          "Every Facility affiliation must reference an active Facility in the current tenant."
        );
      }
    );

    it(
      "rejects Facilities belonging to another tenant",
      async () => {
        await expect(
          personRepository.replaceFacilityAffiliations(
            personAId,
            tenantA,
            [
              {
                facilityId:
                  tenantBFacilityId,
                affiliationType:
                  "GENERAL",
                isPrimary: true
              }
            ]
          )
        ).rejects.toThrow(
          "Every Facility affiliation must reference an active Facility in the current tenant."
        );
      }
    );

    it(
      "rejects a Person belonging to another tenant",
      async () => {
        await expect(
          personRepository.replaceFacilityAffiliations(
            personBId,
            tenantA,
            [
              {
                facilityId: facilityAId,
                affiliationType:
                  "GENERAL",
                isPrimary: true
              }
            ]
          )
        ).rejects.toThrow(
          "Person not found"
        );
      }
    );
  }
);

interface TestFacility {
  readonly id: string;
  readonly tenantId: string;
  readonly code: string;
  readonly name: string;
  readonly status:
    | "ACTIVE"
    | "INACTIVE";
}

async function insertFacility(
  database: IDatabaseProvider,
  facility: TestFacility
): Promise<void> {
  const now = new Date();

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
       @addressLine1,
       NULL,
       @addressCity,
       @addressProvinceOrState,
       @addressPostalCode,
       @addressCountry,
       NULL,
       NULL,
       NULL,
       @status,
       @createdAt,
       @updatedAt,
       1
     )`,
    [
      {
        name: "id",
        value: facility.id
      },
      {
        name: "tenantId",
        value: facility.tenantId
      },
      {
        name: "facilityType",
        value: "HOSPITAL"
      },
      {
        name: "code",
        value: facility.code
      },
      {
        name: "name",
        value: facility.name
      },
      {
        name: "addressLine1",
        value: "1 Integration Test Way"
      },
      {
        name: "addressCity",
        value: "Ottawa"
      },
      {
        name: "addressProvinceOrState",
        value: "Ontario"
      },
      {
        name: "addressPostalCode",
        value: "K1A 0B1"
      },
      {
        name: "addressCountry",
        value: "Canada"
      },
      {
        name: "status",
        value: facility.status
      },
      {
        name: "createdAt",
        value: now
      },
      {
        name: "updatedAt",
        value: now
      }
    ]
  );
}
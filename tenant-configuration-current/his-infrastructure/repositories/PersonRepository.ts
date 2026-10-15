import {
  createUuid,
  type IDatabaseProvider
} from "@intrusionshield/database";

import type { Person } from "@intrusionshield/his";

import type {
  FacilityOption,
  PersonFacilityAffiliation,
  PersonFacilityAffiliationInput,
  PersonListItem,
  PersonListQuery,
  PersonListResult,
  PersonSummary
} from "../../application/PersonList.js";

export interface PersonRepository {
  findById(
    id: string,
    tenantId: string
  ): Promise<Person | null>;

  findAll(
    query: PersonListQuery
  ): Promise<PersonListResult>;

  getSummary(
    tenantId: string
  ): Promise<PersonSummary>;

  listFacilityOptions(
    tenantId: string
  ): Promise<readonly FacilityOption[]>;

  listFacilityAffiliations(
    personId: string,
    tenantId: string
  ): Promise<readonly PersonFacilityAffiliation[]>;

  replaceFacilityAffiliations(
    personId: string,
    tenantId: string,
    affiliations: readonly PersonFacilityAffiliationInput[]
  ): Promise<readonly PersonFacilityAffiliation[]>;

  create(person: Person): Promise<Person>;

  update(person: Person): Promise<Person>;
}

export class SqlPersonRepository implements PersonRepository {
  public constructor(
    private readonly database: IDatabaseProvider
  ) {}

  public async findById(
    id: string,
    tenantId: string
  ): Promise<Person | null> {
    const result = await this.database.query<PersonRow>(
      `SELECT
          id,
          tenant_id AS tenantId,
          first_name AS firstName,
          middle_name AS middleName,
          last_name AS lastName,
          preferred_name AS preferredName,
          date_of_birth AS dateOfBirth,
          sex,
          gender,
          status,
          contact_email AS contactEmail,
          contact_phone AS contactPhone,
          contact_mobile_phone AS contactMobilePhone,
          created_at AS createdAt,
          updated_at AS updatedAt,
          version
       FROM HIS.Persons
       WHERE id = @id
         AND tenant_id = @tenantId`,
      [
        { name: "id", value: id },
        { name: "tenantId", value: tenantId }
      ]
    );

    const row = result.rows[0];

    if (!row) {
      return null;
    }

    const identifiers =
      await this.database.query<PersonIdentifierRow>(
        `SELECT
            system_name AS system,
            identifier_value AS value
         FROM HIS.PersonIdentifiers
         WHERE person_id = @id
           AND tenant_id = @tenantId
         ORDER BY system_name, identifier_value`,
        [
          { name: "id", value: id },
          { name: "tenantId", value: tenantId }
        ]
      );

    const addresses =
      await this.database.query<PersonAddressRow>(
        `SELECT
            line1,
            line2,
            city,
            province_or_state AS provinceOrState,
            postal_code AS postalCode,
            country
         FROM HIS.PersonAddresses
         WHERE person_id = @id
           AND tenant_id = @tenantId
         ORDER BY id`,
        [
          { name: "id", value: id },
          { name: "tenantId", value: tenantId }
        ]
      );

    return this.toDomain(
      row,
      identifiers.rows,
      addresses.rows
    );
  }

  public async findAll(
    query: PersonListQuery
  ): Promise<PersonListResult> {
    const offset =
      (query.page - 1) * query.pageSize;

    const search = query.search?.trim();

    const where: string[] = [
      "p.tenant_id = @tenantId"
    ];

    const parameters: Array<{
      name: string;
      value: string | number;
    }> = [
      {
        name: "tenantId",
        value: query.tenantId
      }
    ];

    if (search) {
      where.push(
        `(
          p.first_name LIKE @search
          OR p.middle_name LIKE @search
          OR p.last_name LIKE @search
          OR p.preferred_name LIKE @search
          OR EXISTS (
            SELECT 1
            FROM HIS.PersonIdentifiers pi
            WHERE pi.person_id = p.id
              AND pi.tenant_id = p.tenant_id
              AND pi.identifier_value LIKE @search
          )
          OR EXISTS (
            SELECT 1
            FROM HIS.PersonFacilityAffiliations searchPfa
            INNER JOIN HIS.Facilities searchFacility
              ON searchFacility.id = searchPfa.facility_id
             AND searchFacility.tenant_id = searchPfa.tenant_id
            WHERE searchPfa.person_id = p.id
              AND searchPfa.tenant_id = p.tenant_id
              AND searchPfa.effective_until IS NULL
              AND searchFacility.status = 'ACTIVE'
              AND searchFacility.name LIKE @search
          )
        )`
      );

      parameters.push({
        name: "search",
        value: `%${search}%`
      });
    }

    if (query.status) {
      where.push("p.status = @status");

      parameters.push({
        name: "status",
        value: query.status
      });
    }

    const whereClause =
      where.join("\nAND ");

    const countResult =
      await this.database.query<PersonCountRow>(
        `SELECT COUNT_BIG(*) AS total
         FROM HIS.Persons p
         WHERE ${whereClause}`,
        parameters
      );

    const total =
      Number(countResult.rows[0]?.total ?? 0);

    const rows =
      await this.database.query<PersonListRow>(
        `SELECT
            p.id,
            p.first_name AS firstName,
            p.middle_name AS middleName,
            p.last_name AS lastName,
            p.preferred_name AS preferredName,
            p.status,
            p.updated_at AS updatedAt,
            (
              SELECT TOP (1)
                pi.identifier_value
              FROM HIS.PersonIdentifiers pi
              WHERE pi.person_id = p.id
                AND pi.tenant_id = p.tenant_id
              ORDER BY
                pi.system_name,
                pi.identifier_value
            ) AS primaryIdentifier,
            CASE
              WHEN EXISTS (
                SELECT 1
                FROM HIS.Patients patient
                WHERE patient.person_id = p.id
                  AND patient.tenant_id = p.tenant_id
              )
              THEN 1
              ELSE 0
            END AS isPatient,
            CASE
              WHEN EXISTS (
                SELECT 1
                FROM HIS.Practitioners practitioner
                WHERE practitioner.person_id = p.id
                  AND practitioner.tenant_id = p.tenant_id
              )
              THEN 1
              ELSE 0
            END AS isPractitioner,
            facilityChoice.facilityId AS primaryFacilityId,
            facilityChoice.facilityName AS primaryFacilityName
         FROM HIS.Persons p
         OUTER APPLY (
           SELECT TOP (1)
             f.id AS facilityId,
             f.name AS facilityName
           FROM HIS.PersonFacilityAffiliations pfa
           INNER JOIN HIS.Facilities f
             ON f.id = pfa.facility_id
            AND f.tenant_id = pfa.tenant_id
           WHERE pfa.person_id = p.id
             AND pfa.tenant_id = p.tenant_id
             AND pfa.effective_until IS NULL
             AND f.status = 'ACTIVE'
           ORDER BY
             pfa.is_primary DESC,
             pfa.effective_from DESC,
             f.name,
             f.id
         ) facilityChoice
         WHERE ${whereClause}
         ORDER BY
           p.last_name,
           p.first_name,
           p.id
         OFFSET @offset ROWS
         FETCH NEXT @pageSize ROWS ONLY`,
        [
          ...parameters,
          {
            name: "offset",
            value: offset
          },
          {
            name: "pageSize",
            value: query.pageSize
          }
        ]
      );

    const items: PersonListItem[] =
      rows.rows.map((row) => {
        const roles: Array<
          "PATIENT" | "PRACTITIONER"
        > = [];

        if (row.isPatient === 1) {
          roles.push("PATIENT");
        }

        if (row.isPractitioner === 1) {
          roles.push("PRACTITIONER");
        }

        return {
          id: row.id,
          firstName: row.firstName,
          middleName:
            row.middleName ?? undefined,
          lastName: row.lastName,
          preferredName:
            row.preferredName ?? undefined,
          status: row.status,
          roles,
          primaryIdentifier:
            row.primaryIdentifier ?? undefined,
          primaryFacilityId:
            row.primaryFacilityId ?? undefined,
          primaryFacilityName:
            row.primaryFacilityName ?? undefined,
          updatedAt: row.updatedAt
        };
      });

    return {
      items,
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages:
        total === 0
          ? 0
          : Math.ceil(
              total / query.pageSize
            )
    };
  }

  public async getSummary(
    tenantId: string
  ): Promise<PersonSummary> {
    const result =
      await this.database.query<PersonSummaryRow>(
        `SELECT
           (
             SELECT COUNT_BIG(*)
             FROM HIS.Persons p
             WHERE p.tenant_id = @tenantId
           ) AS totalPersons,
           (
             SELECT COUNT_BIG(*)
             FROM HIS.Patients patient
             WHERE patient.tenant_id = @tenantId
           ) AS totalPatients,
           (
             SELECT COUNT_BIG(*)
             FROM HIS.Practitioners practitioner
             WHERE practitioner.tenant_id = @tenantId
           ) AS totalPractitioners`,
        [
          {
            name: "tenantId",
            value: tenantId
          }
        ]
      );

    const row = result.rows[0];

    return {
      totalPersons:
        Number(row?.totalPersons ?? 0),
      totalPatients:
        Number(row?.totalPatients ?? 0),
      totalPractitioners:
        Number(row?.totalPractitioners ?? 0)
    };
  }

  public async listFacilityOptions(
    tenantId: string
  ): Promise<readonly FacilityOption[]> {
    const result =
      await this.database.query<FacilityOptionRow>(
        `SELECT
           id,
           code,
           name,
           facility_type AS facilityType
         FROM HIS.Facilities
         WHERE tenant_id = @tenantId
           AND status = 'ACTIVE'
         ORDER BY name, code, id`,
        [
          {
            name: "tenantId",
            value: tenantId
          }
        ]
      );

    return result.rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      facilityType: row.facilityType
    }));
  }

  public async listFacilityAffiliations(
    personId: string,
    tenantId: string
  ): Promise<readonly PersonFacilityAffiliation[]> {
    const result =
      await this.database.query<PersonFacilityAffiliationRow>(
        `SELECT
           pfa.id,
           pfa.facility_id AS facilityId,
           f.code AS facilityCode,
           f.name AS facilityName,
           pfa.affiliation_type AS affiliationType,
           pfa.is_primary AS isPrimary,
           pfa.effective_from AS effectiveFrom,
           pfa.effective_until AS effectiveUntil,
           pfa.version
         FROM HIS.PersonFacilityAffiliations pfa
         INNER JOIN HIS.Facilities f
           ON f.id = pfa.facility_id
          AND f.tenant_id = pfa.tenant_id
         WHERE pfa.person_id = @personId
           AND pfa.tenant_id = @tenantId
           AND pfa.effective_until IS NULL
         ORDER BY
           pfa.is_primary DESC,
           f.name,
           pfa.affiliation_type,
           pfa.id`,
        [
          {
            name: "personId",
            value: personId
          },
          {
            name: "tenantId",
            value: tenantId
          }
        ]
      );

    return result.rows.map(
      (row) => ({
        id: row.id,
        facilityId: row.facilityId,
        facilityCode: row.facilityCode,
        facilityName: row.facilityName,
        affiliationType:
          row.affiliationType,
        isPrimary:
          row.isPrimary === true ||
          row.isPrimary === 1,
        effectiveFrom: row.effectiveFrom,
        effectiveUntil:
          row.effectiveUntil ?? undefined,
        version: row.version
      })
    );
  }

  public async replaceFacilityAffiliations(
    personId: string,
    tenantId: string,
    affiliations: readonly PersonFacilityAffiliationInput[]
  ): Promise<readonly PersonFacilityAffiliation[]> {
    const person =
      await this.database.query<{ id: string }>(
        `SELECT id
         FROM HIS.Persons
         WHERE id = @personId
           AND tenant_id = @tenantId`,
        [
          {
            name: "personId",
            value: personId
          },
          {
            name: "tenantId",
            value: tenantId
          }
        ]
      );

    if (!person.rows[0]) {
      throw new Error(
        "Person not found"
      );
    }

    const primaryCount =
      affiliations.filter(
        (affiliation) =>
          affiliation.isPrimary
      ).length;

    if (primaryCount > 1) {
      throw new Error(
        "Only one active Facility affiliation can be primary."
      );
    }

    const relationshipKeys =
      affiliations.map(
        (affiliation) =>
          `${affiliation.facilityId.toLowerCase()}|${affiliation.affiliationType}`
      );

    if (
      new Set(relationshipKeys).size !==
      relationshipKeys.length
    ) {
      throw new Error(
        "Duplicate active Facility affiliations are not allowed."
      );
    }

    for (const affiliation of affiliations) {
      const facility =
        await this.database.query<{ id: string }>(
          `SELECT id
           FROM HIS.Facilities
           WHERE id = @facilityId
             AND tenant_id = @tenantId
             AND status = 'ACTIVE'`,
          [
            {
              name: "facilityId",
              value: affiliation.facilityId
            },
            {
              name: "tenantId",
              value: tenantId
            }
          ]
        );

      if (!facility.rows[0]) {
        throw new Error(
          "Every Facility affiliation must reference an active Facility in the current tenant."
        );
      }
    }

    const now = new Date();

    await this.database.beginTransaction();

    try {
      await this.database.execute(
        `UPDATE HIS.PersonFacilityAffiliations
         SET
           effective_until = @now,
           updated_at = @now,
           version = version + 1
         WHERE person_id = @personId
           AND tenant_id = @tenantId
           AND effective_until IS NULL`,
        [
          {
            name: "now",
            value: now
          },
          {
            name: "personId",
            value: personId
          },
          {
            name: "tenantId",
            value: tenantId
          }
        ]
      );

      for (const affiliation of affiliations) {
        await this.database.execute(
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
             NULL,
             @createdAt,
             @updatedAt,
             1
           )`,
          [
            {
              name: "id",
              value: createUuid()
            },
            {
              name: "tenantId",
              value: tenantId
            },
            {
              name: "personId",
              value: personId
            },
            {
              name: "facilityId",
              value: affiliation.facilityId
            },
            {
              name: "affiliationType",
              value: affiliation.affiliationType
            },
            {
              name: "isPrimary",
              value: affiliation.isPrimary
            },
            {
              name: "effectiveFrom",
              value: now
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

      await this.database.commitTransaction();
    } catch (error) {
      await this.database.rollbackTransaction();
      throw error;
    }

    return this.listFacilityAffiliations(
      personId,
      tenantId
    );
  }

  public async create(
    person: Person
  ): Promise<Person> {
    await this.database.beginTransaction();

    try {
      await this.database.execute(
        `INSERT INTO HIS.Persons
         (
           id,
           tenant_id,
           first_name,
           middle_name,
           last_name,
           preferred_name,
           date_of_birth,
           sex,
           gender,
           status,
           contact_email,
           contact_phone,
           contact_mobile_phone,
           created_at,
           updated_at,
           version
         )
         VALUES
         (
           @id,
           @tenantId,
           @firstName,
           @middleName,
           @lastName,
           @preferredName,
           @dateOfBirth,
           @sex,
           @gender,
           @status,
           @contactEmail,
           @contactPhone,
           @contactMobilePhone,
           @createdAt,
           @updatedAt,
           @version
         )`,
        [
          {
            name: "id",
            value: person.id
          },
          {
            name: "tenantId",
            value: person.tenantId
          },
          {
            name: "firstName",
            value: person.firstName
          },
          {
            name: "middleName",
            value:
              person.middleName ?? null
          },
          {
            name: "lastName",
            value: person.lastName
          },
          {
            name: "preferredName",
            value:
              person.preferredName ?? null
          },
          {
            name: "dateOfBirth",
            value:
              person.dateOfBirth ?? null
          },
          {
            name: "sex",
            value: person.sex
          },
          {
            name: "gender",
            value:
              person.gender ?? null
          },
          {
            name: "status",
            value: person.status
          },
          {
            name: "contactEmail",
            value:
              person.contactInformation
                ?.email ?? null
          },
          {
            name: "contactPhone",
            value:
              person.contactInformation
                ?.phone ?? null
          },
          {
            name: "contactMobilePhone",
            value:
              person.contactInformation
                ?.mobilePhone ?? null
          },
          {
            name: "createdAt",
            value: person.createdAt
          },
          {
            name: "updatedAt",
            value: person.updatedAt
          },
          {
            name: "version",
            value: person.version
          }
        ]
      );

      for (
        const identifier of
        person.identifiers
      ) {
        await this.database.execute(
          `INSERT INTO HIS.PersonIdentifiers
           (
             tenant_id,
             person_id,
             system_name,
             identifier_value
           )
           VALUES
           (
             @tenantId,
             @personId,
             @system,
             @value
           )`,
          [
            {
              name: "tenantId",
              value: person.tenantId
            },
            {
              name: "personId",
              value: person.id
            },
            {
              name: "system",
              value: identifier.system
            },
            {
              name: "value",
              value: identifier.value
            }
          ]
        );
      }

      for (
        const address of
        person.addresses
      ) {
        await this.database.execute(
          `INSERT INTO HIS.PersonAddresses
           (
             id,
             tenant_id,
             person_id,
             line1,
             line2,
             city,
             province_or_state,
             postal_code,
             country
           )
           VALUES
           (
             @id,
             @tenantId,
             @personId,
             @line1,
             @line2,
             @city,
             @provinceOrState,
             @postalCode,
             @country
           )`,
          [
            {
              name: "id",
              value: createUuid()
            },
            {
              name: "tenantId",
              value: person.tenantId
            },
            {
              name: "personId",
              value: person.id
            },
            {
              name: "line1",
              value: address.line1
            },
            {
              name: "line2",
              value:
                address.line2 ?? null
            },
            {
              name: "city",
              value: address.city
            },
            {
              name: "provinceOrState",
              value:
                address.provinceOrState ??
                null
            },
            {
              name: "postalCode",
              value:
                address.postalCode ?? null
            },
            {
              name: "country",
              value: address.country
            }
          ]
        );
      }

      await this.database.commitTransaction();

      return person;
    } catch (error) {
      await this.database.rollbackTransaction();
      throw error;
    }
  }

  public async update(
    person: Person
  ): Promise<Person> {
    const nextVersion =
      person.version + 1;

    await this.database.beginTransaction();

    try {
      const rows =
        await this.database.execute(
          `UPDATE HIS.Persons
           SET
             first_name = @firstName,
             middle_name = @middleName,
             last_name = @lastName,
             preferred_name = @preferredName,
             date_of_birth = @dateOfBirth,
             sex = @sex,
             gender = @gender,
             status = @status,
             contact_email = @contactEmail,
             contact_phone = @contactPhone,
             contact_mobile_phone = @contactMobilePhone,
             updated_at = @updatedAt,
             version = @nextVersion
           WHERE id = @id
             AND tenant_id = @tenantId
             AND version = @version`,
          [
            {
              name: "firstName",
              value: person.firstName
            },
            {
              name: "middleName",
              value:
                person.middleName ?? null
            },
            {
              name: "lastName",
              value: person.lastName
            },
            {
              name: "preferredName",
              value:
                person.preferredName ?? null
            },
            {
              name: "dateOfBirth",
              value:
                person.dateOfBirth ?? null
            },
            {
              name: "sex",
              value: person.sex
            },
            {
              name: "gender",
              value:
                person.gender ?? null
            },
            {
              name: "status",
              value: person.status
            },
            {
              name: "contactEmail",
              value:
                person.contactInformation
                  ?.email ?? null
            },
            {
              name: "contactPhone",
              value:
                person.contactInformation
                  ?.phone ?? null
            },
            {
              name: "contactMobilePhone",
              value:
                person.contactInformation
                  ?.mobilePhone ?? null
            },
            {
              name: "updatedAt",
              value: person.updatedAt
            },
            {
              name: "nextVersion",
              value: nextVersion
            },
            {
              name: "id",
              value: person.id
            },
            {
              name: "tenantId",
              value: person.tenantId
            },
            {
              name: "version",
              value: person.version
            }
          ]
        );

      if (rows !== 1) {
        throw new Error(
          "Person was modified or does not exist"
        );
      }

      await this.database.execute(
        `DELETE FROM HIS.PersonIdentifiers
         WHERE person_id = @personId
           AND tenant_id = @tenantId`,
        [
          {
            name: "personId",
            value: person.id
          },
          {
            name: "tenantId",
            value: person.tenantId
          }
        ]
      );

      for (
        const identifier of
        person.identifiers
      ) {
        await this.database.execute(
          `INSERT INTO HIS.PersonIdentifiers
           (
             tenant_id,
             person_id,
             system_name,
             identifier_value
           )
           VALUES
           (
             @tenantId,
             @personId,
             @system,
             @value
           )`,
          [
            {
              name: "tenantId",
              value: person.tenantId
            },
            {
              name: "personId",
              value: person.id
            },
            {
              name: "system",
              value: identifier.system
            },
            {
              name: "value",
              value: identifier.value
            }
          ]
        );
      }

      await this.database.execute(
        `DELETE FROM HIS.PersonAddresses
         WHERE person_id = @personId
           AND tenant_id = @tenantId`,
        [
          {
            name: "personId",
            value: person.id
          },
          {
            name: "tenantId",
            value: person.tenantId
          }
        ]
      );

      for (
        const address of
        person.addresses
      ) {
        await this.database.execute(
          `INSERT INTO HIS.PersonAddresses
           (
             id,
             tenant_id,
             person_id,
             line1,
             line2,
             city,
             province_or_state,
             postal_code,
             country
           )
           VALUES
           (
             @id,
             @tenantId,
             @personId,
             @line1,
             @line2,
             @city,
             @provinceOrState,
             @postalCode,
             @country
           )`,
          [
            {
              name: "id",
              value: createUuid()
            },
            {
              name: "tenantId",
              value: person.tenantId
            },
            {
              name: "personId",
              value: person.id
            },
            {
              name: "line1",
              value: address.line1
            },
            {
              name: "line2",
              value:
                address.line2 ?? null
            },
            {
              name: "city",
              value: address.city
            },
            {
              name: "provinceOrState",
              value:
                address.provinceOrState ??
                null
            },
            {
              name: "postalCode",
              value:
                address.postalCode ?? null
            },
            {
              name: "country",
              value: address.country
            }
          ]
        );
      }

      await this.database.commitTransaction();

      return {
        ...person,
        version: nextVersion
      };
    } catch (error) {
      await this.database.rollbackTransaction();
      throw error;
    }
  }

  private toDomain(
    row: PersonRow,
    identifiers:
      readonly PersonIdentifierRow[],
    addresses:
      readonly PersonAddressRow[]
  ): Person {
    const contactInformation =
      row.contactEmail !== null ||
      row.contactPhone !== null ||
      row.contactMobilePhone !== null
        ? {
            email:
              row.contactEmail ??
              undefined,
            phone:
              row.contactPhone ??
              undefined,
            mobilePhone:
              row.contactMobilePhone ??
              undefined
          }
        : undefined;

    return {
      id: row.id,
      tenantId: row.tenantId,
      firstName: row.firstName,
      middleName:
        row.middleName ?? undefined,
      lastName: row.lastName,
      preferredName:
        row.preferredName ?? undefined,
      dateOfBirth:
        row.dateOfBirth ?? undefined,
      sex: row.sex,
      gender: row.gender ?? undefined,
      identifiers:
        identifiers.map(
          (identifier) => ({
            system: identifier.system,
            value: identifier.value
          })
        ),
      contactInformation,
      addresses:
        addresses.map((address) => ({
          line1: address.line1,
          line2:
            address.line2 ?? undefined,
          city: address.city,
          provinceOrState:
            address.provinceOrState ??
            undefined,
          postalCode:
            address.postalCode ??
            undefined,
          country: address.country
        })),
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      version: row.version
    };
  }
}

interface PersonRow {
  id: string;
  tenantId: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  preferredName: string | null;
  dateOfBirth: Date | null;
  sex: Person["sex"];
  gender: string | null;
  status: Person["status"];
  contactEmail: string | null;
  contactPhone: string | null;
  contactMobilePhone: string | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

interface PersonIdentifierRow {
  system: string;
  value: string;
}

interface PersonAddressRow {
  line1: string;
  line2: string | null;
  city: string;
  provinceOrState: string | null;
  postalCode: string | null;
  country: string;
}

interface PersonListRow {
  id: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  preferredName: string | null;
  status: Person["status"];
  primaryIdentifier: string | null;
  primaryFacilityId: string | null;
  primaryFacilityName: string | null;
  isPatient: number;
  isPractitioner: number;
  updatedAt: Date;
}

interface PersonCountRow {
  total: number | bigint;
}

interface PersonSummaryRow {
  totalPersons: number | bigint;
  totalPatients: number | bigint;
  totalPractitioners: number | bigint;
}

interface FacilityOptionRow {
  id: string;
  code: string;
  name: string;
  facilityType: string;
}

interface PersonFacilityAffiliationRow {
  id: string;
  facilityId: string;
  facilityCode: string;
  facilityName: string;
  affiliationType:
    PersonFacilityAffiliation["affiliationType"];
  isPrimary: boolean | number;
  effectiveFrom: Date;
  effectiveUntil: Date | null;
  version: number;
}

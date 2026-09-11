import type { IDatabaseProvider } from "@intrusionshield/database";
import type { Person } from "@intrusionshield/his";

import { normalizeUuid } from "../normalizeUuid.js";

export interface PersonRepository {
  findById(id: string, tenantId: string): Promise<Person | null>;

  create(person: Person): Promise<Person>;

  update(person: Person): Promise<Person>;
}

export class SqlPersonRepository implements PersonRepository {
  public constructor(private readonly database: IDatabaseProvider) {}

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

    const identifiers = await this.database.query<PersonIdentifierRow>(
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

    const addresses = await this.database.query<PersonAddressRow>(
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

  public async create(person: Person): Promise<Person> {
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
          { name: "id", value: person.id },
          { name: "tenantId", value: person.tenantId },
          { name: "firstName", value: person.firstName },
          { name: "middleName", value: person.middleName ?? null },
          { name: "lastName", value: person.lastName },
          { name: "preferredName", value: person.preferredName ?? null },
          { name: "dateOfBirth", value: person.dateOfBirth ?? null },
          { name: "sex", value: person.sex },
          { name: "gender", value: person.gender ?? null },
          { name: "status", value: person.status },
          {
            name: "contactEmail",
            value: person.contactInformation?.email ?? null
          },
          {
            name: "contactPhone",
            value: person.contactInformation?.phone ?? null
          },
          {
            name: "contactMobilePhone",
            value: person.contactInformation?.mobilePhone ?? null
          },
          { name: "createdAt", value: person.createdAt },
          { name: "updatedAt", value: person.updatedAt },
          { name: "version", value: person.version }
        ]
      );

      for (const identifier of person.identifiers) {
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
            { name: "tenantId", value: person.tenantId },
            { name: "personId", value: person.id },
            { name: "system", value: identifier.system },
            { name: "value", value: identifier.value }
          ]
        );
      }

      for (const address of person.addresses) {
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
             NEWID(),
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
            { name: "tenantId", value: person.tenantId },
            { name: "personId", value: person.id },
            { name: "line1", value: address.line1 },
            { name: "line2", value: address.line2 ?? null },
            { name: "city", value: address.city },
            {
              name: "provinceOrState",
              value: address.provinceOrState ?? null
            },
            {
              name: "postalCode",
              value: address.postalCode ?? null
            },
            { name: "country", value: address.country }
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

  public async update(person: Person): Promise<Person> {
    const nextVersion = person.version + 1;

    await this.database.beginTransaction();

    try {
      const rows = await this.database.execute(
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
          { name: "firstName", value: person.firstName },
          { name: "middleName", value: person.middleName ?? null },
          { name: "lastName", value: person.lastName },
          { name: "preferredName", value: person.preferredName ?? null },
          { name: "dateOfBirth", value: person.dateOfBirth ?? null },
          { name: "sex", value: person.sex },
          { name: "gender", value: person.gender ?? null },
          { name: "status", value: person.status },
          {
            name: "contactEmail",
            value: person.contactInformation?.email ?? null
          },
          {
            name: "contactPhone",
            value: person.contactInformation?.phone ?? null
          },
          {
            name: "contactMobilePhone",
            value: person.contactInformation?.mobilePhone ?? null
          },
          { name: "updatedAt", value: person.updatedAt },
          { name: "nextVersion", value: nextVersion },
          { name: "id", value: person.id },
          { name: "tenantId", value: person.tenantId },
          { name: "version", value: person.version }
        ]
      );

      if (rows !== 1) {
        throw new Error("Person was modified or does not exist");
      }

      await this.database.execute(
        `DELETE FROM HIS.PersonIdentifiers
         WHERE person_id = @personId
           AND tenant_id = @tenantId`,
        [
          { name: "personId", value: person.id },
          { name: "tenantId", value: person.tenantId }
        ]
      );

      for (const identifier of person.identifiers) {
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
            { name: "tenantId", value: person.tenantId },
            { name: "personId", value: person.id },
            { name: "system", value: identifier.system },
            { name: "value", value: identifier.value }
          ]
        );
      }

      await this.database.execute(
        `DELETE FROM HIS.PersonAddresses
         WHERE person_id = @personId
           AND tenant_id = @tenantId`,
        [
          { name: "personId", value: person.id },
          { name: "tenantId", value: person.tenantId }
        ]
      );

      for (const address of person.addresses) {
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
             NEWID(),
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
            { name: "tenantId", value: person.tenantId },
            { name: "personId", value: person.id },
            { name: "line1", value: address.line1 },
            { name: "line2", value: address.line2 ?? null },
            { name: "city", value: address.city },
            {
              name: "provinceOrState",
              value: address.provinceOrState ?? null
            },
            {
              name: "postalCode",
              value: address.postalCode ?? null
            },
            { name: "country", value: address.country }
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
    identifiers: readonly PersonIdentifierRow[],
    addresses: readonly PersonAddressRow[]
  ): Person {
    const contactInformation =
      row.contactEmail !== null ||
      row.contactPhone !== null ||
      row.contactMobilePhone !== null
        ? {
            email: row.contactEmail ?? undefined,
            phone: row.contactPhone ?? undefined,
            mobilePhone: row.contactMobilePhone ?? undefined
          }
        : undefined;

    return {
      id: normalizeUuid(row.id),
      tenantId: normalizeUuid(row.tenantId),
      firstName: row.firstName,
      middleName: row.middleName ?? undefined,
      lastName: row.lastName,
      preferredName: row.preferredName ?? undefined,
      dateOfBirth: row.dateOfBirth ?? undefined,
      sex: row.sex,
      gender: row.gender ?? undefined,
      identifiers: identifiers.map((identifier) => ({
        system: identifier.system,
        value: identifier.value
      })),
      contactInformation,
      addresses: addresses.map((address) => ({
        line1: address.line1,
        line2: address.line2 ?? undefined,
        city: address.city,
        provinceOrState: address.provinceOrState ?? undefined,
        postalCode: address.postalCode ?? undefined,
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
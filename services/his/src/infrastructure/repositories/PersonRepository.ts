import type { IDatabaseProvider } from "@intrusionshield/database";
import type { Person } from "@intrusionshield/his";

export interface PersonRepository {
  findById(id: string, tenantId: string): Promise<Person | null>;
  create(person: Person): Promise<Person>;
  update(person: Person): Promise<Person>;
}

export class SqlPersonRepository implements PersonRepository {
  public constructor(private readonly database: IDatabaseProvider) {}

  public async findById(id: string, tenantId: string): Promise<Person | null> {
    const result = await this.database.query<PersonRow>(
      `SELECT id, tenant_id AS tenantId, first_name AS firstName, middle_name AS middleName,
              last_name AS lastName, preferred_name AS preferredName, date_of_birth AS dateOfBirth,
              sex, gender, status, created_at AS createdAt, updated_at AS updatedAt, version
       FROM HIS.Persons
       WHERE id = @id AND tenant_id = @tenantId`,
      [{ name: "id", value: id }, { name: "tenantId", value: tenantId }]
    );
    const row = result.rows[0];
    return row ? this.toDomain(row) : null;
  }

  public async create(person: Person): Promise<Person> {
    await this.database.execute(
      `INSERT INTO HIS.Persons
       (id, tenant_id, first_name, middle_name, last_name, preferred_name, date_of_birth,
        sex, gender, status, created_at, updated_at, version)
       VALUES (@id, @tenantId, @firstName, @middleName, @lastName, @preferredName, @dateOfBirth,
               @sex, @gender, @status, @createdAt, @updatedAt, @version)`,
      [
        { name: "id", value: person.id }, { name: "tenantId", value: person.tenantId },
        { name: "firstName", value: person.firstName }, { name: "middleName", value: person.middleName ?? null },
        { name: "lastName", value: person.lastName }, { name: "preferredName", value: person.preferredName ?? null },
        { name: "dateOfBirth", value: person.dateOfBirth ?? null }, { name: "sex", value: person.sex },
        { name: "gender", value: person.gender ?? null }, { name: "status", value: person.status },
        { name: "createdAt", value: person.createdAt }, { name: "updatedAt", value: person.updatedAt },
        { name: "version", value: person.version }
      ]
    );
    return person;
  }

  public async update(person: Person): Promise<Person> {
    const nextVersion = person.version + 1;
    const rows = await this.database.execute(
      `UPDATE HIS.Persons
       SET first_name = @firstName, middle_name = @middleName, last_name = @lastName,
           preferred_name = @preferredName, date_of_birth = @dateOfBirth, sex = @sex,
           gender = @gender, status = @status, updated_at = @updatedAt, version = @nextVersion
       WHERE id = @id AND tenant_id = @tenantId AND version = @version`,
      [
        { name: "firstName", value: person.firstName }, { name: "middleName", value: person.middleName ?? null },
        { name: "lastName", value: person.lastName }, { name: "preferredName", value: person.preferredName ?? null },
        { name: "dateOfBirth", value: person.dateOfBirth ?? null }, { name: "sex", value: person.sex },
        { name: "gender", value: person.gender ?? null }, { name: "status", value: person.status },
        { name: "updatedAt", value: person.updatedAt }, { name: "nextVersion", value: nextVersion },
        { name: "id", value: person.id }, { name: "tenantId", value: person.tenantId }, { name: "version", value: person.version }
      ]
    );
    if (rows !== 1) throw new Error("Person was modified or does not exist");
    return { ...person, version: nextVersion };
  }

  private toDomain(row: PersonRow): Person {
    return {
      ...row,
      identifiers: [],
      addresses: []
    };
  }
}

interface PersonRow {
  id: string; tenantId: string; firstName: string; middleName?: string;
  lastName: string; preferredName?: string; dateOfBirth?: Date; sex: Person["sex"];
  gender?: string; status: Person["status"]; createdAt: Date; updatedAt: Date; version: number;
}

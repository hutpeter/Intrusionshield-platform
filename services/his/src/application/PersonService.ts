import { createPerson, type Person } from "@intrusionshield/his";
import type { PersonRepository } from "../infrastructure/repositories/PersonRepository.js";

export class PersonService {
  public constructor(private readonly repository: PersonRepository) {}

  public async get(id: string, tenantId: string): Promise<Person | null> {
    return this.repository.findById(id, tenantId);
  }

  public async create(person: Person): Promise<Person> {
    return this.repository.create(createPerson(person));
  }

  public async update(person: Person): Promise<Person> {
    return this.repository.update(createPerson(person));
  }
}

import {
  createPerson,
  type Person
} from "@intrusionshield/his";

import type {
  FacilityOption,
  PersonFacilityAffiliation,
  PersonFacilityAffiliationInput,
  PersonListQuery,
  PersonListResult,
  PersonSummary
} from "./PersonList.js";

import type {
  PersonRepository
} from "../infrastructure/repositories/PersonRepository.js";

export class PersonService {
  public constructor(
    private readonly repository: PersonRepository
  ) {}

  public async get(
    id: string,
    tenantId: string
  ): Promise<Person | null> {
    return this.repository.findById(
      id,
      tenantId
    );
  }

  public async list(
    query: PersonListQuery
  ): Promise<PersonListResult> {
    return this.repository.findAll(query);
  }

  public async summary(
    tenantId: string
  ): Promise<PersonSummary> {
    return this.repository.getSummary(
      tenantId
    );
  }

  public async listFacilityOptions(
    tenantId: string
  ): Promise<readonly FacilityOption[]> {
    return this.repository.listFacilityOptions(
      tenantId
    );
  }

  public async listFacilityAffiliations(
    personId: string,
    tenantId: string
  ): Promise<readonly PersonFacilityAffiliation[]> {
    return this.repository.listFacilityAffiliations(
      personId,
      tenantId
    );
  }

  public async replaceFacilityAffiliations(
    personId: string,
    tenantId: string,
    affiliations: readonly PersonFacilityAffiliationInput[]
  ): Promise<readonly PersonFacilityAffiliation[]> {
    return this.repository.replaceFacilityAffiliations(
      personId,
      tenantId,
      affiliations
    );
  }

  public async create(
    person: Person
  ): Promise<Person> {
    return this.repository.create(
      createPerson(person)
    );
  }

  public async update(
    person: Person
  ): Promise<Person> {
    return this.repository.update(
      createPerson(person)
    );
  }
}

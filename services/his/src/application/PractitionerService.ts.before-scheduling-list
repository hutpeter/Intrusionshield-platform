import { createPractitioner, type Practitioner } from "@intrusionshield/his";
import type { PractitionerRepository } from "../infrastructure/repositories/PractitionerRepository.js";

export class PractitionerService {
  public constructor(private readonly repository: PractitionerRepository) {}

  public async get(id: string, tenantId: string): Promise<Practitioner | null> {
    return this.repository.findById(id, tenantId);
  }

  public async create(practitioner: Practitioner): Promise<Practitioner> {
    return this.repository.create(createPractitioner(practitioner));
  }

  public async update(practitioner: Practitioner): Promise<Practitioner> {
    return this.repository.update(createPractitioner(practitioner));
  }
}

import {
  createEncounter,
  type Encounter
} from "@intrusionshield/his";

import type {
  EncounterRepository
} from "../infrastructure/repositories/EncounterRepository.js";

export class EncounterService {
  public constructor(
    private readonly repository:
      EncounterRepository
  ) {}

  public async get(
    id: string,
    tenantId: string
  ): Promise<Encounter | null> {
    return this.repository.findById(
      id,
      tenantId
    );
  }

  public async listForPatient(
    patientId: string,
    tenantId: string
  ): Promise<readonly Encounter[]> {
    return this.repository.findByPatientId(
      patientId,
      tenantId
    );
  }

  public async create(
    encounter: Encounter
  ): Promise<Encounter> {
    return this.repository.create(
      createEncounter(encounter)
    );
  }

  public async update(
    encounter: Encounter
  ): Promise<Encounter> {
    return this.repository.update(
      createEncounter(encounter)
    );
  }
}

import {
  createAdmission,
  type Admission
} from "@intrusionshield/his";

import type {
  AdmissionCensusItem,
  AdmissionCensusQuery,
  AdmissionRepository
} from "../infrastructure/repositories/AdmissionRepository.js";

export class AdmissionService {
  public constructor(
    private readonly repository:
      AdmissionRepository
  ) {}

  public async get(
    id: string,
    tenantId: string
  ): Promise<Admission | null> {
    return this.repository.findById(
      id,
      tenantId
    );
  }

  public async getForEncounter(
    encounterId: string,
    tenantId: string
  ): Promise<Admission | null> {
    return this.repository.findByEncounterId(
      encounterId,
      tenantId
    );
  }

  public async listForPatient(
    patientId: string,
    tenantId: string
  ): Promise<readonly Admission[]> {
    return this.repository.findByPatientId(
      patientId,
      tenantId
    );
  }

  public async listCensus(
    query: AdmissionCensusQuery
  ): Promise<readonly AdmissionCensusItem[]> {
    return this.repository.findCensus(
      query
    );
  }

  public async create(
    admission: Admission
  ): Promise<Admission> {
    return this.repository.create(
      createAdmission(admission)
    );
  }
}

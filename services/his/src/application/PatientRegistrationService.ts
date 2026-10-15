import {
  createPatientRegistration,
  type PatientRegistration
} from "@intrusionshield/his";

import type {
  PatientRegistrationRepository
} from "../infrastructure/repositories/PatientRegistrationRepository.js";

export class PatientRegistrationService {
  public constructor(
    private readonly repository:
      PatientRegistrationRepository
  ) {}

  public async get(
    id: string,
    tenantId: string
  ): Promise<PatientRegistration | null> {
    return this.repository.findById(
      id,
      tenantId
    );
  }

  public async listForPatient(
    patientId: string,
    tenantId: string
  ): Promise<readonly PatientRegistration[]> {
    return this.repository.findByPatientId(
      patientId,
      tenantId
    );
  }

  public async create(
    registration: PatientRegistration
  ): Promise<PatientRegistration> {
    return this.repository.create(
      createPatientRegistration(registration)
    );
  }

  public async update(
    registration: PatientRegistration
  ): Promise<PatientRegistration> {
    return this.repository.update(
      createPatientRegistration(registration)
    );
  }
}

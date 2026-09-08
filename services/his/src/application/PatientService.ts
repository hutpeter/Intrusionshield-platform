import { createPatient, type Patient } from "@intrusionshield/his";
import type { PatientRepository } from "../infrastructure/repositories/PatientRepository.js";

export class PatientService {
  public constructor(private readonly repository: PatientRepository) {}

  public async get(id: string, tenantId: string): Promise<Patient | null> {
    return this.repository.findById(id, tenantId);
  }

  public async create(patient: Patient): Promise<Patient> {
    return this.repository.create(createPatient(patient));
  }

  public async update(patient: Patient): Promise<Patient> {
    return this.repository.update(createPatient(patient));
  }
}

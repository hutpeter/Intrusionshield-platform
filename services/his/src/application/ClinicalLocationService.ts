import {
  createClinicalLocation,
  type ClinicalLocation
} from "@intrusionshield/his";

import type {
  ClinicalLocationRepository
} from "../infrastructure/repositories/ClinicalLocationRepository.js";

export class ClinicalLocationService {
  public constructor(
    private readonly repository:
      ClinicalLocationRepository
  ) {}

  public async get(
    id: string,
    tenantId: string
  ): Promise<ClinicalLocation | null> {
    return this.repository.findById(
      id,
      tenantId
    );
  }

  public async listForFacility(
    facilityId: string,
    tenantId: string
  ): Promise<ClinicalLocation[]> {
    return this.repository.listForFacility(
      facilityId,
      tenantId
    );
  }

  public async create(
    location: ClinicalLocation
  ): Promise<ClinicalLocation> {
    return this.repository.create(
      createClinicalLocation(location)
    );
  }

  public async update(
    location: ClinicalLocation
  ): Promise<ClinicalLocation> {
    return this.repository.update(
      createClinicalLocation(location)
    );
  }
}

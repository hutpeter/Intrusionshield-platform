import { createFacility, type Facility } from "@intrusionshield/his";
import type { FacilityRepository } from "../infrastructure/repositories/FacilityRepository.js";

export class FacilityService {
  public constructor(private readonly repository: FacilityRepository) {}

  public async get(id: string, tenantId: string): Promise<Facility | null> {
    return this.repository.findById(id, tenantId);
  }

  public async create(facility: Facility): Promise<Facility> {
    return this.repository.create(createFacility(facility));
  }

  public async update(facility: Facility): Promise<Facility> {
    return this.repository.update(createFacility(facility));
  }
}

import {
  createBed,
  type Bed
} from "@intrusionshield/his";

import type {
  BedRepository
} from "../infrastructure/repositories/BedRepository.js";

export class BedService {
  public constructor(
    private readonly repository:
      BedRepository
  ) {}

  public async get(
    id: string,
    tenantId: string
  ): Promise<Bed | null> {
    return this.repository.findById(
      id,
      tenantId
    );
  }

  public async listForLocation(
    locationId: string,
    tenantId: string
  ): Promise<Bed[]> {
    return this.repository.listForLocation(
      locationId,
      tenantId
    );
  }

  public async create(
    bed: Bed
  ): Promise<Bed> {
    return this.repository.create(
      createBed(bed)
    );
  }

  public async update(
    bed: Bed
  ): Promise<Bed> {
    return this.repository.update(
      createBed(bed)
    );
  }
}

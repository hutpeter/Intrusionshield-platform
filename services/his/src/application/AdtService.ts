import {
  type Admission,
  type BedAssignment
} from "@intrusionshield/his";

import type {
  AdmissionRepository
} from "../infrastructure/repositories/AdmissionRepository.js";

import type {
  BedAssignmentRepository
} from "../infrastructure/repositories/BedAssignmentRepository.js";

import type {
  AdtRepository,
  AssignBedCommand,
  TransferCommand,
  DischargeCommand
} from "../infrastructure/repositories/AdtRepository.js";

export class AdtService {
  public constructor(
    private readonly admissionRepository:
      AdmissionRepository,
    private readonly assignmentRepository:
      BedAssignmentRepository,
    private readonly adtRepository:
      AdtRepository
  ) {}

  public async listAssignments(
    admissionId: string,
    tenantId: string
  ): Promise<readonly BedAssignment[]> {
    return this.assignmentRepository
      .findByAdmissionId(
        admissionId,
        tenantId
      );
  }

  public async getCurrentAssignment(
    admissionId: string,
    tenantId: string
  ): Promise<BedAssignment | null> {
    return this.assignmentRepository
      .findActiveByAdmissionId(
        admissionId,
        tenantId
      );
  }

  public async assignBed(
    command: AssignBedCommand
  ): Promise<BedAssignment | null> {
    await this.adtRepository.assignBed(
      command
    );

    return this.getCurrentAssignment(
      command.admissionId,
      command.tenantId
    );
  }

  public async transfer(
    command: TransferCommand
  ): Promise<BedAssignment | null> {
    await this.adtRepository.transfer(
      command
    );

    return this.getCurrentAssignment(
      command.admissionId,
      command.tenantId
    );
  }

  public async discharge(
    command: DischargeCommand
  ): Promise<Admission | null> {
    await this.adtRepository.discharge(
      command
    );

    return this.admissionRepository
      .findById(
        command.admissionId,
        command.tenantId
      );
  }
}

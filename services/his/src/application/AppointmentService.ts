import {
  randomUUID
} from "node:crypto";

import {
  assertAppointmentTransition,
  createAppointment,
  createEncounter,
  type Appointment,
  type AppointmentSearchCriteria,
  type Encounter
} from "@intrusionshield/his";

import type {
  IDatabaseProvider
} from "@intrusionshield/database";

import type {
  AppointmentRepository
} from "../infrastructure/repositories/AppointmentRepository.js";

import type {
  EncounterRepository
} from "../infrastructure/repositories/EncounterRepository.js";

export class AppointmentService {
  public constructor(
    private readonly repository:
      AppointmentRepository,
    private readonly encounterRepository:
      EncounterRepository,
    private readonly database:
      IDatabaseProvider
  ) {}

  public async get(
    id: string,
    tenantId: string
  ): Promise<Appointment | null> {
    return this.repository.findById(
      id,
      tenantId
    );
  }

  public async search(
    criteria: AppointmentSearchCriteria
  ): Promise<Appointment[]> {
    return this.repository.search(
      criteria
    );
  }

  public async create(
    appointment: Appointment
  ): Promise<Appointment> {
    const validated =
      createAppointment(
        appointment
      );

    await this.assertNoConflict(
      validated
    );

    return this.repository.create(
      validated
    );
  }

  public async update(
    appointment: Appointment
  ): Promise<Appointment> {
    const validated =
      createAppointment(
        appointment
      );

    await this.assertNoConflict(
      validated,
      validated.id
    );

    return this.repository.update(
      validated
    );
  }

  public async transition(
    id: string,
    tenantId: string,
    status: Appointment["status"],
    cancellationReason?: string
  ): Promise<Appointment> {
    if (status === "CHECKED_IN") {
      return this.checkIn(
        id,
        tenantId
      );
    }

    const existing =
      await this.repository.findById(
        id,
        tenantId
      );

    if (!existing) {
      throw new Error(
        "Appointment not found"
      );
    }

    assertAppointmentTransition(
      existing.status,
      status
    );

    const now = new Date();

    const updated: Appointment = {
      ...existing,
      status,
      updatedAt: now,

      cancelledAt:
        status === "CANCELLED"
          ? now
          : undefined,

      cancellationReason:
        status === "CANCELLED"
          ? cancellationReason
          : undefined,

      checkedInAt:
        existing.checkedInAt,

      completedAt:
        status === "COMPLETED"
          ? now
          : undefined
    };

    return this.repository.update(
      createAppointment(updated)
    );
  }

  private async checkIn(
    id: string,
    tenantId: string
  ): Promise<Appointment> {
    await this.database.beginTransaction();

    try {
      const existing =
        await this.repository.findById(
          id,
          tenantId
        );

      if (!existing) {
        throw new Error(
          "Appointment not found"
        );
      }

      if (
        existing.status === "CHECKED_IN" &&
        existing.encounterId
      ) {
        await this.database.commitTransaction();
        return existing;
      }

      assertAppointmentTransition(
        existing.status,
        "CHECKED_IN"
      );

      const now = new Date();

      let encounterId =
        existing.encounterId;

      if (encounterId) {
        const linkedEncounter =
          await this.encounterRepository.findById(
            encounterId,
            tenantId
          );

        if (!linkedEncounter) {
          throw new Error(
            "Appointment references an encounter that does not exist"
          );
        }

        if (
          linkedEncounter.patientId !==
            existing.patientId ||
          linkedEncounter.facilityId !==
            existing.facilityId
        ) {
          throw new Error(
            "Appointment encounter does not match the appointment patient and facility"
          );
        }
      } else {
        const encounter =
          this.createEncounterFromAppointment(
            existing,
            now
          );

        const createdEncounter =
          await this.encounterRepository.create(
            encounter
          );

        encounterId =
          createdEncounter.id;
      }

      const updated =
        createAppointment({
          ...existing,
          encounterId,
          status: "CHECKED_IN",
          checkedInAt:
            existing.checkedInAt ?? now,
          updatedAt: now
        });

      const saved =
        await this.repository.update(
          updated
        );

      await this.database.commitTransaction();

      return saved;
    } catch (error) {
      await this.database.rollbackTransaction();
      throw error;
    }
  }

  private createEncounterFromAppointment(
    appointment: Appointment,
    now: Date
  ): Encounter {
    return createEncounter({
      id: randomUUID(),
      tenantId:
        appointment.tenantId,
      patientId:
        appointment.patientId,
      facilityId:
        appointment.facilityId,
      attendingPractitionerId:
        appointment.practitionerId,
      encounterNumber:
        this.encounterNumber(
          appointment
        ),
      encounterType:
        appointment.appointmentType ===
        "VIRTUAL"
          ? "VIRTUAL"
          : "OUTPATIENT",
      status: "ARRIVED",
      source: "SCHEDULED",
      startedAt: now,
      reasonForEncounter:
        appointment.reason,
      createdAt: now,
      updatedAt: now,
      version: 1
    });
  }

  private encounterNumber(
    appointment: Appointment
  ): string {
    const appointmentPart =
      appointment.appointmentNumber
        .replace(
          /[^A-Za-z0-9-]/g,
          ""
        )
        .slice(-32);

    const uniquePart =
      appointment.id
        .replace(/-/g, "")
        .slice(0, 8)
        .toUpperCase();

    return `ENC-${appointmentPart}-${uniquePart}`;
  }

  private async assertNoConflict(
    appointment: Appointment,
    excludeAppointmentId?: string
  ): Promise<void> {
    const conflict =
      await this.repository.hasConflict({
        tenantId:
          appointment.tenantId,

        practitionerId:
          appointment.practitionerId,

        clinicalLocationId:
          appointment.clinicalLocationId,

        scheduledStart:
          appointment.scheduledStart,

        scheduledEnd:
          appointment.scheduledEnd,

        excludeAppointmentId
      });

    if (conflict) {
      throw new Error(
        "Appointment conflicts with an existing appointment"
      );
    }
  }
}

import {
  assertTenantScopedIdentity,
  assertVersion
} from "../shared.js";

import type {
  Appointment
} from "./types.js";

const appointmentStatuses =
  new Set<Appointment["status"]>([
    "BOOKED",
    "CONFIRMED",
    "CHECKED_IN",
    "COMPLETED",
    "CANCELLED",
    "NO_SHOW"
  ]);

const appointmentTypes =
  new Set<Appointment["appointmentType"]>([
    "CONSULTATION",
    "FOLLOW_UP",
    "PROCEDURE",
    "DIAGNOSTIC",
    "THERAPY",
    "VIRTUAL",
    "OTHER"
  ]);

const appointmentSources =
  new Set<Appointment["source"]>([
    "STAFF",
    "PATIENT_PORTAL",
    "REFERRAL",
    "WALK_IN",
    "EXTERNAL",
    "OTHER"
  ]);

function optionalText(
  value: string | undefined
): string | undefined {
  return value?.trim() || undefined;
}

function assertOptionalIdentifier(
  value: string | undefined,
  name: string
): void {
  if (
    value !== undefined &&
    !value.trim()
  ) {
    throw new Error(
      `${name} cannot be empty`
    );
  }
}

export function createAppointment(
  input: Appointment
): Appointment {
  assertTenantScopedIdentity(
    input.id,
    input.tenantId
  );

  assertVersion(input.version);

  if (!input.patientId.trim()) {
    throw new Error(
      "patientId is required"
    );
  }

  if (!input.facilityId.trim()) {
    throw new Error(
      "facilityId is required"
    );
  }

  if (!input.appointmentNumber.trim()) {
    throw new Error(
      "appointmentNumber is required"
    );
  }

  assertOptionalIdentifier(
    input.practitionerId,
    "practitionerId"
  );

  assertOptionalIdentifier(
    input.clinicalLocationId,
    "clinicalLocationId"
  );

  assertOptionalIdentifier(
    input.encounterId,
    "encounterId"
  );

  if (
    !appointmentTypes.has(
      input.appointmentType
    )
  ) {
    throw new Error(
      "appointmentType is invalid"
    );
  }

  if (
    !appointmentStatuses.has(
      input.status
    )
  ) {
    throw new Error(
      "appointment status is invalid"
    );
  }

  if (
    !appointmentSources.has(
      input.source
    )
  ) {
    throw new Error(
      "appointment source is invalid"
    );
  }

  if (
    Number.isNaN(
      input.scheduledStart.getTime()
    )
  ) {
    throw new Error(
      "scheduledStart is invalid"
    );
  }

  if (
    Number.isNaN(
      input.scheduledEnd.getTime()
    )
  ) {
    throw new Error(
      "scheduledEnd is invalid"
    );
  }

  if (
    input.scheduledEnd.getTime() <=
    input.scheduledStart.getTime()
  ) {
    throw new Error(
      "scheduledEnd must be after scheduledStart"
    );
  }

  if (
    input.status === "CANCELLED" &&
    !input.cancelledAt
  ) {
    throw new Error(
      "cancelledAt is required for a cancelled appointment"
    );
  }

  if (
    input.status !== "CANCELLED" &&
    (
      input.cancelledAt ||
      input.cancellationReason
    )
  ) {
    throw new Error(
      "cancellation details are only valid for a cancelled appointment"
    );
  }

  if (
    input.status === "CHECKED_IN" &&
    !input.checkedInAt
  ) {
    throw new Error(
      "checkedInAt is required for a checked-in appointment"
    );
  }

  if (
    input.status === "COMPLETED" &&
    !input.completedAt
  ) {
    throw new Error(
      "completedAt is required for a completed appointment"
    );
  }

  if (
    input.completedAt &&
    input.completedAt.getTime() <
      input.scheduledStart.getTime()
  ) {
    throw new Error(
      "completedAt cannot be before scheduledStart"
    );
  }

  return Object.freeze({
    ...input,

    patientId:
      input.patientId.trim(),

    facilityId:
      input.facilityId.trim(),

    practitionerId:
      optionalText(
        input.practitionerId
      ),

    clinicalLocationId:
      optionalText(
        input.clinicalLocationId
      ),

    encounterId:
      optionalText(
        input.encounterId
      ),

    appointmentNumber:
      input.appointmentNumber.trim(),

    reason:
      optionalText(
        input.reason
      ),

    notes:
      optionalText(
        input.notes
      ),

    cancellationReason:
      optionalText(
        input.cancellationReason
      )
  });
}

export function canTransitionAppointment(
  from: Appointment["status"],
  to: Appointment["status"]
): boolean {
  if (from === to) {
    return true;
  }

  const transitions:
    Readonly<
      Record<
        Appointment["status"],
        readonly Appointment["status"][]
      >
    > = {
      BOOKED: [
        "CONFIRMED",
        "CHECKED_IN",
        "CANCELLED",
        "NO_SHOW"
      ],

      CONFIRMED: [
        "CHECKED_IN",
        "CANCELLED",
        "NO_SHOW"
      ],

      CHECKED_IN: [
        "COMPLETED",
        "CANCELLED"
      ],

      COMPLETED: [],

      CANCELLED: [],

      NO_SHOW: []
    };

  return transitions[from].includes(to);
}

export function assertAppointmentTransition(
  from: Appointment["status"],
  to: Appointment["status"]
): void {
  if (
    !canTransitionAppointment(
      from,
      to
    )
  ) {
    throw new Error(
      `Appointment cannot transition from ${from} to ${to}`
    );
  }
}

import {
  describe,
  expect,
  it
} from "@jest/globals";

import {
  createPatientRegistration,
  type PatientRegistration
} from "@intrusionshield/his";

function registration(
  overrides: Partial<PatientRegistration> = {}
): PatientRegistration {
  const registeredAt =
    new Date("2026-09-17T12:00:00.000Z");

  return {
    id: "11111111-1111-4111-8111-111111111111",
    tenantId:
      "22222222-2222-4222-8222-222222222222",
    patientId:
      "33333333-3333-4333-8333-333333333333",
    facilityId:
      "44444444-4444-4444-8444-444444444444",
    registrationNumber: "REG-100001",
    registrationType: "OUTPATIENT",
    status: "REGISTERED",
    source: "WALK_IN",
    registeredAt,
    reasonForVisit: "Follow-up",
    registrationLocation: "Main Registration",
    createdAt: registeredAt,
    updatedAt: registeredAt,
    version: 1,
    ...overrides
  };
}

describe(
  "Patient Registration domain",
  () => {
    it(
      "creates a valid registration",
      () => {
        const value =
          createPatientRegistration(
            registration()
          );

        expect(
          value.registrationNumber
        ).toBe("REG-100001");

        expect(value.status).toBe(
          "REGISTERED"
        );
      }
    );

    it(
      "requires a patient",
      () => {
        expect(() =>
          createPatientRegistration(
            registration({
              patientId: " "
            })
          )
        ).toThrow("patientId is required");
      }
    );

    it(
      "requires a facility",
      () => {
        expect(() =>
          createPatientRegistration(
            registration({
              facilityId: ""
            })
          )
        ).toThrow("facilityId is required");
      }
    );

    it(
      "requires completion time for completed status",
      () => {
        expect(() =>
          createPatientRegistration(
            registration({
              status: "COMPLETED"
            })
          )
        ).toThrow(
          "completedAt is required"
        );
      }
    );

    it(
      "rejects completion before registration",
      () => {
        expect(() =>
          createPatientRegistration(
            registration({
              status: "COMPLETED",
              completedAt:
                new Date(
                  "2026-09-17T11:59:59.000Z"
                )
            })
          )
        ).toThrow(
          "completedAt cannot be before registeredAt"
        );
      }
    );

    it(
      "requires cancellation time for cancelled status",
      () => {
        expect(() =>
          createPatientRegistration(
            registration({
              status: "CANCELLED"
            })
          )
        ).toThrow(
          "cancelledAt is required"
        );
      }
    );
  }
);

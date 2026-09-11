import { describe, expect, it, jest } from "@jest/globals";

import { FacilityService } from "../application/FacilityService.js";
import { PatientService } from "../application/PatientService.js";
import { PersonService } from "../application/PersonService.js";
import { PractitionerService } from "../application/PractitionerService.js";

import type { FacilityRepository } from "../infrastructure/repositories/FacilityRepository.js";
import type { PatientRepository } from "../infrastructure/repositories/PatientRepository.js";
import type { PersonRepository } from "../infrastructure/repositories/PersonRepository.js";
import type { PractitionerRepository } from "../infrastructure/repositories/PractitionerRepository.js";

import type {
  Facility,
  Patient,
  Person,
  Practitioner
} from "@intrusionshield/his";

const person: Person = {
  id: "11111111-1111-1111-1111-111111111111",
  tenantId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  version: 1,
  firstName: "John",
  lastName: "Smith",
  sex: "MALE",
  identifiers: [],
  addresses: [],
  status: "ACTIVE"
};

const patient: Patient = {
  id: "22222222-2222-2222-2222-222222222222",
  tenantId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  version: 1,
  personId: person.id,
  medicalRecordNumber: "MRN-001",
  patientNumber: "PAT-001",
  status: "ACTIVE",
  registrationDate: new Date("2026-01-01T00:00:00.000Z"),
  emergencyContactPersonIds: []
};

const practitioner: Practitioner = {
  id: "33333333-3333-3333-3333-333333333333",
  tenantId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  version: 1,
  personId: person.id,
  practitionerNumber: "PRAC-001",
  practitionerType: "PHYSICIAN",
  status: "ACTIVE",
  licenses: [],
  specialties: [],
  effectiveFrom: new Date("2026-01-01T00:00:00.000Z")
};

const facility: Facility = {
  id: "44444444-4444-4444-4444-444444444444",
  tenantId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  version: 1,
  facilityType: "HOSPITAL",
  code: "HOSP-001",
  name: "General Hospital",
  status: "ACTIVE"
};

describe("HIS application services", () => {
  describe("PersonService", () => {
    it("delegates get to the repository", async () => {
      const repository: PersonRepository = {
        findById: jest.fn(),
        create: jest.fn(),
        update: jest.fn()
      };

      repository.findById.mockResolvedValue(person);

      const service = new PersonService(repository);

      const result = await service.get(person.id, person.tenantId);

      expect(repository.findById).toHaveBeenCalledWith(
        person.id,
        person.tenantId
      );
      expect(result).toBe(person);
    });

    it("delegates create to the repository", async () => {
      const repository: PersonRepository = {
        findById: jest.fn(),
        create: jest.fn(),
        update: jest.fn()
      };

      repository.create.mockResolvedValue(person);

      const service = new PersonService(repository);

      const result = await service.create(person);

      expect(repository.create).toHaveBeenCalledTimes(1);
      expect(repository.create).toHaveBeenCalledWith(person);
      expect(result).toBe(person);
    });

    it("delegates update to the repository", async () => {
      const repository: PersonRepository = {
        findById: jest.fn(),
        create: jest.fn(),
        update: jest.fn()
      };

      repository.update.mockResolvedValue(person);

      const service = new PersonService(repository);

      const result = await service.update(person);

      expect(repository.update).toHaveBeenCalledTimes(1);
      expect(repository.update).toHaveBeenCalledWith(person);
      expect(result).toBe(person);
    });
  });

  describe("PatientService", () => {
    it("delegates get to the repository", async () => {
      const repository: PatientRepository = {
        findById: jest.fn(),
        create: jest.fn(),
        update: jest.fn()
      };

      repository.findById.mockResolvedValue(patient);

      const service = new PatientService(repository);

      const result = await service.get(patient.id, patient.tenantId);

      expect(repository.findById).toHaveBeenCalledWith(
        patient.id,
        patient.tenantId
      );
      expect(result).toBe(patient);
    });

    it("delegates create to the repository", async () => {
      const repository: PatientRepository = {
        findById: jest.fn(),
        create: jest.fn(),
        update: jest.fn()
      };

      repository.create.mockResolvedValue(patient);

      const service = new PatientService(repository);

      const result = await service.create(patient);

      expect(repository.create).toHaveBeenCalledTimes(1);
      expect(repository.create).toHaveBeenCalledWith(patient);
      expect(result).toBe(patient);
    });

    it("delegates update to the repository", async () => {
      const repository: PatientRepository = {
        findById: jest.fn(),
        create: jest.fn(),
        update: jest.fn()
      };

      repository.update.mockResolvedValue(patient);

      const service = new PatientService(repository);

      const result = await service.update(patient);

      expect(repository.update).toHaveBeenCalledTimes(1);
      expect(repository.update).toHaveBeenCalledWith(patient);
      expect(result).toBe(patient);
    });
  });

  describe("PractitionerService", () => {
    it("delegates get to the repository", async () => {
      const repository: PractitionerRepository = {
        findById: jest.fn(),
        create: jest.fn(),
        update: jest.fn()
      };

      repository.findById.mockResolvedValue(practitioner);

      const service = new PractitionerService(repository);

      const result = await service.get(
        practitioner.id,
        practitioner.tenantId
      );

      expect(repository.findById).toHaveBeenCalledWith(
        practitioner.id,
        practitioner.tenantId
      );
      expect(result).toBe(practitioner);
    });

    it("delegates create to the repository", async () => {
      const repository: PractitionerRepository = {
        findById: jest.fn(),
        create: jest.fn(),
        update: jest.fn()
      };

      repository.create.mockResolvedValue(practitioner);

      const service = new PractitionerService(repository);

      const result = await service.create(practitioner);

      expect(repository.create).toHaveBeenCalledTimes(1);
      expect(repository.create).toHaveBeenCalledWith(practitioner);
      expect(result).toBe(practitioner);
    });

    it("delegates update to the repository", async () => {
      const repository: PractitionerRepository = {
        findById: jest.fn(),
        create: jest.fn(),
        update: jest.fn()
      };

      repository.update.mockResolvedValue(practitioner);

      const service = new PractitionerService(repository);

      const result = await service.update(practitioner);

      expect(repository.update).toHaveBeenCalledTimes(1);
      expect(repository.update).toHaveBeenCalledWith(practitioner);
      expect(result).toBe(practitioner);
    });
  });

  describe("FacilityService", () => {
    it("delegates get to the repository", async () => {
      const repository: FacilityRepository = {
        findById: jest.fn(),
        create: jest.fn(),
        update: jest.fn()
      };

      repository.findById.mockResolvedValue(facility);

      const service = new FacilityService(repository);

      const result = await service.get(facility.id, facility.tenantId);

      expect(repository.findById).toHaveBeenCalledWith(
        facility.id,
        facility.tenantId
      );
      expect(result).toBe(facility);
    });

    it("delegates create to the repository", async () => {
      const repository: FacilityRepository = {
        findById: jest.fn(),
        create: jest.fn(),
        update: jest.fn()
      };

      repository.create.mockResolvedValue(facility);

      const service = new FacilityService(repository);

      const result = await service.create(facility);

      expect(repository.create).toHaveBeenCalledTimes(1);
      expect(repository.create).toHaveBeenCalledWith(facility);
      expect(result).toBe(facility);
    });

    it("delegates update to the repository", async () => {
      const repository: FacilityRepository = {
        findById: jest.fn(),
        create: jest.fn(),
        update: jest.fn()
      };

      repository.update.mockResolvedValue(facility);

      const service = new FacilityService(repository);

      const result = await service.update(facility);

      expect(repository.update).toHaveBeenCalledTimes(1);
      expect(repository.update).toHaveBeenCalledWith(facility);
      expect(result).toBe(facility);
    });
  });
});
import { describe, expect, jest, test } from "@jest/globals";
import type { Request, Response } from "express";
import type {
  Facility,
  Patient,
  Person,
  Practitioner
} from "@intrusionshield/his";

import { PersonController } from "../controllers/PersonController.js";
import { PatientController } from "../controllers/PatientController.js";
import { PractitionerController } from "../controllers/PractitionerController.js";
import { FacilityController } from "../controllers/FacilityController.js";
import { tenantContext } from "../middleware/tenantContext.js";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_TENANT_ID = "22222222-2222-4222-8222-222222222222";

function createResponse() {
  const response = {
    locals: {} as Record<string, unknown>,
    status: jest.fn(),
    json: jest.fn()
  };

  response.status.mockReturnValue(response);
  response.json.mockReturnValue(response);

  return response;
}

function createRequest(
  params: Record<string, string | string[] | undefined> = {},
  body: unknown = undefined
): Request {
  return {
    params,
    body
  } as unknown as Request;
}

function createPerson(): Person {
  return {
    id: "person-1",
    tenantId: TENANT_ID,
    firstName: "John",
    lastName: "Smith",
    sex: "MALE",
    identifiers: [],
    addresses: [],
    status: "ACTIVE",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    version: 1
  };
}

function createPatient(): Patient {
  return {
    id: "patient-1",
    tenantId: TENANT_ID,
    personId: "person-1",
    medicalRecordNumber: "MRN-100",
    patientNumber: "PAT-100",
    status: "ACTIVE",
    registrationDate: new Date("2026-01-01"),
    emergencyContactPersonIds: [],
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    version: 1
  };
}

function createPractitioner(): Practitioner {
  return {
    id: "practitioner-1",
    tenantId: TENANT_ID,
    personId: "person-1",
    practitionerNumber: "PRAC-100",
    practitionerType: "PHYSICIAN",
    status: "ACTIVE",
    licenses: [],
    specialties: [],
    effectiveFrom: new Date("2026-01-01"),
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    version: 1
  };
}

function createFacility(): Facility {
  return {
    id: "facility-1",
    tenantId: TENANT_ID,
    facilityType: "HOSPITAL",
    code: "HOSP-100",
    name: "General Hospital",
    status: "ACTIVE",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    version: 1
  };
}

function setTenant(response: ReturnType<typeof createResponse>, tenantId = TENANT_ID) {
  response.locals.tenantId = tenantId;
}

describe("PersonController", () => {
  test("get returns 400 when id is missing", async () => {
    const service = {
      get: jest.fn()
    };

    const controller = new PersonController(service as never);
    const request = createRequest({});
    const response = createResponse();
    setTenant(response);

    await controller.get(request, response as unknown as Response);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({
      error: "id is required"
    });
    expect(service.get).not.toHaveBeenCalled();
  });

  test("get passes id and tenant to the service", async () => {
    const person = createPerson();

    const service = {
      get: jest.fn().mockResolvedValue(person)
    };

    const controller = new PersonController(service as never);
    const request = createRequest({ id: "person-1" });
    const response = createResponse();
    setTenant(response);

    await controller.get(request, response as unknown as Response);

    expect(service.get).toHaveBeenCalledWith("person-1", TENANT_ID);
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith(person);
  });

  test("get returns 404 when service returns null", async () => {
    const service = {
      get: jest.fn().mockResolvedValue(null)
    };

    const controller = new PersonController(service as never);
    const request = createRequest({ id: "person-1" });
    const response = createResponse();
    setTenant(response);

    await controller.get(request, response as unknown as Response);

    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.json).toHaveBeenCalledWith({
      error: "Person not found"
    });
  });

  test("create overrides the request tenant with tenant context", async () => {
    const created = createPerson();

    const service = {
      create: jest.fn().mockResolvedValue(created)
    };

    const controller = new PersonController(service as never);
    const request = createRequest(
      {},
      {
        tenantId: OTHER_TENANT_ID,
        firstName: "John",
        lastName: "Smith",
        sex: "MALE",
        identifiers: [],
        addresses: []
      }
    );

    const response = createResponse();
    setTenant(response);

    await controller.create(
      request,
      response as unknown as Response
    );

    expect(service.create).toHaveBeenCalledTimes(1);

    const argument = service.create.mock.calls[0][0];

    expect(argument.tenantId).toBe(TENANT_ID);
    expect(argument.tenantId).not.toBe(OTHER_TENANT_ID);
    expect(argument.firstName).toBe("John");
    expect(argument.lastName).toBe("Smith");
    expect(argument.version).toBe(1);

    expect(response.status).toHaveBeenCalledWith(201);
    expect(response.json).toHaveBeenCalledWith(created);
  });

  test("create generates an id and defaults sex and status", async () => {
    const service = {
      create: jest.fn().mockImplementation(async (person: Person) => person)
    };

    const controller = new PersonController(service as never);
    const request = createRequest(
      {},
      {
        firstName: "Jane",
        lastName: "Doe"
      }
    );

    const response = createResponse();
    setTenant(response);

    await controller.create(
      request,
      response as unknown as Response
    );

    const argument = service.create.mock.calls[0][0];

    expect(argument.id).toEqual(expect.any(String));
    expect(argument.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(argument.tenantId).toBe(TENANT_ID);
    expect(argument.sex).toBe("UNKNOWN");
    expect(argument.status).toBe("ACTIVE");
    expect(argument.identifiers).toEqual([]);
    expect(argument.addresses).toEqual([]);
  });

  test("create converts dateOfBirth using the request helper", async () => {
    const service = {
      create: jest.fn().mockImplementation(async (person: Person) => person)
    };

    const controller = new PersonController(service as never);
    const request = createRequest(
      {},
      {
        firstName: "Jane",
        lastName: "Doe",
        dateOfBirth: "1985-05-10"
      }
    );

    const response = createResponse();
    setTenant(response);

    await controller.create(
      request,
      response as unknown as Response
    );

    const argument = service.create.mock.calls[0][0];

    expect(argument.dateOfBirth).toEqual(new Date("1985-05-10"));
  });

  test("update returns 404 before calling service.update when entity is absent", async () => {
    const service = {
      get: jest.fn().mockResolvedValue(null),
      update: jest.fn()
    };

    const controller = new PersonController(service as never);
    const request = createRequest(
      { id: "person-1" },
      {
        firstName: "Updated"
      }
    );

    const response = createResponse();
    setTenant(response);

    await controller.update(
      request,
      response as unknown as Response
    );

    expect(service.get).toHaveBeenCalledWith(
      "person-1",
      TENANT_ID
    );
    expect(service.update).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(404);
  });

  test("update preserves identity and tenant and accepts supplied version", async () => {
    const existing = createPerson();

    const service = {
      get: jest.fn().mockResolvedValue(existing),
      update: jest.fn().mockImplementation(async (person: Person) => person)
    };

    const controller = new PersonController(service as never);

    const request = createRequest(
      { id: "person-1" },
      {
        firstName: "Updated",
        lastName: "Smith",
        version: 7,
        tenantId: OTHER_TENANT_ID
      }
    );

    const response = createResponse();
    setTenant(response);

    await controller.update(
      request,
      response as unknown as Response
    );

    const argument = service.update.mock.calls[0][0];

    expect(argument.id).toBe("person-1");
    expect(argument.tenantId).toBe(TENANT_ID);
    expect(argument.tenantId).not.toBe(OTHER_TENANT_ID);
    expect(argument.version).toBe(7);
    expect(argument.firstName).toBe("Updated");

    expect(response.status).toHaveBeenCalledWith(200);
  });
});

describe("PatientController", () => {
  test("get uses tenant context", async () => {
    const patient = createPatient();

    const service = {
      get: jest.fn().mockResolvedValue(patient)
    };

    const controller = new PatientController(service as never);
    const request = createRequest({ id: "patient-1" });
    const response = createResponse();
    setTenant(response);

    await controller.get(
      request,
      response as unknown as Response
    );

    expect(service.get).toHaveBeenCalledWith(
      "patient-1",
      TENANT_ID
    );
    expect(response.status).toHaveBeenCalledWith(200);
  });

  test("get returns 404 when patient does not exist", async () => {
    const service = {
      get: jest.fn().mockResolvedValue(null)
    };

    const controller = new PatientController(service as never);
    const request = createRequest({ id: "patient-1" });
    const response = createResponse();
    setTenant(response);

    await controller.get(
      request,
      response as unknown as Response
    );

    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.json).toHaveBeenCalledWith({
      error: "Patient not found"
    });
  });

  test("create forces tenant context", async () => {
    const service = {
      create: jest.fn().mockImplementation(async (patient: Patient) => patient)
    };

    const controller = new PatientController(service as never);

    const request = createRequest(
      {},
      {
        ...createPatient(),
        tenantId: OTHER_TENANT_ID
      }
    );

    const response = createResponse();
    setTenant(response);

    await controller.create(
      request,
      response as unknown as Response
    );

    const argument = service.create.mock.calls[0][0];

    expect(argument.tenantId).toBe(TENANT_ID);
    expect(argument.tenantId).not.toBe(OTHER_TENANT_ID);
    expect(response.status).toHaveBeenCalledWith(201);
  });

  test("update obtains existing version and does not trust request version", async () => {
    const existing = createPatient();
    existing.version = 5;

    const service = {
      get: jest.fn().mockResolvedValue(existing),
      update: jest.fn().mockImplementation(async (patient: Patient) => patient)
    };

    const controller = new PatientController(service as never);

    const request = createRequest(
      { id: "patient-1" },
      {
        ...createPatient(),
        version: 999,
        tenantId: OTHER_TENANT_ID
      }
    );

    const response = createResponse();
    setTenant(response);

    await controller.update(
      request,
      response as unknown as Response
    );

    const argument = service.update.mock.calls[0][0];

    expect(service.get).toHaveBeenCalledWith(
      "patient-1",
      TENANT_ID
    );
    expect(argument.id).toBe("patient-1");
    expect(argument.tenantId).toBe(TENANT_ID);
    expect(argument.version).toBe(5);
    expect(argument.version).not.toBe(999);
    expect(response.status).toHaveBeenCalledWith(200);
  });

  test("update returns 404 when patient is absent", async () => {
    const service = {
      get: jest.fn().mockResolvedValue(null),
      update: jest.fn()
    };

    const controller = new PatientController(service as never);
    const request = createRequest(
      { id: "patient-1" },
      createPatient()
    );

    const response = createResponse();
    setTenant(response);

    await controller.update(
      request,
      response as unknown as Response
    );

    expect(service.update).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(404);
  });
});

describe("PractitionerController", () => {
  test("get uses tenant context", async () => {
    const practitioner = createPractitioner();

    const service = {
      get: jest.fn().mockResolvedValue(practitioner)
    };

    const controller = new PractitionerController(service as never);
    const request = createRequest({ id: "practitioner-1" });
    const response = createResponse();
    setTenant(response);

    await controller.get(
      request,
      response as unknown as Response
    );

    expect(service.get).toHaveBeenCalledWith(
      "practitioner-1",
      TENANT_ID
    );
    expect(response.status).toHaveBeenCalledWith(200);
  });

  test("get returns 404 when practitioner does not exist", async () => {
    const service = {
      get: jest.fn().mockResolvedValue(null)
    };

    const controller = new PractitionerController(service as never);
    const request = createRequest({ id: "practitioner-1" });
    const response = createResponse();
    setTenant(response);

    await controller.get(
      request,
      response as unknown as Response
    );

    expect(response.status).toHaveBeenCalledWith(404);
  });

  test("create forces tenant context", async () => {
    const service = {
      create: jest.fn().mockImplementation(
        async (practitioner: Practitioner) => practitioner
      )
    };

    const controller = new PractitionerController(service as never);

    const request = createRequest(
      {},
      {
        ...createPractitioner(),
        tenantId: OTHER_TENANT_ID
      }
    );

    const response = createResponse();
    setTenant(response);

    await controller.create(
      request,
      response as unknown as Response
    );

    const argument = service.create.mock.calls[0][0];

    expect(argument.tenantId).toBe(TENANT_ID);
    expect(argument.tenantId).not.toBe(OTHER_TENANT_ID);
    expect(response.status).toHaveBeenCalledWith(201);
  });

  test("update uses the existing practitioner version", async () => {
    const existing = createPractitioner();
    existing.version = 4;

    const service = {
      get: jest.fn().mockResolvedValue(existing),
      update: jest.fn().mockImplementation(
        async (practitioner: Practitioner) => practitioner
      )
    };

    const controller = new PractitionerController(service as never);

    const request = createRequest(
      { id: "practitioner-1" },
      {
        ...createPractitioner(),
        version: 999,
        tenantId: OTHER_TENANT_ID
      }
    );

    const response = createResponse();
    setTenant(response);

    await controller.update(
      request,
      response as unknown as Response
    );

    const argument = service.update.mock.calls[0][0];

    expect(argument.id).toBe("practitioner-1");
    expect(argument.tenantId).toBe(TENANT_ID);
    expect(argument.version).toBe(4);
    expect(argument.version).not.toBe(999);
    expect(response.status).toHaveBeenCalledWith(200);
  });
});

describe("FacilityController", () => {
  test("get uses tenant context", async () => {
    const facility = createFacility();

    const service = {
      get: jest.fn().mockResolvedValue(facility)
    };

    const controller = new FacilityController(service as never);
    const request = createRequest({ id: "facility-1" });
    const response = createResponse();
    setTenant(response);

    await controller.get(
      request,
      response as unknown as Response
    );

    expect(service.get).toHaveBeenCalledWith(
      "facility-1",
      TENANT_ID
    );
    expect(response.status).toHaveBeenCalledWith(200);
  });

  test("get returns 404 when facility does not exist", async () => {
    const service = {
      get: jest.fn().mockResolvedValue(null)
    };

    const controller = new FacilityController(service as never);
    const request = createRequest({ id: "facility-1" });
    const response = createResponse();
    setTenant(response);

    await controller.get(
      request,
      response as unknown as Response
    );

    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.json).toHaveBeenCalledWith({
      error: "Facility not found"
    });
  });

  test("create forces tenant context", async () => {
    const service = {
      create: jest.fn().mockImplementation(
        async (facility: Facility) => facility
      )
    };

    const controller = new FacilityController(service as never);

    const request = createRequest(
      {},
      {
        ...createFacility(),
        tenantId: OTHER_TENANT_ID
      }
    );

    const response = createResponse();
    setTenant(response);

    await controller.create(
      request,
      response as unknown as Response
    );

    const argument = service.create.mock.calls[0][0];

    expect(argument.tenantId).toBe(TENANT_ID);
    expect(argument.tenantId).not.toBe(OTHER_TENANT_ID);
    expect(response.status).toHaveBeenCalledWith(201);
  });

  test("update uses existing facility version", async () => {
    const existing = createFacility();
    existing.version = 8;

    const service = {
      get: jest.fn().mockResolvedValue(existing),
      update: jest.fn().mockImplementation(
        async (facility: Facility) => facility
      )
    };

    const controller = new FacilityController(service as never);

    const request = createRequest(
      { id: "facility-1" },
      {
        ...createFacility(),
        version: 999,
        tenantId: OTHER_TENANT_ID
      }
    );

    const response = createResponse();
    setTenant(response);

    await controller.update(
      request,
      response as unknown as Response
    );

    const argument = service.update.mock.calls[0][0];

    expect(argument.id).toBe("facility-1");
    expect(argument.tenantId).toBe(TENANT_ID);
    expect(argument.version).toBe(8);
    expect(argument.version).not.toBe(999);
    expect(response.status).toHaveBeenCalledWith(200);
  });
});

describe("tenantContext", () => {
  test("rejects a missing tenant header", () => {
    const request = {
      header: jest.fn().mockReturnValue(undefined)
    } as unknown as Request;

    const response = createResponse();
    const next = jest.fn();

    tenantContext(
      request,
      response as unknown as Response,
      next
    );

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({
      error: "A valid x-tenant-id header is required."
    });
    expect(next).not.toHaveBeenCalled();
  });

  test("rejects an invalid tenant header", () => {
    const request = {
      header: jest.fn().mockReturnValue("not-a-uuid")
    } as unknown as Request;

    const response = createResponse();
    const next = jest.fn();

    tenantContext(
      request,
      response as unknown as Response,
      next
    );

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({
      error: "A valid x-tenant-id header is required."
    });
    expect(next).not.toHaveBeenCalled();
  });

  test("accepts a valid UUID tenant header and stores it in response locals", () => {
    const request = {
      header: jest.fn().mockReturnValue(TENANT_ID)
    } as unknown as Request;

    const response = createResponse();
    const next = jest.fn();

    tenantContext(
      request,
      response as unknown as Response,
      next
    );

    expect(response.locals.tenantId).toBe(TENANT_ID);
    expect(next).toHaveBeenCalledTimes(1);
    expect(response.status).not.toHaveBeenCalled();
  });

  test("accepts uppercase UUID tenant identifiers", () => {
    const uppercaseTenantId = TENANT_ID.toUpperCase();

    const request = {
      header: jest.fn().mockReturnValue(uppercaseTenantId)
    } as unknown as Request;

    const response = createResponse();
    const next = jest.fn();

    tenantContext(
      request,
      response as unknown as Response,
      next
    );

    expect(response.locals.tenantId).toBe(uppercaseTenantId);
    expect(next).toHaveBeenCalledTimes(1);
  });
});

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  jest,
  test
} from "@jest/globals";

import type {
  Server
} from "node:http";

import type {
  AddressInfo
} from "node:net";

import {
  createApp
} from "../app.js";

const TENANT_ID =
  "11111111-1111-4111-8111-111111111111";

const OTHER_TENANT_ID =
  "22222222-2222-4222-8222-222222222222";

const personListResult = {
  items: [
    {
      id: "person-1",
      firstName: "Sarah",
      lastName: "Mitchell",
      status: "ACTIVE",
      primaryIdentifier: "MRN-100024",
      updatedAt:
        new Date("2026-09-12T12:00:00Z")
    }
  ],
  page: 1,
  pageSize: 25,
  total: 1,
  totalPages: 1
};

const personService = {
  get: jest.fn(),
  list: jest.fn(),
  create: jest.fn(),
  update: jest.fn()
};

const patientService = {
  get: jest.fn(),
  create: jest.fn(),
  update: jest.fn()
};

const practitionerService = {
  get: jest.fn(),
  create: jest.fn(),
  update: jest.fn()
};

const facilityService = {
  get: jest.fn(),
  create: jest.fn(),
  update: jest.fn()
};

describe(
  "GET /api/v1/his/persons",
  () => {
    let server: Server;
    let baseUrl: string;

    beforeAll(async () => {
      const app = createApp({
        personService:
          personService as never,
        patientService:
          patientService as never,
        practitionerService:
          practitionerService as never,
        facilityService:
          facilityService as never
      });

      await new Promise<void>(
        (resolve) => {
          server = app.listen(
            0,
            "127.0.0.1",
            resolve
          );
        }
      );

      const address =
        server.address() as AddressInfo;

      baseUrl =
        `http://127.0.0.1:${address.port}`;
    });

    afterAll(async () => {
      if (!server) {
        return;
      }

      await new Promise<void>(
        (resolve, reject) => {
          server.close((error) => {
            if (error) {
              reject(error);
              return;
            }

            resolve();
          });
        }
      );
    });

    beforeEach(() => {
      jest.clearAllMocks();

      personService.list.mockResolvedValue(
        personListResult as never
      );
    });

    test(
      "rejects a request with no tenant header",
      async () => {
        const response = await fetch(
          `${baseUrl}/api/v1/his/persons`
        );

        const body =
          await response.json();

        expect(response.status).toBe(400);

        expect(body).toEqual({
          error:
            "A valid x-tenant-id header is required."
        });

        expect(
          personService.list
        ).not.toHaveBeenCalled();
      }
    );

    test(
      "rejects an invalid tenant header",
      async () => {
        const response = await fetch(
          `${baseUrl}/api/v1/his/persons`,
          {
            headers: {
              "x-tenant-id":
                "not-a-valid-uuid"
            }
          }
        );

        const body =
          await response.json();

        expect(response.status).toBe(400);

        expect(body).toEqual({
          error:
            "A valid x-tenant-id header is required."
        });

        expect(
          personService.list
        ).not.toHaveBeenCalled();
      }
    );

    test(
      "returns the Person collection for a valid tenant",
      async () => {
        const response = await fetch(
          `${baseUrl}/api/v1/his/persons`,
          {
            headers: {
              "x-tenant-id": TENANT_ID
            }
          }
        );

        const body =
          await response.json();

        expect(response.status).toBe(200);

        expect(
          personService.list
        ).toHaveBeenCalledWith({
          tenantId: TENANT_ID,
          page: 1,
          pageSize: 25,
          search: undefined,
          status: undefined
        });

        expect(body).toEqual({
          items: [
            {
              id: "person-1",
              firstName: "Sarah",
              lastName: "Mitchell",
              status: "ACTIVE",
              primaryIdentifier:
                "MRN-100024",
              updatedAt:
                "2026-09-12T12:00:00.000Z"
            }
          ],
          page: 1,
          pageSize: 25,
          total: 1,
          totalPages: 1
        });
      }
    );

    test(
      "passes page and pageSize through the HTTP route",
      async () => {
        const response = await fetch(
          `${baseUrl}/api/v1/his/persons?page=3&pageSize=50`,
          {
            headers: {
              "x-tenant-id": TENANT_ID
            }
          }
        );

        expect(response.status).toBe(200);

        expect(
          personService.list
        ).toHaveBeenCalledWith({
          tenantId: TENANT_ID,
          page: 3,
          pageSize: 50,
          search: undefined,
          status: undefined
        });
      }
    );

    test(
      "passes search through the HTTP route",
      async () => {
        const response = await fetch(
          `${baseUrl}/api/v1/his/persons?search=Mitchell`,
          {
            headers: {
              "x-tenant-id": TENANT_ID
            }
          }
        );

        expect(response.status).toBe(200);

        expect(
          personService.list
        ).toHaveBeenCalledWith({
          tenantId: TENANT_ID,
          page: 1,
          pageSize: 25,
          search: "Mitchell",
          status: undefined
        });
      }
    );

    test(
      "passes status through the HTTP route",
      async () => {
        const response = await fetch(
          `${baseUrl}/api/v1/his/persons?status=inactive`,
          {
            headers: {
              "x-tenant-id": TENANT_ID
            }
          }
        );

        expect(response.status).toBe(200);

        expect(
          personService.list
        ).toHaveBeenCalledWith({
          tenantId: TENANT_ID,
          page: 1,
          pageSize: 25,
          search: undefined,
          status: "INACTIVE"
        });
      }
    );

    test(
      "passes pagination search and status together",
      async () => {
        const response = await fetch(
          `${baseUrl}/api/v1/his/persons?page=2&pageSize=10&search=Smith&status=active`,
          {
            headers: {
              "x-tenant-id": TENANT_ID
            }
          }
        );

        expect(response.status).toBe(200);

        expect(
          personService.list
        ).toHaveBeenCalledWith({
          tenantId: TENANT_ID,
          page: 2,
          pageSize: 10,
          search: "Smith",
          status: "ACTIVE"
        });
      }
    );

    test(
      "rejects an invalid page through the HTTP route",
      async () => {
        const response = await fetch(
          `${baseUrl}/api/v1/his/persons?page=0`,
          {
            headers: {
              "x-tenant-id": TENANT_ID
            }
          }
        );

        const body =
          await response.json();

        expect(response.status).toBe(400);

        expect(body).toEqual({
          error:
            "page must be a positive integer"
        });

        expect(
          personService.list
        ).not.toHaveBeenCalled();
      }
    );

    test(
      "rejects an invalid pageSize through the HTTP route",
      async () => {
        const response = await fetch(
          `${baseUrl}/api/v1/his/persons?pageSize=101`,
          {
            headers: {
              "x-tenant-id": TENANT_ID
            }
          }
        );

        const body =
          await response.json();

        expect(response.status).toBe(400);

        expect(body).toEqual({
          error:
            "pageSize must be an integer between 1 and 100"
        });

        expect(
          personService.list
        ).not.toHaveBeenCalled();
      }
    );

    test(
      "rejects an invalid status through the HTTP route",
      async () => {
        const response = await fetch(
          `${baseUrl}/api/v1/his/persons?status=pending`,
          {
            headers: {
              "x-tenant-id": TENANT_ID
            }
          }
        );

        const body =
          await response.json();

        expect(response.status).toBe(400);

        expect(body).toEqual({
          error:
            "status must be ACTIVE, INACTIVE, or DECEASED"
        });

        expect(
          personService.list
        ).not.toHaveBeenCalled();
      }
    );

    test(
      "does not accept tenant identity from the query string",
      async () => {
        const response = await fetch(
          `${baseUrl}/api/v1/his/persons?tenantId=${OTHER_TENANT_ID}`,
          {
            headers: {
              "x-tenant-id": TENANT_ID
            }
          }
        );

        expect(response.status).toBe(200);

        expect(
          personService.list
        ).toHaveBeenCalledWith({
          tenantId: TENANT_ID,
          page: 1,
          pageSize: 25,
          search: undefined,
          status: undefined
        });

        expect(
          personService.list
        ).not.toHaveBeenCalledWith(
          expect.objectContaining({
            tenantId: OTHER_TENANT_ID
          })
        );
      }
    );
  }
);
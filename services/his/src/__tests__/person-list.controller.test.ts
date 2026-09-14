import {
  describe,
  expect,
  jest,
  test
} from "@jest/globals";

import type {
  Request,
  Response
} from "express";

import {
  PersonController
} from "../controllers/PersonController.js";

const TENANT_ID =
  "11111111-1111-4111-8111-111111111111";

function createResponse() {
  const response = {
    locals: {
      tenantId: TENANT_ID
    } as Record<string, unknown>,
    status: jest.fn(),
    json: jest.fn()
  };

  response.status.mockReturnValue(response);
  response.json.mockReturnValue(response);

  return response;
}

function createRequest(
  query: Record<
    string,
    string | string[] | undefined
  > = {}
): Request {
  return {
    query
  } as unknown as Request;
}

function createListResult() {
  return {
    items: [
      {
        id: "person-1",
        firstName: "John",
        lastName: "Smith",
        status: "ACTIVE" as const,
        primaryIdentifier: "MRN-100",
        updatedAt:
          new Date("2026-09-12T12:00:00Z")
      }
    ],
    page: 1,
    pageSize: 25,
    total: 1,
    totalPages: 1
  };
}

describe("PersonController.list", () => {
  test(
    "uses default pagination values",
    async () => {
      const result = createListResult();

      const service = {
        list: jest
          .fn()
          .mockResolvedValue(result)
      };

      const controller =
        new PersonController(
          service as never
        );

      const request = createRequest();
      const response = createResponse();

      await controller.list(
        request,
        response as unknown as Response
      );

      expect(
        service.list
      ).toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        page: 1,
        pageSize: 25,
        search: undefined,
        status: undefined
      });

      expect(
        response.status
      ).toHaveBeenCalledWith(200);

      expect(
        response.json
      ).toHaveBeenCalledWith(result);
    }
  );

  test(
    "accepts explicit page and pageSize",
    async () => {
      const result = {
        ...createListResult(),
        page: 3,
        pageSize: 50
      };

      const service = {
        list: jest
          .fn()
          .mockResolvedValue(result)
      };

      const controller =
        new PersonController(
          service as never
        );

      const request = createRequest({
        page: "3",
        pageSize: "50"
      });

      const response = createResponse();

      await controller.list(
        request,
        response as unknown as Response
      );

      expect(
        service.list
      ).toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        page: 3,
        pageSize: 50,
        search: undefined,
        status: undefined
      });

      expect(
        response.status
      ).toHaveBeenCalledWith(200);
    }
  );

  test(
    "trims search text before passing it to the service",
    async () => {
      const result = createListResult();

      const service = {
        list: jest
          .fn()
          .mockResolvedValue(result)
      };

      const controller =
        new PersonController(
          service as never
        );

      const request = createRequest({
        search: "  Smith  "
      });

      const response = createResponse();

      await controller.list(
        request,
        response as unknown as Response
      );

      expect(
        service.list
      ).toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        page: 1,
        pageSize: 25,
        search: "Smith",
        status: undefined
      });
    }
  );

  test(
    "converts an empty search to undefined",
    async () => {
      const result = createListResult();

      const service = {
        list: jest
          .fn()
          .mockResolvedValue(result)
      };

      const controller =
        new PersonController(
          service as never
        );

      const request = createRequest({
        search: "   "
      });

      const response = createResponse();

      await controller.list(
        request,
        response as unknown as Response
      );

      expect(
        service.list
      ).toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        page: 1,
        pageSize: 25,
        search: undefined,
        status: undefined
      });
    }
  );

  test(
    "normalizes status to uppercase",
    async () => {
      const result = createListResult();

      const service = {
        list: jest
          .fn()
          .mockResolvedValue(result)
      };

      const controller =
        new PersonController(
          service as never
        );

      const request = createRequest({
        status: "active"
      });

      const response = createResponse();

      await controller.list(
        request,
        response as unknown as Response
      );

      expect(
        service.list
      ).toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        page: 1,
        pageSize: 25,
        search: undefined,
        status: "ACTIVE"
      });
    }
  );

  test(
    "accepts INACTIVE status",
    async () => {
      const result = createListResult();

      const service = {
        list: jest
          .fn()
          .mockResolvedValue(result)
      };

      const controller =
        new PersonController(
          service as never
        );

      const request = createRequest({
        status: "inactive"
      });

      const response = createResponse();

      await controller.list(
        request,
        response as unknown as Response
      );

      expect(
        service.list
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
    "accepts DECEASED status",
    async () => {
      const result = createListResult();

      const service = {
        list: jest
          .fn()
          .mockResolvedValue(result)
      };

      const controller =
        new PersonController(
          service as never
        );

      const request = createRequest({
        status: "deceased"
      });

      const response = createResponse();

      await controller.list(
        request,
        response as unknown as Response
      );

      expect(
        service.list
      ).toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        page: 1,
        pageSize: 25,
        search: undefined,
        status: "DECEASED"
      });
    }
  );

  test(
    "uses the tenant from response locals",
    async () => {
      const result = createListResult();

      const service = {
        list: jest
          .fn()
          .mockResolvedValue(result)
      };

      const controller =
        new PersonController(
          service as never
        );

      const request = createRequest({
        page: "2"
      });

      const response = createResponse();

      response.locals.tenantId =
        "22222222-2222-4222-8222-222222222222";

      await controller.list(
        request,
        response as unknown as Response
      );

      expect(
        service.list
      ).toHaveBeenCalledWith({
        tenantId:
          "22222222-2222-4222-8222-222222222222",
        page: 2,
        pageSize: 25,
        search: undefined,
        status: undefined
      });
    }
  );

  test(
    "rejects page zero",
    async () => {
      const service = {
        list: jest.fn()
      };

      const controller =
        new PersonController(
          service as never
        );

      const request = createRequest({
        page: "0"
      });

      const response = createResponse();

      await controller.list(
        request,
        response as unknown as Response
      );

      expect(
        response.status
      ).toHaveBeenCalledWith(400);

      expect(
        response.json
      ).toHaveBeenCalledWith({
        error:
          "page must be a positive integer"
      });

      expect(
        service.list
      ).not.toHaveBeenCalled();
    }
  );

  test(
    "rejects a negative page",
    async () => {
      const service = {
        list: jest.fn()
      };

      const controller =
        new PersonController(
          service as never
        );

      const request = createRequest({
        page: "-1"
      });

      const response = createResponse();

      await controller.list(
        request,
        response as unknown as Response
      );

      expect(
        response.status
      ).toHaveBeenCalledWith(400);

      expect(
        service.list
      ).not.toHaveBeenCalled();
    }
  );

  test(
    "rejects a non-integer page",
    async () => {
      const service = {
        list: jest.fn()
      };

      const controller =
        new PersonController(
          service as never
        );

      const request = createRequest({
        page: "1.5"
      });

      const response = createResponse();

      await controller.list(
        request,
        response as unknown as Response
      );

      expect(
        response.status
      ).toHaveBeenCalledWith(400);

      expect(
        service.list
      ).not.toHaveBeenCalled();
    }
  );

  test(
    "rejects pageSize zero",
    async () => {
      const service = {
        list: jest.fn()
      };

      const controller =
        new PersonController(
          service as never
        );

      const request = createRequest({
        pageSize: "0"
      });

      const response = createResponse();

      await controller.list(
        request,
        response as unknown as Response
      );

      expect(
        response.status
      ).toHaveBeenCalledWith(400);

      expect(
        response.json
      ).toHaveBeenCalledWith({
        error:
          "pageSize must be an integer between 1 and 100"
      });

      expect(
        service.list
      ).not.toHaveBeenCalled();
    }
  );

  test(
    "rejects pageSize greater than 100",
    async () => {
      const service = {
        list: jest.fn()
      };

      const controller =
        new PersonController(
          service as never
        );

      const request = createRequest({
        pageSize: "101"
      });

      const response = createResponse();

      await controller.list(
        request,
        response as unknown as Response
      );

      expect(
        response.status
      ).toHaveBeenCalledWith(400);

      expect(
        service.list
      ).not.toHaveBeenCalled();
    }
  );

  test(
    "rejects a non-integer pageSize",
    async () => {
      const service = {
        list: jest.fn()
      };

      const controller =
        new PersonController(
          service as never
        );

      const request = createRequest({
        pageSize: "10.5"
      });

      const response = createResponse();

      await controller.list(
        request,
        response as unknown as Response
      );

      expect(
        response.status
      ).toHaveBeenCalledWith(400);

      expect(
        service.list
      ).not.toHaveBeenCalled();
    }
  );

  test(
    "rejects an invalid status",
    async () => {
      const service = {
        list: jest.fn()
      };

      const controller =
        new PersonController(
          service as never
        );

      const request = createRequest({
        status: "pending"
      });

      const response = createResponse();

      await controller.list(
        request,
        response as unknown as Response
      );

      expect(
        response.status
      ).toHaveBeenCalledWith(400);

      expect(
        response.json
      ).toHaveBeenCalledWith({
        error:
          "status must be ACTIVE, INACTIVE, or DECEASED"
      });

      expect(
        service.list
      ).not.toHaveBeenCalled();
    }
  );

  test(
    "passes search status and pagination together",
    async () => {
      const result = createListResult();

      const service = {
        list: jest
          .fn()
          .mockResolvedValue(result)
      };

      const controller =
        new PersonController(
          service as never
        );

      const request = createRequest({
        page: "4",
        pageSize: "10",
        search: "  Mitchell ",
        status: "active"
      });

      const response = createResponse();

      await controller.list(
        request,
        response as unknown as Response
      );

      expect(
        service.list
      ).toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        page: 4,
        pageSize: 10,
        search: "Mitchell",
        status: "ACTIVE"
      });

      expect(
        response.status
      ).toHaveBeenCalledWith(200);

      expect(
        response.json
      ).toHaveBeenCalledWith(result);
    }
  );
});
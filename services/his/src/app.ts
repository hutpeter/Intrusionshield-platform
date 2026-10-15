import express from "express";
import type { Express } from "express";

import {
  createHisRouter,
  type HisServices
} from "./routes/index.js";

export function createApp(
  services?: HisServices
): Express {
  const app = express();

  app.disable("x-powered-by");

  app.use(
    express.json({
      limit: "1mb"
    })
  );

  app.get(
    "/health",
    (_req, res) => {
      res.status(200).json({
        service: "his",
        status: "ok"
      });
    }
  );

  if (services) {
    app.use(
      "/api/v1/his",
      createHisRouter(services)
    );
  }

  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      const message =
        error instanceof Error
          ? error.message
          : "Internal server error";

      let status = 500;

      if (
        /conflict|modified by another|was modified/i.test(
          message
        )
      ) {
        status = 409;
      }
      else if (
        /not found/i.test(
          message
        )
      ) {
        status = 404;
      }
      else if (
        /required|invalid|future|before|after|positive|cannot transition/i.test(
          message
        )
      ) {
        status = 400;
      }

      res.status(status).json({
        error: message
      });
    }
  );

  return app;
}

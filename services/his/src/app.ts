import express from "express";
import { createHisRouter, type HisServices } from "./routes/index.js";

export function createApp(services?: HisServices) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    res.status(200).json({ service: "his", status: "ok" });
  });

  if (services) {
    app.use("/api/v1/his", createHisRouter(services));
  }

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = /required|invalid|future|after|positive/i.test(message) ? 400 : 500;
    res.status(status).json({ error: message });
  });

  return app;
}

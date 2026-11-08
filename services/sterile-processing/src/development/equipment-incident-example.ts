import { createHash } from "node:crypto";
import {
  EquipmentRegistry,
  sterileUuid,
  type SterileRepository,
  type SterileScope,
} from "@intrusionshield/sterile-processing";
import { assertSterilePreviewEnvironment } from "./guard.js";
import { prepareReviewExample } from "./review-example.js";
export async function prepareEquipmentIncidentExample(
  repository: SterileRepository,
  reviewer: SterileScope,
  operator: SterileScope,
  requestId: string,
) {
  assertSterilePreviewEnvironment();
  const key = sterileUuid(requestId),
    step = (name: string) => {
      const h = createHash("sha256")
        .update(key + ":incident:" + name)
        .digest("hex");
      return (
        h.slice(0, 8) +
        "-" +
        h.slice(8, 12) +
        "-4" +
        h.slice(13, 16) +
        "-8" +
        h.slice(17, 20) +
        "-" +
        h.slice(20, 32)
      );
    };
  if (
    reviewer.tenantId !== operator.tenantId ||
    reviewer.facilityId !== operator.facilityId ||
    reviewer.actorId === operator.actorId
  )
    throw Error("Fixture scope mismatch");
  const code = "INCIDENT-STER-" + key.toUpperCase(),
    existing = await repository.transaction(reviewer, (tx) =>
      tx.findEquipmentByCode(code),
    ),
    equipment =
      existing ??
      (await new EquipmentRegistry(repository).register(reviewer, {
        requestId: step("machine"),
        code,
        name: "Fictional incident demonstration sterilizer",
        kind: "sterilizer",
        methods: ["steam"],
        manufacturer: "DEMO",
        model: "DEMO",
        serialNumber: "FICTITIOUS",
        location: "DEMO-AREA",
        state: "in_service",
        lastServicedAt: new Date(Date.now() - 86400000).toISOString(),
        serviceDueAt: new Date(Date.now() + 30 * 86400000).toISOString(),
        serviceReference: "SIMULATED-SERVICE",
        qualificationDueAt: new Date(Date.now() + 365 * 86400000).toISOString(),
        qualificationReference: "SIMULATED-QUALIFICATION",
        reason: "Fictional incident prerequisites only",
        confirmed: true,
      }));
  const load = await prepareReviewExample(
    repository,
    operator,
    step("work"),
    equipment,
  );
  return {
    equipment,
    from: new Date(Date.parse(load.startedAt!) - 60000).toISOString(),
    to: new Date(Date.parse(load.finishedAt!) + 1).toISOString(),
  };
}

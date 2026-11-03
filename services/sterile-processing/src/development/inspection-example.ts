import { createHash } from "node:crypto";
import {
  InstrumentRegistry,
  ProcessingRegistry,
  sterileUuid,
  type SterileRepository,
  type SterileScope,
} from "@intrusionshield/sterile-processing";
import { assertSterilePreviewEnvironment } from "./guard.js";
/** Explicit fictional setup for the preview smoke check. All writes commit together. */
export async function prepareInspectionExample(
  repository: SterileRepository,
  scope: SterileScope,
  requestId: string,
) {
  assertSterilePreviewEnvironment();
  const key = sterileUuid(requestId);
  const step = (name: string) => {
    const h = createHash("sha256")
      .update(key + ":" + name)
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
  return repository.transaction(scope, async (tx) => {
    const direct: SterileRepository = {
      transaction: async (s, work) => {
        if (
          s.tenantId !== scope.tenantId ||
          s.facilityId !== scope.facilityId ||
          s.actorId !== scope.actorId
        )
          throw Error("Fixture scope mismatch");
        return work(tx);
      },
    };
    const ir = new InstrumentRegistry(direct),
      p = new ProcessingRegistry(direct);
    const type = await ir.createType(scope, {
      requestId: step("type"),
      code: "DEMO-INSP-TYPE-" + key,
      name: "Instrumento ficticio de inspección",
      manufacturer: "DEMO",
      model: "DEMO",
    });
    const i = await ir.register(scope, {
      requestId: step("instrument"),
      code: "DEMO-INSP-INS-" + key,
      instrumentTypeId: type.id,
      serialNumber: "FICTICIO",
    });
    const e = await p.receive(scope, {
      requestId: step("receive"),
      code: "DEMO-INSP-REC-" + key,
      source: "SIMULATED DEMO",
      custodian: "DEMO",
      condition: "Fictional inspection example — no real processing",
      discrepancies: "",
      instrumentIds: [i.id],
      confirmed: true,
    });
    await p.start(scope, e.id, {
      requestId: step("start"),
      version: 1,
      method: "manual",
      procedure: "SIMULATED-CLEANING",
      procedureVersion: "DEMO-1",
      equipment: "",
      confirmed: true,
    });
    return p.finish(scope, e.id, {
      requestId: key,
      version: 2,
      outcome: "passed",
      evidence: "SIMULATED — no cleaning performed",
      note: "Fictional smoke-check prerequisite only",
      confirmed: true,
    });
  });
}

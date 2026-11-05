import { createHash } from "node:crypto";
import {
  InstrumentRegistry,
  MaintenanceRegistry,
  sterileUuid,
  type SterileRepository,
  type SterileScope,
} from "@intrusionshield/sterile-processing";
import { assertSterilePreviewEnvironment } from "./guard.js";
/** Explicit fictional setup for the preview smoke check. All writes commit together. */
export async function prepareScanExample(
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
    const ir = new InstrumentRegistry(direct);
    const type = await ir.createType(scope, {
      requestId: step("type"),
      code: "SCAN-TYPE-" + key,
      name: "Instrumento ficticio de escaneo",
      manufacturer: "DEMO",
      model: "DEMO",
    });
    const i = await ir.register(scope, {
      requestId: step("instrument"),
      code: "SCAN-DEMO-" + key,
      instrumentTypeId: type.id,
      serialNumber: "FICTICIO",
    });
    await new MaintenanceRegistry(direct).report(scope, i.id, {
      requestId: step("hold"),
      version: 1,
      defect: "SIMULATED scan example defect",
      location: "DEMO-SCAN-QUARANTINE",
      confirmed: true,
    });
    return ir.get(scope, i.id);
  });
}

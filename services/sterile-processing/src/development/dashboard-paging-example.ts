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
export async function prepareDashboardPagingExample(
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
      code: "QUEUE-DEMO-TYPE-" + key,
      name: "Instrumento ficticio de recepción",
      manufacturer: "DEMO",
      model: "DEMO",
    });
    const episodes = [];
    for (let n = 1; n <= 13; n++) {
      const i = await ir.register(scope, {
        requestId: step("instrument-" + n),
        code: "QUEUE-DEMO-INS-" + key + "-" + n,
        instrumentTypeId: type.id,
        serialNumber: "FICTICIO",
      });
      episodes.push(
        await new ProcessingRegistry(direct).receive(scope, {
          requestId: step("episode-" + n),
          code: "QUEUE-DEMO-REC-" + key + "-" + String(n).padStart(2, "0"),
          source: "SIMULATED DEMO",
          custodian: "DEMO",
          condition: "Fictional queue paging example; no physical processing",
          discrepancies: "",
          instrumentIds: [i.id],
          confirmed: true,
        }),
      );
    }
    return {
      tenantId: scope.tenantId,
      facilityId: scope.facilityId,
      created: episodes.length,
    };
  });
}

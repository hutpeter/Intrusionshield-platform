import { fictionalInspector, fictionalBatch } from "./inspection-person.js";
import { createHash } from "node:crypto";
import {
  CycleRegistry,
  sterileUuid,
  type SterileRepository,
  type SterileScope,
} from "@intrusionshield/sterile-processing";
import { prepareCycleExample } from "./cycle-example.js";
import { assertSterilePreviewEnvironment } from "./guard.js";
/** Simulated operator prerequisites only. The human reviewer still makes the decision. */
export async function prepareReviewExample(
  repository: SterileRepository,
  operatorScope: SterileScope,
  requestId: string,
  machine?: { id: string; code: string },
) {
  assertSterilePreviewEnvironment();
  const key = sterileUuid(requestId),
    h = createHash("sha256")
      .update(key + ":review:cycle")
      .digest("hex"),
    child =
      h.slice(0, 8) +
      "-" +
      h.slice(8, 12) +
      "-4" +
      h.slice(13, 16) +
      "-8" +
      h.slice(17, 20) +
      "-" +
      h.slice(20, 32);
  return fictionalBatch(repository, operatorScope, async (tx) => {
    const direct: SterileRepository = {
      transaction: async (s, work) => {
        if (
          s.tenantId !== operatorScope.tenantId ||
          s.facilityId !== operatorScope.facilityId ||
          (s.actorId !== operatorScope.actorId &&
            s.actorId !== fictionalInspector(operatorScope).actorId)
        )
          throw Error("Fixture scope mismatch");
        return work(tx);
      },
    };
    const l = await prepareCycleExample(direct, operatorScope, child, machine);
    return new CycleRegistry(direct).finish(operatorScope, l.id, {
      requestId: key,
      version: 2,
      outcome: "passed",
      cycleEvidence: "SIMULATED-CYCLE-EVIDENCE",
      indicatorEvidence: "SIMULATED-INDICATOR-EVIDENCE",
      note: "Fictional review prerequisites only",
      confirmed: true,
    });
  });
}

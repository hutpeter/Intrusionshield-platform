import { createHash } from "node:crypto";
import {
  RecallRegistry,
  sterileUuid,
  type SterileRepository,
  type SterileScope,
} from "@intrusionshield/sterile-processing";
import { prepareLineageRecallExample } from "./lineage-recall-example.js";
import { assertSterilePreviewEnvironment } from "./guard.js";
/** Simulated reconciliation/disposition only. The owner must explicitly record clearance. */
export async function prepareRecallClearanceExample(
  repo: SterileRepository,
  operator: SterileScope,
  reviewer: SterileScope,
  requestId: string,
) {
  assertSterilePreviewEnvironment();
  const key = sterileUuid(requestId),
    step = (name: string) => {
      const h = createHash("sha256")
        .update(key + ":clearance:" + name)
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
  const x = await prepareLineageRecallExample(
      repo,
      operator,
      reviewer,
      step("lineage"),
    ),
    rc = new RecallRegistry(repo),
    impact = await rc.impact(
      reviewer,
      "package",
      x.sourcePackage.id,
      x.sourcePackage.version,
    );
  let r = await rc.create(reviewer, {
    requestId: step("recall"),
    code: "CLEARANCE-DEMO-" + key,
    sourceKind: "package",
    sourceId: x.sourcePackage.id,
    sourceVersion: x.sourcePackage.version,
    reason: "SIMULATED recall clearance prerequisites",
    reference: "SIMULATED-RECALL",
    impactHash: impact.impactHash,
    confirmed: true,
  });
  for (const item of r.items) {
    r = await rc.recover(operator, r.id, {
      requestId: step("recover-" + item.packageId),
      version: r.version,
      packageId: item.packageId,
      location: "DEMO-RECALL-QUARANTINE",
      reference: "SIMULATED-RECONCILIATION",
      note: item.previousReturn
        ? "SIMULATED historical return reconciliation — no physical recovery performed"
        : "SIMULATED recovery — no physical recovery performed",
      confirmed: true,
    });
    r = await rc.dispose(reviewer, r.id, {
      requestId: step("dispose-" + item.packageId),
      version: r.version,
      packageId: item.packageId,
      action: "reprocess_required",
      reason: "SIMULATED reviewed disposition requiring fresh reprocessing",
      reference: "SIMULATED-DISPOSITION",
      confirmed: true,
    });
  }
  return rc.get(reviewer, r.id);
}

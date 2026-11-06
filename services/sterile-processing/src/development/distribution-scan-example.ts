import { createHash } from "node:crypto";
import {
  ReviewRegistry,
  PackagingRegistry,
  sterileUuid,
  type SterileRepository,
  type SterileScope,
} from "@intrusionshield/sterile-processing";
import { prepareReviewExample } from "./review-example.js";
import { assertSterilePreviewEnvironment } from "./guard.js";
/** Staged idempotent fictional setup; each actor's writes retain their own transaction/audit identity. */
export async function prepareDistributionScanExample(
  repository: SterileRepository,
  operator: SterileScope,
  reviewer: SterileScope,
  requestId: string,
) {
  assertSterilePreviewEnvironment();
  const key = sterileUuid(requestId);
  if (
    operator.tenantId !== reviewer.tenantId ||
    operator.facilityId !== reviewer.facilityId ||
    operator.actorId === reviewer.actorId
  )
    throw Error("Fictional setup requires separate scoped actors");
  const step = (name: string) => {
    const h = createHash("sha256")
      .update(key + ":distribution:" + name)
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
  const l = await prepareReviewExample(repository, operator, step("load"));
  const r = await new ReviewRegistry(repository).decide(reviewer, {
    requestId: step("release"),
    loadId: l.id,
    loadVersion: l.version,
    reviewVersion: 0,
    decision: "release",
    reason: "SIMULATED distribution prerequisites",
    reference: "SIMULATED-REVIEW",
    cycleChecked: true,
    indicatorsChecked: true,
    packagesChecked: true,
    profileChecked: true,
    confirmed: true,
  });
  const p = l.packages[0];
  return new PackagingRegistry(repository).get(operator, p.id);
}

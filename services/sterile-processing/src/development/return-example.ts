import { createHash } from "node:crypto";
import {
  DistributionRegistry,
  sterileUuid,
  type SterileRepository,
  type SterileScope,
} from "@intrusionshield/sterile-processing";
import { prepareDistributionExample } from "./distribution-example.js";
import { assertSterilePreviewEnvironment } from "./guard.js";
/** Only prerequisite issuance is simulated; the owner explicitly records the return. */
export async function prepareReturnExample(
  repository: SterileRepository,
  operator: SterileScope,
  reviewer: SterileScope,
  requestId: string,
) {
  assertSterilePreviewEnvironment();
  const key = sterileUuid(requestId),
    h = createHash("sha256")
      .update(key + ":return-issue")
      .digest("hex"),
    step =
      h.slice(0, 8) +
      "-" +
      h.slice(8, 12) +
      "-4" +
      h.slice(13, 16) +
      "-8" +
      h.slice(17, 20) +
      "-" +
      h.slice(20, 32);
  const d = await prepareDistributionExample(
    repository,
    operator,
    reviewer,
    key,
  );
  return new DistributionRegistry(repository).issue(operator, d.id, {
    requestId: step,
    version: d.version,
    destination: "DEMO-DEPARTMENT",
    recipient: "DEMO-RECEIVER",
    reference: "SIMULATED-ISSUE-FOR-RETURN",
    integrityChecked: true,
    confirmed: true,
  });
}

import { createHash } from "node:crypto";
import {
  ServiceUsageRegistry,
  InstrumentRegistry,
  CycleRegistry,
  sterileUuid,
  type SterileRepository,
  type SterileScope,
} from "@intrusionshield/sterile-processing";
import { prepareCycleExample } from "./cycle-example.js";
import { assertSterilePreviewEnvironment } from "./guard.js";
/** Explicit staged setup: operator recorded cycle, reviewer fixture policy, operator result. Retries resume each command. */
export async function prepareServiceThresholdExample(
  repo: SterileRepository,
  operator: SterileScope,
  reviewer: SterileScope,
  requestId: string,
) {
  assertSterilePreviewEnvironment();
  const key = sterileUuid(requestId);
  const step = (name: string) => {
    const h = createHash("sha256")
      .update(key + ":service:" + name)
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
  const load = await prepareCycleExample(repo, operator, step("cycle"));
  const p = await repo.transaction(operator, (tx) =>
    tx.findPackage(load.packages[0]!.id),
  );
  if (!p) throw Error("Missing fixture package");
  const id = p.assemblySnapshot.instruments[0]!.id;
  await new ServiceUsageRegistry(repo).configure(reviewer, id, {
    requestId: step("policy"),
    version: 0,
    interval: 1,
    warningBefore: 0,
    reference: "SIMULATED service every recorded cycle — fictional data only",
    confirmed: true,
  });
  await new CycleRegistry(repo).finish(operator, load.id, {
    requestId: step("finish"),
    version: 2,
    outcome: "passed",
    cycleEvidence: "SIMULATED-CYCLE",
    indicatorEvidence: "SIMULATED-INDICATORS",
    note: "Fictional service threshold example; no physical cycle performed",
    confirmed: true,
  });
  return new InstrumentRegistry(repo).get(operator, id);
}

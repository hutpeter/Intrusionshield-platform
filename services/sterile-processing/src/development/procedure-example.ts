import { createHash } from "node:crypto";
import {
  ProcedureRegistry,
  ProcessingRegistry,
  sterileUuid,
  type SterileRepository,
  type SterileScope,
} from "@intrusionshield/sterile-processing";
import { prepareReceivingScanExample } from "./receiving-scan-example.js";
import { assertSterilePreviewEnvironment } from "./guard.js";
export async function prepareProcedureExample(
  repo: SterileRepository,
  operator: SterileScope,
  reviewer: SterileScope,
  requestId: string,
) {
  assertSterilePreviewEnvironment();
  const key = sterileUuid(requestId),
    step = (name: string) => {
      const h = createHash("sha256")
        .update(key + ":procedure:" + name)
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
  const i = await prepareReceivingScanExample(
    repo,
    operator,
    step("instrument"),
  );
  const e = await new ProcessingRegistry(repo).receive(operator, {
    requestId: step("receipt"),
    code: "PROC-DEMO-REC-" + key,
    source: "SIMULATED DEMO",
    custodian: "DEMO",
    condition: "Fictional controlled-procedure example",
    discrepancies: "",
    instrumentIds: [i.id],
    confirmed: true,
  });
  const revision = await new ProcedureRegistry(repo).draft(reviewer, {
    requestId: key,
    code: "PROC-DEMO-" + key,
    title: "Fictional cleaning procedure",
    stage: "cleaning",
    method: "manual",
    instructions:
      "FICTIONAL DEMONSTRATION ONLY.\nThis is placeholder procedure text; no physical cleaning instructions or clinical authorization are supplied.",
    source: "SIMULATED-SOP-DEMO-1",
    instrumentTypeIds: [i.instrumentTypeId],
    confirmed: true,
  });
  return {
    tenantId: reviewer.tenantId,
    facilityId: reviewer.facilityId,
    revision,
    episodeId: e.id,
    episodeCode: e.code,
  };
}

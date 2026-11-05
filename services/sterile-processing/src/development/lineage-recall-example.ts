import { createHash } from "node:crypto";
import {
  ReturnRegistry,
  ProcessingRegistry,
  TrayRegistry,
  PackagingRegistry,
  CycleRegistry,
  ReviewRegistry,
  DistributionRegistry,
  sterileUuid,
  type SterileRepository,
  type SterileScope,
} from "@intrusionshield/sterile-processing";
import { prepareReturnExample } from "./return-example.js";
import { assertSterilePreviewEnvironment } from "./guard.js";
/** Staged fictional workflow with operator and reviewer audit attribution; replay-safe, never real inspection. */
export async function prepareLineageRecallExample(
  repo: SterileRepository,
  operator: SterileScope,
  reviewer: SterileScope,
  requestId: string,
) {
  assertSterilePreviewEnvironment();
  const key = sterileUuid(requestId),
    step = (name: string) => {
      const h = createHash("sha256")
        .update(key + ":lineage:" + name)
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
  const d = await prepareReturnExample(
    repo,
    operator,
    reviewer,
    step("ancestor"),
  );
  const pk = new PackagingRegistry(repo),
    rt = new ReturnRegistry(repo),
    pr = new ProcessingRegistry(repo),
    tr = new TrayRegistry(repo),
    cy = new CycleRegistry(repo),
    rr = new ReviewRegistry(repo),
    dr = new DistributionRegistry(repo);
  const source = await pk.get(operator, d.packageId);
  const ret = await rt.create(operator, {
    requestId: step("return"),
    code: "LINEAGE-RETURN-" + key,
    distributionId: d.id,
    distributionVersion: d.version,
    condition: "used",
    location: "DEMO-RETURN-QUARANTINE",
    custodian: "DEMO-RETURNER",
    reference: "SIMULATED-RETURN",
    note: "Fictional lineage prerequisite",
    contentsChecked: true,
    confirmed: true,
  });
  const disposition = await rt.dispose(reviewer, ret.id, {
    requestId: step("disposition"),
    version: 1,
    action: "reprocess",
    reason: "SIMULATED reprocessing prerequisite",
    reference: "SIMULATED-REPROCESS",
    episodeCode: "LINEAGE-RECEIPT-" + key,
    confirmed: true,
  });
  const e = await pr.get(operator, disposition.episodeId!);
  await pr.start(operator, e.id, {
    requestId: step("clean-start"),
    version: 1,
    method: "manual",
    procedure: "SIMULATED-CLEANING",
    procedureVersion: "DEMO-1",
    equipment: "",
    confirmed: true,
  });
  await pr.finish(operator, e.id, {
    requestId: step("clean-finish"),
    version: 2,
    outcome: "passed",
    evidence: "SIMULATED-CLEANING-EVIDENCE",
    note: "Fictional demonstration only",
    confirmed: true,
  });
  await pr.inspect(operator, e.id, {
    requestId: step("inspection"),
    version: 3,
    procedure: "SIMULATED-INSPECTION",
    procedureVersion: "DEMO-1",
    evidence: "SIMULATED — no physical inspection performed",
    items: e.instruments.map((i) => ({
      instrumentId: i.id,
      clean: true,
      dry: true,
      intact: true,
      functional: true,
      note: "",
    })),
    confirmed: true,
  });
  const a = await tr.createAssembly(operator, {
    requestId: step("assembly"),
    code: "LINEAGE-ASSEMBLY-" + key,
    definitionId: source.assemblySnapshot.definitionId,
    definitionVersion: source.assemblySnapshot.definitionRevision,
  });
  await tr.updateContents(operator, a.id, {
    requestId: step("contents"),
    version: 1,
    instrumentIds: e.instruments.map((i) => i.id),
  });
  const done = await tr.transition(operator, a.id, {
    requestId: step("complete"),
    version: 2,
    action: "complete",
    reason: "",
    confirmed: true,
  });
  const p = await pk.pack(operator, {
    requestId: step("package"),
    code: "LINEAGE-DESCENDANT-" + key,
    assemblyId: done.id,
    assemblyVersion: done.version,
    material: "DEMO-WRAP",
    materialLot: "DEMO-LOT",
    procedure: "SIMULATED-PACK",
    procedureVersion: "DEMO-1",
    sealChecked: true,
    contentsChecked: true,
    confirmed: true,
  });
  const l = await cy.create(operator, {
    requestId: step("load"),
    code: "LINEAGE-LOAD-" + key,
    sterilizer: "DEMO-STERILIZER",
    method: "steam",
    profile: "SIMULATED-PROFILE",
    profileVersion: "DEMO-1",
    packageIds: [p.id],
    confirmed: true,
  });
  await cy.start(operator, l.id, {
    requestId: step("cycle-start"),
    version: 1,
    cycleReference: "SIMULATED-CYCLE-" + key,
    confirmed: true,
  });
  await cy.finish(operator, l.id, {
    requestId: step("cycle-finish"),
    version: 2,
    outcome: "passed",
    cycleEvidence: "SIMULATED-CYCLE-EVIDENCE",
    indicatorEvidence: "SIMULATED-INDICATORS",
    note: "Fictional demonstration only",
    confirmed: true,
  });
  const review = await rr.decide(reviewer, {
    requestId: step("release"),
    loadId: l.id,
    loadVersion: 3,
    reviewVersion: 0,
    decision: "release",
    reason: "SIMULATED release prerequisite",
    reference: "SIMULATED-REVIEW",
    cycleChecked: true,
    indicatorsChecked: true,
    packagesChecked: true,
    profileChecked: true,
    confirmed: true,
  });
  await dr.store(operator, {
    requestId: step("store"),
    packageId: p.id,
    packageVersion: p.version,
    reviewId: review.id,
    reviewVersion: review.version,
    location: "DEMO-DESCENDANT-STORE",
    reference: "SIMULATED-STORAGE",
    integrityChecked: true,
    confirmed: true,
  });
  return {
    tenantId: operator.tenantId,
    facilityId: operator.facilityId,
    sourcePackage: {
      id: source.id,
      code: source.code,
      version: source.version,
    },
    descendantPackage: { id: p.id, code: p.code, version: p.version },
  };
}

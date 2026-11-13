import { fictionalInspector, fictionalBatch } from "./inspection-person.js";
import { createHash } from "node:crypto";
import {
  InstrumentRegistry,
  LoanerRegistry,
  ProcessingRegistry,
  sterileUuid,
  type SterileRepository,
  type SterileScope,
} from "@intrusionshield/sterile-processing";
import { assertSterilePreviewEnvironment } from "./guard.js";
/** Fictional first visit and supplier hand-back only; the human confirms the new readmission. */
export async function prepareLoanerReadmissionExample(
  repo: SterileRepository,
  scope: SterileScope,
  requestId: string,
) {
  assertSterilePreviewEnvironment();
  const key = sterileUuid(requestId),
    step = (name: string) => {
      const h = createHash("sha256")
        .update(key + ":loaner-readmit:" + name)
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
  return fictionalBatch(repo, scope, async (tx) => {
    const direct: SterileRepository = {
      transaction: async (s, work) => {
        if (
          s.tenantId !== scope.tenantId ||
          s.facilityId !== scope.facilityId ||
          (s.actorId !== scope.actorId &&
            s.actorId !== fictionalInspector(scope).actorId)
        )
          throw Error("Fixture scope mismatch");
        return work(tx);
      },
    };
    const type = await new InstrumentRegistry(direct).createType(scope, {
        requestId: step("type"),
        code: "LOAN-REVISIT-TYPE-" + key,
        name: "Fictional repeat-visit loaner instrument",
        manufacturer: "DEMO-SUPPLIER",
        model: "FICTITIOUS",
      }),
      l = new LoanerRegistry(direct),
      p = new ProcessingRegistry(direct);
    const r = await l.receive(scope, {
      requestId: step("receipt"),
      code: "LOAN-REVISIT-" + key,
      supplier: "DEMO-SUPPLIER",
      supplierReference: "SIMULATED-REPEAT-VISIT-SET",
      dueOn: "",
      location: "DEMO-FIRST-VISIT",
      custodian: "DEMO-COURIER",
      reference: "SIMULATED-FIRST-VISIT",
      condition: "Fictional first visit",
      note: "SIMULATED prerequisites only; no physical processing",
      items: [
        {
          code: "LOAN-REVISIT-INS-" + key,
          instrumentTypeId: type.id,
          serialNumber: "FICTITIOUS",
        },
      ],
      contentsChecked: true,
      confirmed: true,
    });
    await p.start(scope, r.episodeId, {
      requestId: step("clean-start"),
      version: 1,
      method: "manual",
      procedure: "SIMULATED-CLEAN",
      procedureVersion: "DEMO-1",
      equipment: "",
      confirmed: true,
    });
    await p.finish(scope, r.episodeId, {
      requestId: step("clean-finish"),
      version: 2,
      outcome: "passed",
      evidence: "SIMULATED — no physical cleaning",
      note: "",
      confirmed: true,
    });
    await p.inspect(fictionalInspector(scope), r.episodeId, {
      requestId: step("inspect"),
      version: 3,
      procedure: "SIMULATED-INSPECTION",
      procedureVersion: "DEMO-1",
      evidence: "SIMULATED — no physical inspection",
      items: r.items.map((i) => ({
        instrumentId: i.id,
        clean: true,
        dry: true,
        intact: true,
        functional: true,
        note: "Fictional preparation",
      })),
      confirmed: true,
    });
    return l.returnToSupplier(scope, r.id, {
      requestId: step("handback"),
      version: 1,
      instrumentIds: r.items.map((i) => i.id),
      recipient: "DEMO-SUPPLIER-RECEIVER",
      reference: "SIMULATED-FIRST-HANDBACK",
      note: "Fictional hand-back prerequisite",
      contentsChecked: true,
      confirmed: true,
    });
  });
}

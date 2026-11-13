import { fictionalInspector, fictionalBatch } from "./inspection-person.js";
import { createHash } from "node:crypto";
import {
  ProcessingRegistry,
  TrayRegistry,
  sterileUuid,
  type SterileRepository,
  type SterileScope,
} from "@intrusionshield/sterile-processing";
import { prepareInspectionExample } from "./inspection-example.js";
import { assertSterilePreviewEnvironment } from "./guard.js";
/** New fictional records only; all setup writes share one transaction. */
export async function preparePackagingExample(
  repository: SterileRepository,
  scope: SterileScope,
  requestId: string,
) {
  assertSterilePreviewEnvironment();
  const key = sterileUuid(requestId);
  const step = (name: string) => {
    const h = createHash("sha256")
      .update(key + ":pack:" + name)
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
  return fictionalBatch(repository, scope, async (tx) => {
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
    const e = await prepareInspectionExample(direct, scope, step("processing")),
      p = new ProcessingRegistry(direct),
      trays = new TrayRegistry(direct),
      i = e.instruments[0];
    await p.inspect(fictionalInspector(scope), e.id, {
      requestId: step("inspection"),
      version: 3,
      procedure: "SIMULATED-INSPECTION",
      procedureVersion: "DEMO-1",
      evidence: "SIMULATED — no physical inspection performed",
      confirmed: true,
      items: [
        {
          instrumentId: i.id,
          clean: true,
          dry: true,
          intact: true,
          functional: true,
          note: "Fictional packaging prerequisite",
        },
      ],
    });
    const d = await trays.createDefinition(scope, {
      requestId: step("definition"),
      code: "DEMO-PACK-DEF-" + key,
      name: "Bandeja ficticia de empaque",
      requirements: [{ instrumentTypeId: i.instrumentTypeId, quantity: 1 }],
    });
    const a = await trays.createAssembly(scope, {
      requestId: step("assembly"),
      code: "DEMO-PACK-ARM-" + key,
      definitionId: d.id,
      definitionVersion: 1,
    });
    await trays.updateContents(scope, a.id, {
      requestId: step("contents"),
      version: 1,
      instrumentIds: [i.id],
    });
    return trays.transition(scope, a.id, {
      requestId: key,
      version: 2,
      action: "complete",
      confirmed: true,
      reason: "",
    });
  });
}

import { fictionalInspector, fictionalBatch } from "./inspection-person.js";
import { createHash } from "node:crypto";
import {
  PackagingRegistry,
  CycleRegistry,
  sterileUuid,
  type SterileRepository,
  type SterileScope,
} from "@intrusionshield/sterile-processing";
import { preparePackagingExample } from "./packaging-example.js";
import { assertSterilePreviewEnvironment } from "./guard.js";
/** Fictional prerequisite setup only; no machine communication or real cycle. */
export async function prepareLoadScanExample(
  repository: SterileRepository,
  scope: SterileScope,
  requestId: string,
) {
  assertSterilePreviewEnvironment();
  const key = sterileUuid(requestId);
  const step = (name: string) => {
    const h = createHash("sha256")
      .update(key + ":cycle:" + name)
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
    const a = await preparePackagingExample(direct, scope, step("assembly")),
      pk = new PackagingRegistry(direct),
      cycles = new CycleRegistry(direct);
    const p = await pk.pack(scope, {
      requestId: step("package"),
      code: "DEMO-CYCLE-PACK-" + key,
      assemblyId: a.id,
      assemblyVersion: a.version,
      material: "SIMULATED-WRAP",
      materialLot: "SIMULATED-LOT",
      procedure: "SIMULATED-PACKING",
      procedureVersion: "DEMO-1",
      sealChecked: true,
      contentsChecked: true,
      confirmed: true,
    });
    const secondAssembly = await preparePackagingExample(
      direct,
      scope,
      step("candidate-assembly"),
    );
    const candidate = await pk.pack(scope, {
      requestId: step("candidate-package"),
      code: "LOADSCAN-PACK-" + key,
      assemblyId: secondAssembly.id,
      assemblyVersion: secondAssembly.version,
      material: "SIMULATED-WRAP",
      materialLot: "SIMULATED-LOT",
      procedure: "SIMULATED-PACKING",
      procedureVersion: "DEMO-1",
      sealChecked: true,
      contentsChecked: true,
      confirmed: true,
    });
    const load = await cycles.create(scope, {
      requestId: step("draft"),
      code: "LOADSCAN-DRAFT-" + key,
      sterilizer: "STER-DEMO-1",
      method: "steam",
      profile: "SIMULATED-PROFILE",
      profileVersion: "DEMO-1",
      packageIds: [p.id],
      confirmed: true,
    });
    return { load, package: await pk.get(scope, candidate.id) };
  });
}

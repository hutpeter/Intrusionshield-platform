import { createHash } from "node:crypto";
import {
  EquipmentRegistry, InstrumentRegistry, ProcessingRegistry, sterileUuid,
  type SterileRepository, type SterileScope,
} from "@intrusionshield/sterile-processing";
import { assertSterilePreviewEnvironment } from "./guard.js";

/** Fictional washer cleaning without packaging. Never creates holds or recalls. */
export async function prepareUnpackagedIncidentExample(
  repository: SterileRepository, reviewer: SterileScope,
  operator: SterileScope, requestId: string,
) {
  assertSterilePreviewEnvironment();
  if (reviewer.tenantId !== operator.tenantId ||
      reviewer.facilityId !== operator.facilityId ||
      reviewer.actorId === operator.actorId) throw Error("Fixture scope mismatch");
  const key = sterileUuid(requestId);
  const step = (name: string) => {
    const h = createHash("sha256").update(key + ":unpackaged:" + name).digest("hex");
    return h.slice(0,8)+"-"+h.slice(8,12)+"-4"+h.slice(13,16)+"-8"+h.slice(17,20)+"-"+h.slice(20,32);
  };
  const machine = await new EquipmentRegistry(repository).register(reviewer, {
    requestId: step("machine"), code: "DEMO-WASH-INC-"+key,
    name: "Fictional washer incident — unpackaged instrument",
    kind: "washer_disinfector", methods: [],
    manufacturer: "DEMO", model: "DEMO", serialNumber: "FICTITIOUS",
    location: "DEMO-AREA", state: "in_service",
    lastServicedAt: new Date(Date.now()-86400000).toISOString(),
    serviceDueAt: new Date(Date.now()+30*86400000).toISOString(),
    serviceReference: "SIMULATED-SERVICE",
    qualificationDueAt: new Date(Date.now()+365*86400000).toISOString(),
    qualificationReference: "SIMULATED-QUALIFICATION",
    reason: "Fictional unpackaged incident prerequisites only", confirmed: true,
  });
  const work = await repository.transaction(operator, async tx => {
    const direct: SterileRepository = { transaction: async (s, fn) => {
      if (s.tenantId !== operator.tenantId || s.facilityId !== operator.facilityId ||
          s.actorId !== operator.actorId) throw Error("Fixture scope mismatch");
      return fn(tx);
    }};
    const ir = new InstrumentRegistry(direct), pr = new ProcessingRegistry(direct);
    const type = await ir.createType(operator, {
      requestId: step("type"), code: "DEMO-WASH-TYPE-"+key,
      name: "Fictional instrument type", manufacturer: "DEMO", model: "DEMO",
    });
    const instrument = await ir.register(operator, {
      requestId: step("instrument"), code: "DEMO-WASH-INST-"+key,
      instrumentTypeId: type.id, serialNumber: "FICTITIOUS",
    });
    let episode = await pr.receive(operator, {
      requestId: step("receive"), code: "DEMO-WASH-REC-"+key,
      source: "SIMULATED DEMO", custodian: "DEMO",
      condition: "Fictional only", discrepancies: "",
      instrumentIds: [instrument.id], confirmed: true,
    });
    episode = await pr.start(operator, episode.id, {
      requestId: step("start"), version: episode.version,
      method: "mechanical", equipment: machine.code, equipmentId: machine.id,
      procedure: "SIMULATED-CLEANING", procedureVersion: "DEMO-1", confirmed: true,
    });
    return pr.finish(operator, episode.id, {
      requestId: step("finish"), version: episode.version,
      outcome: "passed", evidence: "SIMULATED — no cleaning performed",
      note: "Fictional instrument intentionally not packaged", confirmed: true,
    });
  });
  const attempt = work.attempts[0];
  return {
    equipment: machine,
    from: new Date(Date.parse(attempt.startedAt)-60000).toISOString(),
    to: new Date(Date.parse(attempt.finishedAt!)+1).toISOString(),
  };
}

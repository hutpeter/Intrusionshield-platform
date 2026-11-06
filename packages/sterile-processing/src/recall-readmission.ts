import { createHash, randomUUID } from "node:crypto";
import {
  SterileError,
  sterileUuid,
  type SterileScope,
  type SterileTransaction,
} from "./foundation.js";
import type {
  RecallRecord,
  RecallAdmissionPlan,
  RecallAdmissionInput,
} from "./recall-types.js";
import type { ProcessingEpisode } from "./processing-types.js";
export async function recallAdmissionPlan(
  tx: SterileTransaction,
  s: SterileScope,
  r: RecallRecord,
): Promise<RecallAdmissionPlan> {
  if (!r.clearance || !r.lineage || r.state !== "closed")
    throw new SterileError("CLEARANCE_BLOCKED");
  const pendingInstrumentIds: string[] = [];
  for (const id of r.clearance.instrumentIds)
    if (!(await tx.findRecallReadmission(r.id, id)))
      pendingInstrumentIds.push(id);
  const ids = new Set(pendingInstrumentIds),
    instruments = new Map<
      string,
      { id: string; code: string; version: number }
    >(),
    assemblies = new Map<string, RecallAdmissionPlan["assemblies"][number]>(),
    episodes = new Map<string, RecallAdmissionPlan["episodes"][number]>(),
    activeCycles = new Set<string>();
  // Admit physical groups in full; never silently free co-members of an assembly or hold.
  for (const id of ids) {
    if (ids.size > 100) throw new SterileError("RECALL_LIMIT");
    const i = await tx.findInstrument(id);
    if (!i || i.state !== "registered")
      throw new SterileError("CLEARANCE_BLOCKED");
    instruments.set(id, { id: i.id, code: i.code, version: i.version });
    const assignment = await tx.findActiveAssignment(id),
      hold = await tx.findProcessingHold(id);
    if (assignment && hold) throw new SterileError("CONFLICT");
    if (assignment) {
      const a = await tx.findAssembly(assignment.assemblyId);
      if (!a || a.state === "disassembled") throw new SterileError("CONFLICT");
      for (const member of a.instruments) ids.add(member.id);
      const active = await tx.findActivePackage(a.id),
        p = active ? await tx.findPackage(active.packageId) : null;
      if (p && (p.state !== "packaged" || p.assemblyVersion !== a.version))
        throw new SterileError("CONFLICT");
      if (p) {
        const returned = await tx.findReturnByPackage(p.id);
        if (
          returned?.state === "discrepancy" ||
          returned?.reconciliation?.missingInstrumentIds.length
        )
          throw new SterileError("RETURN_BLOCKED");
        const load = await tx.findPackageLoad(p.id);
        if (load?.state === "running") activeCycles.add(load.loadCode);
      }
      assemblies.set(a.id, {
        id: a.id,
        code: a.code,
        version: a.version,
        packageId: p?.id ?? null,
        packageVersion: p?.version ?? null,
      });
    }
    if (hold) {
      const e = await tx.findProcessing(hold.episodeId);
      if (!e || e.state === "superseded") throw new SterileError("CONFLICT");
      for (const member of e.instruments) ids.add(member.id);
      episodes.set(e.id, {
        id: e.id,
        code: e.code,
        version: e.version,
        state: e.state,
      });
    }
  }
  const cases = new Map<string, RecallRecord>();
  for (const id of ids)
    for (const c of await tx.listInstrumentRecallCases(id)) cases.set(c.id, c);
  for (const a of assemblies.values())
    if (a.packageId)
      for (const c of await tx.listPackageRecallCases(a.packageId))
        cases.set(c.id, c);
  const blockedCases = [...cases.values()]
    .filter((c) => !c.clearance || c.state !== "closed")
    .map((c) => ({ id: c.id, code: c.code }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const clearances: RecallAdmissionPlan["clearances"] = [];
  for (const c of cases.values()) {
    if (!c.clearance) continue;
    const instrumentIds: string[] = [];
    for (const id of c.clearance.instrumentIds)
      if (ids.has(id) && !(await tx.findRecallReadmission(c.id, id)))
        instrumentIds.push(id);
    if (instrumentIds.length)
      clearances.push({
        caseId: c.id,
        caseCode: c.code,
        version: c.clearance.version,
        instrumentIds: instrumentIds.sort(),
      });
  }
  const activeCleaning = [...episodes.values()]
    .filter((e) => e.state === "cleaning")
    .map((e) => e.code)
    .sort();
  const data = {
    tenantId: s.tenantId,
    facilityId: s.facilityId,
    caseId: r.id,
    caseVersion: r.version,
    pendingInstrumentIds: pendingInstrumentIds.sort(),
    instruments: [...instruments.values()].sort((a, b) =>
      a.id.localeCompare(b.id),
    ),
    assemblies: [...assemblies.values()].sort((a, b) =>
      a.id.localeCompare(b.id),
    ),
    episodes: [...episodes.values()].sort((a, b) => a.id.localeCompare(b.id)),
    clearances: clearances.sort((a, b) => a.caseId.localeCompare(b.caseId)),
    blockedCases,
    activeCleaning,
    activeCycles: [...activeCycles].sort(),
    ready:
      pendingInstrumentIds.length > 0 &&
      !blockedCases.length &&
      !activeCleaning.length &&
      !activeCycles.size,
  };
  return {
    ...data,
    impactHash: createHash("sha256").update(JSON.stringify(data)).digest("hex"),
  };
}
export async function admitRecall(
  tx: SterileTransaction,
  s: SterileScope,
  old: RecallRecord,
  input: RecallAdmissionInput,
  at: string,
): Promise<RecallRecord> {
  const plan = await recallAdmissionPlan(tx, s, old);
  if (!plan.ready) throw new SterileError("CLEARANCE_BLOCKED");
  if (plan.impactHash !== input.impactHash) throw new SterileError("CONFLICT");
  if (await tx.findProcessingByCode(input.episodeCode))
    throw new SterileError("CONFLICT");
  const episode: ProcessingEpisode = {
    id: randomUUID(),
    tenantId: s.tenantId,
    facilityId: s.facilityId,
    code: input.episodeCode,
    source: "RECALL " + old.code,
    custodian: input.custodian,
    condition: input.condition,
    discrepancies: input.note,
    instruments: [],
    state: "received",
    attempts: [],
    inspections: [],
    version: 1,
    createdAt: at,
    updatedAt: at,
    receivedBy: s.actorId,
    recallSource: {
      caseId: old.id,
      caseCode: old.code,
      clearanceVersion: old.clearance!.version,
      clearances: plan.clearances,
      previousEpisodeIds: plan.episodes.map((e) => e.id),
      packageIds: [
        ...new Set([
          ...old.items.map((i) => i.packageId),
          ...plan.assemblies.flatMap((a) => (a.packageId ? [a.packageId] : [])),
        ]),
      ],
      receivingLocation: input.location,
    },
  };
  for (const member of plan.instruments) {
    const i = await tx.findInstrument(member.id),
      t = i ? await tx.findType(i.instrumentTypeId) : null;
    if (!i || !t) throw new SterileError("NOT_FOUND");
    episode.instruments.push({
      id: i.id,
      code: i.code,
      serialNumber: i.serialNumber,
      instrumentTypeId: t.id,
      instrumentTypeName: t.name,
      instrumentVersion: i.version,
    });
  }
  const audit = async (
    entityId: string,
    version: number,
    action:
      | "tray-assembly-disassembled"
      | "processing-superseded"
      | "processing-received",
    reason: string,
  ) =>
    tx.appendAudit({
      id: randomUUID(),
      ...s,
      entityId,
      version,
      action,
      requestId: randomUUID(),
      correlationRequestId: sterileUuid(input.requestId),
      at,
      reason,
    });
  for (const source of plan.assemblies) {
    const a = await tx.findAssembly(source.id);
    if (!a || a.version !== source.version) throw new SterileError("CONFLICT");
    if (source.packageId) {
      const p = await tx.findPackage(source.packageId);
      if (!p || p.version !== source.packageVersion)
        throw new SterileError("CONFLICT");
      await tx.releasePackage(p);
    }
    const closed = {
      ...a,
      state: "disassembled" as const,
      version: a.version + 1,
      updatedAt: at,
      disassembledAt: at,
      disassemblyReason: "RECALL " + old.code + " · " + input.reference,
    };
    await tx.updateAssembly(closed, a.version);
    await tx.replaceAssignments(closed);
    await tx.insertAssemblyVersion(closed);
    await audit(
      closed.id,
      closed.version,
      "tray-assembly-disassembled",
      closed.disassemblyReason,
    );
  }
  for (const source of plan.episodes) {
    const e = await tx.findProcessing(source.id);
    if (!e || e.version !== source.version || e.state === "cleaning")
      throw new SterileError("CONFLICT");
    const previous = {
      ...e,
      state: "superseded" as const,
      version: e.version + 1,
      updatedAt: at,
      supersededBy: episode.id,
      supersededReason: "RECALL " + old.code + " · " + input.reference,
    };
    await tx.updateProcessing(previous, e.version);
    await tx.insertProcessingVersion(previous);
    await tx.releaseProcessing(previous);
    await audit(
      previous.id,
      previous.version,
      "processing-superseded",
      previous.supersededReason,
    );
  }
  await tx.insertProcessing(episode);
  await tx.reserveProcessing(episode);
  await tx.insertProcessingVersion(episode);
  await audit(
    episode.id,
    1,
    "processing-received",
    "RECALL " + old.code + " · " + input.reference,
  );
  await tx.insertRecallReadmissions(
    episode,
    plan.clearances.flatMap((c) =>
      c.instrumentIds.map((instrumentId) => ({
        caseId: c.caseId,
        instrumentId,
      })),
    ),
  );
  return {
    ...old,
    version: old.version + 1,
    updatedAt: at,
    admissions: [
      ...(old.admissions ?? []),
      {
        episodeId: episode.id,
        episodeCode: episode.code,
        instrumentIds: plan.instruments.map((i) => i.id),
        reference: input.reference,
        location: input.location,
        actorId: s.actorId,
        at,
      },
    ],
  };
}

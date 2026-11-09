import { createHash, randomUUID } from "node:crypto";
import {
  SterileRegistryBase,
  SterileError,
  scopeOf,
  sterileUuid,
  field,
  codeOf,
  pageOf,
  type SterileScope,
  type SterileTransaction,
  type SterileRepository,
} from "./foundation.js";
import type { ProcessingEquipment } from "./equipment.js";
import type { RecallImpact } from "./recall-types.js";
import { recallImpact } from "./recall-impact.js";
import { RecallRegistry } from "./recalls.js";
export interface EquipmentExposure {
  kind: "cleaning" | "load";
  id: string;
  code: string;
  version: number;
  attempt: number | null;
  state: string;
  method: string;
  startedAt: string;
  finishedAt: string | null;
  outcome: string | null;
  link: "registered" | "legacy_code";
  equipmentVersion: number | null;
  instrumentIds: string[];
  packageIds: string[];
}
export interface EquipmentIncidentTarget {
  id: string;
  code: string;
  version: number;
  state: string;
  loadIds: string[];
  cleaning: { episodeId: string; attempt: number }[];
  custody: {
    id: string;
    version: number;
    state: string;
    location: string | null;
    destination: string | null;
    recipient: string | null;
  } | null;
}
export interface EquipmentIncidentImpact {
  tenantId: string;
  facilityId: string;
  equipment: ProcessingEquipment;
  from: string;
  to: string;
  exposures: EquipmentExposure[];
  targets: EquipmentIncidentTarget[];
  /** Recorded cleaning instruments with no directly linked package in this assessment. */
  unpackagedInstrumentIds: string[];
  impactHash: string;
}
export interface IncidentFinding {
  at: string;
  actorId: string;
  reference: string;
  finding: string;
  instrumentIds: string[];
  packageIds: string[];
}
export interface EquipmentIncident {
  id: string;
  tenantId: string;
  facilityId: string;
  code: string;
  equipmentId: string;
  impact: EquipmentIncidentImpact;
  reason: string;
  reference: string;
  recalls: { id: string; code: string; packageId: string; at: string }[];
  /** Append-only investigation findings; absent on older records. */
  findings?: IncidentFinding[];
  closed?: { at: string; actorId: string; reference: string; reason: string };
  version: number;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
}
export interface EquipmentIncidentInput {
  requestId: string;
  code: string;
  equipmentId: string;
  from: string;
  to: string;
  impactHash: string;
  reason: string;
  reference: string;
  confirmed: boolean;
}
const invalid = (): never => {
  throw new SterileError("INVALID_REQUEST");
};
function windowOf(from: string, to: string) {
  for (const v of [from, to])
    if (
      typeof v !== "string" ||
      !Number.isFinite(Date.parse(v)) ||
      new Date(v).toISOString() !== v
    )
      invalid();
  if (Date.parse(from) >= Date.parse(to) || Date.parse(to) > Date.now())
    invalid();
  return { from, to };
}
const limit = (): never => {
  throw new SterileError("INCIDENT_LIMIT");
};
const overlap = (start: string, end: string | null, from: string, to: string) =>
  Date.parse(start) < Date.parse(to) &&
  (end === null || Date.parse(end) >= Date.parse(from));
async function assess(
  tx: SterileTransaction,
  s: SterileScope,
  id: string,
  from: string,
  to: string,
): Promise<EquipmentIncidentImpact> {
  const equipment = await tx.findEquipment(id);
  if (!equipment) throw new SterileError("NOT_FOUND");
  const candidates = await tx.equipmentExposureCandidates(
    id,
    equipment.code,
    from,
    to,
  );
  if (candidates.processing.length > 200 || candidates.loads.length > 200)
    limit();
  const exposures: EquipmentExposure[] = [];
  for (const e of candidates.processing)
    for (const a of e.attempts) {
      const linked = a.registeredEquipment?.id === id,
        legacy =
          !a.registeredEquipment &&
          a.equipment.toUpperCase() === equipment.code;
      if (
        a.method !== "mechanical" ||
        (!linked && !legacy) ||
        !overlap(a.startedAt, a.finishedAt, from, to)
      )
        continue;
      exposures.push({
        kind: "cleaning",
        id: e.id,
        code: e.code,
        version: e.version,
        attempt: a.number,
        state: e.state,
        method: a.method,
        startedAt: a.startedAt,
        finishedAt: a.finishedAt,
        outcome: a.outcome,
        link: linked ? "registered" : "legacy_code",
        equipmentVersion: a.registeredEquipment?.version ?? null,
        instrumentIds: e.instruments.map((i) => i.id).sort(),
        packageIds: [],
      });
    }
  for (const l of candidates.loads) {
    const machine = l.startedEquipment ?? l.registeredEquipment,
      linked = machine?.id === id,
      legacy = !machine && l.sterilizer.toUpperCase() === equipment.code;
    if (
      !l.startedAt ||
      (!linked && !legacy) ||
      !overlap(l.startedAt, l.finishedAt, from, to)
    )
      continue;
    exposures.push({
      kind: "load",
      id: l.id,
      code: l.code,
      version: l.version,
      attempt: null,
      state: l.state,
      method: l.method,
      startedAt: l.startedAt,
      finishedAt: l.finishedAt,
      outcome: l.outcome,
      link: linked ? "registered" : "legacy_code",
      equipmentVersion: machine?.version ?? null,
      instrumentIds: [],
      packageIds: l.packages.map((p) => p.id).sort(),
    });
  }
  if (
    exposures.length > 200 ||
    exposures.reduce(
      (n, e) => n + e.instrumentIds.length + e.packageIds.length,
      0,
    ) > 5000
  )
    limit();
  exposures.sort((a, b) =>
    (a.kind + a.id + ":" + a.attempt).localeCompare(
      b.kind + b.id + ":" + b.attempt,
    ),
  );
  const episodeIds = [
      ...new Set(
        exposures.filter((e) => e.kind === "cleaning").map((e) => e.id),
      ),
    ],
    packageIds = [...new Set(exposures.flatMap((e) => e.packageIds))];
  if (packageIds.length > 1000) limit();
  const packages =
    episodeIds.length || packageIds.length
      ? await tx.equipmentIncidentPackages(episodeIds, packageIds)
      : [];
  if (packages.length > 100) limit();
  const targets: EquipmentIncidentTarget[] = [];
  for (const p of packages) {
    const loads = exposures.filter(
        (e) => e.kind === "load" && e.packageIds.includes(p.id),
      ),
      cleaning = exposures.filter(
        (e) =>
          e.kind === "cleaning" &&
          p.inspectionProofs.some(
            (proof) =>
              proof.episodeId === e.id && proof.cleaningAttempt === e.attempt,
          ),
      );
    if (!loads.length && !cleaning.length) continue;
    const custody = await tx.findDistributionByPackage(p.id);
    targets.push({
      id: p.id,
      code: p.code,
      version: p.version,
      state: p.state,
      loadIds: loads.map((e) => e.id).sort(),
      cleaning: cleaning.map((e) => ({ episodeId: e.id, attempt: e.attempt! })),
      custody: custody
        ? {
            id: custody.id,
            version: custody.version,
            state: custody.state,
            location: custody.location,
            destination: custody.destination,
            recipient: custody.recipient,
          }
        : null,
    });
    for (const e of cleaning) e.packageIds.push(p.id);
  }
  for (const e of exposures) e.packageIds = [...new Set(e.packageIds)].sort();
  targets.sort((a, b) => a.id.localeCompare(b.id));
  // This is a recorded-data coverage warning, not a clinical clearance decision.
  // Cleaning exposures can exist without any package eligible for recall.
  // Match inspection proof to each instrument, episode and cleaning attempt.
  // A package covering one instrument must not conceal another instrument
  // from the same affected cleaning episode.
  const unpackagedInstrumentIds = [...new Set(
    exposures.filter((e) => e.kind === "cleaning").flatMap((e) =>
      e.instrumentIds.filter((instrumentId) =>
        !packages.some((p) => p.inspectionProofs.some((proof) =>
          proof.instrumentId === instrumentId &&
          proof.episodeId === e.id &&
          proof.cleaningAttempt === e.attempt,
        )),
      ),
    ),
  )].sort();
  const result = {
    tenantId: s.tenantId,
    facilityId: s.facilityId,
    equipment,
    from,
    to,
    exposures,
    targets,
    unpackagedInstrumentIds,
  };
  return {
    ...result,
    impactHash: createHash("sha256")
      .update(JSON.stringify(result))
      .digest("hex"),
  };
}
export class EquipmentIncidentRegistry extends SterileRegistryBase {
  async preview(scope: SterileScope, id: string, from: string, to: string) {
    const s = scopeOf(scope),
      key = sterileUuid(id),
      range = windowOf(from, to);
    return this.repository.transaction(s, (tx) =>
      assess(tx, s, key, range.from, range.to),
    );
  }
  async create(scope: SterileScope, input: EquipmentIncidentInput) {
    const s = scopeOf(scope),
      equipmentId = sterileUuid(input.equipmentId),
      code = codeOf(input.code),
      range = windowOf(input.from, input.to),
      reason = field(input.reason, 500),
      reference = field(input.reference, 200);
    if (
      input.confirmed !== true ||
      typeof input.impactHash !== "string" ||
      !/^[a-f0-9]{64}$/.test(input.impactHash)
    )
      invalid();
    return this.command(
      s,
      input.requestId,
      "equipment-incident-recorded",
      input,
      async (tx, at) => {
        if (await tx.findEquipmentIncidentByCode(code))
          throw new SterileError("CONFLICT");
        const impact = await assess(tx, s, equipmentId, range.from, range.to);
        if (impact.impactHash !== input.impactHash)
          throw new SterileError("CONFLICT");
        const record: EquipmentIncident = {
          id: randomUUID(),
          tenantId: s.tenantId,
          facilityId: s.facilityId,
          code,
          equipmentId,
          impact,
          reason,
          reference,
          recalls: [],
          findings: [],
          version: 1,
          createdAt: at,
          createdBy: s.actorId,
          updatedAt: at,
        };
        await tx.insertEquipmentIncident(record);
        await this.record(
          tx,
          s,
          record,
          input.requestId,
          "equipment-incident-recorded",
          reason,
        );
        return record;
      },
    );
  }
  private async record(
    tx: SterileTransaction,
    s: SterileScope,
    r: EquipmentIncident,
    requestId: string,
    action: "equipment-incident-recorded" | "equipment-incident-recall-created" | "equipment-incident-finding-recorded" | "equipment-incident-instrument-held" | "equipment-incident-instrument-released" | "equipment-incident-closed",
    reason: string,
  ) {
    await tx.insertEquipmentIncidentVersion(r);
    await tx.appendAudit({
      id: randomUUID(),
      ...s,
      entityId: r.id,
      version: r.version,
      requestId: sterileUuid(requestId),
      at: r.updatedAt,
      action,
      reason,
    });
  }
  async list(scope: SterileScope, equipmentId: string, page = 1) {
    const s = scopeOf(scope),
      key = sterileUuid(equipmentId),
      p = pageOf(page);
    return this.repository.transaction(s, async (tx) => {
      if (!(await tx.findEquipment(key))) throw new SterileError("NOT_FOUND");
      const rows = await tx.listEquipmentIncidents(key, p);
      return { items: rows.slice(0, 50), page: p, hasMore: rows.length > 50 };
    });
  }
  async get(scope: SterileScope, id: string, version?: number) {
    const s = scopeOf(scope),
      key = sterileUuid(id);
    if (
      version !== undefined &&
      (!Number.isSafeInteger(version) || version < 1)
    )
      invalid();
    return this.repository.transaction(s, async (tx) => {
      const r =
        version === undefined
          ? await tx.findEquipmentIncident(key)
          : await tx.findEquipmentIncidentVersion(key, version);
      if (!r) throw new SterileError("NOT_FOUND");
      return r;
    });
  }
  /** Records investigation evidence only; does not hold, release, recall or close work. */
  async recordFinding(scope: SterileScope, id: string, input: {
    requestId: string;
    version: number;
    finding: string;
    reference: string;
    instrumentIds: string[];
    packageIds: string[];
    confirmed: boolean;
  }) {
    const s = scopeOf(scope), key = sterileUuid(id),
      finding = field(input.finding, 2000),
      reference = field(input.reference, 200);
    if (input.confirmed !== true ||
        !Number.isSafeInteger(input.version) || input.version < 1 ||
        !Array.isArray(input.instrumentIds) ||
        !Array.isArray(input.packageIds) ||
        input.instrumentIds.length + input.packageIds.length > 500)
      invalid();
    const instrumentIds = [...new Set(input.instrumentIds.map(sterileUuid))].sort(),
      packageIds = [...new Set(input.packageIds.map(sterileUuid))].sort();
    return this.command(s, input.requestId, "equipment-incident-finding-recorded",
      { id: key, ...input, instrumentIds, packageIds }, async (tx, at) => {
        const old = await tx.findEquipmentIncident(key);
        if (!old) throw new SterileError("NOT_FOUND");
        if (old.version !== input.version || old.closed) throw new SterileError("CONFLICT");
        const knownInstruments = new Set(old.impact.exposures.flatMap(e => e.instrumentIds));
        const knownPackages = new Set(old.impact.targets.map(p => p.id));
        if (instrumentIds.some(i => !knownInstruments.has(i)) ||
            packageIds.some(p => !knownPackages.has(p)))
          throw new SterileError("INVALID_REQUEST");
        const record: EquipmentIncident = {
          ...old,
          findings: [...(old.findings ?? []), {
            at, actorId: s.actorId, reference, finding, instrumentIds, packageIds,
          }],
          version: old.version + 1, updatedAt: at,
        };
        await tx.updateEquipmentIncident(record, old.version);
        await this.record(tx, s, record, input.requestId,
          "equipment-incident-finding-recorded", reference);
        return record;
      });
  }
  /** Explicit incident hold; never inferred from a finding or automatically released. */
  async holdInstrument(scope: SterileScope, id: string, input: {
    requestId: string;
    version: number;
    instrumentId: string;
    instrumentVersion: number;
    reason: string;
    confirmed: boolean;
  }) {
    const s = scopeOf(scope), key = sterileUuid(id),
      instrumentId = sterileUuid(input.instrumentId),
      reason = field(input.reason, 500);
    if (input.confirmed !== true ||
        !Number.isSafeInteger(input.version) || input.version < 1 ||
        !Number.isSafeInteger(input.instrumentVersion) || input.instrumentVersion < 1)
      invalid();
    return this.command(s, input.requestId, "equipment-incident-instrument-held",
      { id: key, ...input, instrumentId }, async (tx, at) => {
        const old = await tx.findEquipmentIncident(key);
        if (!old) throw new SterileError("NOT_FOUND");
        if (old.version !== input.version || old.closed) throw new SterileError("CONFLICT");
        const exposed = old.impact.exposures.some(e => e.instrumentIds.includes(instrumentId));
        if (!exposed) throw new SterileError("INVALID_REQUEST");
        const instrument = await tx.findInstrument(instrumentId);
        if (!instrument) throw new SterileError("NOT_FOUND");
        if (instrument.version !== input.instrumentVersion ||
            instrument.incidentHold || instrument.state === "retired")
          throw new SterileError("CONFLICT");
        await tx.updateInstrument({
          ...instrument, version: instrument.version + 1, updatedAt: at,
          incidentHold: { incidentId: old.id, incidentCode: old.code, at, reason },
        }, instrument.version);
        await tx.appendAudit({
          id: randomUUID(), ...s, entityId: instrument.id,
          version: instrument.version + 1, requestId: sterileUuid(input.requestId),
          at, action: "equipment-incident-instrument-held", reason,
        });
        const updated: EquipmentIncident = {
          ...old, version: old.version + 1, updatedAt: at,
        };
        await tx.updateEquipmentIncident(updated, old.version);
        await this.record(tx, s, updated, input.requestId,
          "equipment-incident-instrument-held", reason);
        return updated;
      });
  }
  /** Reviewer release requires evidence; it never clears unrelated recall or processing blocks. */
  async releaseInstrument(scope: SterileScope, id: string, input: {
    requestId: string; version: number; instrumentId: string;
    instrumentVersion: number; reason: string; reference: string;
    confirmed: boolean;
  }) {
    const s = scopeOf(scope), key = sterileUuid(id),
      instrumentId = sterileUuid(input.instrumentId),
      reason = field(input.reason, 500),
      reference = field(input.reference, 200);
    if (input.confirmed !== true ||
        !Number.isSafeInteger(input.version) || input.version < 1 ||
        !Number.isSafeInteger(input.instrumentVersion) || input.instrumentVersion < 1)
      invalid();
    return this.command(s, input.requestId, "equipment-incident-instrument-released",
      { id: key, ...input, instrumentId }, async (tx, at) => {
        const old = await tx.findEquipmentIncident(key);
        if (!old) throw new SterileError("NOT_FOUND");
        if (old.version !== input.version || old.closed) throw new SterileError("CONFLICT");
        const instrument = await tx.findInstrument(instrumentId);
        if (!instrument) throw new SterileError("NOT_FOUND");
        if (instrument.version !== input.instrumentVersion ||
            instrument.incidentHold?.incidentId !== old.id)
          throw new SterileError("CONFLICT");
        if (!(old.findings ?? []).some(f => f.instrumentIds.includes(instrumentId)))
          throw new SterileError("CONFLICT");
        await tx.updateInstrument({
          ...instrument, version: instrument.version + 1, updatedAt: at,
          incidentHold: undefined,
        }, instrument.version);
        await tx.appendAudit({
          id: randomUUID(), ...s, entityId: instrument.id,
          version: instrument.version + 1, requestId: sterileUuid(input.requestId),
          at, action: "equipment-incident-instrument-released",
          reason: reference + ": " + reason,
        });
        const updated: EquipmentIncident = {
          ...old, version: old.version + 1, updatedAt: at,
        };
        await tx.updateEquipmentIncident(updated, old.version);
        await this.record(tx, s, updated, input.requestId,
          "equipment-incident-instrument-released", reference + ": " + reason);
        return updated;
      });
  }
  /** Conservative closure gate: evidence, disposition of all directly linked packages,
   * and no unresolved incident holds. Closure never performs clinical clearance. */
  async close(scope: SterileScope, id: string, input: {
    requestId: string; version: number; reason: string;
    reference: string; confirmed: boolean;
  }) {
    const s = scopeOf(scope), key = sterileUuid(id),
      reason = field(input.reason, 500),
      reference = field(input.reference, 200);
    if (input.confirmed !== true ||
        !Number.isSafeInteger(input.version) || input.version < 1)
      invalid();
    return this.command(s, input.requestId, "equipment-incident-closed",
      { id: key, ...input }, async (tx, at) => {
        const old = await tx.findEquipmentIncident(key);
        if (!old) throw new SterileError("NOT_FOUND");
        if (old.version !== input.version || old.closed)
          throw new SterileError("CONFLICT");
        if (!(old.findings ?? []).length)
          throw new SterileError("CONFLICT");
        if (old.impact.targets.some(p =>
          !old.recalls.some(r => r.packageId === p.id)))
          throw new SterileError("CONFLICT");
        for (const instrumentId of old.impact.unpackagedInstrumentIds ?? []) {
          if (!(old.findings ?? []).some(f => f.instrumentIds.includes(instrumentId)))
            throw new SterileError("CONFLICT");
          const instrument = await tx.findInstrument(instrumentId);
          if (!instrument || instrument.incidentHold?.incidentId === old.id)
            throw new SterileError("CONFLICT");
        }
        const updated: EquipmentIncident = {
          ...old, closed: { at, actorId: s.actorId, reference, reason },
          version: old.version + 1, updatedAt: at,
        };
        await tx.updateEquipmentIncident(updated, old.version);
        await this.record(tx, s, updated, input.requestId,
          "equipment-incident-closed", reference + ": " + reason);
        return updated;
      });
  }
  async recallPreview(
    scope: SterileScope,
    id: string,
    packageId: string,
  ): Promise<RecallImpact> {
    const s = scopeOf(scope),
      key = sterileUuid(id),
      pid = sterileUuid(packageId);
    return this.repository.transaction(s, async (tx) => {
      const r = await tx.findEquipmentIncident(key);
      if (!r) throw new SterileError("NOT_FOUND");
      if (
        !r.impact.targets.some((p) => p.id === pid) ||
        r.recalls.some((p) => p.packageId === pid)
      )
        throw new SterileError("CONFLICT");
      const p = await tx.findPackage(pid);
      if (!p) throw new SterileError("NOT_FOUND");
      return recallImpact(tx, s, {
        sourceKind: "package",
        sourceId: pid,
        sourceVersion: p.version,
      });
    });
  }
  async createRecall(
    scope: SterileScope,
    id: string,
    input: {
      requestId: string;
      version: number;
      packageId: string;
      impactHash: string;
      code: string;
      reason: string;
      reference: string;
      confirmed: boolean;
    },
  ) {
    const s = scopeOf(scope),
      key = sterileUuid(id),
      pid = sterileUuid(input.packageId),
      code = codeOf(input.code),
      reason = field(input.reason, 500),
      reference = field(input.reference, 200);
    if (
      input.confirmed !== true ||
      !Number.isSafeInteger(input.version) ||
      input.version < 1 ||
      typeof input.impactHash !== "string"
    )
      invalid();
    return this.command(
      s,
      input.requestId,
      "equipment-incident-recall-created",
      { ...input, id: key },
      async (tx, at) => {
        const old = await tx.findEquipmentIncident(key);
        if (!old) throw new SterileError("NOT_FOUND");
        if (
          old.closed || old.version !== input.version ||
          !old.impact.targets.some((p) => p.id === pid) ||
          old.recalls.some((p) => p.packageId === pid)
        )
          throw new SterileError("CONFLICT");
        const p = await tx.findPackage(pid);
        if (!p) throw new SterileError("NOT_FOUND");
        const direct: SterileRepository = {
          transaction: async (other, work) => {
            if (
              other.tenantId !== s.tenantId ||
              other.facilityId !== s.facilityId ||
              other.actorId !== s.actorId
            )
              throw new SterileError("INVALID_REQUEST");
            return work(tx);
          },
        };
        const recall = await new RecallRegistry(direct).create(
          s,
          {
            requestId: randomUUID(),
            code,
            sourceKind: "package",
            sourceId: pid,
            sourceVersion: p.version,
            reason,
            reference,
            impactHash: input.impactHash,
            confirmed: true,
          },
          old.id,
        );
        const record: EquipmentIncident = {
          ...old,
          recalls: [
            ...old.recalls,
            { id: recall.id, code: recall.code, packageId: pid, at },
          ],
          version: old.version + 1,
          updatedAt: at,
        };
        await tx.updateEquipmentIncident(record, old.version);
        await this.record(
          tx,
          s,
          record,
          input.requestId,
          "equipment-incident-recall-created",
          reason,
        );
        return record;
      },
    );
  }
}

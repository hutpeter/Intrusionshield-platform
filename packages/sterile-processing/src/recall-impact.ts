import { createHash } from "node:crypto";
import {
  SterileError,
  type SterileTransaction,
  type SterileScope,
} from "./foundation.js";
import type { RecallImpact, RecallItem, RecallRecord } from "./recall-types.js";
import type { SterilePackage } from "./packaging-types.js";
import type { ProcessingEpisode } from "./processing-types.js";
/** Conservative prospective hold: original instruments only, never co-loaded peers. */
export async function recallImpact(
  tx: SterileTransaction,
  s: SterileScope,
  source: {
    sourceKind: "load" | "package";
    sourceId: string;
    sourceVersion: number;
  },
  existing?: RecallRecord,
): Promise<RecallImpact> {
  let refs: { id: string; version: number }[], sourceCode: string;
  if (existing) {
    const rootIds =
      existing.lineage?.rootPackageIds ??
      existing.items.map((p) => p.packageId);
    refs = existing.items
      .filter((p) => rootIds.includes(p.packageId))
      .map((p) => ({ id: p.packageId, version: p.packageVersion }));
    sourceCode = existing.sourceCode;
  } else if (source.sourceKind === "load") {
    const l = await tx.findLoad(source.sourceId);
    if (!l) throw new SterileError("NOT_FOUND");
    if (l.version !== source.sourceVersion) throw new SterileError("CONFLICT");
    refs = l.packages.map((p) => ({ id: p.id, version: p.version }));
    sourceCode = l.code;
  } else {
    const p = await tx.findPackage(source.sourceId);
    if (!p) throw new SterileError("NOT_FOUND");
    if (p.version !== source.sourceVersion) throw new SterileError("CONFLICT");
    refs = [{ id: p.id, version: p.version }];
    sourceCode = p.code;
  }
  if (
    !refs.length ||
    refs.length > 100 ||
    new Set(refs.map((p) => p.id)).size !== refs.length
  )
    throw new SterileError("INVALID_REQUEST");
  const targets = new Map<
      string,
      {
        p: SterilePackage;
        version: number;
        origin: NonNullable<RecallItem["origin"]>;
      }
    >(),
    ids = new Set<string>();
  for (const r of refs) {
    const p = await tx.findPackageVersion(r.id, r.version);
    if (!p) throw new SterileError("NOT_FOUND");
    targets.set(p.id, { p, version: r.version, origin: "direct" });
    for (const i of p.assemblySnapshot.instruments) ids.add(i.id);
  }
  if (ids.size > 1000) throw new SterileError("RECALL_LIMIT");
  const instrumentIds = [...ids].sort();
  const packageRows = await tx.traceRows("package", { instrumentIds }),
    episodeRows = await tx.traceRows("processing", { instrumentIds });
  if (packageRows.length > 1000 || episodeRows.length > 1000)
    throw new SterileError("RECALL_LIMIT");
  const packages = packageRows
      .filter((r) => r.current)
      .map((r) => r.record as SterilePackage),
    episodes = episodeRows
      .filter((r) => r.current)
      .map((r) => r.record as ProcessingEpisode);
  // Follow explicit return -> episode -> inspection-proof links. Never spread through co-members.
  for (let changed = true; changed;) {
    changed = false;
    const linked = new Set<string>();
    for (const e of episodes) {
      const from = e.returnSource;
      if (!from || !targets.has(from.packageId)) continue;
      const ret = await tx.findReturn(from.returnId);
      if (ret?.packageId === from.packageId && ret.episodeId === e.id)
        linked.add(e.id);
    }
    for (const p of packages) {
      if (targets.has(p.id)) continue;
      if (
        p.inspectionProofs.some(
          (proof) => ids.has(proof.instrumentId) && linked.has(proof.episodeId),
        )
      ) {
        targets.set(p.id, { p, version: p.version, origin: "reprocessed" });
        changed = true;
      }
    }
    if (targets.size > 100) throw new SterileError("RECALL_LIMIT");
  }
  // Also hold present custody even if an older manual episode lacks a return link.
  for (const p of packages) {
    if (targets.has(p.id) || p.state !== "packaged") continue;
    const active = await tx.findActivePackage(p.assemblyId);
    if (active?.packageId === p.id)
      targets.set(p.id, { p, version: p.version, origin: "current_custody" });
  }
  if (targets.size > 100) throw new SterileError("RECALL_LIMIT");
  const items: RecallItem[] = [];
  for (const { p, version, origin } of [...targets.values()].sort((a, b) =>
    a.p.id.localeCompare(b.p.id),
  )) {
    const d = await tx.findDistributionByPackage(p.id);
    const previousReturn = await tx.findReturnByPackage(p.id);
    items.push({
      packageId: p.id,
      packageCode: p.code,
      packageVersion: version,
      origin,
      ...(previousReturn
        ? {
            previousReturn: {
              id: previousReturn.id,
              code: previousReturn.code,
              state: previousReturn.state,
              episodeCode: previousReturn.episodeCode,
            },
          }
        : {}),
      atRecall: d
        ? {
            id: d.id,
            version: d.version,
            state: d.state,
            location: d.location,
            destination: d.destination,
            recipient: d.recipient,
          }
        : null,
      status: "outstanding",
      recovery: null,
      disposition: null,
    });
  }
  const instruments = [];
  for (const id of instrumentIds) {
    const i = await tx.findInstrument(id);
    if (!i) throw new SterileError("NOT_FOUND");
    instruments.push({ id: i.id, code: i.code, version: i.version });
  }
  const plan = {
    tenantId: s.tenantId,
    facilityId: s.facilityId,
    sourceKind: source.sourceKind,
    sourceId: source.sourceId,
    sourceVersion: source.sourceVersion,
    sourceCode,
    rootPackageIds: refs.map((r) => r.id).sort(),
    instruments,
    items,
  };
  return {
    ...plan,
    impactHash: createHash("sha256").update(JSON.stringify(plan)).digest("hex"),
  };
}

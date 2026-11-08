import { randomUUID } from "node:crypto";
import {
  SterileRegistryBase,
  SterileError,
  scopeOf,
  sterileUuid,
  codeOf,
  field,
  pageOf,
  type SterileScope,
  type SterileTransaction,
} from "./foundation.js";
export type ProcedureStage = "cleaning" | "inspection" | "sterilization";
export interface ProcedureRevision {
  id: string;
  tenantId: string;
  facilityId: string;
  code: string;
  revision: number;
  title: string;
  stage: ProcedureStage;
  method: string;
  instructions: string;
  source: string;
  instrumentTypeIds: string[];
  state: "draft" | "published" | "withdrawn";
  version: number;
  createdAt: string;
  createdBy: string;
  publishedAt: string | null;
  publishedBy: string | null;
  withdrawnAt: string | null;
  withdrawnBy: string | null;
}
export interface ProcedureDraftInput {
  requestId: string;
  code: string;
  title: string;
  stage: ProcedureStage;
  method: string;
  instructions: string;
  source: string;
  instrumentTypeIds: string[];
  confirmed: boolean;
}
export interface ProcedureTransitionInput {
  requestId: string;
  version: number;
  reason: string;
  confirmed: boolean;
}
export const procedureMethods = {
  cleaning: ["manual", "mechanical"],
  inspection: ["inspection"],
  sterilization: ["steam", "low_temperature", "other"],
};
export async function resolveProcedure(
  tx: SterileTransaction,
  id: string | undefined,
  stage: ProcedureStage,
  method: string,
  types: string[],
  code: string,
  revision: string,
) {
  if (id === undefined) return undefined;
  const p = await tx.findProcedure(sterileUuid(id));
  if (!p) throw new SterileError("NOT_FOUND");
  if (
    p.state !== "published" ||
    p.stage !== stage ||
    p.method !== method ||
    p.code !== code ||
    String(p.revision) !== revision ||
    types.some((t) => !p.instrumentTypeIds.includes(t))
  )
    throw new SterileError("PROCEDURE_BLOCKED");
  return structuredClone(p);
}
export class ProcedureRegistry extends SterileRegistryBase {
  async draft(scope: SterileScope, input: ProcedureDraftInput) {
    const s = scopeOf(scope),
      code = codeOf(input.code),
      title = field(input.title, 200),
      source = field(input.source, 500);
    if (
      input.confirmed !== true ||
      !Object.hasOwn(procedureMethods, input.stage) ||
      !procedureMethods[input.stage].includes(input.method) ||
      typeof input.instructions !== "string" ||
      !input.instructions.trim() ||
      input.instructions.length > 16000 ||
      /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(input.instructions) ||
      !Array.isArray(input.instrumentTypeIds) ||
      input.instrumentTypeIds.length < 1 ||
      input.instrumentTypeIds.length > 100
    )
      throw new SterileError("INVALID_REQUEST");
    const types = input.instrumentTypeIds.map(sterileUuid);
    if (new Set(types).size !== types.length)
      throw new SterileError("INVALID_REQUEST");
    return this.command(
      s,
      input.requestId,
      "procedure-drafted",
      input,
      async (tx, at) => {
        const previous = await tx.latestProcedure(code);
        if (
          previous &&
          (previous.stage !== input.stage || previous.revision >= 9999)
        )
          throw new SterileError("CONFLICT");
        for (const id of types)
          if (!(await tx.findType(id))) throw new SterileError("NOT_FOUND");
        const r: ProcedureRevision = {
          id: randomUUID(),
          tenantId: s.tenantId,
          facilityId: s.facilityId,
          code,
          revision: (previous?.revision ?? 0) + 1,
          title,
          stage: input.stage,
          method: input.method,
          instructions: input.instructions.trim().normalize("NFC"),
          source,
          instrumentTypeIds: types,
          state: "draft",
          version: 1,
          createdAt: at,
          createdBy: s.actorId,
          publishedAt: null,
          publishedBy: null,
          withdrawnAt: null,
          withdrawnBy: null,
        };
        await tx.insertProcedure(r);
        await tx.insertProcedureVersion(r);
        await this.audit(
          tx,
          s,
          r,
          input.requestId,
          "procedure-drafted",
          at,
          source,
        );
        return r;
      },
    );
  }
  async transition(
    scope: SterileScope,
    id: string,
    action: "publish" | "withdraw",
    input: ProcedureTransitionInput,
  ) {
    const s = scopeOf(scope),
      key = sterileUuid(id),
      reason = field(input.reason, 500);
    if (
      input.confirmed !== true ||
      !Number.isSafeInteger(input.version) ||
      input.version < 1 ||
      !["publish", "withdraw"].includes(action)
    )
      throw new SterileError("INVALID_REQUEST");
    return this.command(
      s,
      input.requestId,
      "procedure-" + action,
      { ...input, id: key },
      async (tx, at) => {
        const old = await tx.findProcedure(key);
        if (!old) throw new SterileError("NOT_FOUND");
        if (
          old.version !== input.version ||
          old.state !== (action === "publish" ? "draft" : "published")
        )
          throw new SterileError("CONFLICT");
        const r: ProcedureRevision = {
          ...old,
          version: old.version + 1,
          state: action === "publish" ? "published" : "withdrawn",
          ...(action === "publish"
            ? { publishedAt: at, publishedBy: s.actorId }
            : { withdrawnAt: at, withdrawnBy: s.actorId }),
        };
        await tx.updateProcedure(r, old.version);
        await tx.insertProcedureVersion(r);
        await this.audit(
          tx,
          s,
          r,
          input.requestId,
          action === "publish" ? "procedure-published" : "procedure-withdrawn",
          at,
          reason,
        );
        return r;
      },
    );
  }
  private async audit(
    tx: SterileTransaction,
    s: SterileScope,
    r: ProcedureRevision,
    requestId: string,
    action: "procedure-drafted" | "procedure-published" | "procedure-withdrawn",
    at: string,
    reason: string,
  ) {
    await tx.appendAudit({
      id: randomUUID(),
      ...s,
      entityId: r.id,
      version: r.version,
      requestId: sterileUuid(requestId),
      action,
      at,
      reason,
    });
  }
  async list(scope: SterileScope, page = 1, stage?: ProcedureStage) {
    const s = scopeOf(scope),
      n = pageOf(page);
    if (stage !== undefined && !Object.hasOwn(procedureMethods, stage))
      throw new SterileError("INVALID_REQUEST");
    return this.repository.transaction(s, async (tx) => {
      const rows = await tx.listProcedures(n, stage);
      return { items: rows.slice(0, 50), page: n, hasMore: rows.length > 50 };
    });
  }
  async history(scope: SterileScope, id: string, page = 1) {
    const s = scopeOf(scope),
      key = sterileUuid(id),
      n = pageOf(page);
    return this.repository.transaction(s, async (tx) => {
      if (!(await tx.findProcedure(key))) throw new SterileError("NOT_FOUND");
      const rows = await tx.listAudit(key, n);
      return { items: rows.slice(0, 50), page: n, hasMore: rows.length > 50 };
    });
  }
  async get(scope: SterileScope, id: string, version?: number) {
    const s = scopeOf(scope),
      key = sterileUuid(id);
    if (
      version !== undefined &&
      (!Number.isSafeInteger(version) || version < 1)
    )
      throw new SterileError("INVALID_REQUEST");
    return this.repository.transaction(s, async (tx) => {
      const r =
        version === undefined
          ? await tx.findProcedure(key)
          : await tx.findProcedureVersion(key, version);
      if (!r) throw new SterileError("NOT_FOUND");
      return r;
    });
  }
}

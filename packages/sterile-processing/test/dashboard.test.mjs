import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { DashboardRegistry, dashboardQueueIds } from "../dist/index.js";
import { MemoryRepository } from "./memory-repository.mjs";
const scope = () => ({
  tenantId: randomUUID(),
  facilityId: randomUUID(),
  actorId: randomUUID(),
});
const row = (s, code, state, extra = {}) => ({
  ...s,
  id: randomUUID(),
  code,
  state,
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
  ...extra,
});
test("dashboard classifies current work, excludes completed states and never changes records", async () => {
  const repo = new MemoryRepository(),
    s = scope();
  for (const state of [
    "received",
    "cleaning_failed",
    "inspection_failed",
    "cleaning",
    "awaiting_inspection",
    "ready_for_assembly",
    "superseded",
  ])
    repo.state.processing.push(
      row(s, state, state, { instruments: [{ id: randomUUID() }] }),
    );
  repo.state.assemblies.push(row(s, "DRAFT", "draft", { instruments: [] }));
  repo.state.assemblies.push(row(s, "DONE", "complete", { instruments: [] }));
  repo.state.returns.push(row(s, "RETURN", "returned"));
  repo.state.returns.push(row(s, "QUARANTINE", "quarantined"));
  repo.state.instruments.push(row(s, "MAINT", "maintenance"));
  repo.state.instruments.push(row(s, "NORMAL", "registered"));
  const before = structuredClone(repo.state),
    r = await new DashboardRegistry(repo).get(s, dashboardQueueIds),
    q = (id) => r.queues.find((x) => x.id === id);
  assert.equal(q("cleaning").total, 3);
  assert.equal(q("inspection").total, 1);
  assert.equal(q("assembly").total, 1);
  assert.equal(q("returns").total, 1);
  assert.equal(q("maintenance").total, 1);
  assert.deepEqual(repo.state, before);
});
test("exact totals exceed 12-row preview, stay scoped and use stable oldest-first ordering", async () => {
  const repo = new MemoryRepository(),
    s = scope();
  for (let n = 0; n < 18; n++)
    repo.state.returns.push(
      row(s, "RETURN-" + n, "returned", {
        updatedAt: new Date(Date.UTC(2026, 10, 1, 0, n)).toISOString(),
      }),
    );
  repo.state.returns.push(
    row({ ...s, facilityId: randomUUID() }, "FOREIGN", "returned"),
  );
  const r = await new DashboardRegistry(repo).get(s, ["returns"]),
    q = r.queues.find((q) => q.id === "returns");
  assert.equal(q.total, 18);
  assert.equal(q.items.length, 12);
  assert.equal(q.items[0].code, "RETURN-0");
  assert.equal(q.items[11].code, "RETURN-11");
  assert.ok(
    r.queues
      .filter((q) => q.id !== "returns")
      .every(
        (q) =>
          q.total === null && q.access === "restricted" && q.items.length === 0,
      ),
  );
});
test("restricted queues are not queried and invalid queue requests are rejected", async () => {
  const calls = [],
    s = scope(),
    repo = {
      transaction: async (scope, work) =>
        work({
          dashboardQueue: async (id) => {
            calls.push(id);
            return { total: 0, items: [] };
          },
        }),
    },
    d = new DashboardRegistry(repo);
  await d.get(s, ["returns"]);
  assert.deepEqual(calls, ["returns"]);
  await assert.rejects(
    d.get(s, ["unknown"]),
    (e) => e.code === "INVALID_REQUEST",
  );
});
test("recall queue includes unresolved instrument holds after closure and removes readmitted cases", async () => {
  const repo = new MemoryRepository(),
    s = scope(),
    r = row(s, "CLOSED", "closed", { items: [{}] }),
    i = randomUUID();
  repo.state.recalls.push(r);
  repo.state.recallInstruments.push({ ...s, instrumentId: i, recallId: r.id });
  let q = (await new DashboardRegistry(repo).get(s, ["recall"])).queues.find(
    (q) => q.id === "recall",
  );
  assert.equal(q.total, 1);
  repo.state.recallReadmissions.push({
    ...s,
    instrumentId: i,
    caseId: r.id,
    episodeId: randomUUID(),
  });
  q = (await new DashboardRegistry(repo).get(s, ["recall"])).queues.find(
    (q) => q.id === "recall",
  );
  assert.equal(q.total, 0);
});

/** SQL-free test adapter only. Never loaded by the service composition root. */
import { stockCountReview } from "../dist/stock-reconciliation.js";
import { consumableAlert } from "../dist/consumable-alerts.js";
export class MemoryRepository {
  state = {
    serviceUsages: [],
    serviceExposures: [],
    procedures: [],
    procedureVersions: [],
    loaners: [],
    loanerVersions: [],
    returns: [],
    returnVersions: [],
    recalls: [],
    recallVersions: [],
    recallBlocks: [],
    recallInstruments: [],
    recallReadmissions: [],
    distribution: [],
    distributionVersions: [],
    reviews: [],
    reviewVersions: [],
    loads: [],
    loadVersions: [],
    loadAssignments: [],
    machineCycles: [],
    equipmentIncidents: [],
    equipmentIncidentVersions: [],
    consumables: [],
    consumableStock: [],
    stockCounts: [],
    consumableStockMovements: [],
    equipment: [],
    equipmentVersions: [],
    packages: [],
    packageIntegrity: [],
    packageVersions: [],
    packageAssignments: [],
    processing: [],
    processingVersions: [],
    processingHolds: [],
    types: [],
    instruments: [],
    audit: [],
    receipts: [],
    definitions: [],
    definitionVersions: [],
    assemblies: [],
    assemblyVersions: [],
    assignments: [],
  };
  failAudit = false;
  pending = Promise.resolve();
  async transaction(scope, work) {
    const previous = this.pending;
    let unlock;
    this.pending = new Promise((resolve) => {
      unlock = resolve;
    });
    await previous;
    const snapshot = structuredClone(this.state),
      s = this.state;
    const own = (x) =>
      x.tenantId === scope.tenantId && x.facilityId === scope.facilityId;
    const read = (x) => (x ? structuredClone(x) : null);
    const status = (r) => {
      const d = r.decisions.at(-1);
      return {
        id: r.id,
        version: r.version,
        state: r.state,
        decision: d.decision,
        actorId: d.actorId,
        at: d.at,
      };
    };
    const tx = {
      findProcedure: async (id) =>
        s.procedures.find((r) => own(r) && r.id === id) ?? null,
      latestProcedure: async (code) =>
        s.procedures
          .filter((r) => own(r) && r.code === code)
          .sort((a, b) => b.revision - a.revision)[0] ?? null,
      listProcedures: async (page, stage) =>
        s.procedures
          .filter(
            (r) =>
              own(r) &&
              (!stage || (r.stage === stage && r.state === "published")),
          )
          .reverse()
          .slice((page - 1) * 50, (page - 1) * 50 + 51),
      insertProcedure: async (r) => {
        if (
          s.procedures.some(
            (x) => own(x) && x.code === r.code && x.revision === r.revision,
          )
        )
          throw Object.assign(Error("CONFLICT"), { code: "CONFLICT" });
        s.procedures.push(structuredClone(r));
      },
      updateProcedure: async (r, expected) => {
        const n = s.procedures.findIndex((x) => own(x) && x.id === r.id);
        if (n < 0 || s.procedures[n].version !== expected)
          throw Object.assign(Error("CONFLICT"), { code: "CONFLICT" });
        s.procedures[n] = structuredClone(r);
      },
      insertProcedureVersion: async (r) =>
        s.procedureVersions.push(structuredClone(r)),
      findProcedureVersion: async (id, version) =>
        s.procedureVersions.find(
          (r) => own(r) && r.id === id && r.version === version,
        ) ?? null,
      findLoaner: async (id) =>
        s.loaners.find((x) => own(x) && x.id === id) ?? null,
      findLoanerByCode: async (code) =>
        s.loaners.find((x) => own(x) && x.code === code) ?? null,
      listLoaners: async (page) =>
        s.loaners
          .filter(own)
          .reverse()
          .slice((page - 1) * 50, (page - 1) * 50 + 51)
          .map((r) => {
            const { items, handback, ...summary } = r;
            return { ...summary, count: items.length };
          }),
      insertLoaner: async (item) => {
        if (
          s.loaners.some(
            (x) => own(x) && (x.id === item.id || x.code === item.code),
          )
        )
          throw Object.assign(Error("CONFLICT"), { code: "CONFLICT" });
        s.loaners.push(structuredClone(item));
      },
      updateLoaner: async (item, expected) => {
        const n = s.loaners.findIndex((x) => own(x) && x.id === item.id);
        if (
          n < 0 ||
          s.loaners[n].version !== expected ||
          item.version !== expected + 1
        )
          throw Object.assign(Error("CONFLICT"), { code: "CONFLICT" });
        s.loaners[n] = structuredClone(item);
      },
      insertLoanerVersion: async (item) =>
        s.loanerVersions.push(structuredClone(item)),
      findLoanerVersion: async (id, version) =>
        s.loanerVersions.find(
          (x) => own(x) && x.id === id && x.version === version,
        ) ?? null,
      findServiceUsage: async (id) =>
        s.serviceUsages.find((x) => own(x) && x.instrumentId === id) ?? null,
      saveServiceUsage: async (item, expected) => {
        const n = s.serviceUsages.findIndex(
          (x) => own(x) && x.instrumentId === item.instrumentId,
        );
        if (
          item.version !== expected + 1 ||
          (n < 0 ? expected !== 0 : s.serviceUsages[n].version !== expected)
        )
          throw Object.assign(Error("CONFLICT"), { code: "CONFLICT" });
        if (n < 0) s.serviceUsages.push(structuredClone(item));
        else s.serviceUsages[n] = structuredClone(item);
      },
      insertServiceExposure: async (item) => {
        const old = s.serviceExposures.find(
          (x) =>
            own(x) &&
            x.instrumentId === item.instrumentId &&
            x.loadId === item.loadId,
        );
        if (old) {
          if (
            old.loadVersion !== item.loadVersion ||
            old.outcome !== item.outcome
          )
            throw Object.assign(Error("CONFLICT"), { code: "CONFLICT" });
          return false;
        }
        s.serviceExposures.push(structuredClone(item));
        return true;
      },
      listServiceExposures: async (id, page) =>
        s.serviceExposures
          .filter((x) => own(x) && x.instrumentId === id)
          .reverse()
          .slice((page - 1) * 50, (page - 1) * 50 + 51),
      performanceData: async (from, to) => {
        const inside = (at) =>
            Date.parse(at) >= Date.parse(from) &&
            Date.parse(at) < Date.parse(to),
          overlap = (a, b) =>
            Date.parse(a) < Date.parse(to) &&
            (b === null || Date.parse(b) >= Date.parse(from)),
          copy = (rows) => rows.map((x) => structuredClone(x));
        return {
          processing: copy(
            s.processing
              .filter(
                (e) =>
                  own(e) &&
                  (inside(e.createdAt) ||
                    e.attempts.some(
                      (a) =>
                        overlap(a.startedAt, a.finishedAt) ||
                        inside(a.finishedAt),
                    ) ||
                    e.inspections?.some((i) => inside(i.at))),
              )
              .slice(0, 5001),
          ),
          assemblies: copy(
            s.assemblies
              .filter((a) => own(a) && inside(a.completedAt))
              .slice(0, 5001),
          ),
          packages: copy(
            s.packages
              .filter((p) => own(p) && inside(p.createdAt))
              .slice(0, 5001),
          ),
          loads: copy(
            s.loads
              .filter(
                (l) =>
                  own(l) &&
                  (overlap(l.startedAt, l.finishedAt) || inside(l.finishedAt)),
              )
              .slice(0, 5001),
          ),
          reviews: copy(
            s.reviews
              .filter((r) => own(r) && r.decisions.some((d) => inside(d.at)))
              .slice(0, 5001),
          ),
          distribution: copy(
            s.distribution
              .filter(
                (r) =>
                  own(r) &&
                  r.events.some((e) => e.kind === "issued" && inside(e.at)),
              )
              .slice(0, 5001),
          ),
          returns: copy(
            s.returns
              .filter((r) => own(r) && inside(r.createdAt))
              .slice(0, 5001),
          ),
          equipmentVersions: copy(
            s.equipmentVersions
              .filter(
                (v) =>
                  own(v) &&
                  Date.parse(v.updatedAt) < Date.parse(to) &&
                  (inside(v.updatedAt) ||
                    v.version ===
                      Math.max(
                        ...s.equipmentVersions
                          .filter(
                            (p) =>
                              own(p) &&
                              p.id === v.id &&
                              Date.parse(p.updatedAt) < Date.parse(from),
                          )
                          .map((p) => p.version),
                      )),
              )
              .slice(0, 5001),
          ),
        };
      },
      dashboardQueue: async (id, offset = 0) => {
        if (id === "stockCountReviews") {
          const rows = s.stockCounts
            .filter(
              (x) =>
                own(x) &&
                x.state === "pending" &&
                s.consumables.some((l) => own(l) && l.id === x.lotId),
            )
            .map((count) => {
              const review = stockCountReview(
                count,
                s.consumableStock.find(
                  (x) => own(x) && x.lotId === count.lotId,
                ) ?? null,
              );
              return {
                id: count.id,
                code: count.lotCode,
                state: review.stale ? "count_stale" : "count_ready",
                updatedAt: count.recordedAt,
                units: null,
                stockCountReview: review,
              };
            })
            .sort(
              (a, b) =>
                a.updatedAt.localeCompare(b.updatedAt) ||
                a.id.localeCompare(b.id),
            );
          return { total: rows.length, items: rows.slice(offset, offset + 12) };
        }

        if (id === "consumableAlerts") {
          const now = new Date().toISOString(),
            rows = s.consumables
              .filter(own)
              .flatMap((lot) => {
                const stock =
                    s.consumableStock.find(
                      (x) => own(x) && x.lotId === lot.id,
                    ) ?? null,
                  a = consumableAlert(lot, stock, now);
                return a
                  ? [
                      {
                        id: lot.id,
                        code: lot.code,
                        state: "consumable_alert",
                        units: a.available,
                        updatedAt: [
                          lot.createdAt,
                          lot.alertPolicy?.at ?? lot.createdAt,
                          stock?.updatedAt ?? lot.createdAt,
                        ]
                          .sort()
                          .at(-1),
                        consumableAlert: a,
                        expiresOn: lot.expiresOn,
                      },
                    ]
                  : [];
              })
              .sort(
                (a, b) =>
                  a.expiresOn.localeCompare(b.expiresOn) ||
                  a.code.localeCompare(b.code) ||
                  a.id.localeCompare(b.id),
              );
          return {
            total: rows.length,
            items: rows
              .slice(offset, offset + 12)
              .map(({ expiresOn, ...r }) => r),
          };
        }

        const pending = (r) =>
          s.recallInstruments.some(
            (i) =>
              own(i) &&
              i.recallId === r.id &&
              !s.recallReadmissions.some(
                (a) =>
                  own(a) &&
                  a.caseId === r.id &&
                  a.instrumentId === i.instrumentId,
              ),
          );
        const config = {
          cleaning: [
            s.processing,
            (p) =>
              ["received", "cleaning_failed", "inspection_failed"].includes(
                p.state,
              ),
            (p) => p.instruments.length,
          ],
          inspection: [
            s.processing,
            (p) => p.state === "awaiting_inspection",
            (p) => p.instruments.length,
          ],
          assembly: [
            s.assemblies,
            (p) => p.state === "draft",
            (p) => p.instruments.length,
          ],
          loading: [
            s.packages,
            (p) =>
              p.state === "packaged" &&
              !s.packageIntegrity.some((h) => own(h) && h.packageId === p.id) &&
              (p.shelfLife?.mode !== "time_based" ||
                Date.parse(p.shelfLife.expiresAt) > Date.now()) &&
              s.packageAssignments.some(
                (a) => own(a) && a.packageId === p.id,
              ) &&
              !s.loadAssignments.some((a) => own(a) && a.packageId === p.id) &&
              !s.returns.some((a) => own(a) && a.packageId === p.id) &&
              !s.recallBlocks.some((a) => own(a) && a.packageId === p.id),
            (p) => p.assemblySnapshot.instruments.length,
          ],
          release: [
            s.loads,
            (p) =>
              p.state === "awaiting_review" &&
              p.outcome === "passed" &&
              !s.reviews.some(
                (r) =>
                  own(r) &&
                  r.loadId === p.id &&
                  ["released", "rejected"].includes(r.state),
              ),
            (p) => p.packages.length,
          ],
          returns: [
            s.returns,
            (p) => ["returned", "discrepancy"].includes(p.state),
            () => 1,
          ],
          recall: [
            s.recalls,
            (p) => p.state === "open" || pending(p),
            (p) => p.items.length,
          ],
          packageAlerts: [
            s.packages,
            (p) =>
              p.state === "packaged" &&
              !s.returns.some((r) => own(r) && r.packageId === p.id) &&
              (s.packageIntegrity.some((h) => own(h) && h.packageId === p.id) ||
                (p.shelfLife?.mode === "time_based" &&
                  Date.parse(p.shelfLife.expiresAt) <=
                    Date.now() + p.shelfLife.warningDays * 86400000 &&
                  !s.distribution.some(
                    (d) =>
                      own(d) && d.packageId === p.id && d.state === "issued",
                  ))),
            (p) => p.assemblySnapshot.instruments.length,
          ],
          maintenance: [
            s.instruments,
            (p) =>
              p.state === "maintenance" ||
              (p.state === "registered" &&
                !s.loaners.some(
                  (l) =>
                    own(l) &&
                    l.id === p.externalOwnership?.loanerId &&
                    l.state === "returned",
                ) &&
                s.serviceUsages.some(
                  (u) =>
                    own(u) &&
                    u.instrumentId === p.id &&
                    u.interval !== null &&
                    u.totalRecorded - u.serviceBaseline >= u.interval,
                )),
            () => 1,
          ],
        }[id];
        const [rows, filter, units] = config,
          found = rows
            .filter((p) => own(p) && filter(p))
            .sort(
              (a, b) =>
                (a.updatedAt ?? a.createdAt).localeCompare(
                  b.updatedAt ?? b.createdAt,
                ) || a.id.localeCompare(b.id),
            );
        return {
          total: found.length,
          items: found.slice(offset, offset + 12).map((p) => ({
            id: p.id,
            code: p.code,
            state: p.state,
            updatedAt: p.updatedAt ?? p.createdAt,
            units: units(p),
          })),
        };
      },
      searchTraceCode: async (code) =>
        [
          ["instrument", "instruments"],
          ["definition", "definitions"],
          ["assembly", "assemblies"],
          ["package", "packages"],
          ["load", "loads"],
        ].flatMap(([kind, table]) =>
          s[table]
            .filter((x) => own(x) && x.code === code)
            .map((x) => ({ kind, id: x.id, code: x.code, version: x.version })),
        ),
      traceRows: async (kind, filter) => {
        const tables = {
          instrument: ["instruments", null],
          definition: ["definitions", "definitionVersions"],
          assembly: ["assemblies", "assemblyVersions"],
          package: ["packages", "packageVersions"],
          load: ["loads", "loadVersions"],
          processing: ["processing", "processingVersions"],
          review: ["reviews", "reviewVersions"],
          distribution: ["distribution", "distributionVersions"],
          return: ["returns", "returnVersions"],
          recall: ["recalls", "recallVersions"],
        };
        const [table, versions] = tables[kind],
          current = s[table].filter(own),
          past = versions ? s[versions].filter(own) : [],
          matches = (x) =>
            filter.ids?.includes(x.id) ||
            (kind === "assembly" &&
              filter.definitionIds?.includes(x.definitionId)) ||
            (["assembly", "processing"].includes(kind) &&
              x.instruments.some((i) =>
                filter.instrumentIds?.includes(i.id),
              )) ||
            (kind === "package" &&
              x.assemblySnapshot.instruments.some((i) =>
                filter.instrumentIds?.includes(i.id),
              )) ||
            (kind === "load" &&
              x.packages.some((p) => filter.packageIds?.includes(p.id))) ||
            (["distribution", "return"].includes(kind) &&
              filter.packageIds?.includes(x.packageId)) ||
            (kind === "recall" &&
              x.items.some((p) => filter.packageIds?.includes(p.packageId))) ||
            (kind === "review" && filter.loadIds?.includes(x.loadId));
        const ids = new Set(
          [...current, ...past].filter(matches).map((x) => x.id),
        );
        return [
          ...current
            .filter((x) => ids.has(x.id))
            .map((record) => ({ kind, current: true, record })),
          ...past
            .filter(
              (x) =>
                ids.has(x.id) &&
                !current.some((c) => c.id === x.id && c.version === x.version),
            )
            .map((record) => ({ kind, current: false, record })),
        ]
          .slice(0, 1001)
          .map((x) => structuredClone(x));
      },
      traceAudit: async (ids) =>
        structuredClone(
          s.audit
            .filter((x) => own(x) && ids.includes(x.entityId))
            .slice(0, 2001),
        ),
      findReturn: async (id) =>
        read(s.returns.find((x) => own(x) && x.id === id)),
      findReturnByCode: async (code) =>
        read(s.returns.find((x) => own(x) && x.code === code)),
      listReturns: async (page) =>
        s.returns
          .filter(own)
          .slice()
          .reverse()
          .slice((page - 1) * 50, (page - 1) * 50 + 51)
          .map((x) => {
            const { issue, scanReceipt, reconciliation, ...summary } = x;
            return structuredClone(summary);
          }),
      insertReturn: async (x) => {
        if (
          !own(x) ||
          s.returns.some(
            (r) =>
              own(r) &&
              (r.id === x.id ||
                r.code === x.code ||
                r.packageId === x.packageId),
          )
        )
          throw Error("constraint");
        s.returns.push(structuredClone(x));
      },
      updateReturn: async (x, version) => {
        const n = s.returns.findIndex(
          (r) => own(r) && r.id === x.id && r.version === version,
        );
        if (n < 0) throw Error("conflict");
        s.returns[n] = structuredClone(x);
      },
      insertReturnVersion: async (x) => {
        if (
          !own(x) ||
          s.returnVersions.some(
            (r) => own(r) && r.id === x.id && r.version === x.version,
          )
        )
          throw Error("constraint");
        s.returnVersions.push(structuredClone(x));
      },
      findReturnVersion: async (id, version) =>
        read(
          s.returnVersions.find(
            (x) => own(x) && x.id === id && x.version === version,
          ),
        ),
      findReturnByPackage: async (id) =>
        read(s.returns.find((x) => own(x) && x.packageId === id)),
      findRecall: async (id) =>
        read(s.recalls.find((x) => own(x) && x.id === id)),
      findRecallByCode: async (code) =>
        read(s.recalls.find((x) => own(x) && x.code === code)),
      listRecalls: async (page) =>
        s.recalls
          .filter(own)
          .slice()
          .reverse()
          .slice((page - 1) * 50, (page - 1) * 50 + 51)
          .map((x) => {
            const { items, ...summary } = x;
            return { ...structuredClone(summary), packageCount: items.length };
          }),
      insertRecall: async (x) => {
        if (
          !own(x) ||
          s.recalls.some((r) => own(r) && (r.id === x.id || r.code === x.code))
        )
          throw Error("constraint");
        s.recalls.push(structuredClone(x));
      },
      updateRecall: async (x, version) => {
        const n = s.recalls.findIndex(
          (r) => own(r) && r.id === x.id && r.version === version,
        );
        if (n < 0) throw Error("conflict");
        s.recalls[n] = structuredClone(x);
      },
      insertRecallVersion: async (x) => {
        if (
          !own(x) ||
          s.recallVersions.some(
            (r) => own(r) && r.id === x.id && r.version === x.version,
          )
        )
          throw Error("constraint");
        s.recallVersions.push(structuredClone(x));
      },
      findRecallVersion: async (id, version) =>
        read(
          s.recallVersions.find(
            (x) => own(x) && x.id === id && x.version === version,
          ),
        ),
      insertRecallBlocks: async (r) => {
        for (const p of r.items)
          s.recallBlocks.push({
            ...scope,
            packageId: p.packageId,
            recallId: r.id,
          });
      },
      findRecallReadmission: async (caseId, instrumentId) => {
        const link = s.recallReadmissions.find(
            (x) =>
              own(x) && x.caseId === caseId && x.instrumentId === instrumentId,
          ),
          e =
            link && s.processing.find((x) => own(x) && x.id === link.episodeId);
        return e ? { episodeId: e.id, episodeCode: e.code } : null;
      },
      listInstrumentRecallCases: async (id) =>
        read(
          s.recalls.filter(
            (r) =>
              own(r) &&
              (s.recallInstruments.some(
                (x) => own(x) && x.recallId === r.id && x.instrumentId === id,
              ) ||
                (!r.lineage &&
                  r.items.some((item) =>
                    s.packages.some(
                      (p) =>
                        own(p) &&
                        p.id === item.packageId &&
                        p.assemblySnapshot.instruments.some((i) => i.id === id),
                    ),
                  ))),
          ),
        ),
      listPackageRecallCases: async (id) =>
        read(
          s.recalls.filter(
            (r) =>
              own(r) &&
              s.recallBlocks.some(
                (b) => own(b) && b.packageId === id && b.recallId === r.id,
              ),
          ),
        ),
      insertRecallReadmissions: async (episode, pairs) => {
        for (const pair of pairs) {
          const r = s.recalls.find((x) => own(x) && x.id === pair.caseId);
          if (
            !own(episode) ||
            !r?.clearance ||
            r.state !== "closed" ||
            s.recallReadmissions.some(
              (x) =>
                own(x) &&
                x.caseId === pair.caseId &&
                x.instrumentId === pair.instrumentId,
            )
          )
            throw Error("readmission constraint");
          s.recallReadmissions.push({
            ...scope,
            ...pair,
            episodeId: episode.id,
          });
        }
      },
      insertRecallInstrumentBlocks: async (r) => {
        for (const id of r.lineage?.instrumentIds ?? []) {
          if (
            !s.recallInstruments.some(
              (x) => own(x) && x.instrumentId === id && x.recallId === r.id,
            )
          )
            s.recallInstruments.push({
              ...scope,
              instrumentId: id,
              recallId: r.id,
            });
        }
      },
      findInstrumentRecallBlock: async (id) => {
        const refs = s.recallInstruments.filter(
            (x) =>
              own(x) &&
              x.instrumentId === id &&
              !s.recallReadmissions.some(
                (a) =>
                  own(a) && a.caseId === x.recallId && a.instrumentId === id,
              ),
          ),
          latest = refs.at(-1),
          r =
            latest && s.recalls.find((x) => own(x) && x.id === latest.recallId);
        return r
          ? {
              caseId: r.id,
              caseCode: r.code,
              state: r.state,
              count: refs.length,
            }
          : null;
      },
      findRecallBlock: async (id) => {
        const refs = s.recallBlocks.filter((x) => own(x) && x.packageId === id),
          latest = refs.at(-1),
          r =
            latest && s.recalls.find((x) => own(x) && x.id === latest.recallId);
        return r
          ? {
              caseId: r.id,
              caseCode: r.code,
              state: r.state,
              count: refs.length,
            }
          : null;
      },
      findDistribution: async (id) =>
        read(s.distribution.find((x) => own(x) && x.id === id)),
      findDistributionByPackage: async (id) =>
        read(s.distribution.find((x) => own(x) && x.packageId === id)),
      listDistribution: async (page) =>
        s.distribution
          .filter(own)
          .slice()
          .reverse()
          .slice((page - 1) * 50, (page - 1) * 50 + 51)
          .map((x) => {
            const { events, ...summary } = x;
            return structuredClone(summary);
          }),
      insertDistribution: async (x) => {
        if (
          !own(x) ||
          s.distribution.some(
            (i) => own(i) && (i.id === x.id || i.packageId === x.packageId),
          )
        )
          throw Error("constraint");
        s.distribution.push(structuredClone(x));
      },
      updateDistribution: async (x, version) => {
        const n = s.distribution.findIndex(
          (i) => own(i) && i.id === x.id && i.version === version,
        );
        if (n < 0) throw Error("conflict");
        s.distribution[n] = structuredClone(x);
      },
      insertDistributionVersion: async (x) => {
        if (
          !own(x) ||
          s.distributionVersions.some(
            (i) => own(i) && i.id === x.id && i.version === x.version,
          )
        )
          throw Error("constraint");
        s.distributionVersions.push(structuredClone(x));
      },
      findDistributionVersion: async (id, version) =>
        read(
          s.distributionVersions.find(
            (x) => own(x) && x.id === id && x.version === version,
          ),
        ),
      findReview: async (id) =>
        read(s.reviews.find((x) => own(x) && x.id === id)),
      findReviewByLoad: async (loadId) =>
        read(s.reviews.find((x) => own(x) && x.loadId === loadId)),
      listReviews: async (page) =>
        s.reviews
          .filter(own)
          .slice()
          .reverse()
          .slice((page - 1) * 50, (page - 1) * 50 + 51)
          .map((x) => ({
            id: x.id,
            tenantId: x.tenantId,
            facilityId: x.facilityId,
            loadId: x.loadId,
            loadVersion: x.loadVersion,
            state: x.state,
            version: x.version,
            createdAt: x.createdAt,
            updatedAt: x.updatedAt,
            loadCode: x.loadSnapshot.code,
          })),
      listReviewQueue: async (page) =>
        s.loads
          .filter(
            (x) =>
              own(x) &&
              ["awaiting_review", "failed", "aborted"].includes(x.state),
          )
          .map((l) => ({
            l,
            r: s.reviews.find((r) => own(r) && r.loadId === l.id),
          }))
          .filter((x) => !x.r || x.r.state === "held")
          .reverse()
          .slice((page - 1) * 50, (page - 1) * 50 + 51)
          .map(({ l, r }) => ({
            id: l.id,
            tenantId: l.tenantId,
            facilityId: l.facilityId,
            code: l.code,
            version: l.version,
            state: l.state,
            outcome: l.outcome,
            sterilizer: l.sterilizer,
            packageCount: l.packages.length,
            reviewId: r?.id ?? null,
            reviewVersion: r?.version ?? 0,
          })),
      insertReview: async (x) => {
        if (
          !own(x) ||
          s.reviews.some(
            (r) => own(r) && (r.id === x.id || r.loadId === x.loadId),
          )
        )
          throw Error("constraint");
        s.reviews.push(structuredClone(x));
      },
      updateReview: async (x, version) => {
        const n = s.reviews.findIndex(
          (r) => own(r) && r.id === x.id && r.version === version,
        );
        if (n < 0) throw Error("conflict");
        s.reviews[n] = structuredClone(x);
      },
      insertReviewVersion: async (x) => {
        if (
          !own(x) ||
          s.reviewVersions.some(
            (r) => own(r) && r.id === x.id && r.version === x.version,
          )
        )
          throw Error("constraint");
        s.reviewVersions.push(structuredClone(x));
      },
      findReviewVersion: async (id, version) =>
        read(
          s.reviewVersions.find(
            (x) => own(x) && x.id === id && x.version === version,
          ),
        ),
      findLoad: async (id) => read(s.loads.find((x) => own(x) && x.id === id)),
      findLoadByCode: async (code) =>
        read(s.loads.find((x) => own(x) && x.code === code)),
      listLoads: async (page) =>
        s.loads
          .filter(own)
          .slice()
          .reverse()
          .slice((page - 1) * 50, (page - 1) * 50 + 51)
          .map((x) => ({
            id: x.id,
            tenantId: x.tenantId,
            facilityId: x.facilityId,
            code: x.code,
            sterilizer: x.sterilizer,
            state: x.state,
            version: x.version,
            createdAt: x.createdAt,
            packageCount: x.packages.length,
          })),
      insertLoad: async (x) => {
        if (
          !own(x) ||
          s.loads.some((i) => own(i) && (i.id === x.id || i.code === x.code))
        )
          throw Error("constraint");
        s.loads.push(structuredClone(x));
      },
      updateLoad: async (x, version) => {
        const n = s.loads.findIndex(
          (i) => own(i) && i.id === x.id && i.version === version,
        );
        if (n < 0) throw Error("conflict");
        s.loads[n] = structuredClone(x);
      },
      insertLoadVersion: async (x) => {
        if (
          !own(x) ||
          s.loadVersions.some(
            (i) => own(i) && i.id === x.id && i.version === x.version,
          )
        )
          throw Error("constraint");
        s.loadVersions.push(structuredClone(x));
      },
      findLoadVersion: async (id, version) =>
        read(
          s.loadVersions.find(
            (x) => own(x) && x.id === id && x.version === version,
          ),
        ),
      findPackageLoad: async (id) => {
        const a = s.loadAssignments.find((x) => own(x) && x.packageId === id),
          l = a && s.loads.find((x) => own(x) && x.id === a.loadId);
        const review = l && s.reviews.find((r) => own(r) && r.loadId === l.id);
        return l
          ? {
              loadId: l.id,
              loadCode: l.code,
              state: l.state,
              ...(review ? { review: status(review) } : {}),
            }
          : null;
      },
      replaceLoadAssignments: async (l) => {
        s.loadAssignments = s.loadAssignments.filter(
          (x) => !(own(x) && x.loadId === l.id),
        );
        if (l.state !== "cancelled")
          for (const p of l.packages) {
            if (s.loadAssignments.some((x) => own(x) && x.packageId === p.id))
              throw Error("constraint");
            s.loadAssignments.push({ ...scope, loadId: l.id, packageId: p.id });
          }
      },
      findMachineCycle: async (sterilizer, reference) =>
        s.machineCycles.find(
          (x) =>
            own(x) && x.sterilizer === sterilizer && x.reference === reference,
        )?.loadId ?? null,
      reserveMachineCycle: async (l) => {
        if (
          !own(l) ||
          s.machineCycles.some(
            (x) =>
              own(x) &&
              x.sterilizer === l.sterilizer &&
              x.reference === l.cycleReference,
          )
        )
          throw Error("constraint");
        s.machineCycles.push({
          ...scope,
          sterilizer: l.sterilizer,
          reference: l.cycleReference,
          loadId: l.id,
        });
      },
      equipmentExposureCandidates: async (id, code, from, to) => {
        const overlap = (start, end) =>
          Date.parse(start) < Date.parse(to) &&
          (end === null || Date.parse(end) >= Date.parse(from));
        return {
          processing: s.processing
            .filter(
              (p) =>
                own(p) &&
                p.attempts.some(
                  (a) =>
                    a.method === "mechanical" &&
                    (a.registeredEquipment?.id === id ||
                      (!a.registeredEquipment &&
                        a.equipment.toUpperCase() === code)) &&
                    overlap(a.startedAt, a.finishedAt),
                ),
            )
            .slice(0, 201)
            .map((x) => structuredClone(x)),
          loads: s.loads
            .filter((l) => {
              const machine = l.startedEquipment ?? l.registeredEquipment;
              return (
                own(l) &&
                l.startedAt &&
                (machine?.id === id ||
                  (!machine && l.sterilizer.toUpperCase() === code)) &&
                overlap(l.startedAt, l.finishedAt)
              );
            })
            .slice(0, 201)
            .map((x) => structuredClone(x)),
        };
      },
      equipmentIncidentPackages: async (episodes, ids) =>
        s.packages
          .filter(
            (p) =>
              own(p) &&
              (ids.includes(p.id) ||
                p.inspectionProofs.some((proof) =>
                  episodes.includes(proof.episodeId),
                )),
          )
          .slice(0, 101)
          .map((x) => structuredClone(x)),
      findEquipmentIncident: async (id) =>
        read(s.equipmentIncidents.find((x) => own(x) && x.id === id)),
      findEquipmentIncidentByCode: async (code) =>
        read(s.equipmentIncidents.find((x) => own(x) && x.code === code)),
      listEquipmentIncidents: async (id, page) =>
        s.equipmentIncidents
          .filter((x) => own(x) && x.equipmentId === id)
          .slice()
          .reverse()
          .slice((page - 1) * 50, (page - 1) * 50 + 51)
          .map((x) => structuredClone(x)),
      insertEquipmentIncident: async (item) => {
        if (
          !own(item) ||
          s.equipmentIncidents.some(
            (x) => own(x) && (x.id === item.id || x.code === item.code),
          )
        )
          throw Error("constraint");
        s.equipmentIncidents.push(structuredClone(item));
      },
      updateEquipmentIncident: async (item, expected) => {
        const n = s.equipmentIncidents.findIndex(
          (x) => own(x) && x.id === item.id && x.version === expected,
        );
        if (!own(item) || n < 0) throw Error("constraint");
        s.equipmentIncidents[n] = structuredClone(item);
      },
      insertEquipmentIncidentVersion: async (item) => {
        if (
          !own(item) ||
          s.equipmentIncidentVersions.some(
            (x) => own(x) && x.id === item.id && x.version === item.version,
          )
        )
          throw Error("constraint");
        s.equipmentIncidentVersions.push(structuredClone(item));
      },
      findEquipmentIncidentVersion: async (id, version) =>
        read(
          s.equipmentIncidentVersions.find(
            (x) => own(x) && x.id === id && x.version === version,
          ),
        ),
      listConsumablePackages: async (id, page) =>
        s.packages
          .filter((x) => own(x) && x.consumableLots?.some((l) => l.id === id))
          .slice()
          .reverse()
          .slice((page - 1) * 50, (page - 1) * 50 + 51)
          .map((x) => ({
            id: x.id,
            tenantId: x.tenantId,
            facilityId: x.facilityId,
            code: x.code,
            state: x.state,
            createdAt: x.createdAt,
          })),
      findStockCount: async (id) =>
        read(s.stockCounts.find((x) => own(x) && x.id === id)),
      findPendingStockCount: async (id) =>
        read(
          s.stockCounts.find(
            (x) => own(x) && x.lotId === id && x.state === "pending",
          ),
        ),
      insertStockCount: async (item) => {
        if (
          !own(item) ||
          s.stockCounts.some(
            (x) =>
              own(x) &&
              (x.id === item.id ||
                (x.lotId === item.lotId && x.state === "pending")),
          )
        )
          throw Error("constraint");
        s.stockCounts.push(structuredClone(item));
      },
      updateStockCount: async (item, expected) => {
        const n = s.stockCounts.findIndex(
          (x) =>
            own(x) &&
            x.id === item.id &&
            x.version === expected &&
            x.state === "pending",
        );
        if (!own(item) || n < 0) throw Error("constraint");
        s.stockCounts[n] = structuredClone(item);
      },
      listStockCounts: async (id, page) =>
        s.stockCounts
          .filter((x) => own(x) && x.lotId === id)
          .slice()
          .reverse()
          .slice((page - 1) * 50, (page - 1) * 50 + 51)
          .map((x) => structuredClone(x)),
      findConsumableStock: async (id) =>
        read(s.consumableStock.find((x) => own(x) && x.lotId === id)),
      saveConsumableStock: async (item, expected) => {
        const n = s.consumableStock.findIndex(
          (x) => own(x) && x.lotId === item.lotId,
        );
        if (
          !own(item) ||
          (n < 0 ? expected !== 0 : s.consumableStock[n].version !== expected)
        )
          throw Error("constraint");
        if (n < 0) s.consumableStock.push(structuredClone(item));
        else s.consumableStock[n] = structuredClone(item);
      },
      listConsumableStockMovements: async (id, page) =>
        s.consumableStockMovements
          .filter((x) => own(x) && x.lotId === id)
          .slice()
          .reverse()
          .slice((page - 1) * 50, (page - 1) * 50 + 51)
          .map((x) => structuredClone(x)),
      insertConsumableStockMovement: async (item) => {
        if (
          !own(item) ||
          s.consumableStockMovements.some(
            (x) =>
              own(x) &&
              (x.id === item.id ||
                (x.lotId === item.lotId && x.version === item.version)),
          )
        )
          throw Error("constraint");
        s.consumableStockMovements.push(structuredClone(item));
      },
      updateConsumable: async (item, expected) => {
        const n = s.consumables.findIndex(
          (x) => own(x) && x.id === item.id && x.version === expected,
        );
        if (!own(item) || n < 0) throw Error("constraint");
        s.consumables[n] = structuredClone(item);
      },
      findConsumable: async (id) =>
        read(s.consumables.find((x) => own(x) && x.id === id)),
      findConsumableByCode: async (code) =>
        read(s.consumables.find((x) => own(x) && x.code === code)),
      listConsumables: async (page) =>
        s.consumables
          .filter(own)
          .slice()
          .reverse()
          .slice((page - 1) * 50, (page - 1) * 50 + 51)
          .map((x) => structuredClone(x)),
      insertConsumable: async (item) => {
        if (
          !own(item) ||
          s.consumables.some(
            (x) => own(x) && (x.id === item.id || x.code === item.code),
          )
        )
          throw Error("constraint");
        s.consumables.push(structuredClone(item));
      },
      findEquipment: async (id) =>
        read(s.equipment.find((x) => own(x) && x.id === id)),
      findEquipmentByCode: async (code) =>
        read(s.equipment.find((x) => own(x) && x.code === code)),
      listEquipment: async (page) =>
        s.equipment
          .filter(own)
          .slice()
          .reverse()
          .slice((page - 1) * 50, (page - 1) * 50 + 51)
          .map((x) => structuredClone(x)),
      insertEquipment: async (item) => {
        if (
          !own(item) ||
          s.equipment.some(
            (x) => own(x) && (x.id === item.id || x.code === item.code),
          )
        )
          throw Error("constraint");
        s.equipment.push(structuredClone(item));
      },
      updateEquipment: async (item, expected) => {
        const n = s.equipment.findIndex(
          (x) => own(x) && x.id === item.id && x.version === expected,
        );
        if (!own(item) || n < 0) throw Error("constraint");
        s.equipment[n] = structuredClone(item);
      },
      insertEquipmentVersion: async (item) => {
        if (
          !own(item) ||
          s.equipmentVersions.some(
            (x) => own(x) && x.id === item.id && x.version === item.version,
          )
        )
          throw Error("constraint");
        s.equipmentVersions.push(structuredClone(item));
      },
      findEquipmentVersion: async (id, version) =>
        read(
          s.equipmentVersions.find(
            (x) => own(x) && x.id === id && x.version === version,
          ),
        ),
      findPackageIntegrity: async (id) =>
        read(s.packageIntegrity.find((x) => own(x) && x.packageId === id)),
      insertPackageIntegrity: async (item) => {
        if (
          !own(item) ||
          s.packageIntegrity.some(
            (x) => own(x) && x.packageId === item.packageId,
          )
        )
          throw Error("constraint");
        s.packageIntegrity.push(structuredClone(item));
      },
      findPackage: async (id) =>
        read(s.packages.find((x) => own(x) && x.id === id)),
      findPackageByCode: async (code) =>
        read(s.packages.find((x) => own(x) && x.code === code)),
      listPackages: async (page) =>
        s.packages
          .filter(own)
          .slice()
          .reverse()
          .slice((page - 1) * 50, (page - 1) * 50 + 51)
          .map((x) => ({
            id: x.id,
            tenantId: x.tenantId,
            facilityId: x.facilityId,
            code: x.code,
            assemblyId: x.assemblyId,
            state: x.state,
            version: x.version,
            createdAt: x.createdAt,
            ...(x.shelfLife ? { shelfLife: x.shelfLife } : {}),
            trayName: x.assemblySnapshot.definitionSnapshot.name,
            instrumentCount: x.assemblySnapshot.instruments.length,
          })),
      insertPackage: async (x) => {
        if (
          !own(x) ||
          s.packages.some((i) => own(i) && (i.id === x.id || i.code === x.code))
        )
          throw Error("constraint");
        s.packages.push(structuredClone(x));
      },
      updatePackage: async (x, version) => {
        const n = s.packages.findIndex(
          (i) => own(i) && i.id === x.id && i.version === version,
        );
        if (n < 0) throw Error("conflict");
        s.packages[n] = structuredClone(x);
      },
      insertPackageVersion: async (x) => {
        if (
          !own(x) ||
          s.packageVersions.some(
            (i) => own(i) && i.id === x.id && i.version === x.version,
          )
        )
          throw Error("constraint");
        s.packageVersions.push(structuredClone(x));
      },
      findPackageVersion: async (id, version) =>
        read(
          s.packageVersions.find(
            (x) => own(x) && x.id === id && x.version === version,
          ),
        ),
      findActivePackage: async (id) => {
        const a = s.packageAssignments.find(
            (x) => own(x) && x.assemblyId === id,
          ),
          p = a && s.packages.find((x) => own(x) && x.id === a.packageId);
        return p ? { packageId: p.id, packageCode: p.code } : null;
      },
      reservePackage: async (x) => {
        if (
          !own(x) ||
          s.packageAssignments.some(
            (i) => own(i) && i.assemblyId === x.assemblyId,
          )
        )
          throw Error("constraint");
        s.packageAssignments.push({
          ...scope,
          assemblyId: x.assemblyId,
          packageId: x.id,
        });
      },
      releasePackage: async (x) => {
        const n = s.packageAssignments.findIndex(
          (i) =>
            own(i) && i.assemblyId === x.assemblyId && i.packageId === x.id,
        );
        if (n < 0) throw Error("conflict");
        s.packageAssignments.splice(n, 1);
      },
      findLatestProcessing: async (id) =>
        read(
          s.processing
            .filter((x) => own(x) && x.instruments.some((i) => i.id === id))
            .at(-1),
        ),
      findProcessing: async (id) =>
        read(s.processing.find((x) => own(x) && x.id === id)),
      findProcessingByCode: async (code) =>
        read(s.processing.find((x) => own(x) && x.code === code)),
      listProcessing: async (page) =>
        structuredClone(
          s.processing.filter(own).slice((page - 1) * 50, (page - 1) * 50 + 51),
        ),
      insertProcessing: async (x) => {
        if (
          !own(x) ||
          s.processing.some(
            (i) => own(i) && (i.id === x.id || i.code === x.code),
          )
        )
          throw Error("constraint");
        s.processing.push(structuredClone(x));
      },
      updateProcessing: async (x, v) => {
        const n = s.processing.findIndex(
          (i) => own(i) && i.id === x.id && i.version === v,
        );
        if (n < 0) throw Error("conflict");
        s.processing[n] = structuredClone(x);
      },
      insertProcessingVersion: async (x) => {
        if (
          !own(x) ||
          s.processingVersions.some(
            (i) => own(i) && i.id === x.id && i.version === x.version,
          )
        )
          throw Error("constraint");
        s.processingVersions.push(structuredClone(x));
      },
      findProcessingVersion: async (id, v) =>
        read(
          s.processingVersions.find(
            (x) => own(x) && x.id === id && x.version === v,
          ),
        ),
      findProcessingHold: async (id) => {
        const h = s.processingHolds.find(
          (x) => own(x) && x.instrumentId === id,
        );
        const e = h && s.processing.find((x) => own(x) && x.id === h.episodeId);
        return e ? { episodeId: e.id, episodeCode: e.code } : null;
      },
      releaseProcessing: async (e) => {
        const rows = s.processingHolds.filter(
          (x) => own(x) && x.episodeId === e.id,
        );
        if (rows.length !== e.instruments.length) throw Error("conflict");
        s.processingHolds = s.processingHolds.filter(
          (x) => !(own(x) && x.episodeId === e.id),
        );
      },
      reserveProcessing: async (e) => {
        for (const i of e.instruments) {
          if (s.processingHolds.some((x) => own(x) && x.instrumentId === i.id))
            throw Error("constraint");
          s.processingHolds.push({
            ...scope,
            instrumentId: i.id,
            episodeId: e.id,
          });
        }
      },
      findType: async (id) => read(s.types.find((x) => own(x) && x.id === id)),
      findTypeByCode: async (code) =>
        read(s.types.find((x) => own(x) && x.code === code)),
      listTypes: async (page) =>
        structuredClone(
          s.types
            .filter(own)
            .sort((a, b) => a.id.localeCompare(b.id))
            .slice((page - 1) * 50, (page - 1) * 50 + 51),
        ),
      insertType: async (x) => {
        if (
          !own(x) ||
          s.types.some((t) => own(t) && (t.id === x.id || t.code === x.code))
        )
          throw Error("constraint");
        s.types.push(structuredClone(x));
      },
      findInstrument: async (id) =>
        read(s.instruments.find((x) => own(x) && x.id === id)),
      findInstrumentByCode: async (code) =>
        read(s.instruments.find((x) => own(x) && x.code === code)),
      listInstruments: async (page) =>
        structuredClone(
          s.instruments
            .filter(own)
            .sort((a, b) => a.id.localeCompare(b.id))
            .slice((page - 1) * 50, (page - 1) * 50 + 51),
        ),
      insertInstrument: async (x) => {
        if (
          !own(x) ||
          s.instruments.some(
            (i) => own(i) && (i.id === x.id || i.code === x.code),
          ) ||
          !s.types.some((t) => own(t) && t.id === x.instrumentTypeId)
        )
          throw Error("constraint");
        s.instruments.push(structuredClone(x));
      },
      updateInstrument: async (x, v) => {
        const n = s.instruments.findIndex(
          (i) => own(i) && i.id === x.id && i.version === v,
        );
        if (n < 0) throw Error("conflict");
        s.instruments[n] = structuredClone(x);
      },
      listAudit: async (id, page) =>
        structuredClone(
          s.audit
            .filter((x) => own(x) && x.entityId === id)
            .reverse()
            .slice((page - 1) * 50, (page - 1) * 50 + 51),
        ),
      appendAudit: async (e) => {
        if (this.failAudit) throw Error("synthetic audit failure");
        if (!own(e) || e.actorId !== scope.actorId) throw Error("scope");
        if (s.audit.some((x) => own(x) && x.requestId === e.requestId))
          throw Error("audit request constraint");
        s.audit.push(structuredClone(e));
      },
      findDefinition: async (id) =>
        read(s.definitions.find((x) => own(x) && x.id === id)),
      findDefinitionByCode: async (code) =>
        read(s.definitions.find((x) => own(x) && x.code === code)),
      listDefinitions: async (page) =>
        structuredClone(
          s.definitions
            .filter(own)
            .sort((a, b) => a.id.localeCompare(b.id))
            .slice((page - 1) * 50, (page - 1) * 50 + 51),
        ),
      insertDefinition: async (x) => {
        if (
          !own(x) ||
          s.definitions.some(
            (d) => own(d) && (d.id === x.id || d.code === x.code),
          )
        )
          throw Error("constraint");
        s.definitions.push(structuredClone(x));
      },
      updateDefinition: async (x, v) => {
        const n = s.definitions.findIndex(
          (d) => own(d) && d.id === x.id && d.version === v,
        );
        if (n < 0) throw Error("conflict");
        s.definitions[n] = structuredClone(x);
      },
      insertDefinitionRevision: async (x) => {
        if (
          !own(x) ||
          s.definitionVersions.some(
            (d) => own(d) && d.id === x.id && d.revision === x.revision,
          )
        )
          throw Error("constraint");
        s.definitionVersions.push(structuredClone(x));
      },
      findDefinitionRevision: async (id, revision) =>
        read(
          s.definitionVersions.find(
            (d) => own(d) && d.id === id && d.revision === revision,
          ),
        ),
      findAssembly: async (id) =>
        read(s.assemblies.find((x) => own(x) && x.id === id)),
      findAssemblyByCode: async (code) =>
        read(s.assemblies.find((x) => own(x) && x.code === code)),
      listAssemblies: async (page) =>
        structuredClone(
          s.assemblies
            .filter(own)
            .sort((a, b) => a.id.localeCompare(b.id))
            .slice((page - 1) * 50, (page - 1) * 50 + 51),
        ),
      insertAssembly: async (x) => {
        if (
          !own(x) ||
          s.assemblies.some(
            (a) => own(a) && (a.id === x.id || a.code === x.code),
          )
        )
          throw Error("constraint");
        s.assemblies.push(structuredClone(x));
      },
      updateAssembly: async (x, v) => {
        const n = s.assemblies.findIndex(
          (a) => own(a) && a.id === x.id && a.version === v,
        );
        if (n < 0) throw Error("conflict");
        s.assemblies[n] = structuredClone(x);
      },
      insertAssemblyVersion: async (x) => {
        if (
          !own(x) ||
          s.assemblyVersions.some(
            (a) => own(a) && a.id === x.id && a.version === x.version,
          )
        )
          throw Error("constraint");
        s.assemblyVersions.push(structuredClone(x));
      },
      findAssemblyVersion: async (id, version) =>
        read(
          s.assemblyVersions.find(
            (a) => own(a) && a.id === id && a.version === version,
          ),
        ),
      findActiveAssignment: async (id) => {
        const p = s.assignments.find((x) => own(x) && x.instrumentId === id);
        const a =
          p && s.assemblies.find((x) => own(x) && x.id === p.assemblyId);
        return a ? { assemblyId: a.id, assemblyCode: a.code } : null;
      },
      replaceAssignments: async (a) => {
        if (!own(a)) throw Error("scope");
        s.assignments = s.assignments.filter(
          (x) => !(own(x) && x.assemblyId === a.id),
        );
        if (a.state !== "disassembled")
          for (const i of a.instruments) {
            if (s.assignments.some((x) => own(x) && x.instrumentId === i.id))
              throw Error("duplicate assignment");
            s.assignments.push({
              ...scope,
              instrumentId: i.id,
              assemblyId: a.id,
            });
          }
      },
      findReceipt: async (key) =>
        read(s.receipts.find((x) => own(x) && x.requestId === key)?.value),
      saveReceipt: async (key, value) => {
        if (s.receipts.some((x) => own(x) && x.requestId === key))
          throw Error("duplicate request");
        s.receipts.push({
          ...scope,
          requestId: key,
          value: structuredClone(value),
        });
      },
    };
    try {
      return await work(tx);
    } catch (e) {
      this.state = snapshot;
      throw e;
    } finally {
      unlock();
    }
  }
}

/** Fictional, independent inspection actor for workflow fixtures. Not an authorization bypass. */
export function independentInspector(scope) {
  const id = "a7f4b902-0101-4be1-8001-000000000005";
  return { ...scope, actorId: id, personId: id };
}

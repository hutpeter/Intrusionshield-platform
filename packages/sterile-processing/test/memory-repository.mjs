/** SQL-free test adapter only. Never loaded by the service composition root. */
export class MemoryRepository {
  state = {
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
    packages: [],
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
            const { issue, ...summary } = x;
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

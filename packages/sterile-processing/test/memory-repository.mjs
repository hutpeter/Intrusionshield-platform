/** SQL-free test adapter only. Never loaded by the service composition root. */
export class MemoryRepository {
  state = {
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
    const tx = {
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
        return l ? { loadId: l.id, loadCode: l.code, state: l.state } : null;
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

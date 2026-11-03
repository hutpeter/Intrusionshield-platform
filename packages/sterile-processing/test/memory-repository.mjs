/** SQL-free test adapter only. Never loaded by the service composition root. */
export class MemoryRepository {
  state = {
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

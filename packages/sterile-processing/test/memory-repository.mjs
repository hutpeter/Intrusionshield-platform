/** SQL-free test adapter only. Never loaded by the service composition root. */
export class MemoryRepository {
  state = { types: [], instruments: [], audit: [], receipts: [] };
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
      appendAudit: async (e) => {
        if (this.failAudit) throw Error("synthetic audit failure");
        if (!own(e) || e.actorId !== scope.actorId) throw Error("scope");
        s.audit.push(structuredClone(e));
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

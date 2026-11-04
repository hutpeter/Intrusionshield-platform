import type {
  TraceReport,
  TraceField,
} from "@intrusionshield/sterile-processing";
export interface TraceCsvFormat {
  headers: string[];
  word: (s: string) => string;
  kind: (s: string) => string;
  actor: (s: string) => string;
}
/** Escape spreadsheet formulas as text, in addition to RFC 4180 quoting. */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[\s]*[=+\-@]/u.test(s) || /^[\t\r\n]/u.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}
export function traceCsv(r: TraceReport, f: TraceCsvFormat): string {
  const text = (v: TraceField) =>
    f.word(v.key) +
    ": " +
    (v.value === null
      ? "—"
      : typeof v.value === "boolean" ||
          [
            "state",
            "condition",
            "method",
            "outcome",
            "decision",
            "kind",
            "action",
            "status",
          ].includes(v.key)
        ? f.word(String(v.value))
        : String(v.value));
  const rows: unknown[][] = [f.headers],
    add = (
      section: string,
      kind: string,
      code: string,
      version: unknown,
      state: unknown,
      at: unknown,
      actor: unknown,
      details: unknown,
      from: unknown = "",
      to: unknown = "",
      relation: unknown = "",
    ) =>
      rows.push([
        section,
        kind,
        code,
        version,
        state,
        at,
        actor,
        details,
        from,
        to,
        relation,
      ]);
  const node = (kind: string, id: string) =>
    r.nodes.find((n) => n.kind === kind && n.id === id)?.code ?? id;
  add(
    f.word("report"),
    f.kind(r.root.kind),
    r.root.code,
    r.root.version,
    "",
    r.generatedAt,
    "",
    JSON.stringify({
      tenantId: r.tenantId,
      facilityId: r.facilityId,
      coverage: r.coverage,
    }),
  );
  for (const n of r.nodes)
    for (const s of n.snapshots) {
      add(
        f.word("record"),
        f.kind(n.kind),
        n.code,
        s.version,
        f.word(s.current ? "current" : "historical"),
        "",
        "",
        s.fields.map(text).join("\n"),
      );
      for (const fact of s.facts)
        add(
          f.word(fact.kind),
          f.kind(n.kind),
          n.code,
          s.version,
          "",
          fact.at,
          fact.actorId ? f.actor(fact.actorId) : "",
          fact.fields.map(text).join("\n"),
        );
    }
  for (const l of r.links)
    add(
      f.word("link"),
      f.kind(l.fromKind),
      node(l.fromKind, l.fromId),
      l.fromVersion,
      "",
      "",
      "",
      l.targetAvailable ? "" : f.word("missing"),
      l.fromId,
      f.kind(l.toKind) +
        " / " +
        node(l.toKind, l.toId) +
        " / " +
        l.toId +
        " / " +
        (l.toVersion ?? "—"),
      f.word(l.relation),
    );
  for (const e of r.events) {
    const n = r.nodes.find((n) => n.id === e.entityId);
    add(
      f.word("event"),
      n ? f.kind(n.kind) : "",
      n?.code ?? e.entityId,
      e.version,
      "",
      e.at,
      f.actor(e.actorId),
      f.word(e.action) +
        "\n" +
        e.reason +
        (e.correlationRequestId ? "\n" + e.correlationRequestId : ""),
    );
  }
  for (const a of r.alerts)
    add(
      f.word(a.kind),
      f.kind(a.entityKind),
      a.code,
      "",
      "",
      "",
      "",
      a.reference,
    );
  return (
    "\uFEFF" +
    rows.map((row) => row.map(csvCell).join(",")).join("\r\n") +
    "\r\n"
  );
}

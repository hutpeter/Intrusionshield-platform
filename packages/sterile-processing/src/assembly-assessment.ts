import type { TrayAssembly, AssemblyAssessment } from "./tray-types.js";
export function assessAssembly(a: TrayAssembly): AssemblyAssessment {
  const rows = a.definitionSnapshot.requirements.map((r) => ({
    instrumentTypeId: r.instrumentTypeId,
    name: r.instrumentTypeName,
    required: r.quantity,
    assigned: a.instruments.filter(
      (i) => i.instrumentTypeId === r.instrumentTypeId,
    ).length,
    missing: 0,
    excess: 0,
  }));
  for (const i of a.instruments)
    if (!rows.some((r) => r.instrumentTypeId === i.instrumentTypeId))
      rows.push({
        instrumentTypeId: i.instrumentTypeId,
        name: i.instrumentTypeName,
        required: 0,
        assigned: a.instruments.filter(
          (x) => x.instrumentTypeId === i.instrumentTypeId,
        ).length,
        missing: 0,
        excess: 0,
      });
  for (const r of rows) {
    r.missing = Math.max(0, r.required - r.assigned);
    r.excess = Math.max(0, r.assigned - r.required);
  }
  const sum = (key: "required" | "assigned" | "missing" | "excess") =>
    rows.reduce((n, r) => n + r[key], 0);
  return {
    complete: sum("missing") === 0 && sum("excess") === 0,
    required: sum("required"),
    assigned: sum("assigned"),
    missing: sum("missing"),
    excess: sum("excess"),
    rows,
  };
}

import type { DatabaseSync } from "node:sqlite";
import type { PerformanceData } from "@intrusionshield/sterile-processing";
/** Fixed SQL and bound timestamps only. Extra sentinel rows make limits explicit. */
export function readPerformanceData(
  db: DatabaseSync,
  args: string[],
  from: string,
  to: string,
): PerformanceData {
  const within = (field: string) =>
    `julianday(${field})>=julianday(?) AND julianday(${field})<julianday(?)`;
  const query = <T>(table: string, where: string, params: string[]) =>
    db
      .prepare(
        `SELECT payload FROM ${table} p WHERE tenant_id=? AND facility_id=? AND (${where}) ORDER BY id LIMIT 5001`,
      )
      .all(...args, ...params)
      .map((r) => JSON.parse((r as { payload: string }).payload) as T);
  const processing = query<PerformanceData["processing"][number]>(
    "sp_processing",
    `${within("json_extract(payload,'$.createdAt')")} OR EXISTS(SELECT 1 FROM json_each(p.payload,'$.attempts') a WHERE julianday(json_extract(a.value,'$.startedAt'))<julianday(?) AND (json_extract(a.value,'$.finishedAt') IS NULL OR julianday(json_extract(a.value,'$.finishedAt'))>=julianday(?)) OR ${within("json_extract(a.value,'$.finishedAt')")}) OR EXISTS(SELECT 1 FROM json_each(p.payload,'$.inspections') i WHERE ${within("json_extract(i.value,'$.at')")})`,
    [from, to, to, from, from, to, from, to],
  );
  const assemblies = query<PerformanceData["assemblies"][number]>(
    "sp_assemblies",
    within("json_extract(payload,'$.completedAt')"),
    [from, to],
  );
  const packages = query<PerformanceData["packages"][number]>(
    "sp_packages",
    within("json_extract(payload,'$.createdAt')"),
    [from, to],
  );
  const loads = query<PerformanceData["loads"][number]>(
    "sp_loads",
    `julianday(json_extract(payload,'$.startedAt'))<julianday(?) AND (json_extract(payload,'$.finishedAt') IS NULL OR julianday(json_extract(payload,'$.finishedAt'))>=julianday(?)) OR ${within("json_extract(payload,'$.finishedAt')")}`,
    [to, from, from, to],
  );
  const reviews = query<PerformanceData["reviews"][number]>(
    "sp_reviews",
    `EXISTS(SELECT 1 FROM json_each(p.payload,'$.decisions') d WHERE ${within("json_extract(d.value,'$.at')")})`,
    [from, to],
  );
  const distribution = query<PerformanceData["distribution"][number]>(
    "sp_distribution",
    `EXISTS(SELECT 1 FROM json_each(p.payload,'$.events') e WHERE json_extract(e.value,'$.kind')='issued' AND ${within("json_extract(e.value,'$.at')")})`,
    [from, to],
  );
  const returns = query<PerformanceData["returns"][number]>(
    "sp_returns",
    within("json_extract(payload,'$.createdAt')"),
    [from, to],
  );
  const equipmentVersions = db
    .prepare(
      "SELECT v.payload FROM sp_equipment_versions v WHERE v.tenant_id=? AND v.facility_id=? AND julianday(json_extract(v.payload,'$.updatedAt'))<julianday(?) AND (julianday(json_extract(v.payload,'$.updatedAt'))>=julianday(?) OR v.version=(SELECT max(p.version) FROM sp_equipment_versions p WHERE p.tenant_id=v.tenant_id AND p.facility_id=v.facility_id AND p.id=v.id AND julianday(json_extract(p.payload,'$.updatedAt'))<julianday(?))) ORDER BY v.id,v.version LIMIT 5001",
    )
    .all(...args, to, from, from)
    .map((r) => JSON.parse((r as { payload: string }).payload));
  return {
    processing,
    assemblies,
    packages,
    loads,
    reviews,
    distribution,
    returns,
    equipmentVersions,
  };
}

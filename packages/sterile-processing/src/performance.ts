import {
  scopeOf,
  SterileError,
  type SterileScope,
  type SterileRepository,
} from "./foundation.js";
import type { ProcessingEpisode } from "./processing-types.js";
import type { TrayAssembly, AssemblyInstrument } from "./tray-types.js";
import type { SterilePackage } from "./packaging-types.js";
import type { SterilizationLoad } from "./cycle-types.js";
import type { LoadReview } from "./review-types.js";
import type { DistributionRecord } from "./distribution-types.js";
import type { ReturnRecord } from "./return-types.js";
import type { ProcessingEquipment } from "./equipment.js";
export interface PerformanceData {
  processing: ProcessingEpisode[];
  assemblies: TrayAssembly[];
  packages: SterilePackage[];
  loads: SterilizationLoad[];
  reviews: LoadReview[];
  distribution: DistributionRecord[];
  returns: ReturnRecord[];
  equipmentVersions: ProcessingEquipment[];
}
export const performanceStages = [
  "received",
  "cleaning",
  "inspection",
  "assembly",
  "packaging",
  "cycles",
  "release",
  "issue",
  "returns",
] as const;
export type PerformanceStage = (typeof performanceStages)[number];
export interface PerformanceDay {
  day: string;
  received: number;
  cleaning: number;
  inspection: number;
  assembly: number;
  packaging: number;
  cycles: number;
  release: number;
  issue: number;
  returns: number;
}
export interface TimingMetric {
  samples: number;
  meanMinutes: number | null;
  medianMinutes: number | null;
  p95Minutes: number | null;
  minMinutes: number | null;
  maxMinutes: number | null;
}
export interface EquipmentPerformance {
  key: string;
  id: string | null;
  code: string;
  name: string;
  link: "registered" | "legacy_code";
  cleaningStarts: number;
  cycleStarts: number;
  finishedRuns: number;
  recordedRunMinutes: number;
  outOfServiceMinutes: number | null;
}
export interface PerformanceReport {
  tenantId: string;
  facilityId: string;
  from: string;
  to: string;
  generatedAt: string;
  groupingTimeZone: "UTC";
  daily: PerformanceDay[];
  totals: Omit<PerformanceDay, "day">;
  quality: {
    cleaningPassed: number;
    cleaningFailed: number;
    inspectionPassed: number;
    inspectionFailed: number;
    repeatCleaningStarts: number;
    cyclesPassed: number;
    cyclesFailed: number;
    cyclesAborted: number;
    holdDecisions: number;
    rejectDecisions: number;
    cleaningFailureRate: number | null;
    inspectionFailureRate: number | null;
  };
  timing: {
    cleaning: TimingMetric;
    receiptToInspection: TimingMetric;
    cycle: TimingMetric;
    finishToRelease: TimingMetric;
  };
  types: {
    id: string;
    code: string;
    name: string;
    received: number;
    cleaning: number;
    inspectionPassed: number;
    assembly: number;
    packaging: number;
    cycles: number;
  }[];
  equipment: EquipmentPerformance[];
  backlog: { queue: string; total: number }[];
  oldest: {
    queue: string;
    id: string;
    code: string;
    updatedAt: string;
    ageMinutes: number;
  }[];
  exclusions: {
    unfinishedCleaning: number;
    unfinishedCycles: number;
    invalidTimingPairs: number;
    missingPackageSnapshots: number;
    invalidBacklogDates: number;
  };
}
const dayMs = 86400000;
const limit = (): never => {
  throw new SterileError("REPORT_LIMIT");
};
const validDay = (v: string) =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  Number.isFinite(Date.parse(v + "T00:00:00.000Z")) &&
  new Date(v + "T00:00:00.000Z").toISOString().slice(0, 10) === v;
const minutes = (n: number) => Math.round((n / 60000) * 100) / 100;
export function timingMetric(values: number[]): TimingMetric {
  if (!values.length)
    return {
      samples: 0,
      meanMinutes: null,
      medianMinutes: null,
      p95Minutes: null,
      minMinutes: null,
      maxMinutes: null,
    };
  const sorted = [...values].sort((a, b) => a - b),
    n = sorted.length;
  return {
    samples: n,
    meanMinutes: minutes(values.reduce((a, b) => a + b, 0) / n),
    medianMinutes: minutes(
      n % 2 ? sorted[(n - 1) / 2]! : (sorted[n / 2 - 1]! + sorted[n / 2]!) / 2,
    ),
    p95Minutes: minutes(sorted[Math.ceil(0.95 * n) - 1]!),
    minMinutes: minutes(sorted[0]!),
    maxMinutes: minutes(sorted[n - 1]!),
  };
}
function unionMinutes(spans: [number, number][]) {
  const sorted = spans.sort((a, b) => a[0] - b[0]);
  let from = NaN,
    to = NaN,
    total = 0;
  for (const [a, b] of sorted) {
    if (!Number.isFinite(from)) {
      from = a;
      to = b;
    } else if (a <= to) to = Math.max(to, b);
    else {
      total += to - from;
      from = a;
      to = b;
    }
  }
  if (Number.isFinite(from)) total += to - from;
  return minutes(total);
}
export class PerformanceRegistry {
  constructor(private repository: SterileRepository) {}
  async report(
    scope: SterileScope,
    from: string,
    to: string,
  ): Promise<PerformanceReport> {
    const s = scopeOf(scope),
      validationNow = Date.now();
    if (!validDay(from) || !validDay(to))
      throw new SterileError("INVALID_REQUEST");
    const start = Date.parse(from + "T00:00:00.000Z"),
      end = Date.parse(to + "T00:00:00.000Z");
    if (
      start >= end ||
      end - start > 90 * dayMs ||
      end > Math.floor(validationNow / dayMs) * dayMs + dayMs
    )
      throw new SterileError("INVALID_REQUEST");
    return this.repository.transaction(s, async (tx) => {
      const now = Date.now(),
        stop = Math.min(now, end);
      const data = await tx.performanceData(
        new Date(start).toISOString(),
        new Date(end).toISOString(),
      );
      if (
        Object.values(data).some((rows) => rows.length > 5000) ||
        Object.values(data).reduce((n, rows) => n + rows.length, 0) > 20000
      )
        limit();
      let work = 0;
      const charge = (n: number) => {
        work += n;
        if (work > 100000) limit();
      };
      const daily: PerformanceDay[] = [];
      for (let at = start; at < end; at += dayMs)
        daily.push({
          day: new Date(at).toISOString().slice(0, 10),
          received: 0,
          cleaning: 0,
          inspection: 0,
          assembly: 0,
          packaging: 0,
          cycles: 0,
          release: 0,
          issue: 0,
          returns: 0,
        });
      const buckets = new Map(daily.map((d) => [d.day, d]));
      const inside = (at: string | null | undefined) =>
        !!at &&
        Date.parse(at) >= start &&
        Date.parse(at) < end &&
        Date.parse(at) <= now;
      const add = (at: string, key: PerformanceStage) => {
        const row = buckets.get(at.slice(0, 10));
        if (row) row[key]++;
      };
      const quality = {
        cleaningPassed: 0,
        cleaningFailed: 0,
        inspectionPassed: 0,
        inspectionFailed: 0,
        repeatCleaningStarts: 0,
        cyclesPassed: 0,
        cyclesFailed: 0,
        cyclesAborted: 0,
        holdDecisions: 0,
        rejectDecisions: 0,
      };
      const exclusions = {
        unfinishedCleaning: 0,
        unfinishedCycles: 0,
        invalidTimingPairs: 0,
        missingPackageSnapshots: 0,
        invalidBacklogDates: 0,
      };
      const timing = {
        cleaning: [] as number[],
        receiptToInspection: [] as number[],
        cycle: [] as number[],
        finishToRelease: [] as number[],
      };
      const duration = (
        a: string | null,
        b: string | null,
        values: number[],
      ) => {
        const ms = Date.parse(b ?? "") - Date.parse(a ?? "");
        if (!Number.isFinite(ms) || ms < 0) {
          exclusions.invalidTimingPairs++;
          return;
        }
        values.push(ms);
      };
      const types = new Map<string, PerformanceReport["types"][number]>();
      const countTypes = (
        items: AssemblyInstrument[],
        key:
          | "received"
          | "cleaning"
          | "inspectionPassed"
          | "assembly"
          | "packaging"
          | "cycles",
      ) => {
        charge(items.length);
        for (const i of items) {
          let r = types.get(i.instrumentTypeId);
          if (!r) {
            r = {
              id: i.instrumentTypeId,
              code: i.instrumentTypeId,
              name: i.instrumentTypeName,
              received: 0,
              cleaning: 0,
              inspectionPassed: 0,
              assembly: 0,
              packaging: 0,
              cycles: 0,
            };
            types.set(i.instrumentTypeId, r);
            if (types.size > 1000) limit();
          }
          r[key]++;
        }
      };
      const equipment = new Map<string, EquipmentPerformance>(),
        runs = new Map<string, [number, number][]>(),
        offline = new Map<string, [number, number][]>();
      const machine = (
        r: ProcessingEquipment | undefined,
        code: string,
        kind = "equipment",
      ) => {
        const key = r
          ? "registered:" + r.id
          : "legacy:" + kind + ":" + code.toUpperCase();
        let row = equipment.get(key);
        if (!row) {
          row = {
            key,
            id: r?.id ?? null,
            code: r?.code ?? code,
            name: r?.name ?? code,
            link: r ? "registered" : "legacy_code",
            cleaningStarts: 0,
            cycleStarts: 0,
            finishedRuns: 0,
            recordedRunMinutes: 0,
            outOfServiceMinutes: r ? 0 : null,
          };
          equipment.set(key, row);
          if (equipment.size > 1000) limit();
        }
        return row;
      };
      const span = (a: string, b: string | null) => {
        const l = Math.max(start, Date.parse(a)),
          r = Math.min(stop, b === null ? stop : Date.parse(b));
        return Number.isFinite(l) && Number.isFinite(r) && r > l
          ? ([l, r] as [number, number])
          : null;
      };
      const run = (
        r: ProcessingEquipment | undefined,
        code: string,
        a: string,
        b: string | null,
        kind: "cleaning" | "cycle",
      ) => {
        const interval = span(a, b);
        if (!interval && !inside(a) && !inside(b)) return;
        const row = machine(r, code, kind);
        if (inside(a)) {
          if (kind === "cleaning") row.cleaningStarts++;
          else row.cycleStarts++;
        }
        if (inside(b)) row.finishedRuns++;
        if (interval) {
          const items = runs.get(row.key) ?? [];
          items.push(interval);
          runs.set(row.key, items);
        }
      };
      for (const e of data.processing) {
        charge(e.attempts.length + (e.inspections?.length ?? 0));
        if (inside(e.createdAt)) {
          add(e.createdAt, "received");
          countTypes(e.instruments, "received");
        }
        for (const a of e.attempts) {
          if (inside(a.finishedAt) && a.outcome) {
            add(a.finishedAt!, "cleaning");
            quality[
              a.outcome === "passed" ? "cleaningPassed" : "cleaningFailed"
            ]++;
            countTypes(e.instruments, "cleaning");
            duration(a.startedAt, a.finishedAt, timing.cleaning);
          }
          if (a.number > 1 && inside(a.startedAt))
            quality.repeatCleaningStarts++;
          if (a.finishedAt === null && span(a.startedAt, null))
            exclusions.unfinishedCleaning++;
          if (a.method === "mechanical")
            run(
              a.registeredEquipment,
              a.equipment,
              a.startedAt,
              a.finishedAt,
              "cleaning",
            );
        }
        for (const i of e.inspections ?? []) {
          if (inside(i.at)) {
            add(i.at, "inspection");
            quality[
              i.outcome === "passed" ? "inspectionPassed" : "inspectionFailed"
            ]++;
            if (i.outcome === "passed")
              countTypes(e.instruments, "inspectionPassed");
          }
        }
        const passed = e.inspections?.find((i) => i.outcome === "passed");
        if (passed && inside(passed.at))
          duration(e.createdAt, passed.at, timing.receiptToInspection);
      }
      for (const a of data.assemblies)
        if (inside(a.completedAt)) {
          add(a.completedAt!, "assembly");
          countTypes(a.instruments, "assembly");
        }
      for (const p of data.packages)
        if (inside(p.createdAt)) {
          add(p.createdAt, "packaging");
          countTypes(p.assemblySnapshot.instruments, "packaging");
        }
      const packageCache = new Map<string, SterilePackage | null>();
      for (const l of data.loads) {
        if (l.startedAt)
          run(
            l.startedEquipment ?? l.registeredEquipment,
            l.sterilizer,
            l.startedAt,
            l.finishedAt,
            "cycle",
          );
        if (l.startedAt && l.finishedAt === null && span(l.startedAt, null))
          exclusions.unfinishedCycles++;
        if (inside(l.finishedAt) && l.outcome) {
          add(l.finishedAt!, "cycles");
          quality[
            l.outcome === "passed"
              ? "cyclesPassed"
              : l.outcome === "failed"
                ? "cyclesFailed"
                : "cyclesAborted"
          ]++;
          duration(l.startedAt, l.finishedAt, timing.cycle);
          charge(l.packages.length);
          for (const member of l.packages) {
            const key = member.id + ":" + member.version;
            if (!packageCache.has(key)) {
              if (packageCache.size >= 5000) limit();
              packageCache.set(
                key,
                await tx.findPackageVersion(member.id, member.version),
              );
            }
            const p = packageCache.get(key);
            if (p) countTypes(p.assemblySnapshot.instruments, "cycles");
            else exclusions.missingPackageSnapshots++;
          }
        }
      }
      for (const r of data.reviews) {
        charge(r.decisions.length);
        for (const d of r.decisions)
          if (inside(d.at)) {
            if (d.decision === "release") add(d.at, "release");
            else if (d.decision === "hold") quality.holdDecisions++;
            else quality.rejectDecisions++;
          }
        const first = r.decisions.find((d) => d.decision === "release");
        if (first && inside(first.at))
          duration(r.loadSnapshot.finishedAt, first.at, timing.finishToRelease);
      }
      for (const d of data.distribution) {
        charge(d.events.length);
        for (const e of d.events)
          if (e.kind === "issued" && inside(e.at)) add(e.at, "issue");
      }
      for (const r of data.returns)
        if (inside(r.createdAt)) add(r.createdAt, "returns");
      const versions = new Map<string, ProcessingEquipment[]>();
      for (const r of data.equipmentVersions) {
        const list = versions.get(r.id) ?? [];
        list.push(r);
        versions.set(r.id, list);
      }
      for (const list of versions.values()) {
        list.sort((a, b) => a.version - b.version);
        const last = list.at(-1)!;
        const row = machine(last, last.code);
        for (let n = 0; n < list.length; n++) {
          const r = list[n]!;
          if (r.state !== "out_of_service") continue;
          const interval = span(r.updatedAt, list[n + 1]?.updatedAt ?? null);
          if (interval) {
            const items = offline.get(row.key) ?? [];
            items.push(interval);
            offline.set(row.key, items);
          }
        }
      }
      for (const row of equipment.values()) {
        row.recordedRunMinutes = unionMinutes(runs.get(row.key) ?? []);
        if (row.id)
          row.outOfServiceMinutes = unionMinutes(offline.get(row.key) ?? []);
      }
      for (const row of types.values()) {
        const type = await tx.findType(row.id);
        if (type) row.code = type.code;
      }
      const backlog: PerformanceReport["backlog"] = [],
        oldest: PerformanceReport["oldest"] = [];
      for (const queue of [
        "cleaning",
        "inspection",
        "assembly",
        "loading",
        "release",
        "returns",
      ] as const) {
        const q = await tx.dashboardQueue(queue);
        backlog.push({ queue, total: q.total });
        for (const r of q.items) {
          const age = now - Date.parse(r.updatedAt);
          if (!Number.isFinite(age) || age < 0) {
            exclusions.invalidBacklogDates++;
            continue;
          }
          oldest.push({
            queue,
            id: r.id,
            code: r.code,
            updatedAt: r.updatedAt,
            ageMinutes: minutes(age),
          });
        }
      }
      oldest.sort(
        (a, b) => b.ageMinutes - a.ageMinutes || a.id.localeCompare(b.id),
      );
      const totals = Object.fromEntries(
        performanceStages.map((key) => [
          key,
          daily.reduce((n, r) => n + r[key], 0),
        ]),
      ) as PerformanceReport["totals"];
      return {
        tenantId: s.tenantId,
        facilityId: s.facilityId,
        from,
        to,
        generatedAt: new Date(now).toISOString(),
        groupingTimeZone: "UTC",
        daily,
        totals,
        quality: {
          ...quality,
          cleaningFailureRate:
            quality.cleaningPassed + quality.cleaningFailed
              ? quality.cleaningFailed /
                (quality.cleaningPassed + quality.cleaningFailed)
              : null,
          inspectionFailureRate:
            quality.inspectionPassed + quality.inspectionFailed
              ? quality.inspectionFailed /
                (quality.inspectionPassed + quality.inspectionFailed)
              : null,
        },
        timing: {
          cleaning: timingMetric(timing.cleaning),
          receiptToInspection: timingMetric(timing.receiptToInspection),
          cycle: timingMetric(timing.cycle),
          finishToRelease: timingMetric(timing.finishToRelease),
        },
        types: [...types.values()].sort((a, b) => a.code.localeCompare(b.code)),
        equipment: [...equipment.values()].sort(
          (a, b) => a.code.localeCompare(b.code) || a.key.localeCompare(b.key),
        ),
        backlog,
        oldest: oldest.slice(0, 20),
        exclusions,
      };
    });
  }
}

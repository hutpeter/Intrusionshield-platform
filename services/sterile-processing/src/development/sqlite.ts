import { readDashboardQueue } from "./dashboard.js";
import { DatabaseSync } from "node:sqlite";
import {
  mkdirSync,
  lstatSync,
  realpathSync,
  openSync,
  closeSync,
  existsSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import {
  SterileError,
  reviewStatus,
  type TraceKind,
  type TraceMatch,
  type TraceRow,
  type ReturnRecord,
  type ReturnSummary,
  type RecallRecord,
  type RecallSummary,
  type RecallBlock,
  type DistributionRecord,
  type DistributionSummary,
  type LoadReview,
  type ReviewSummary,
  type ReviewQueueItem,
  type SterileRepository,
  type SterileScope,
  type SterileTransaction,
  type Instrument,
  type InstrumentType,
  type SterileAuditEvent,
  type CommandReceipt,
  type TrayDefinition,
  type TrayAssembly,
  type ProcessingEpisode,
  type SterilePackage,
  type PackageSummary,
  type SterilizationLoad,
  type LoadSummary,
  type PackageLoad,
} from "@intrusionshield/sterile-processing";
import { assertSterilePreviewEnvironment } from "./guard.js";

/** Durable dummy-data adapter only. No SQL Server loader or environment connection lookup. */
export class PreviewSqliteRepository implements SterileRepository {
  private readonly db: DatabaseSync;
  private queue: Promise<void> = Promise.resolve();
  private closed = false;
  constructor(filename: string) {
    assertSterilePreviewEnvironment();
    const path = resolve(filename),
      parent = dirname(path);
    mkdirSync(parent, { recursive: true, mode: 0o700 });
    if (realpathSync(parent) !== parent || lstatSync(parent).isSymbolicLink())
      throw new Error("Preview directory must not use symbolic links.");
    if (process.platform !== "win32" && (lstatSync(parent).mode & 0o077) !== 0)
      throw new Error("Preview directory must be private.");
    if (
      existsSync(path) ||
      (() => {
        try {
          return lstatSync(path).isSymbolicLink();
        } catch {
          return false;
        }
      })()
    ) {
      const stat = lstatSync(path);
      if (
        !stat.isFile() ||
        stat.isSymbolicLink() ||
        (process.platform !== "win32" && (stat.mode & 0o077) !== 0)
      )
        throw new Error("Preview database must be a private regular file.");
    } else closeSync(openSync(path, "wx", 0o600));
    this.db = new DatabaseSync(path);
    try {
      this.db
        .exec(`PRAGMA foreign_keys=ON; PRAGMA busy_timeout=0; PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS sp_types(tenant_id TEXT NOT NULL,facility_id TEXT NOT NULL,id TEXT NOT NULL,code TEXT NOT NULL,payload TEXT NOT NULL CHECK(json_valid(payload)),PRIMARY KEY(tenant_id,facility_id,id),UNIQUE(tenant_id,facility_id,code));
CREATE TABLE IF NOT EXISTS sp_instruments(tenant_id TEXT NOT NULL,facility_id TEXT NOT NULL,id TEXT NOT NULL,type_id TEXT NOT NULL,code TEXT NOT NULL,version INTEGER NOT NULL CHECK(version>0),payload TEXT NOT NULL CHECK(json_valid(payload)),PRIMARY KEY(tenant_id,facility_id,id),UNIQUE(tenant_id,facility_id,code),FOREIGN KEY(tenant_id,facility_id,type_id) REFERENCES sp_types(tenant_id,facility_id,id));
CREATE TABLE IF NOT EXISTS sp_service_usage(tenant_id TEXT NOT NULL,facility_id TEXT NOT NULL,instrument_id TEXT NOT NULL,version INTEGER NOT NULL,payload TEXT NOT NULL CHECK(json_valid(payload)),PRIMARY KEY(tenant_id,facility_id,instrument_id),FOREIGN KEY(tenant_id,facility_id,instrument_id) REFERENCES sp_instruments(tenant_id,facility_id,id));
CREATE TABLE IF NOT EXISTS sp_service_exposures(tenant_id TEXT NOT NULL,facility_id TEXT NOT NULL,instrument_id TEXT NOT NULL,load_id TEXT NOT NULL,payload TEXT NOT NULL CHECK(json_valid(payload)),PRIMARY KEY(tenant_id,facility_id,instrument_id,load_id),FOREIGN KEY(tenant_id,facility_id,instrument_id) REFERENCES sp_instruments(tenant_id,facility_id,id));
CREATE TABLE IF NOT EXISTS sp_loaners(tenant_id TEXT NOT NULL,facility_id TEXT NOT NULL,id TEXT NOT NULL,code TEXT NOT NULL,version INTEGER NOT NULL,payload TEXT NOT NULL CHECK(json_valid(payload)),PRIMARY KEY(tenant_id,facility_id,id),UNIQUE(tenant_id,facility_id,code));
CREATE TABLE IF NOT EXISTS sp_loaner_versions(tenant_id TEXT NOT NULL,facility_id TEXT NOT NULL,id TEXT NOT NULL,version INTEGER NOT NULL,payload TEXT NOT NULL CHECK(json_valid(payload)),PRIMARY KEY(tenant_id,facility_id,id,version),FOREIGN KEY(tenant_id,facility_id,id) REFERENCES sp_loaners(tenant_id,facility_id,id));
CREATE TABLE IF NOT EXISTS sp_procedures(tenant_id TEXT NOT NULL,facility_id TEXT NOT NULL,id TEXT NOT NULL,code TEXT NOT NULL,revision INTEGER NOT NULL,stage TEXT NOT NULL,state TEXT NOT NULL,version INTEGER NOT NULL,payload TEXT NOT NULL CHECK(json_valid(payload)),PRIMARY KEY(tenant_id,facility_id,id),UNIQUE(tenant_id,facility_id,code,revision));
CREATE TABLE IF NOT EXISTS sp_procedure_versions(tenant_id TEXT NOT NULL,facility_id TEXT NOT NULL,id TEXT NOT NULL,version INTEGER NOT NULL,payload TEXT NOT NULL CHECK(json_valid(payload)),PRIMARY KEY(tenant_id,facility_id,id,version),FOREIGN KEY(tenant_id,facility_id,id) REFERENCES sp_procedures(tenant_id,facility_id,id));
CREATE TABLE IF NOT EXISTS sp_audit(tenant_id TEXT NOT NULL,facility_id TEXT NOT NULL,id TEXT NOT NULL,entity_id TEXT NOT NULL,request_id TEXT NOT NULL,payload TEXT NOT NULL CHECK(json_valid(payload)),PRIMARY KEY(tenant_id,facility_id,id),UNIQUE(tenant_id,facility_id,request_id));
CREATE INDEX IF NOT EXISTS sp_audit_entity ON sp_audit(tenant_id,facility_id,entity_id);
CREATE TABLE IF NOT EXISTS sp_receipts(tenant_id TEXT NOT NULL,facility_id TEXT NOT NULL,request_id TEXT NOT NULL,payload TEXT NOT NULL CHECK(json_valid(payload)),PRIMARY KEY(tenant_id,facility_id,request_id));
CREATE TABLE IF NOT EXISTS sp_definitions(tenant_id TEXT NOT NULL,facility_id TEXT NOT NULL,id TEXT NOT NULL,code TEXT NOT NULL,version INTEGER NOT NULL,payload TEXT NOT NULL CHECK(json_valid(payload)),PRIMARY KEY(tenant_id,facility_id,id),UNIQUE(tenant_id,facility_id,code));
CREATE TABLE IF NOT EXISTS sp_definition_versions(tenant_id TEXT NOT NULL,facility_id TEXT NOT NULL,id TEXT NOT NULL,revision INTEGER NOT NULL,payload TEXT NOT NULL CHECK(json_valid(payload)),PRIMARY KEY(tenant_id,facility_id,id,revision),FOREIGN KEY(tenant_id,facility_id,id) REFERENCES sp_definitions(tenant_id,facility_id,id));
CREATE TABLE IF NOT EXISTS sp_assemblies(tenant_id TEXT NOT NULL,facility_id TEXT NOT NULL,id TEXT NOT NULL,code TEXT NOT NULL,definition_id TEXT NOT NULL,definition_revision INTEGER NOT NULL,version INTEGER NOT NULL,state TEXT NOT NULL CHECK(state IN ('draft','complete','disassembled')),payload TEXT NOT NULL CHECK(json_valid(payload)),PRIMARY KEY(tenant_id,facility_id,id),UNIQUE(tenant_id,facility_id,code),FOREIGN KEY(tenant_id,facility_id,definition_id,definition_revision) REFERENCES sp_definition_versions(tenant_id,facility_id,id,revision));
CREATE TABLE IF NOT EXISTS sp_assembly_versions(tenant_id TEXT NOT NULL,facility_id TEXT NOT NULL,id TEXT NOT NULL,version INTEGER NOT NULL,payload TEXT NOT NULL CHECK(json_valid(payload)),PRIMARY KEY(tenant_id,facility_id,id,version),FOREIGN KEY(tenant_id,facility_id,id) REFERENCES sp_assemblies(tenant_id,facility_id,id));
CREATE TABLE IF NOT EXISTS sp_assignments(tenant_id TEXT NOT NULL,facility_id TEXT NOT NULL,instrument_id TEXT NOT NULL,assembly_id TEXT NOT NULL,PRIMARY KEY(tenant_id,facility_id,instrument_id),FOREIGN KEY(tenant_id,facility_id,instrument_id) REFERENCES sp_instruments(tenant_id,facility_id,id),FOREIGN KEY(tenant_id,facility_id,assembly_id) REFERENCES sp_assemblies(tenant_id,facility_id,id));
CREATE TABLE IF NOT EXISTS sp_processing(tenant_id TEXT NOT NULL,facility_id TEXT NOT NULL,id TEXT NOT NULL,code TEXT NOT NULL,version INTEGER NOT NULL,payload TEXT NOT NULL CHECK(json_valid(payload)),PRIMARY KEY(tenant_id,facility_id,id),UNIQUE(tenant_id,facility_id,code));
CREATE TABLE IF NOT EXISTS sp_processing_versions(tenant_id TEXT NOT NULL,facility_id TEXT NOT NULL,id TEXT NOT NULL,version INTEGER NOT NULL,payload TEXT NOT NULL CHECK(json_valid(payload)),PRIMARY KEY(tenant_id,facility_id,id,version),FOREIGN KEY(tenant_id,facility_id,id) REFERENCES sp_processing(tenant_id,facility_id,id));
CREATE TABLE IF NOT EXISTS sp_processing_holds(tenant_id TEXT NOT NULL,facility_id TEXT NOT NULL,instrument_id TEXT NOT NULL,episode_id TEXT NOT NULL,PRIMARY KEY(tenant_id,facility_id,instrument_id),FOREIGN KEY(tenant_id,facility_id,instrument_id) REFERENCES sp_instruments(tenant_id,facility_id,id),FOREIGN KEY(tenant_id,facility_id,episode_id) REFERENCES sp_processing(tenant_id,facility_id,id));
CREATE TABLE IF NOT EXISTS sp_equipment_incidents(tenant_id TEXT NOT NULL,facility_id TEXT NOT NULL,id TEXT NOT NULL,code TEXT NOT NULL,equipment_id TEXT NOT NULL,version INTEGER NOT NULL CHECK(version>0),payload TEXT NOT NULL CHECK(json_valid(payload)),PRIMARY KEY(tenant_id,facility_id,id),UNIQUE(tenant_id,facility_id,code),FOREIGN KEY(tenant_id,facility_id,equipment_id) REFERENCES sp_equipment(tenant_id,facility_id,id));
CREATE TABLE IF NOT EXISTS sp_equipment_incident_versions(tenant_id TEXT NOT NULL,facility_id TEXT NOT NULL,id TEXT NOT NULL,version INTEGER NOT NULL,payload TEXT NOT NULL CHECK(json_valid(payload)),PRIMARY KEY(tenant_id,facility_id,id,version),FOREIGN KEY(tenant_id,facility_id,id) REFERENCES sp_equipment_incidents(tenant_id,facility_id,id));
CREATE TABLE IF NOT EXISTS sp_equipment(tenant_id TEXT NOT NULL,facility_id TEXT NOT NULL,id TEXT NOT NULL,code TEXT NOT NULL,version INTEGER NOT NULL CHECK(version>0),payload TEXT NOT NULL CHECK(json_valid(payload)),PRIMARY KEY(tenant_id,facility_id,id),UNIQUE(tenant_id,facility_id,code));
CREATE TABLE IF NOT EXISTS sp_equipment_versions(tenant_id TEXT NOT NULL,facility_id TEXT NOT NULL,id TEXT NOT NULL,version INTEGER NOT NULL,payload TEXT NOT NULL CHECK(json_valid(payload)),PRIMARY KEY(tenant_id,facility_id,id,version),FOREIGN KEY(tenant_id,facility_id,id) REFERENCES sp_equipment(tenant_id,facility_id,id));
CREATE TABLE IF NOT EXISTS sp_packages(tenant_id TEXT NOT NULL,facility_id TEXT NOT NULL,id TEXT NOT NULL,code TEXT NOT NULL,assembly_id TEXT NOT NULL,version INTEGER NOT NULL CHECK(version>0),payload TEXT NOT NULL CHECK(json_valid(payload)),PRIMARY KEY(tenant_id,facility_id,id),UNIQUE(tenant_id,facility_id,code),FOREIGN KEY(tenant_id,facility_id,assembly_id) REFERENCES sp_assemblies(tenant_id,facility_id,id));
CREATE TABLE IF NOT EXISTS sp_package_integrity(tenant_id TEXT NOT NULL,facility_id TEXT NOT NULL,package_id TEXT NOT NULL,payload TEXT NOT NULL CHECK(json_valid(payload)),PRIMARY KEY(tenant_id,facility_id,package_id),FOREIGN KEY(tenant_id,facility_id,package_id) REFERENCES sp_packages(tenant_id,facility_id,id));
CREATE TABLE IF NOT EXISTS sp_package_versions(tenant_id TEXT NOT NULL,facility_id TEXT NOT NULL,id TEXT NOT NULL,version INTEGER NOT NULL,payload TEXT NOT NULL CHECK(json_valid(payload)),PRIMARY KEY(tenant_id,facility_id,id,version),FOREIGN KEY(tenant_id,facility_id,id) REFERENCES sp_packages(tenant_id,facility_id,id));
CREATE TABLE IF NOT EXISTS sp_package_assignments(tenant_id TEXT NOT NULL,facility_id TEXT NOT NULL,assembly_id TEXT NOT NULL,package_id TEXT NOT NULL,PRIMARY KEY(tenant_id,facility_id,assembly_id),FOREIGN KEY(tenant_id,facility_id,assembly_id) REFERENCES sp_assemblies(tenant_id,facility_id,id),FOREIGN KEY(tenant_id,facility_id,package_id) REFERENCES sp_packages(tenant_id,facility_id,id));
CREATE TABLE IF NOT EXISTS sp_loads(tenant_id TEXT NOT NULL,facility_id TEXT NOT NULL,id TEXT NOT NULL,code TEXT NOT NULL,version INTEGER NOT NULL CHECK(version>0),state TEXT NOT NULL CHECK(state IN ('draft','running','awaiting_review','failed','aborted','cancelled')),payload TEXT NOT NULL CHECK(json_valid(payload)),PRIMARY KEY(tenant_id,facility_id,id),UNIQUE(tenant_id,facility_id,code));
CREATE TABLE IF NOT EXISTS sp_load_versions(tenant_id TEXT NOT NULL,facility_id TEXT NOT NULL,id TEXT NOT NULL,version INTEGER NOT NULL,payload TEXT NOT NULL CHECK(json_valid(payload)),PRIMARY KEY(tenant_id,facility_id,id,version),FOREIGN KEY(tenant_id,facility_id,id) REFERENCES sp_loads(tenant_id,facility_id,id));
CREATE TABLE IF NOT EXISTS sp_load_assignments(tenant_id TEXT NOT NULL,facility_id TEXT NOT NULL,package_id TEXT NOT NULL,load_id TEXT NOT NULL,PRIMARY KEY(tenant_id,facility_id,package_id),FOREIGN KEY(tenant_id,facility_id,package_id) REFERENCES sp_packages(tenant_id,facility_id,id),FOREIGN KEY(tenant_id,facility_id,load_id) REFERENCES sp_loads(tenant_id,facility_id,id));
CREATE TABLE IF NOT EXISTS sp_machine_cycles(tenant_id TEXT NOT NULL,facility_id TEXT NOT NULL,sterilizer TEXT NOT NULL,cycle_reference TEXT NOT NULL,load_id TEXT NOT NULL,PRIMARY KEY(tenant_id,facility_id,sterilizer,cycle_reference),UNIQUE(tenant_id,facility_id,load_id),FOREIGN KEY(tenant_id,facility_id,load_id) REFERENCES sp_loads(tenant_id,facility_id,id));
CREATE TABLE IF NOT EXISTS sp_reviews(tenant_id TEXT NOT NULL,facility_id TEXT NOT NULL,id TEXT NOT NULL,load_id TEXT NOT NULL,version INTEGER NOT NULL CHECK(version>0),state TEXT NOT NULL CHECK(state IN ('released','held','rejected')),payload TEXT NOT NULL CHECK(json_valid(payload)),PRIMARY KEY(tenant_id,facility_id,id),UNIQUE(tenant_id,facility_id,load_id),FOREIGN KEY(tenant_id,facility_id,load_id) REFERENCES sp_loads(tenant_id,facility_id,id));
CREATE TABLE IF NOT EXISTS sp_review_versions(tenant_id TEXT NOT NULL,facility_id TEXT NOT NULL,id TEXT NOT NULL,version INTEGER NOT NULL,payload TEXT NOT NULL CHECK(json_valid(payload)),PRIMARY KEY(tenant_id,facility_id,id,version),FOREIGN KEY(tenant_id,facility_id,id) REFERENCES sp_reviews(tenant_id,facility_id,id));
CREATE TABLE IF NOT EXISTS sp_distribution(tenant_id TEXT NOT NULL,facility_id TEXT NOT NULL,id TEXT NOT NULL,package_id TEXT NOT NULL,package_version INTEGER NOT NULL,review_id TEXT NOT NULL,review_version INTEGER NOT NULL,load_id TEXT NOT NULL,load_version INTEGER NOT NULL,version INTEGER NOT NULL CHECK(version>0),payload TEXT NOT NULL CHECK(json_valid(payload)),PRIMARY KEY(tenant_id,facility_id,id),UNIQUE(tenant_id,facility_id,package_id),FOREIGN KEY(tenant_id,facility_id,package_id,package_version) REFERENCES sp_package_versions(tenant_id,facility_id,id,version),FOREIGN KEY(tenant_id,facility_id,review_id,review_version) REFERENCES sp_review_versions(tenant_id,facility_id,id,version),FOREIGN KEY(tenant_id,facility_id,load_id,load_version) REFERENCES sp_load_versions(tenant_id,facility_id,id,version));
CREATE TABLE IF NOT EXISTS sp_distribution_versions(tenant_id TEXT NOT NULL,facility_id TEXT NOT NULL,id TEXT NOT NULL,version INTEGER NOT NULL,payload TEXT NOT NULL CHECK(json_valid(payload)),PRIMARY KEY(tenant_id,facility_id,id,version),FOREIGN KEY(tenant_id,facility_id,id) REFERENCES sp_distribution(tenant_id,facility_id,id));
CREATE TABLE IF NOT EXISTS sp_returns(tenant_id TEXT NOT NULL,facility_id TEXT NOT NULL,id TEXT NOT NULL,code TEXT NOT NULL,package_id TEXT NOT NULL,package_version INTEGER NOT NULL,distribution_id TEXT NOT NULL,distribution_version INTEGER NOT NULL,version INTEGER NOT NULL CHECK(version>0),payload TEXT NOT NULL CHECK(json_valid(payload)),PRIMARY KEY(tenant_id,facility_id,id),UNIQUE(tenant_id,facility_id,code),UNIQUE(tenant_id,facility_id,package_id),FOREIGN KEY(tenant_id,facility_id,package_id,package_version) REFERENCES sp_package_versions(tenant_id,facility_id,id,version),FOREIGN KEY(tenant_id,facility_id,distribution_id,distribution_version) REFERENCES sp_distribution_versions(tenant_id,facility_id,id,version));
CREATE TABLE IF NOT EXISTS sp_return_versions(tenant_id TEXT NOT NULL,facility_id TEXT NOT NULL,id TEXT NOT NULL,version INTEGER NOT NULL,payload TEXT NOT NULL CHECK(json_valid(payload)),PRIMARY KEY(tenant_id,facility_id,id,version),FOREIGN KEY(tenant_id,facility_id,id) REFERENCES sp_returns(tenant_id,facility_id,id));
CREATE TABLE IF NOT EXISTS sp_recalls(tenant_id TEXT NOT NULL,facility_id TEXT NOT NULL,id TEXT NOT NULL,code TEXT NOT NULL,version INTEGER NOT NULL CHECK(version>0),payload TEXT NOT NULL CHECK(json_valid(payload)),PRIMARY KEY(tenant_id,facility_id,id),UNIQUE(tenant_id,facility_id,code));
CREATE TABLE IF NOT EXISTS sp_recall_versions(tenant_id TEXT NOT NULL,facility_id TEXT NOT NULL,id TEXT NOT NULL,version INTEGER NOT NULL,payload TEXT NOT NULL CHECK(json_valid(payload)),PRIMARY KEY(tenant_id,facility_id,id,version),FOREIGN KEY(tenant_id,facility_id,id) REFERENCES sp_recalls(tenant_id,facility_id,id));
CREATE TABLE IF NOT EXISTS sp_recall_blocks(tenant_id TEXT NOT NULL,facility_id TEXT NOT NULL,package_id TEXT NOT NULL,package_version INTEGER NOT NULL,recall_id TEXT NOT NULL,PRIMARY KEY(tenant_id,facility_id,package_id,recall_id),FOREIGN KEY(tenant_id,facility_id,package_id,package_version) REFERENCES sp_package_versions(tenant_id,facility_id,id,version),FOREIGN KEY(tenant_id,facility_id,recall_id) REFERENCES sp_recalls(tenant_id,facility_id,id));
CREATE TABLE IF NOT EXISTS sp_recall_instruments(tenant_id TEXT NOT NULL,facility_id TEXT NOT NULL,instrument_id TEXT NOT NULL,recall_id TEXT NOT NULL,PRIMARY KEY(tenant_id,facility_id,instrument_id,recall_id),FOREIGN KEY(tenant_id,facility_id,instrument_id) REFERENCES sp_instruments(tenant_id,facility_id,id),FOREIGN KEY(tenant_id,facility_id,recall_id) REFERENCES sp_recalls(tenant_id,facility_id,id));
CREATE TABLE IF NOT EXISTS sp_recall_readmissions(tenant_id TEXT NOT NULL,facility_id TEXT NOT NULL,instrument_id TEXT NOT NULL,recall_id TEXT NOT NULL,episode_id TEXT NOT NULL,PRIMARY KEY(tenant_id,facility_id,instrument_id,recall_id),FOREIGN KEY(tenant_id,facility_id,instrument_id,recall_id) REFERENCES sp_recall_instruments(tenant_id,facility_id,instrument_id,recall_id),FOREIGN KEY(tenant_id,facility_id,episode_id) REFERENCES sp_processing(tenant_id,facility_id,id));
CREATE INDEX IF NOT EXISTS sp_assignment_assembly ON sp_assignments(tenant_id,facility_id,assembly_id);`);
    } catch (error) {
      this.db.close();
      throw error;
    }
  }
  close(): void {
    this.closed = true;
    this.db.close();
  }
  async transaction<T>(
    scope: SterileScope,
    work: (tx: SterileTransaction) => Promise<T>,
  ): Promise<T> {
    if (this.closed) throw new Error("Preview storage is closed.");
    const previous = this.queue;
    let release!: () => void;
    this.queue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    let started = false;
    try {
      if (this.closed) throw new Error("Preview storage is closed.");
      // Yield while another connection owns the write lock so its async work
      // can commit; a synchronous busy timeout would block that same event loop.
      const deadline = Date.now() + 3000;
      for (;;) {
        try {
          this.db.exec("BEGIN IMMEDIATE");
          break;
        } catch (error) {
          if (
            (error as { errcode?: number }).errcode !== 5 ||
            Date.now() >= deadline
          )
            throw error;
          await new Promise((resolve) => setTimeout(resolve, 15));
          if (this.closed) throw new Error("Preview storage is closed.");
        }
      }
      started = true;
      const args = [scope.tenantId, scope.facilityId];
      const own = (item: { tenantId: string; facilityId: string }) => {
        if (
          item.tenantId !== scope.tenantId ||
          item.facilityId !== scope.facilityId
        )
          throw new SterileError("INVALID_REQUEST");
      };
      const read = <V>(
        sql: string,
        ...params: (string | number)[]
      ): V | null => {
        const row = this.db.prepare(sql).get(...args, ...params) as
          { payload: string } | undefined;
        return row ? (JSON.parse(row.payload) as V) : null;
      };
      const list = <V>(sql: string, page: number): V[] => {
        const rows = this.db.prepare(sql).all(...args, (page - 1) * 50) as {
          payload: string;
        }[];
        return rows.map((row) => JSON.parse(row.payload) as V);
      };
      const tx: SterileTransaction = {
        findProcedure: async (id) =>
          read(
            "SELECT payload FROM sp_procedures WHERE tenant_id=? AND facility_id=? AND id=?",
            id,
          ),
        latestProcedure: async (code) =>
          read(
            "SELECT payload FROM sp_procedures WHERE tenant_id=? AND facility_id=? AND code=? ORDER BY revision DESC LIMIT 1",
            code,
          ),
        listProcedures: async (page, stage) =>
          this.db
            .prepare(
              "SELECT payload FROM sp_procedures WHERE tenant_id=? AND facility_id=?" +
                (stage ? " AND stage=? AND state='published'" : "") +
                " ORDER BY rowid DESC LIMIT 51 OFFSET ?",
            )
            .all(...args, ...(stage ? [stage] : []), (page - 1) * 50)
            .map((row) => JSON.parse((row as { payload: string }).payload)),
        insertProcedure: async (r) => {
          own(r);
          this.db
            .prepare("INSERT INTO sp_procedures VALUES(?,?,?,?,?,?,?,?,?)")
            .run(
              ...args,
              r.id,
              r.code,
              r.revision,
              r.stage,
              r.state,
              r.version,
              JSON.stringify(r),
            );
        },
        updateProcedure: async (r, expected) => {
          own(r);
          if (r.version !== expected + 1)
            throw new SterileError("INVALID_REQUEST");
          if (
            this.db
              .prepare(
                "UPDATE sp_procedures SET state=?,version=?,payload=? WHERE tenant_id=? AND facility_id=? AND id=? AND version=?",
              )
              .run(
                r.state,
                r.version,
                JSON.stringify(r),
                ...args,
                r.id,
                expected,
              ).changes !== 1
          )
            throw new SterileError("CONFLICT");
        },
        insertProcedureVersion: async (r) => {
          own(r);
          this.db
            .prepare("INSERT INTO sp_procedure_versions VALUES(?,?,?,?,?)")
            .run(...args, r.id, r.version, JSON.stringify(r));
        },
        findProcedureVersion: async (id, version) =>
          read(
            "SELECT payload FROM sp_procedure_versions WHERE tenant_id=? AND facility_id=? AND id=? AND version=?",
            id,
            version,
          ),
        findLoaner: async (id) =>
          read(
            "SELECT payload FROM sp_loaners WHERE tenant_id=? AND facility_id=? AND id=?",
            id,
          ),
        findLoanerByCode: async (code) =>
          read(
            "SELECT payload FROM sp_loaners WHERE tenant_id=? AND facility_id=? AND code=?",
            code,
          ),
        listLoaners: async (page) =>
          list<import("@intrusionshield/sterile-processing").LoanerRecord>(
            "SELECT payload FROM sp_loaners WHERE tenant_id=? AND facility_id=? ORDER BY rowid DESC LIMIT 51 OFFSET ?",
            page,
          ).map((r) => {
            const { items, handback, ...summary } = r;
            return { ...summary, count: items.length };
          }),
        insertLoaner: async (item) => {
          own(item);
          this.db
            .prepare("INSERT INTO sp_loaners VALUES(?,?,?,?,?,?)")
            .run(
              ...args,
              item.id,
              item.code,
              item.version,
              JSON.stringify(item),
            );
        },
        updateLoaner: async (item, expected) => {
          own(item);
          if (item.version !== expected + 1)
            throw new SterileError("INVALID_REQUEST");
          if (
            this.db
              .prepare(
                "UPDATE sp_loaners SET version=?,payload=? WHERE tenant_id=? AND facility_id=? AND id=? AND version=?",
              )
              .run(
                item.version,
                JSON.stringify(item),
                ...args,
                item.id,
                expected,
              ).changes !== 1
          )
            throw new SterileError("CONFLICT");
        },
        insertLoanerVersion: async (item) => {
          own(item);
          this.db
            .prepare("INSERT INTO sp_loaner_versions VALUES(?,?,?,?,?)")
            .run(...args, item.id, item.version, JSON.stringify(item));
        },
        findLoanerVersion: async (id, version) =>
          read(
            "SELECT payload FROM sp_loaner_versions WHERE tenant_id=? AND facility_id=? AND id=? AND version=?",
            id,
            version,
          ),
        findServiceUsage: async (id) =>
          read(
            "SELECT payload FROM sp_service_usage WHERE tenant_id=? AND facility_id=? AND instrument_id=?",
            id,
          ),
        saveServiceUsage: async (item, expected) => {
          own(item);
          if (item.version !== expected + 1)
            throw new SterileError("INVALID_REQUEST");
          if (expected === 0)
            this.db
              .prepare("INSERT INTO sp_service_usage VALUES(?,?,?,?,?)")
              .run(
                ...args,
                item.instrumentId,
                item.version,
                JSON.stringify(item),
              );
          else if (
            this.db
              .prepare(
                "UPDATE sp_service_usage SET version=?,payload=? WHERE tenant_id=? AND facility_id=? AND instrument_id=? AND version=?",
              )
              .run(
                item.version,
                JSON.stringify(item),
                ...args,
                item.instrumentId,
                expected,
              ).changes !== 1
          )
            throw new SterileError("CONFLICT");
        },
        insertServiceExposure: async (item) => {
          own(item);
          if (item.actorId !== scope.actorId)
            throw new SterileError("INVALID_REQUEST");
          const existing = read<
            import("@intrusionshield/sterile-processing").ServiceExposure
          >(
            "SELECT payload FROM sp_service_exposures WHERE tenant_id=? AND facility_id=? AND instrument_id=? AND load_id=?",
            item.instrumentId,
            item.loadId,
          );
          if (existing) {
            if (
              existing.loadVersion !== item.loadVersion ||
              existing.outcome !== item.outcome
            )
              throw new SterileError("CONFLICT");
            return false;
          }
          this.db
            .prepare("INSERT INTO sp_service_exposures VALUES(?,?,?,?,?)")
            .run(...args, item.instrumentId, item.loadId, JSON.stringify(item));
          return true;
        },
        listServiceExposures: async (id, page) =>
          this.db
            .prepare(
              "SELECT payload FROM sp_service_exposures WHERE tenant_id=? AND facility_id=? AND instrument_id=? ORDER BY rowid DESC LIMIT 51 OFFSET ?",
            )
            .all(...args, id, (page - 1) * 50)
            .map((row) => JSON.parse((row as { payload: string }).payload)),
        dashboardQueue: async (id, offset) =>
          readDashboardQueue(this.db, args, id, offset),
        searchTraceCode: async (code) => {
          const pairs = [
            ["instrument", "sp_instruments"],
            ["definition", "sp_definitions"],
            ["assembly", "sp_assemblies"],
            ["package", "sp_packages"],
            ["load", "sp_loads"],
          ] as const;
          return pairs.flatMap(([kind, table]) => {
            const row = read<{ id: string; code: string; version: number }>(
              `SELECT payload FROM ${table} WHERE tenant_id=? AND facility_id=? AND code=?`,
              code,
            );
            return row
              ? [{ kind, id: row.id, code: row.code, version: row.version }]
              : [];
          });
        },
        traceRows: async (kind, filter) => {
          const tables: Record<TraceKind, [string, string | null]> = {
            instrument: ["sp_instruments", null],
            definition: ["sp_definitions", "sp_definition_versions"],
            assembly: ["sp_assemblies", "sp_assembly_versions"],
            package: ["sp_packages", "sp_package_versions"],
            load: ["sp_loads", "sp_load_versions"],
            processing: ["sp_processing", "sp_processing_versions"],
            review: ["sp_reviews", "sp_review_versions"],
            distribution: ["sp_distribution", "sp_distribution_versions"],
            return: ["sp_returns", "sp_return_versions"],
            recall: ["sp_recalls", "sp_recall_versions"],
          };
          const pair = tables[kind];
          if (!pair) throw new SterileError("INVALID_REQUEST");
          const [table, versions] = pair,
            parts: string[] = [],
            params: string[] = [];
          const scalar = (path: string, ids: string[] | undefined) => {
            if (ids?.length) {
              parts.push(
                `json_extract(payload,'${path}') IN (SELECT value FROM json_each(?))`,
              );
              params.push(JSON.stringify(ids));
            }
          };
          const members = (
            path: string,
            key: string,
            ids: string[] | undefined,
          ) => {
            if (ids?.length) {
              parts.push(
                `EXISTS(SELECT 1 FROM json_each(payload,'${path}') m WHERE json_extract(m.value,'$.${key}') IN (SELECT value FROM json_each(?)))`,
              );
              params.push(JSON.stringify(ids));
            }
          };
          scalar("$.id", filter.ids);
          if (kind === "assembly")
            scalar("$.definitionId", filter.definitionIds);
          if (kind === "assembly" || kind === "processing")
            members("$.instruments", "id", filter.instrumentIds);
          if (kind === "package")
            members(
              "$.assemblySnapshot.instruments",
              "id",
              filter.instrumentIds,
            );
          if (kind === "load") members("$.packages", "id", filter.packageIds);
          if (kind === "distribution" || kind === "return")
            scalar("$.packageId", filter.packageIds);
          if (kind === "recall")
            members("$.items", "packageId", filter.packageIds);
          if (kind === "review") scalar("$.loadId", filter.loadIds);
          if (!parts.length) return [];
          const source =
              `SELECT payload FROM ${table} WHERE tenant_id=? AND facility_id=?` +
              (versions
                ? ` UNION ALL SELECT payload FROM ${versions} WHERE tenant_id=? AND facility_id=?`
                : ""),
            where = parts.join(" OR "),
            selected = `WITH source AS (${source}),selected AS(SELECT DISTINCT json_extract(payload,'$.id') AS id FROM source WHERE ${where}) `;
          const sql =
            selected +
            `SELECT c.payload,1 AS current FROM ${table} c JOIN selected s ON c.id=s.id WHERE c.tenant_id=? AND c.facility_id=?` +
            (versions
              ? ` UNION ALL SELECT v.payload,0 AS current FROM ${versions} v JOIN ${table} c ON c.tenant_id=v.tenant_id AND c.facility_id=v.facility_id AND c.id=v.id JOIN selected s ON s.id=v.id WHERE v.tenant_id=? AND v.facility_id=? AND json_extract(v.payload,'$.version')<>json_extract(c.payload,'$.version')`
              : "") +
            " LIMIT 1001";
          const rows = this.db
            .prepare(sql)
            .all(
              ...args,
              ...(versions ? args : []),
              ...params,
              ...args,
              ...(versions ? args : []),
            ) as { payload: string; current: number }[];
          return rows.map((row) => ({
            kind,
            current: row.current === 1,
            record: JSON.parse(row.payload),
          }));
        },
        traceAudit: async (ids) => {
          if (!ids.length) return [];
          return (
            this.db
              .prepare(
                "SELECT payload FROM sp_audit WHERE tenant_id=? AND facility_id=? AND entity_id IN (SELECT value FROM json_each(?)) ORDER BY rowid LIMIT 2001",
              )
              .all(...args, JSON.stringify(ids)) as { payload: string }[]
          ).map((r) => JSON.parse(r.payload));
        },
        findReturn: async (id) =>
          read<ReturnRecord>(
            "SELECT payload FROM sp_returns WHERE tenant_id=? AND facility_id=? AND id=?",
            id,
          ),
        findReturnByCode: async (code) =>
          read<ReturnRecord>(
            "SELECT payload FROM sp_returns WHERE tenant_id=? AND facility_id=? AND code=?",
            code,
          ),
        listReturns: async (page) =>
          list<ReturnSummary>(
            "SELECT json_remove(payload,'$.issue','$.scanReceipt','$.reconciliation') AS payload FROM sp_returns WHERE tenant_id=? AND facility_id=? ORDER BY rowid DESC LIMIT 51 OFFSET ?",
            page,
          ),
        insertReturn: async (item) => {
          own(item);
          this.db
            .prepare("INSERT INTO sp_returns VALUES(?,?,?,?,?,?,?,?,?,?)")
            .run(
              ...args,
              item.id,
              item.code,
              item.packageId,
              item.packageVersion,
              item.issue.id,
              item.issue.version,
              item.version,
              JSON.stringify(item),
            );
        },
        updateReturn: async (item, expected) => {
          own(item);
          if (item.version !== expected + 1)
            throw new SterileError("INVALID_REQUEST");
          const r = this.db
            .prepare(
              "UPDATE sp_returns SET version=?,payload=? WHERE tenant_id=? AND facility_id=? AND id=? AND version=?",
            )
            .run(
              item.version,
              JSON.stringify(item),
              ...args,
              item.id,
              expected,
            );
          if (r.changes !== 1) throw new SterileError("CONFLICT");
        },
        insertReturnVersion: async (item) => {
          own(item);
          this.db
            .prepare("INSERT INTO sp_return_versions VALUES(?,?,?,?,?)")
            .run(...args, item.id, item.version, JSON.stringify(item));
        },
        findReturnVersion: async (id, version) =>
          read<ReturnRecord>(
            "SELECT payload FROM sp_return_versions WHERE tenant_id=? AND facility_id=? AND id=? AND version=?",
            id,
            version,
          ),
        findReturnByPackage: async (id) =>
          read<ReturnRecord>(
            "SELECT payload FROM sp_returns WHERE tenant_id=? AND facility_id=? AND package_id=?",
            id,
          ),
        findRecall: async (id) =>
          read<RecallRecord>(
            "SELECT payload FROM sp_recalls WHERE tenant_id=? AND facility_id=? AND id=?",
            id,
          ),
        findRecallByCode: async (code) =>
          read<RecallRecord>(
            "SELECT payload FROM sp_recalls WHERE tenant_id=? AND facility_id=? AND code=?",
            code,
          ),
        listRecalls: async (page) =>
          list<RecallSummary>(
            "SELECT json_set(json_remove(payload,'$.items'),'$.packageCount',json_array_length(payload,'$.items')) AS payload FROM sp_recalls WHERE tenant_id=? AND facility_id=? ORDER BY rowid DESC LIMIT 51 OFFSET ?",
            page,
          ),
        insertRecall: async (item) => {
          own(item);
          this.db
            .prepare("INSERT INTO sp_recalls VALUES(?,?,?,?,?,?)")
            .run(
              ...args,
              item.id,
              item.code,
              item.version,
              JSON.stringify(item),
            );
        },
        updateRecall: async (item, expected) => {
          own(item);
          if (item.version !== expected + 1)
            throw new SterileError("INVALID_REQUEST");
          const r = this.db
            .prepare(
              "UPDATE sp_recalls SET version=?,payload=? WHERE tenant_id=? AND facility_id=? AND id=? AND version=?",
            )
            .run(
              item.version,
              JSON.stringify(item),
              ...args,
              item.id,
              expected,
            );
          if (r.changes !== 1) throw new SterileError("CONFLICT");
        },
        insertRecallVersion: async (item) => {
          own(item);
          this.db
            .prepare("INSERT INTO sp_recall_versions VALUES(?,?,?,?,?)")
            .run(...args, item.id, item.version, JSON.stringify(item));
        },
        findRecallVersion: async (id, version) =>
          read<RecallRecord>(
            "SELECT payload FROM sp_recall_versions WHERE tenant_id=? AND facility_id=? AND id=? AND version=?",
            id,
            version,
          ),
        insertRecallBlocks: async (item) => {
          own(item);
          for (const p of item.items)
            this.db
              .prepare("INSERT INTO sp_recall_blocks VALUES(?,?,?,?,?)")
              .run(...args, p.packageId, p.packageVersion, item.id);
        },
        findRecallReadmission: async (caseId, instrumentId) => {
          const row = this.db
            .prepare(
              "SELECT p.id AS episodeId,json_extract(p.payload,'$.code') AS episodeCode FROM sp_recall_readmissions a JOIN sp_processing p ON p.tenant_id=a.tenant_id AND p.facility_id=a.facility_id AND p.id=a.episode_id WHERE a.tenant_id=? AND a.facility_id=? AND a.recall_id=? AND a.instrument_id=?",
            )
            .get(...args, caseId, instrumentId) as
            { episodeId: string; episodeCode: string } | undefined;
          return row ?? null;
        },
        listInstrumentRecallCases: async (id) =>
          (
            this.db
              .prepare(
                "SELECT DISTINCT r.payload FROM sp_recalls r WHERE r.tenant_id=? AND r.facility_id=? AND (EXISTS(SELECT 1 FROM sp_recall_instruments a WHERE a.tenant_id=r.tenant_id AND a.facility_id=r.facility_id AND a.recall_id=r.id AND a.instrument_id=?) OR (json_type(r.payload,'$.lineage') IS NULL AND EXISTS(SELECT 1 FROM json_each(r.payload,'$.items') item JOIN sp_packages p ON p.tenant_id=r.tenant_id AND p.facility_id=r.facility_id AND p.id=json_extract(item.value,'$.packageId') WHERE EXISTS(SELECT 1 FROM json_each(p.payload,'$.assemblySnapshot.instruments') i WHERE json_extract(i.value,'$.id')=?))))",
              )
              .all(...args, id, id) as { payload: string }[]
          ).map((x) => JSON.parse(x.payload)),
        listPackageRecallCases: async (id) =>
          (
            this.db
              .prepare(
                "SELECT r.payload FROM sp_recalls r JOIN sp_recall_blocks a ON a.tenant_id=r.tenant_id AND a.facility_id=r.facility_id AND a.recall_id=r.id WHERE a.tenant_id=? AND a.facility_id=? AND a.package_id=?",
              )
              .all(...args, id) as { payload: string }[]
          ).map((x) => JSON.parse(x.payload)),
        insertRecallReadmissions: async (episode, pairs) => {
          own(episode);
          for (const pair of pairs) {
            const result = this.db
              .prepare(
                "INSERT INTO sp_recall_readmissions SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM sp_recalls r WHERE r.tenant_id=? AND r.facility_id=? AND r.id=? AND json_type(r.payload,'$.clearance')='object' AND json_extract(r.payload,'$.state')='closed')",
              )
              .run(
                ...args,
                pair.instrumentId,
                pair.caseId,
                episode.id,
                ...args,
                pair.caseId,
              );
            if (result.changes !== 1)
              throw new SterileError("CLEARANCE_BLOCKED");
          }
        },
        insertRecallInstrumentBlocks: async (item) => {
          own(item);
          for (const id of item.lineage?.instrumentIds ?? [])
            this.db
              .prepare(
                "INSERT OR IGNORE INTO sp_recall_instruments VALUES(?,?,?,?)",
              )
              .run(...args, id, item.id);
        },
        findInstrumentRecallBlock: async (id) => {
          const row = this.db
            .prepare(
              "SELECT r.id AS caseId,r.code AS caseCode,json_extract(r.payload,'$.state') AS state,(SELECT count(*) FROM sp_recall_instruments b WHERE b.tenant_id=a.tenant_id AND b.facility_id=a.facility_id AND b.instrument_id=a.instrument_id AND NOT EXISTS(SELECT 1 FROM sp_recall_readmissions d WHERE d.tenant_id=b.tenant_id AND d.facility_id=b.facility_id AND d.instrument_id=b.instrument_id AND d.recall_id=b.recall_id)) AS count FROM sp_recall_instruments a JOIN sp_recalls r ON r.tenant_id=a.tenant_id AND r.facility_id=a.facility_id AND r.id=a.recall_id WHERE a.tenant_id=? AND a.facility_id=? AND a.instrument_id=? AND NOT EXISTS(SELECT 1 FROM sp_recall_readmissions d WHERE d.tenant_id=a.tenant_id AND d.facility_id=a.facility_id AND d.instrument_id=a.instrument_id AND d.recall_id=a.recall_id) ORDER BY r.rowid DESC LIMIT 1",
            )
            .get(...args, id) as RecallBlock | undefined;
          return row ?? null;
        },
        findRecallBlock: async (id) => {
          const row = this.db
            .prepare(
              "SELECT r.id AS caseId,r.code AS caseCode,json_extract(r.payload,'$.state') AS state,(SELECT count(*) FROM sp_recall_blocks b WHERE b.tenant_id=a.tenant_id AND b.facility_id=a.facility_id AND b.package_id=a.package_id) AS count FROM sp_recall_blocks a JOIN sp_recalls r ON r.tenant_id=a.tenant_id AND r.facility_id=a.facility_id AND r.id=a.recall_id WHERE a.tenant_id=? AND a.facility_id=? AND a.package_id=? ORDER BY r.rowid DESC LIMIT 1",
            )
            .get(...args, id) as RecallBlock | undefined;
          return row ?? null;
        },
        findDistribution: async (id) =>
          read<DistributionRecord>(
            "SELECT payload FROM sp_distribution WHERE tenant_id=? AND facility_id=? AND id=?",
            id,
          ),
        findDistributionByPackage: async (id) =>
          read<DistributionRecord>(
            "SELECT payload FROM sp_distribution WHERE tenant_id=? AND facility_id=? AND package_id=?",
            id,
          ),
        listDistribution: async (page) =>
          list<DistributionSummary>(
            "SELECT json_remove(payload,'$.events') AS payload FROM sp_distribution WHERE tenant_id=? AND facility_id=? ORDER BY rowid DESC LIMIT 51 OFFSET ?",
            page,
          ),
        insertDistribution: async (item) => {
          own(item);
          this.db
            .prepare(
              "INSERT INTO sp_distribution VALUES(?,?,?,?,?,?,?,?,?,?,?)",
            )
            .run(
              ...args,
              item.id,
              item.packageId,
              item.packageVersion,
              item.reviewId,
              item.reviewVersion,
              item.loadId,
              item.loadVersion,
              item.version,
              JSON.stringify(item),
            );
        },
        updateDistribution: async (item, expected) => {
          own(item);
          if (item.version !== expected + 1)
            throw new SterileError("INVALID_REQUEST");
          const r = this.db
            .prepare(
              "UPDATE sp_distribution SET version=?,payload=? WHERE tenant_id=? AND facility_id=? AND id=? AND version=?",
            )
            .run(
              item.version,
              JSON.stringify(item),
              ...args,
              item.id,
              expected,
            );
          if (r.changes !== 1) throw new SterileError("CONFLICT");
        },
        insertDistributionVersion: async (item) => {
          own(item);
          this.db
            .prepare("INSERT INTO sp_distribution_versions VALUES(?,?,?,?,?)")
            .run(...args, item.id, item.version, JSON.stringify(item));
        },
        findDistributionVersion: async (id, version) =>
          read<DistributionRecord>(
            "SELECT payload FROM sp_distribution_versions WHERE tenant_id=? AND facility_id=? AND id=? AND version=?",
            id,
            version,
          ),
        findReview: async (id) =>
          read<LoadReview>(
            "SELECT payload FROM sp_reviews WHERE tenant_id=? AND facility_id=? AND id=?",
            id,
          ),
        findReviewByLoad: async (id) =>
          read<LoadReview>(
            "SELECT payload FROM sp_reviews WHERE tenant_id=? AND facility_id=? AND load_id=?",
            id,
          ),
        listReviews: async (page) =>
          list<ReviewSummary>(
            "SELECT json_object('id',id,'tenantId',tenant_id,'facilityId',facility_id,'loadId',load_id,'loadVersion',json_extract(payload,'$.loadVersion'),'loadCode',json_extract(payload,'$.loadSnapshot.code'),'state',state,'version',version,'createdAt',json_extract(payload,'$.createdAt'),'updatedAt',json_extract(payload,'$.updatedAt')) AS payload FROM sp_reviews WHERE tenant_id=? AND facility_id=? ORDER BY rowid DESC LIMIT 51 OFFSET ?",
            page,
          ),
        listReviewQueue: async (page) =>
          list<ReviewQueueItem>(
            "SELECT json_object('id',l.id,'tenantId',l.tenant_id,'facilityId',l.facility_id,'code',l.code,'version',l.version,'state',l.state,'outcome',json_extract(l.payload,'$.outcome'),'sterilizer',json_extract(l.payload,'$.sterilizer'),'packageCount',json_array_length(l.payload,'$.packages'),'reviewId',r.id,'reviewVersion',coalesce(r.version,0)) AS payload FROM sp_loads l LEFT JOIN sp_reviews r ON r.tenant_id=l.tenant_id AND r.facility_id=l.facility_id AND r.load_id=l.id WHERE l.tenant_id=? AND l.facility_id=? AND l.state IN ('awaiting_review','failed','aborted') AND (r.state IS NULL OR r.state='held') ORDER BY l.rowid DESC LIMIT 51 OFFSET ?",
            page,
          ),
        insertReview: async (item) => {
          own(item);
          this.db
            .prepare("INSERT INTO sp_reviews VALUES(?,?,?,?,?,?,?)")
            .run(
              ...args,
              item.id,
              item.loadId,
              item.version,
              item.state,
              JSON.stringify(item),
            );
        },
        updateReview: async (item, expected) => {
          own(item);
          if (item.version !== expected + 1)
            throw new SterileError("INVALID_REQUEST");
          const r = this.db
            .prepare(
              "UPDATE sp_reviews SET version=?,state=?,payload=? WHERE tenant_id=? AND facility_id=? AND id=? AND version=?",
            )
            .run(
              item.version,
              item.state,
              JSON.stringify(item),
              ...args,
              item.id,
              expected,
            );
          if (r.changes !== 1) throw new SterileError("CONFLICT");
        },
        insertReviewVersion: async (item) => {
          own(item);
          this.db
            .prepare("INSERT INTO sp_review_versions VALUES(?,?,?,?,?)")
            .run(...args, item.id, item.version, JSON.stringify(item));
        },
        findReviewVersion: async (id, version) =>
          read<LoadReview>(
            "SELECT payload FROM sp_review_versions WHERE tenant_id=? AND facility_id=? AND id=? AND version=?",
            id,
            version,
          ),
        findLoad: async (id) =>
          read<SterilizationLoad>(
            "SELECT payload FROM sp_loads WHERE tenant_id=? AND facility_id=? AND id=?",
            id,
          ),
        findLoadByCode: async (code) =>
          read<SterilizationLoad>(
            "SELECT payload FROM sp_loads WHERE tenant_id=? AND facility_id=? AND code=?",
            code,
          ),
        listLoads: async (page) =>
          list<LoadSummary>(
            "SELECT json_object('id',id,'tenantId',tenant_id,'facilityId',facility_id,'code',code,'sterilizer',json_extract(payload,'$.sterilizer'),'state',state,'version',version,'createdAt',json_extract(payload,'$.createdAt'),'packageCount',json_array_length(payload,'$.packages')) AS payload FROM sp_loads WHERE tenant_id=? AND facility_id=? ORDER BY rowid DESC LIMIT 51 OFFSET ?",
            page,
          ),
        insertLoad: async (item) => {
          own(item);
          this.db
            .prepare("INSERT INTO sp_loads VALUES(?,?,?,?,?,?,?)")
            .run(
              ...args,
              item.id,
              item.code,
              item.version,
              item.state,
              JSON.stringify(item),
            );
        },
        updateLoad: async (item, expected) => {
          own(item);
          if (item.version !== expected + 1)
            throw new SterileError("INVALID_REQUEST");
          const r = this.db
            .prepare(
              "UPDATE sp_loads SET version=?,state=?,payload=? WHERE tenant_id=? AND facility_id=? AND id=? AND version=?",
            )
            .run(
              item.version,
              item.state,
              JSON.stringify(item),
              ...args,
              item.id,
              expected,
            );
          if (r.changes !== 1) throw new SterileError("CONFLICT");
        },
        insertLoadVersion: async (item) => {
          own(item);
          this.db
            .prepare("INSERT INTO sp_load_versions VALUES(?,?,?,?,?)")
            .run(...args, item.id, item.version, JSON.stringify(item));
        },
        findLoadVersion: async (id, version) =>
          read<SterilizationLoad>(
            "SELECT payload FROM sp_load_versions WHERE tenant_id=? AND facility_id=? AND id=? AND version=?",
            id,
            version,
          ),
        findPackageLoad: async (id) => {
          const row = this.db
            .prepare(
              "SELECT l.id AS loadId,l.code AS loadCode,l.state FROM sp_load_assignments a JOIN sp_loads l ON l.tenant_id=a.tenant_id AND l.facility_id=a.facility_id AND l.id=a.load_id WHERE a.tenant_id=? AND a.facility_id=? AND a.package_id=?",
            )
            .get(...args, id) as PackageLoad | undefined;
          if (!row) return null;
          const review = read<LoadReview>(
            "SELECT payload FROM sp_reviews WHERE tenant_id=? AND facility_id=? AND load_id=?",
            row.loadId,
          );
          return {
            ...row,
            ...(review ? { review: reviewStatus(review) } : {}),
          };
        },
        replaceLoadAssignments: async (item) => {
          own(item);
          this.db
            .prepare(
              "DELETE FROM sp_load_assignments WHERE tenant_id=? AND facility_id=? AND load_id=?",
            )
            .run(...args, item.id);
          if (item.state !== "cancelled")
            for (const p of item.packages)
              this.db
                .prepare("INSERT INTO sp_load_assignments VALUES(?,?,?,?)")
                .run(...args, p.id, item.id);
        },
        findMachineCycle: async (sterilizer, reference) => {
          const r = this.db
            .prepare(
              "SELECT load_id FROM sp_machine_cycles WHERE tenant_id=? AND facility_id=? AND sterilizer=? AND cycle_reference=?",
            )
            .get(...args, sterilizer, reference) as
            { load_id: string } | undefined;
          return r?.load_id ?? null;
        },
        reserveMachineCycle: async (item) => {
          own(item);
          if (!item.cycleReference) throw new SterileError("INVALID_REQUEST");
          this.db
            .prepare("INSERT INTO sp_machine_cycles VALUES(?,?,?,?,?)")
            .run(...args, item.sterilizer, item.cycleReference, item.id);
        },
        equipmentExposureCandidates: async (id, code, from, to) => {
          const processing = this.db
            .prepare(
              "SELECT payload FROM sp_processing p WHERE tenant_id=? AND facility_id=? AND EXISTS(SELECT 1 FROM json_each(p.payload,'$.attempts') a WHERE (json_extract(a.value,'$.registeredEquipment.id')=? OR (json_extract(a.value,'$.registeredEquipment.id') IS NULL AND upper(json_extract(a.value,'$.equipment'))=?)) AND json_extract(a.value,'$.method')='mechanical' AND julianday(json_extract(a.value,'$.startedAt'))<julianday(?) AND (json_extract(a.value,'$.finishedAt') IS NULL OR julianday(json_extract(a.value,'$.finishedAt'))>=julianday(?))) ORDER BY id LIMIT 201",
            )
            .all(...args, id, code, to, from)
            .map((r) => JSON.parse((r as { payload: string }).payload));
          const loads = this.db
            .prepare(
              "SELECT payload FROM sp_loads p WHERE tenant_id=? AND facility_id=? AND (coalesce(json_extract(payload,'$.startedEquipment.id'),json_extract(payload,'$.registeredEquipment.id'))=? OR (coalesce(json_extract(payload,'$.startedEquipment.id'),json_extract(payload,'$.registeredEquipment.id')) IS NULL AND upper(json_extract(payload,'$.sterilizer'))=?)) AND julianday(json_extract(payload,'$.startedAt'))<julianday(?) AND (json_extract(payload,'$.finishedAt') IS NULL OR julianday(json_extract(payload,'$.finishedAt'))>=julianday(?)) ORDER BY id LIMIT 201",
            )
            .all(...args, id, code, to, from)
            .map((r) => JSON.parse((r as { payload: string }).payload));
          return { processing, loads };
        },
        equipmentIncidentPackages: async (episodeIds, packageIds) =>
          this.db
            .prepare(
              "SELECT payload FROM sp_packages p WHERE tenant_id=? AND facility_id=? AND (p.id IN (SELECT value FROM json_each(?)) OR EXISTS(SELECT 1 FROM json_each(p.payload,'$.inspectionProofs') proof WHERE json_extract(proof.value,'$.episodeId') IN (SELECT value FROM json_each(?)))) ORDER BY id LIMIT 101",
            )
            .all(
              ...args,
              JSON.stringify(packageIds),
              JSON.stringify(episodeIds),
            )
            .map((r) => JSON.parse((r as { payload: string }).payload)),
        findEquipmentIncident: async (id) =>
          read<import("@intrusionshield/sterile-processing").EquipmentIncident>(
            "SELECT payload FROM sp_equipment_incidents WHERE tenant_id=? AND facility_id=? AND id=?",
            id,
          ),
        findEquipmentIncidentByCode: async (code) =>
          read<import("@intrusionshield/sterile-processing").EquipmentIncident>(
            "SELECT payload FROM sp_equipment_incidents WHERE tenant_id=? AND facility_id=? AND code=?",
            code,
          ),
        listEquipmentIncidents: async (id, page) =>
          this.db
            .prepare(
              "SELECT payload FROM sp_equipment_incidents WHERE tenant_id=? AND facility_id=? AND equipment_id=? ORDER BY rowid DESC LIMIT 51 OFFSET ?",
            )
            .all(...args, id, (page - 1) * 50)
            .map((r) => JSON.parse((r as { payload: string }).payload)),
        insertEquipmentIncident: async (item) => {
          own(item);
          this.db
            .prepare("INSERT INTO sp_equipment_incidents VALUES(?,?,?,?,?,?,?)")
            .run(
              ...args,
              item.id,
              item.code,
              item.equipmentId,
              item.version,
              JSON.stringify(item),
            );
        },
        updateEquipmentIncident: async (item, expected) => {
          own(item);
          const r = this.db
            .prepare(
              "UPDATE sp_equipment_incidents SET version=?,payload=? WHERE tenant_id=? AND facility_id=? AND id=? AND version=?",
            )
            .run(
              item.version,
              JSON.stringify(item),
              ...args,
              item.id,
              expected,
            );
          if (r.changes !== 1) throw new SterileError("CONFLICT");
        },
        insertEquipmentIncidentVersion: async (item) => {
          own(item);
          this.db
            .prepare(
              "INSERT INTO sp_equipment_incident_versions VALUES(?,?,?,?,?)",
            )
            .run(...args, item.id, item.version, JSON.stringify(item));
        },
        findEquipmentIncidentVersion: async (id, version) =>
          read<import("@intrusionshield/sterile-processing").EquipmentIncident>(
            "SELECT payload FROM sp_equipment_incident_versions WHERE tenant_id=? AND facility_id=? AND id=? AND version=?",
            id,
            version,
          ),
        findEquipment: async (id) =>
          read<
            import("@intrusionshield/sterile-processing").ProcessingEquipment
          >(
            "SELECT payload FROM sp_equipment WHERE tenant_id=? AND facility_id=? AND id=?",
            id,
          ),
        findEquipmentByCode: async (code) =>
          read<
            import("@intrusionshield/sterile-processing").ProcessingEquipment
          >(
            "SELECT payload FROM sp_equipment WHERE tenant_id=? AND facility_id=? AND code=?",
            code,
          ),
        listEquipment: async (page) =>
          list<
            import("@intrusionshield/sterile-processing").ProcessingEquipment
          >(
            "SELECT payload FROM sp_equipment WHERE tenant_id=? AND facility_id=? ORDER BY rowid DESC LIMIT 51 OFFSET ?",
            page,
          ),
        insertEquipment: async (item) => {
          own(item);
          this.db
            .prepare("INSERT INTO sp_equipment VALUES(?,?,?,?,?,?)")
            .run(
              ...args,
              item.id,
              item.code,
              item.version,
              JSON.stringify(item),
            );
        },
        updateEquipment: async (item, expected) => {
          own(item);
          const r = this.db
            .prepare(
              "UPDATE sp_equipment SET version=?,payload=? WHERE tenant_id=? AND facility_id=? AND id=? AND version=?",
            )
            .run(
              item.version,
              JSON.stringify(item),
              ...args,
              item.id,
              expected,
            );
          if (r.changes !== 1) throw new SterileError("CONFLICT");
        },
        insertEquipmentVersion: async (item) => {
          own(item);
          this.db
            .prepare("INSERT INTO sp_equipment_versions VALUES(?,?,?,?,?)")
            .run(...args, item.id, item.version, JSON.stringify(item));
        },
        findEquipmentVersion: async (id, version) =>
          read<
            import("@intrusionshield/sterile-processing").ProcessingEquipment
          >(
            "SELECT payload FROM sp_equipment_versions WHERE tenant_id=? AND facility_id=? AND id=? AND version=?",
            id,
            version,
          ),
        findPackageIntegrity: async (id) =>
          read<
            import("@intrusionshield/sterile-processing").PackageIntegrityHold
          >(
            "SELECT payload FROM sp_package_integrity WHERE tenant_id=? AND facility_id=? AND package_id=?",
            id,
          ),
        insertPackageIntegrity: async (item) => {
          own(item);
          this.db
            .prepare("INSERT INTO sp_package_integrity VALUES(?,?,?,?)")
            .run(...args, item.packageId, JSON.stringify(item));
        },
        findPackage: async (id) =>
          read<SterilePackage>(
            "SELECT payload FROM sp_packages WHERE tenant_id=? AND facility_id=? AND id=?",
            id,
          ),
        findPackageByCode: async (code) =>
          read<SterilePackage>(
            "SELECT payload FROM sp_packages WHERE tenant_id=? AND facility_id=? AND code=?",
            code,
          ),
        listPackages: async (page) =>
          list<PackageSummary>(
            "SELECT json_object('id',id,'tenantId',tenant_id,'facilityId',facility_id,'code',code,'assemblyId',assembly_id,'state',json_extract(payload,'$.state'),'version',version,'createdAt',json_extract(payload,'$.createdAt'),'shelfLife',json_extract(payload,'$.shelfLife'),'trayName',json_extract(payload,'$.assemblySnapshot.definitionSnapshot.name'),'instrumentCount',json_array_length(payload,'$.assemblySnapshot.instruments')) AS payload FROM sp_packages WHERE tenant_id=? AND facility_id=? ORDER BY rowid DESC LIMIT 51 OFFSET ?",
            page,
          ),
        insertPackage: async (item) => {
          own(item);
          this.db
            .prepare("INSERT INTO sp_packages VALUES(?,?,?,?,?,?,?)")
            .run(
              ...args,
              item.id,
              item.code,
              item.assemblyId,
              item.version,
              JSON.stringify(item),
            );
        },
        updatePackage: async (item, expected) => {
          own(item);
          if (item.version !== expected + 1)
            throw new SterileError("INVALID_REQUEST");
          const r = this.db
            .prepare(
              "UPDATE sp_packages SET version=?,payload=? WHERE tenant_id=? AND facility_id=? AND id=? AND version=?",
            )
            .run(
              item.version,
              JSON.stringify(item),
              ...args,
              item.id,
              expected,
            );
          if (r.changes !== 1) throw new SterileError("CONFLICT");
        },
        insertPackageVersion: async (item) => {
          own(item);
          this.db
            .prepare("INSERT INTO sp_package_versions VALUES(?,?,?,?,?)")
            .run(...args, item.id, item.version, JSON.stringify(item));
        },
        findPackageVersion: async (id, version) =>
          read<SterilePackage>(
            "SELECT payload FROM sp_package_versions WHERE tenant_id=? AND facility_id=? AND id=? AND version=?",
            id,
            version,
          ),
        findActivePackage: async (id) => {
          const row = this.db
            .prepare(
              "SELECT p.id AS packageId,p.code AS packageCode FROM sp_package_assignments a JOIN sp_packages p ON p.tenant_id=a.tenant_id AND p.facility_id=a.facility_id AND p.id=a.package_id WHERE a.tenant_id=? AND a.facility_id=? AND a.assembly_id=?",
            )
            .get(...args, id) as
            { packageId: string; packageCode: string } | undefined;
          return row ?? null;
        },
        reservePackage: async (item) => {
          own(item);
          this.db
            .prepare("INSERT INTO sp_package_assignments VALUES(?,?,?,?)")
            .run(...args, item.assemblyId, item.id);
        },
        releasePackage: async (item) => {
          own(item);
          const r = this.db
            .prepare(
              "DELETE FROM sp_package_assignments WHERE tenant_id=? AND facility_id=? AND assembly_id=? AND package_id=?",
            )
            .run(...args, item.assemblyId, item.id);
          if (r.changes !== 1) throw new SterileError("CONFLICT");
        },
        findLatestProcessing: async (id) =>
          read<ProcessingEpisode>(
            "SELECT p.payload FROM sp_processing p WHERE p.tenant_id=? AND p.facility_id=? AND EXISTS(SELECT 1 FROM json_each(p.payload,'$.instruments') i WHERE json_extract(i.value,'$.id')=?) ORDER BY p.rowid DESC LIMIT 1",
            id,
          ),
        findProcessing: async (id) =>
          read<ProcessingEpisode>(
            "SELECT payload FROM sp_processing WHERE tenant_id=? AND facility_id=? AND id=?",
            id,
          ),
        findProcessingByCode: async (code) =>
          read<ProcessingEpisode>(
            "SELECT payload FROM sp_processing WHERE tenant_id=? AND facility_id=? AND code=?",
            code,
          ),
        listProcessing: async (page) =>
          list<ProcessingEpisode>(
            "SELECT payload FROM sp_processing WHERE tenant_id=? AND facility_id=? ORDER BY json_extract(payload,'$.createdAt') DESC,id LIMIT 51 OFFSET ?",
            page,
          ),
        insertProcessing: async (item) => {
          own(item);
          this.db
            .prepare("INSERT INTO sp_processing VALUES(?,?,?,?,?,?)")
            .run(
              ...args,
              item.id,
              item.code,
              item.version,
              JSON.stringify(item),
            );
        },
        updateProcessing: async (item, expected) => {
          own(item);
          if (item.version !== expected + 1)
            throw new SterileError("INVALID_REQUEST");
          const r = this.db
            .prepare(
              "UPDATE sp_processing SET version=?,payload=? WHERE tenant_id=? AND facility_id=? AND id=? AND version=?",
            )
            .run(
              item.version,
              JSON.stringify(item),
              ...args,
              item.id,
              expected,
            );
          if (r.changes !== 1) throw new SterileError("CONFLICT");
        },
        insertProcessingVersion: async (item) => {
          own(item);
          this.db
            .prepare("INSERT INTO sp_processing_versions VALUES(?,?,?,?,?)")
            .run(...args, item.id, item.version, JSON.stringify(item));
        },
        findProcessingVersion: async (id, version) =>
          read<ProcessingEpisode>(
            "SELECT payload FROM sp_processing_versions WHERE tenant_id=? AND facility_id=? AND id=? AND version=?",
            id,
            version,
          ),
        findProcessingHold: async (id) => {
          const row = this.db
            .prepare(
              "SELECT e.id AS episodeId,e.code AS episodeCode FROM sp_processing_holds h JOIN sp_processing e ON e.tenant_id=h.tenant_id AND e.facility_id=h.facility_id AND e.id=h.episode_id WHERE h.tenant_id=? AND h.facility_id=? AND h.instrument_id=?",
            )
            .get(...args, id) as
            { episodeId: string; episodeCode: string } | undefined;
          return row ?? null;
        },
        releaseProcessing: async (item) => {
          own(item);
          const r = this.db
            .prepare(
              "DELETE FROM sp_processing_holds WHERE tenant_id=? AND facility_id=? AND episode_id=?",
            )
            .run(...args, item.id);
          if (r.changes !== item.instruments.length)
            throw new SterileError("CONFLICT");
        },
        reserveProcessing: async (item) => {
          own(item);
          for (const i of item.instruments)
            this.db
              .prepare("INSERT INTO sp_processing_holds VALUES(?,?,?,?)")
              .run(...args, i.id, item.id);
        },
        findType: async (id) =>
          read<InstrumentType>(
            "SELECT payload FROM sp_types WHERE tenant_id=? AND facility_id=? AND id=?",
            id,
          ),
        findTypeByCode: async (code) =>
          read<InstrumentType>(
            "SELECT payload FROM sp_types WHERE tenant_id=? AND facility_id=? AND code=?",
            code,
          ),
        listTypes: async (page) =>
          list<InstrumentType>(
            "SELECT payload FROM sp_types WHERE tenant_id=? AND facility_id=? ORDER BY json_extract(payload,'$.createdAt') DESC,id LIMIT 51 OFFSET ?",
            page,
          ),
        insertType: async (item) => {
          own(item);
          this.db
            .prepare("INSERT INTO sp_types VALUES(?,?,?,?,?)")
            .run(...args, item.id, item.code, JSON.stringify(item));
        },
        findInstrument: async (id) =>
          read<Instrument>(
            "SELECT payload FROM sp_instruments WHERE tenant_id=? AND facility_id=? AND id=?",
            id,
          ),
        findInstrumentByCode: async (code) =>
          read<Instrument>(
            "SELECT payload FROM sp_instruments WHERE tenant_id=? AND facility_id=? AND code=?",
            code,
          ),
        listInstruments: async (page) =>
          list<Instrument>(
            "SELECT payload FROM sp_instruments WHERE tenant_id=? AND facility_id=? ORDER BY json_extract(payload,'$.createdAt') DESC,id LIMIT 51 OFFSET ?",
            page,
          ),
        insertInstrument: async (item) => {
          own(item);
          this.db
            .prepare("INSERT INTO sp_instruments VALUES(?,?,?,?,?,?,?)")
            .run(
              ...args,
              item.id,
              item.instrumentTypeId,
              item.code,
              item.version,
              JSON.stringify(item),
            );
        },
        updateInstrument: async (item, expected) => {
          own(item);
          if (item.version !== expected + 1)
            throw new SterileError("INVALID_REQUEST");
          const result = this.db
            .prepare(
              "UPDATE sp_instruments SET version=?,payload=? WHERE tenant_id=? AND facility_id=? AND id=? AND version=?",
            )
            .run(
              item.version,
              JSON.stringify(item),
              ...args,
              item.id,
              expected,
            );
          if (result.changes !== 1) throw new SterileError("CONFLICT");
        },
        appendAudit: async (event) => {
          own(event);
          if (event.actorId !== scope.actorId)
            throw new SterileError("INVALID_REQUEST");
          this.db
            .prepare("INSERT INTO sp_audit VALUES(?,?,?,?,?,?)")
            .run(
              ...args,
              event.id,
              event.entityId,
              event.requestId,
              JSON.stringify(event),
            );
        },
        listAudit: async (id, page) => {
          const rows = this.db
            .prepare(
              "SELECT payload FROM sp_audit WHERE tenant_id=? AND facility_id=? AND entity_id=? ORDER BY rowid DESC LIMIT 51 OFFSET ?",
            )
            .all(...args, id, (page - 1) * 50) as { payload: string }[];
          return rows.map(
            (row) => JSON.parse(row.payload) as SterileAuditEvent,
          );
        },
        findDefinition: async (id) =>
          read<TrayDefinition>(
            "SELECT payload FROM sp_definitions WHERE tenant_id=? AND facility_id=? AND id=?",
            id,
          ),
        findDefinitionByCode: async (code) =>
          read<TrayDefinition>(
            "SELECT payload FROM sp_definitions WHERE tenant_id=? AND facility_id=? AND code=?",
            code,
          ),
        listDefinitions: async (page) =>
          list<TrayDefinition>(
            "SELECT payload FROM sp_definitions WHERE tenant_id=? AND facility_id=? ORDER BY json_extract(payload,'$.createdAt') DESC,id LIMIT 51 OFFSET ?",
            page,
          ),
        insertDefinition: async (item) => {
          own(item);
          this.db
            .prepare("INSERT INTO sp_definitions VALUES(?,?,?,?,?,?)")
            .run(
              ...args,
              item.id,
              item.code,
              item.version,
              JSON.stringify(item),
            );
        },
        updateDefinition: async (item, expected) => {
          own(item);
          const result = this.db
            .prepare(
              "UPDATE sp_definitions SET version=?,payload=? WHERE tenant_id=? AND facility_id=? AND id=? AND version=?",
            )
            .run(
              item.version,
              JSON.stringify(item),
              ...args,
              item.id,
              expected,
            );
          if (result.changes !== 1) throw new SterileError("CONFLICT");
        },
        insertDefinitionRevision: async (item) => {
          own(item);
          this.db
            .prepare("INSERT INTO sp_definition_versions VALUES(?,?,?,?,?)")
            .run(...args, item.id, item.revision, JSON.stringify(item));
        },
        findDefinitionRevision: async (id, revision) =>
          read<TrayDefinition>(
            "SELECT payload FROM sp_definition_versions WHERE tenant_id=? AND facility_id=? AND id=? AND revision=?",
            id,
            revision,
          ),
        findAssembly: async (id) =>
          read<TrayAssembly>(
            "SELECT payload FROM sp_assemblies WHERE tenant_id=? AND facility_id=? AND id=?",
            id,
          ),
        findAssemblyByCode: async (code) =>
          read<TrayAssembly>(
            "SELECT payload FROM sp_assemblies WHERE tenant_id=? AND facility_id=? AND code=?",
            code,
          ),
        listAssemblies: async (page) =>
          list<TrayAssembly>(
            "SELECT payload FROM sp_assemblies WHERE tenant_id=? AND facility_id=? ORDER BY json_extract(payload,'$.createdAt') DESC,id LIMIT 51 OFFSET ?",
            page,
          ),
        insertAssembly: async (item) => {
          own(item);
          this.db
            .prepare("INSERT INTO sp_assemblies VALUES(?,?,?,?,?,?,?,?,?)")
            .run(
              ...args,
              item.id,
              item.code,
              item.definitionId,
              item.definitionRevision,
              item.version,
              item.state,
              JSON.stringify(item),
            );
        },
        updateAssembly: async (item, expected) => {
          own(item);
          const result = this.db
            .prepare(
              "UPDATE sp_assemblies SET version=?,state=?,payload=? WHERE tenant_id=? AND facility_id=? AND id=? AND version=?",
            )
            .run(
              item.version,
              item.state,
              JSON.stringify(item),
              ...args,
              item.id,
              expected,
            );
          if (result.changes !== 1) throw new SterileError("CONFLICT");
        },
        insertAssemblyVersion: async (item) => {
          own(item);
          this.db
            .prepare("INSERT INTO sp_assembly_versions VALUES(?,?,?,?,?)")
            .run(...args, item.id, item.version, JSON.stringify(item));
        },
        findAssemblyVersion: async (id, version) =>
          read<TrayAssembly>(
            "SELECT payload FROM sp_assembly_versions WHERE tenant_id=? AND facility_id=? AND id=? AND version=?",
            id,
            version,
          ),
        findActiveAssignment: async (id) => {
          const row = this.db
            .prepare(
              "SELECT a.id AS assemblyId,a.code AS assemblyCode FROM sp_assignments p JOIN sp_assemblies a ON a.tenant_id=p.tenant_id AND a.facility_id=p.facility_id AND a.id=p.assembly_id WHERE p.tenant_id=? AND p.facility_id=? AND p.instrument_id=?",
            )
            .get(...args, id) as
            { assemblyId: string; assemblyCode: string } | undefined;
          return row ?? null;
        },
        replaceAssignments: async (item) => {
          own(item);
          this.db
            .prepare(
              "DELETE FROM sp_assignments WHERE tenant_id=? AND facility_id=? AND assembly_id=?",
            )
            .run(...args, item.id);
          if (item.state !== "disassembled")
            for (const i of item.instruments)
              this.db
                .prepare("INSERT INTO sp_assignments VALUES(?,?,?,?)")
                .run(...args, i.id, item.id);
        },
        findReceipt: async (key) =>
          read<CommandReceipt>(
            "SELECT payload FROM sp_receipts WHERE tenant_id=? AND facility_id=? AND request_id=?",
            key,
          ),
        saveReceipt: async (key, value) => {
          this.db
            .prepare("INSERT INTO sp_receipts VALUES(?,?,?,?)")
            .run(...args, key, JSON.stringify(value));
        },
      };
      const result = await work(tx);
      this.db.exec("COMMIT");
      started = false;
      return result;
    } catch (error) {
      if (started) this.db.exec("ROLLBACK");
      throw error;
    } finally {
      release();
    }
  }
}

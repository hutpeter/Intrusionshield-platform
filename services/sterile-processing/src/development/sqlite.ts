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
CREATE TABLE IF NOT EXISTS sp_packages(tenant_id TEXT NOT NULL,facility_id TEXT NOT NULL,id TEXT NOT NULL,code TEXT NOT NULL,assembly_id TEXT NOT NULL,version INTEGER NOT NULL CHECK(version>0),payload TEXT NOT NULL CHECK(json_valid(payload)),PRIMARY KEY(tenant_id,facility_id,id),UNIQUE(tenant_id,facility_id,code),FOREIGN KEY(tenant_id,facility_id,assembly_id) REFERENCES sp_assemblies(tenant_id,facility_id,id));
CREATE TABLE IF NOT EXISTS sp_package_versions(tenant_id TEXT NOT NULL,facility_id TEXT NOT NULL,id TEXT NOT NULL,version INTEGER NOT NULL,payload TEXT NOT NULL CHECK(json_valid(payload)),PRIMARY KEY(tenant_id,facility_id,id,version),FOREIGN KEY(tenant_id,facility_id,id) REFERENCES sp_packages(tenant_id,facility_id,id));
CREATE TABLE IF NOT EXISTS sp_package_assignments(tenant_id TEXT NOT NULL,facility_id TEXT NOT NULL,assembly_id TEXT NOT NULL,package_id TEXT NOT NULL,PRIMARY KEY(tenant_id,facility_id,assembly_id),FOREIGN KEY(tenant_id,facility_id,assembly_id) REFERENCES sp_assemblies(tenant_id,facility_id,id),FOREIGN KEY(tenant_id,facility_id,package_id) REFERENCES sp_packages(tenant_id,facility_id,id));
CREATE TABLE IF NOT EXISTS sp_loads(tenant_id TEXT NOT NULL,facility_id TEXT NOT NULL,id TEXT NOT NULL,code TEXT NOT NULL,version INTEGER NOT NULL CHECK(version>0),state TEXT NOT NULL CHECK(state IN ('draft','running','awaiting_review','failed','aborted','cancelled')),payload TEXT NOT NULL CHECK(json_valid(payload)),PRIMARY KEY(tenant_id,facility_id,id),UNIQUE(tenant_id,facility_id,code));
CREATE TABLE IF NOT EXISTS sp_load_versions(tenant_id TEXT NOT NULL,facility_id TEXT NOT NULL,id TEXT NOT NULL,version INTEGER NOT NULL,payload TEXT NOT NULL CHECK(json_valid(payload)),PRIMARY KEY(tenant_id,facility_id,id,version),FOREIGN KEY(tenant_id,facility_id,id) REFERENCES sp_loads(tenant_id,facility_id,id));
CREATE TABLE IF NOT EXISTS sp_load_assignments(tenant_id TEXT NOT NULL,facility_id TEXT NOT NULL,package_id TEXT NOT NULL,load_id TEXT NOT NULL,PRIMARY KEY(tenant_id,facility_id,package_id),FOREIGN KEY(tenant_id,facility_id,package_id) REFERENCES sp_packages(tenant_id,facility_id,id),FOREIGN KEY(tenant_id,facility_id,load_id) REFERENCES sp_loads(tenant_id,facility_id,id));
CREATE TABLE IF NOT EXISTS sp_machine_cycles(tenant_id TEXT NOT NULL,facility_id TEXT NOT NULL,sterilizer TEXT NOT NULL,cycle_reference TEXT NOT NULL,load_id TEXT NOT NULL,PRIMARY KEY(tenant_id,facility_id,sterilizer,cycle_reference),UNIQUE(tenant_id,facility_id,load_id),FOREIGN KEY(tenant_id,facility_id,load_id) REFERENCES sp_loads(tenant_id,facility_id,id));
CREATE TABLE IF NOT EXISTS sp_reviews(tenant_id TEXT NOT NULL,facility_id TEXT NOT NULL,id TEXT NOT NULL,load_id TEXT NOT NULL,version INTEGER NOT NULL CHECK(version>0),state TEXT NOT NULL CHECK(state IN ('released','held','rejected')),payload TEXT NOT NULL CHECK(json_valid(payload)),PRIMARY KEY(tenant_id,facility_id,id),UNIQUE(tenant_id,facility_id,load_id),FOREIGN KEY(tenant_id,facility_id,load_id) REFERENCES sp_loads(tenant_id,facility_id,id));
CREATE TABLE IF NOT EXISTS sp_review_versions(tenant_id TEXT NOT NULL,facility_id TEXT NOT NULL,id TEXT NOT NULL,version INTEGER NOT NULL,payload TEXT NOT NULL CHECK(json_valid(payload)),PRIMARY KEY(tenant_id,facility_id,id,version),FOREIGN KEY(tenant_id,facility_id,id) REFERENCES sp_reviews(tenant_id,facility_id,id));
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
            "SELECT json_object('id',id,'tenantId',tenant_id,'facilityId',facility_id,'code',code,'assemblyId',assembly_id,'state',json_extract(payload,'$.state'),'version',version,'createdAt',json_extract(payload,'$.createdAt'),'trayName',json_extract(payload,'$.assemblySnapshot.definitionSnapshot.name'),'instrumentCount',json_array_length(payload,'$.assemblySnapshot.instruments')) AS payload FROM sp_packages WHERE tenant_id=? AND facility_id=? ORDER BY rowid DESC LIMIT 51 OFFSET ?",
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

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
  type SterileRepository,
  type SterileScope,
  type SterileTransaction,
  type Instrument,
  type InstrumentType,
  type SterileAuditEvent,
  type CommandReceipt,
  type TrayDefinition,
  type TrayAssembly,
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
        .exec(`PRAGMA foreign_keys=ON; PRAGMA busy_timeout=3000; PRAGMA journal_mode=WAL;
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
      this.db.exec("BEGIN IMMEDIATE");
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

import type { AssemblyInstrument } from "./tray-types.js";
export interface CleaningAttempt {
  registeredEquipment?: import("./equipment.js").ProcessingEquipment;
  controlledProcedure?: import("./procedures.js").ProcedureRevision;
  number: number;
  method: "manual" | "mechanical";
  procedure: string;
  procedureVersion: string;
  equipment: string;
  startedAt: string;
  startedBy: string;
  startedByPersonId?: string;
  finishedAt: string | null;
  finishedBy: string | null;
  finishedByPersonId?: string | null;
  outcome: "passed" | "failed" | null;
  evidence: string | null;
  note: string | null;
}
export interface InspectionItem {
  instrumentId: string;
  clean: boolean;
  dry: boolean;
  intact: boolean;
  functional: boolean;
  note: string;
}
export interface InspectionRecord {
  controlledProcedure?: import("./procedures.js").ProcedureRevision;
  number: number;
  cleaningAttempt: number;
  procedure: string;
  procedureVersion: string;
  evidence: string;
  items: InspectionItem[];
  outcome: "passed" | "failed";
  at: string;
  actorId: string;
  personId?: string;
}
export interface InspectInput {
  procedureRevisionId?: string;
  requestId: string;
  version: number;
  procedure: string;
  procedureVersion: string;
  evidence: string;
  items: InspectionItem[];
  confirmed: boolean;
}
export interface ProcessingEpisode {
  loanerSource?: { id: string; code: string; visit?: number };
  /** Entered or simulated internal identifiers, not proof of a physical device scan. */
  receivingScans?: { instrumentId: string; identifier: string }[];
  maintenanceSource?: {
    instrumentId: string;
    maintenanceId: string;
    procedure: string;
    procedureVersion: string;
  };
  supersededBy?: string;
  supersededReason?: string;
  recallSource?: {
    caseId: string;
    caseCode: string;
    clearanceVersion: number;
    clearances: {
      caseId: string;
      caseCode: string;
      version: number;
      instrumentIds: string[];
    }[];
    previousEpisodeIds: string[];
    packageIds: string[];
    receivingLocation: string;
  };
  recallBlocked?: boolean;
  returnSource?: {
    returnId: string;
    returnCode: string;
    packageId: string;
    packageCode: string;
    distributionId: string;
  };
  id: string;
  tenantId: string;
  facilityId: string;
  code: string;
  source: string;
  custodian: string;
  condition: string;
  discrepancies: string;
  instruments: AssemblyInstrument[];
  state:
    | "received"
    | "cleaning"
    | "cleaning_failed"
    | "awaiting_inspection"
    | "inspection_failed"
    | "ready_for_assembly"
    | "superseded";
  /** Optional for episodes saved before inspection was introduced. */
  inspections?: InspectionRecord[];
  attempts: CleaningAttempt[];
  version: number;
  createdAt: string;
  updatedAt: string;
  receivedBy: string;
}
export interface ReceiveInput {
  requestId: string;
  code: string;
  source: string;
  custodian: string;
  condition: string;
  discrepancies: string;
  instrumentIds: string[];
  confirmed: boolean;
}
export interface StartCleaningInput {
  equipmentId?: string;
  procedureRevisionId?: string;
  requestId: string;
  version: number;
  method: "manual" | "mechanical";
  procedure: string;
  procedureVersion: string;
  equipment: string;
  confirmed: boolean;
}
export interface FinishCleaningInput {
  requestId: string;
  version: number;
  outcome: "passed" | "failed";
  evidence: string;
  note: string;
  confirmed: boolean;
}

export interface ScannedReceiveInput extends ReceiveInput {
  scannedIdentifiers: string[];
}

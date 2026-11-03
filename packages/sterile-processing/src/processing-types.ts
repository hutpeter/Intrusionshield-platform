import type { AssemblyInstrument } from "./tray-types.js";
export interface CleaningAttempt {
  number: number;
  method: "manual" | "mechanical";
  procedure: string;
  procedureVersion: string;
  equipment: string;
  startedAt: string;
  startedBy: string;
  finishedAt: string | null;
  finishedBy: string | null;
  outcome: "passed" | "failed" | null;
  evidence: string | null;
  note: string | null;
}
export interface ProcessingEpisode {
  id: string;
  tenantId: string;
  facilityId: string;
  code: string;
  source: string;
  custodian: string;
  condition: string;
  discrepancies: string;
  instruments: AssemblyInstrument[];
  state: "received" | "cleaning" | "cleaning_failed" | "awaiting_inspection";
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

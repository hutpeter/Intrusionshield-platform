export interface TrayRequirement {
  instrumentTypeId: string;
  instrumentTypeCode: string;
  instrumentTypeName: string;
  quantity: number;
}
export interface TrayDefinition {
  id: string;
  tenantId: string;
  facilityId: string;
  code: string;
  name: string;
  requirements: TrayRequirement[];
  revision: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}
export interface AssemblyInstrument {
  id: string;
  code: string;
  instrumentTypeId: string;
  instrumentTypeName: string;
  serialNumber: string;
  instrumentVersion: number;
}
export interface TrayAssembly {
  id: string;
  tenantId: string;
  facilityId: string;
  code: string;
  definitionId: string;
  definitionRevision: number;
  definitionSnapshot: {
    code: string;
    name: string;
    requirements: TrayRequirement[];
  };
  instruments: AssemblyInstrument[];
  state: "draft" | "complete" | "disassembled";
  version: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  disassembledAt: string | null;
  disassemblyReason: string | null;
}
export interface AssemblyAssessment {
  complete: boolean;
  required: number;
  assigned: number;
  missing: number;
  excess: number;
  rows: {
    instrumentTypeId: string;
    name: string;
    required: number;
    assigned: number;
    missing: number;
    excess: number;
  }[];
}
export interface AssemblyView {
  assembly: TrayAssembly;
  assessment: AssemblyAssessment;
}
export interface TrayDefinitionInput {
  requestId: string;
  code: string;
  name: string;
  requirements: { instrumentTypeId: string; quantity: number }[];
}
export interface TrayDefinitionRevisionInput extends Omit<
  TrayDefinitionInput,
  "code"
> {
  version: number;
  reason: string;
}

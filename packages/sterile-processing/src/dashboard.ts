import {
  scopeOf,
  SterileRegistryBase,
  SterileError,
  type SterileScope,
} from "./foundation.js";
export const dashboardQueueIds = [
  "cleaning",
  "inspection",
  "assembly",
  "loading",
  "release",
  "returns",
  "recall",
  "maintenance",
  "packageAlerts",
  "consumableAlerts",
] as const;
export type DashboardQueueId = (typeof dashboardQueueIds)[number];
export type DashboardWorkspace =
  | "consumables"
  | "processing"
  | "trays"
  | "packaging"
  | "reviews"
  | "returns"
  | "recalls"
  | "instruments";
export const dashboardWorkspaces: Record<DashboardQueueId, DashboardWorkspace> =
  {
    cleaning: "processing",
    inspection: "processing",
    assembly: "trays",
    loading: "packaging",
    release: "reviews",
    returns: "returns",
    recall: "recalls",
    maintenance: "instruments",
    packageAlerts: "packaging",
    consumableAlerts: "consumables",
  };
export interface DashboardRow {
  consumableAlert?: import("./consumable-alerts.js").ConsumableAlert;
  id: string;
  code: string;
  state: string;
  updatedAt: string;
  units: number | null;
}
export interface DashboardQueue {
  id: DashboardQueueId;
  workspace: DashboardWorkspace;
  access: "allowed" | "restricted";
  total: number | null;
  items: DashboardRow[];
}
export interface OperationalDashboard {
  tenantId: string;
  facilityId: string;
  generatedAt: string;
  limit: 12;
  queues: DashboardQueue[];
}
export interface DashboardQueuePage {
  tenantId: string;
  facilityId: string;
  generatedAt: string;
  limit: 12;
  page: number;
  queue: DashboardQueue & { access: "allowed"; total: number };
}
export class DashboardRegistry extends SterileRegistryBase {
  async queue(
    scope: SterileScope,
    id: DashboardQueueId,
    page = 1,
  ): Promise<DashboardQueuePage> {
    const s = scopeOf(scope);
    if (
      !dashboardQueueIds.includes(id) ||
      !Number.isSafeInteger(page) ||
      page < 1 ||
      page > 99999
    )
      throw new SterileError("INVALID_REQUEST");
    return this.repository.transaction(s, async (tx) => ({
      tenantId: s.tenantId,
      facilityId: s.facilityId,
      generatedAt: new Date().toISOString(),
      limit: 12,
      page,
      queue: {
        id,
        workspace: dashboardWorkspaces[id],
        access: "allowed",
        ...(await tx.dashboardQueue(id, (page - 1) * 12)),
      },
    }));
  }
  async get(
    scope: SterileScope,
    allowed: readonly DashboardQueueId[],
  ): Promise<OperationalDashboard> {
    const s = scopeOf(scope);
    if (
      allowed.some((k) => !dashboardQueueIds.includes(k)) ||
      new Set(allowed).size !== allowed.length
    )
      throw new SterileError("INVALID_REQUEST");
    return this.repository.transaction(s, async (tx) => {
      const queues: DashboardQueue[] = [];
      for (const id of dashboardQueueIds) {
        if (!allowed.includes(id)) {
          queues.push({
            id,
            workspace: dashboardWorkspaces[id],
            access: "restricted",
            total: null,
            items: [],
          });
          continue;
        }
        const q = await tx.dashboardQueue(id);
        queues.push({
          id,
          workspace: dashboardWorkspaces[id],
          access: "allowed",
          ...q,
        });
      }
      return {
        tenantId: s.tenantId,
        facilityId: s.facilityId,
        generatedAt: new Date().toISOString(),
        limit: 12,
        queues,
      };
    });
  }
}

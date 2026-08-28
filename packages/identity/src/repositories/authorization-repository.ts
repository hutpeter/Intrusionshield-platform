import type { Permission } from "../types/authorization.js";

export interface AuthorizationRepository {
  getPermissions(identityId: string, tenantId: string): Promise<readonly Permission[]>;
}

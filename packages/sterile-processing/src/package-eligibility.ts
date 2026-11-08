import { SterileError, type SterileTransaction } from "./foundation.js";
import type { SterilePackage } from "./packaging-types.js";
import { shelfLifeState } from "./package-safety.js";
export async function assertPackageUsable(
  tx: SterileTransaction,
  p: SterilePackage,
  at = new Date().toISOString(),
) {
  if (await tx.findPackageIntegrity(p.id))
    throw new SterileError("PACKAGE_INTEGRITY_BLOCKED");
  if (shelfLifeState(p.shelfLife, Date.parse(at)) === "expired")
    throw new SterileError("PACKAGE_EXPIRED");
}

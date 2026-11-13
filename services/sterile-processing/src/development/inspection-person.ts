import type {
  SterileScope,
  SterileRepository,
  SterileTransaction,
} from "@intrusionshield/sterile-processing";
import { assertSterilePreviewEnvironment } from "./guard.js";
/** Matches the demo reviewer, explicitly granted inspection separately from cleaning. */
export function fictionalInspector(scope: SterileScope): SterileScope {
  assertSterilePreviewEnvironment();
  const id = "a7f4b902-0101-4be1-8001-000000000005";
  return { ...scope, actorId: id, personId: id };
}
export function fictionalBatch<T>(
  repository: SterileRepository,
  scope: SterileScope,
  work: (tx: SterileTransaction) => Promise<T>,
): Promise<T> {
  assertSterilePreviewEnvironment();
  const preview = repository as SterileRepository & {
    fictionalTransaction?: (
      s: SterileScope,
      w: (tx: SterileTransaction) => Promise<T>,
    ) => Promise<T>;
  };
  return preview.fictionalTransaction
    ? preview.fictionalTransaction(scope, work)
    : repository.transaction(scope, work);
}

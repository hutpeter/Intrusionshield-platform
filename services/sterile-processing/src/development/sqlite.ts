import { LocalSqliteSterileRepository } from "../persistence/sqlite.js";
import type {
  SterileScope,
  SterileTransaction,
} from "@intrusionshield/sterile-processing";
import { assertSterilePreviewEnvironment } from "./guard.js";
/** The existing dummy-data entry point retains its development/preview gate. */
export class PreviewSqliteRepository extends LocalSqliteSterileRepository {
  constructor(filename: string) {
    super(filename, "preview");
  }
  /** Explicit fictional batch only; preserves atomic rollback and each simulated actor's audit identity. */
  fictionalTransaction<T>(
    scope: SterileScope,
    work: (tx: SterileTransaction) => Promise<T>,
  ): Promise<T> {
    assertSterilePreviewEnvironment();
    return this.transactionForActors(scope, work, [
      scope.actorId,
      "a7f4b902-0101-4be1-8001-000000000005",
    ]);
  }
}

import { LocalSqliteSterileRepository } from "../persistence/sqlite.js";
/** The existing dummy-data entry point retains its development/preview gate. */
export class PreviewSqliteRepository extends LocalSqliteSterileRepository {
  constructor(filename: string) {
    super(filename, "preview");
  }
}

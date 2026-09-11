/**
 * Normalizes UUID values crossing the database/infrastructure boundary
 * into the canonical lowercase representation used by the HIS domain.
 *
 * SQL Server uniqueidentifier values may be returned by the database
 * provider as uppercase hexadecimal strings. UUIDs are case-insensitive,
 * but keeping a single canonical representation prevents unnecessary
 * equality failures throughout the application.
 */
export function normalizeUuid(value: string): string {
  return value.toLowerCase();
}

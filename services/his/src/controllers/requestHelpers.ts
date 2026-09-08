export function bodyAsRecord(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new Error("request body must be a JSON object");
  }
  return body as Record<string, unknown>;
}

export function dateFromBody(value: unknown, fallback: Date): Date {
  if (value === undefined || value === null || value === "") return fallback;
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new Error("invalid date value");
  return date;
}

export function optionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  return String(value);
}

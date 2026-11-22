/** Supported relational database engines. */
export type DatabaseEngine = "sqlserver" | "postgresql";

/**
 * Database-specific SQL syntax. Application repositories should request
 * dialect operations rather than embed vendor-specific pagination or quoting.
 */
export interface DatabaseDialect {
    readonly engine: DatabaseEngine;
    quoteIdentifier(identifier: string): string;
    parameter(index: number): string;
    paginate(limit: number, offset?: number): string;
}

function requireNonNegativeInteger(value: number, name: string): void {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new RangeError(`${name} must be a non-negative safe integer`);
    }
}

export class SqlServerDialect implements DatabaseDialect {
    readonly engine = "sqlserver" as const;
    quoteIdentifier(identifier: string): string {
        return `[${identifier.replace(/]/g, "]]")}]`;
    }
    parameter(index: number): string {
        requireNonNegativeInteger(index, "index");
        return `@p${index}`;
    }
    paginate(limit: number, offset = 0): string {
        requireNonNegativeInteger(limit, "limit");
        requireNonNegativeInteger(offset, "offset");
        return `OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY`;
    }
}

export class PostgreSqlDialect implements DatabaseDialect {
    readonly engine = "postgresql" as const;
    quoteIdentifier(identifier: string): string {
        return `"${identifier.replace(/"/g, '""')}"`;
    }
    parameter(index: number): string {
        if (!Number.isSafeInteger(index) || index < 1) {
            throw new RangeError("PostgreSQL parameter index must be a positive safe integer");
        }
        return `$${index}`;
    }
    paginate(limit: number, offset = 0): string {
        requireNonNegativeInteger(limit, "limit");
        requireNonNegativeInteger(offset, "offset");
        return `LIMIT ${limit} OFFSET ${offset}`;
    }
}

export function createDatabaseDialect(engine: DatabaseEngine): DatabaseDialect {
    switch (engine) {
        case "sqlserver": return new SqlServerDialect();
        case "postgresql": return new PostgreSqlDialect();
        default: {
            throw new Error(`Unsupported database engine: ${String(engine)}`);
        }
    }
}

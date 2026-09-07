import type { SqlCommand } from "./SqlCommand.js";
import { QueryParameter } from "./QueryParameter.js";
import type { QueryOperator } from "./QueryOperator.js";

/**
 * Provider-neutral SELECT query builder.
 *
 * The builder generates SQL text and platform SqlParameter objects.
 * It has no dependency on SQL Server, mssql, or another database
 * implementation.
 */
export class SelectQueryBuilder {
    private readonly parameterBuilder = new QueryParameter();

    private readonly columns: string[] = [];

    private readonly conditions: string[] = [];

    private readonly orderings: string[] = [];

    private tableName?: string;

    private limitValue?: number;

    private offsetValue?: number;

    /**
     * Specifies the table to query.
     */
    public from(table: string): this {
        this.tableName = table;

        return this;
    }

    /**
     * Specifies the columns to return.
     */
    public select(...columns: string[]): this {
        this.columns.push(...columns);

        return this;
    }

    /**
     * Adds a WHERE condition.
     */
    public where(
        column: string,
        operator: QueryOperator,
        value?: unknown
    ): this {
        if (
            operator === "IS NULL" ||
            operator === "IS NOT NULL"
        ) {
            this.conditions.push(
                `${column} ${operator}`
            );

            return this;
        }

        if (operator === "IN" || operator === "NOT IN") {
            if (!Array.isArray(value) || value.length === 0) {
                throw new Error(
                    `${operator} requires a non-empty array.`
                );
            }

            const placeholders = value.map(
                item => this.parameterBuilder.add(item)
            );

            this.conditions.push(
                `${column} ${operator} (${placeholders.join(", ")})`
            );

            return this;
        }

        const placeholder =
            this.parameterBuilder.add(value);

        this.conditions.push(
            `${column} ${operator} ${placeholder}`
        );

        return this;
    }

    /**
     * Adds an ORDER BY expression.
     */
    public orderBy(
        column: string,
        direction: "ASC" | "DESC" = "ASC"
    ): this {
        this.orderings.push(
            `${column} ${direction}`
        );

        return this;
    }

    /**
     * Limits the number of rows returned.
     */
    public limit(value: number): this {
        this.validateNonNegativeInteger(
            value,
            "limit"
        );

        this.limitValue = value;

        return this;
    }

    /**
     * Specifies the number of rows to skip.
     */
    public offset(value: number): this {
        this.validateNonNegativeInteger(
            value,
            "offset"
        );

        this.offsetValue = value;

        return this;
    }

    /**
     * Builds the SQL command.
     */
    public build(): SqlCommand {
        if (!this.tableName) {
            throw new Error(
                "A table must be specified before building a SELECT query."
            );
        }

        const selectedColumns =
            this.columns.length > 0
                ? this.columns.join(", ")
                : "*";

        let sql =
            `SELECT ${selectedColumns} FROM ${this.tableName}`;

        if (this.conditions.length > 0) {
            sql +=
                ` WHERE ${this.conditions.join(" AND ")}`;
        }

        if (this.orderings.length > 0) {
            sql +=
                ` ORDER BY ${this.orderings.join(", ")}`;
        }

        if (this.limitValue !== undefined) {
            sql += ` OFFSET ${this.offsetValue ?? 0} ROWS`;
            sql += ` FETCH NEXT ${this.limitValue} ROWS ONLY`;
        } else if (this.offsetValue !== undefined) {
            sql += ` OFFSET ${this.offsetValue} ROWS`;
        }

        return {
            sql,
            parameters:
                this.parameterBuilder.getParameters()
        };
    }

    private validateNonNegativeInteger(
        value: number,
        name: string
    ): void {
        if (
            !Number.isInteger(value) ||
            value < 0
        ) {
            throw new Error(
                `${name} must be a non-negative integer.`
            );
        }
    }
}
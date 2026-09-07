/**
 * Operators supported by the platform query abstraction.
 */
export const QUERY_OPERATORS = {
    EQUALS: "=",
    NOT_EQUALS: "<>",
    GREATER_THAN: ">",
    GREATER_THAN_OR_EQUAL: ">=",
    LESS_THAN: "<",
    LESS_THAN_OR_EQUAL: "<=",
    LIKE: "LIKE",
    NOT_LIKE: "NOT LIKE",
    IN: "IN",
    NOT_IN: "NOT IN",
    IS_NULL: "IS NULL",
    IS_NOT_NULL: "IS NOT NULL"
} as const;

export type QueryOperator =
    typeof QUERY_OPERATORS[keyof typeof QUERY_OPERATORS];
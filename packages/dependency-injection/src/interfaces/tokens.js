/**
 * IntrusionShield Dependency Injection Tokens
 *
 * Using symbols prevents naming collisions
 * between services.
 */

export const TOKENS = {
    CONFIG: Symbol.for("CONFIG"),

    DATABASE: Symbol.for("DATABASE"),

    LOGGER: Symbol.for("LOGGER"),

    EVENT_BUS: Symbol.for("EVENT_BUS"),

    AUTH_SERVICE: Symbol.for("AUTH_SERVICE"),

    USER_SERVICE: Symbol.for("USER_SERVICE"),

    TENANT_SERVICE: Symbol.for("TENANT_SERVICE"),

    WORKFLOW_SERVICE: Symbol.for("WORKFLOW_SERVICE"),

    AI_SERVICE: Symbol.for("AI_SERVICE"),

    COMPLIANCE_SERVICE: Symbol.for("COMPLIANCE_SERVICE"),

    ANALYTICS_SERVICE: Symbol.for("ANALYTICS_SERVICE")
};
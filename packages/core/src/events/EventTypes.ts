/**
 * IntrusionShield domain event types.
 *
 * These events represent events exchanged between
 * platform modules and services.
 */
export const EVENT_TYPES = {
    /**
     * Identity events.
     */
    USER_CREATED: "identity.user.created",
    USER_UPDATED: "identity.user.updated",
    USER_DISABLED: "identity.user.disabled",

    /**
     * Tenant events.
     */
    TENANT_CREATED: "tenant.created",
    TENANT_SUSPENDED: "tenant.suspended",

    /**
     * Workflow events.
     */
    WORKFLOW_CREATED: "workflow.created",
    WORKFLOW_STARTED: "workflow.started",
    WORKFLOW_COMPLETED: "workflow.completed",

    /**
     * AI events.
     */
    AI_REQUEST_RECEIVED: "ai.request.received",
    AI_ANALYSIS_COMPLETED: "ai.analysis.completed",

    /**
     * Security events.
     */
    SECURITY_FINDING_CREATED:
        "security.finding.created",

    SECURITY_ALERT_RAISED:
        "security.alert.raised",

    /**
     * Compliance events.
     */
    CONTROL_ASSESSMENT_COMPLETED:
        "compliance.control.completed"
} as const;

export type DomainEventType =
    typeof EVENT_TYPES[keyof typeof EVENT_TYPES];

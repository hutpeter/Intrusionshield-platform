/**
 * IntrusionShield domain event types.
 *
 * These events represent events exchanged between
 * platform modules and services.
 */
export const EVENT_TYPES = {
    USER_CREATED: "identity.user.created",
    USER_UPDATED: "identity.user.updated",
    USER_DISABLED: "identity.user.disabled",

    TENANT_CREATED: "tenant.created",
    TENANT_SUSPENDED: "tenant.suspended",

    WORKFLOW_CREATED: "workflow.created",
    WORKFLOW_STARTED: "workflow.started",
    WORKFLOW_COMPLETED: "workflow.completed",

    AI_REQUEST_RECEIVED: "ai.request.received",
    AI_ANALYSIS_COMPLETED: "ai.analysis.completed",

    SECURITY_FINDING_CREATED: "security.finding.created",
    SECURITY_ALERT_RAISED: "security.alert.raised",

    CONTROL_ASSESSMENT_COMPLETED: "compliance.control.completed"
} as const;

export type DomainEventType =
    typeof EVENT_TYPES[keyof typeof EVENT_TYPES];

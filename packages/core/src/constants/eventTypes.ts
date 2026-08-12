/**
 * IntrusionShield application-level event identifiers.
 */
export const APPLICATION_EVENT_TYPES = {
    USER_CREATED: "USER_CREATED",
    USER_UPDATED: "USER_UPDATED",
    PASSWORD_CHANGED: "PASSWORD_CHANGED",
    LOGIN_SUCCESS: "LOGIN_SUCCESS",
    LOGIN_FAILURE: "LOGIN_FAILURE",
    CONTROL_FAILED: "CONTROL_FAILED",
    EVIDENCE_CREATED: "EVIDENCE_CREATED"
} as const;

export type ApplicationEventType =
    typeof APPLICATION_EVENT_TYPES[
        keyof typeof APPLICATION_EVENT_TYPES
    ];

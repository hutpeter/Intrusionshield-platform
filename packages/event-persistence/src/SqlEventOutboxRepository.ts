
import type { IDatabaseProvider } from "@intrusionshield/database";
import type { IEvent } from "@intrusionshield/events";

const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function serializePayload(value: unknown): string {
    const ancestors = new Set<object>();

    function validate(
        current: unknown,
        path: string
    ): void {
        if (
            current === null ||
            typeof current === "string" ||
            typeof current === "boolean"
        ) {
            return;
        }

        if (typeof current === "number") {
            if (!Number.isFinite(current)) {
                throw new Error(
                    `Event payload contains a non-finite number at ${path}.`
                );
            }
            return;
        }

        if (typeof current !== "object") {
            throw new Error(
                `Event payload must be JSON serializable: unsupported value at ${path}.`
            );
        }

        if (ancestors.has(current)) {
            throw new Error(
                `Event payload contains a circular reference at ${path}.`
            );
        }

        if (
            !Array.isArray(current) &&
            Object.getPrototypeOf(current) !== Object.prototype &&
            Object.getPrototypeOf(current) !== null
        ) {
            throw new Error(
                `Event payload contains an unsupported object at ${path}.`
            );
        }

        ancestors.add(current);

        try {
            if (Array.isArray(current)) {
                for (let index = 0; index < current.length; index++) {
                    if (!Object.prototype.hasOwnProperty.call(current, index)) {
                        throw new Error(
                            `Event payload contains a sparse array at ${path}.`
                        );
                    }

                    validate(current[index], `${path}[${index}]`);
                }
            } else {
                for (const key of Reflect.ownKeys(current)) {
                    if (typeof key === "symbol") {
                        throw new Error(
                            `Event payload contains a symbol property at ${path}.`
                        );
                    }

                    const descriptor =
                        Object.getOwnPropertyDescriptor(current, key);

                    if (!descriptor || !("value" in descriptor)) {
                        throw new Error(
                            `Event payload contains an accessor at ${path}.${key}.`
                        );
                    }

                    if (!descriptor.enumerable) {
                        throw new Error(
                            `Event payload contains a non-enumerable property at ${path}.${key}.`
                        );
                    }

                    validate(descriptor.value, `${path}.${key}`);
                }
            }
        } finally {
            ancestors.delete(current);
        }
    }

    validate(value, "$");

    const serialized = JSON.stringify(value);

    if (typeof serialized !== "string") {
        throw new Error("Event payload must be JSON serializable.");
    }

    return serialized;
}

/**
 * Persists Ruby events in the SQL Server transactional outbox.
 *
 * The caller owns the transaction. During tenant provisioning,
 * this repository must use the same database provider instance
 * as the tenant and configuration repositories.
 *
 * This repository does not publish events or manage transactions.
 */
export class SqlEventOutboxRepository {
    public constructor(
        private readonly database: IDatabaseProvider
    ) {}

    public async append<TPayload>(
        event: IEvent<TPayload>
    ): Promise<void> {
        if (
            typeof event.id !== "string" ||
            !UUID_PATTERN.test(event.id)
        ) {
            throw new Error("Event ID must be a valid UUID.");
        }

        if (
            typeof event.type !== "string" ||
            event.type.trim().length === 0 ||
            event.type.length > 200
        ) {
            throw new Error(
                "Event type must contain 1-200 characters."
            );
        }

        if (
            !(event.timestamp instanceof Date) ||
            !Number.isFinite(event.timestamp.getTime())
        ) {
            throw new Error(
                "Event timestamp must be a valid Date."
            );
        }

        if (
            event.tenantId !== undefined &&
            !UUID_PATTERN.test(event.tenantId)
        ) {
            throw new Error(
                "Event tenant ID must be a valid UUID."
            );
        }

        const payload = serializePayload(event.payload);

        const metadata = serializePayload({
            version: event.version,
            ...(event.userId !== undefined
                ? { userId: event.userId }
                : {}),
            ...(event.correlationId !== undefined
                ? { correlationId: event.correlationId }
                : {}),
            ...(event.causationId !== undefined
                ? { causationId: event.causationId }
                : {}),
            ...(event.source !== undefined
                ? { source: event.source }
                : {})
        });

        await this.database.execute(
            `INSERT INTO [Platform].[EventOutbox]
                (
                    Id,
                    TenantId,
                    EventType,
                    Payload,
                    Metadata,
                    Status,
                    AttemptCount,
                    CreatedAt,
                    NextAttemptAt
                )
             VALUES
                (
                    @id,
                    @tenantId,
                    @eventType,
                    @payload,
                    @metadata,
                    N'PENDING',
                    0,
                    @createdAt,
                    SYSUTCDATETIME()
                )`,
            [
                { name: "id", value: event.id },
                {
                    name: "tenantId",
                    value: event.tenantId ?? null
                },
                { name: "eventType", value: event.type },
                { name: "payload", value: payload },
                { name: "metadata", value: metadata },
                {
                    name: "createdAt",
                    value: event.timestamp
                }
            ]
        );
    }
}

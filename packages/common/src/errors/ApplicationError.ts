import { ErrorCode } from "./ErrorCode.js";
import { ErrorSeverity } from "./ErrorSeverity.js";

export class ApplicationError extends Error {
    public readonly code: ErrorCode;

    public readonly severity: ErrorSeverity;

    public readonly metadata?: Readonly<Record<string, unknown>>;

    public constructor(
        code: ErrorCode,
        message: string,
        severity: ErrorSeverity = ErrorSeverity.Error,
        metadata?: Record<string, unknown>
    ) {
        super(message);

        this.name = new.target.name;
        this.code = code;
        this.severity = severity;
        this.metadata = metadata
            ? Object.freeze({ ...metadata })
            : undefined;

        Object.setPrototypeOf(this, new.target.prototype);
    }
}

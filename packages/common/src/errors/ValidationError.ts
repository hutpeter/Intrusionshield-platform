import { ApplicationError } from "./ApplicationError.js";
import { ErrorCode } from "./ErrorCode.js";
import { ErrorSeverity } from "./ErrorSeverity.js";

export class ValidationError extends ApplicationError {
    public constructor(
        message: string,
        code: ErrorCode = ErrorCode.VALIDATION_ERROR,
        metadata?: Record<string, unknown>
    ) {
        super(
            code,
            message,
            ErrorSeverity.Warning,
            metadata
        );
    }
}

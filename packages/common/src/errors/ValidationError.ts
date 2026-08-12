import { ApplicationError } from "./ApplicationError";
import { ErrorCode } from "./ErrorCode";
import { ErrorSeverity } from "./ErrorSeverity";

export class ValidationError extends ApplicationError {

    constructor(

        code: ErrorCode,

        message: string,

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
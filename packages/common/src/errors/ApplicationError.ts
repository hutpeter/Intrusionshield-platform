import { ErrorCode } from "./ErrorCode";
import { ErrorSeverity } from "./ErrorSeverity";

export class ApplicationError extends Error {

    constructor(

        public readonly code: ErrorCode,

        message: string,

        public readonly severity: ErrorSeverity = ErrorSeverity.Error,

        public readonly metadata?: Record<string, unknown>

    ) {

        super(message);

        this.name = this.constructor.name;

    }

}
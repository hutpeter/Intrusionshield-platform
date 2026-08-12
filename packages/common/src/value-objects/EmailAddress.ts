import { Guard } from "../guards";

import { ValidationError } from "../errors";

import { ErrorCode } from "../errors";

import { ValueObject } from "./ValueObject";

export class EmailAddress
    extends ValueObject<string> {

    private constructor(
        email: string
    ) {

        super(email);

    }

    public static create(
        value: string
    ): EmailAddress {

        const validation =
            Guard
                .against(value, "email")
                .notNull()
                .notEmpty()
                .maxLength(254)
                .email()
                .validate();

        if (!validation.succeeded) {

            throw validation.error!;

        }

        return new EmailAddress(
            value.toLowerCase()
        );

    }

}
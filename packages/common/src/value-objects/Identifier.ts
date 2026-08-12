import { randomUUID } from "crypto";

import { ValueObject } from "./ValueObject";

export class Identifier<T>
    extends ValueObject<string> {

    private constructor(
        value: string
    ) {

        super(value);

    }

    public static create<T>(
        value?: string
    ): Identifier<T> {

        return new Identifier<T>(
            value ?? randomUUID()
        );

    }

    public toString(): string {

        return this.value;

    }

}
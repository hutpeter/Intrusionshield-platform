import { randomUUID } from "node:crypto";
import { ValueObject } from "./ValueObject.js";

export class Identifier<T> extends ValueObject<string> {
    protected constructor(value: string) {
        super(value);
    }

    public static create<T>(value?: string): Identifier<T> {
        return new Identifier<T>(value ?? randomUUID());
    }

    public toString(): string {
        return this.value;
    }
}

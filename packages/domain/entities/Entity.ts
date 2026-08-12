import { Identifier } from "@intrusionshield/common";

export abstract class Entity<TId extends Identifier<unknown>> {

    protected constructor(
        public readonly id: TId
    ) {}

    public equals(object?: Entity<TId>): boolean {

        if (!object) {
            return false;
        }

        return this.id.toString() === object.id.toString();

    }

}
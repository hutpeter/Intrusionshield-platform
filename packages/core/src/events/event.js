/**
 * IntrusionShield Domain Event
 *
 * All platform events inherit this structure.
 */

export class Event {

    constructor(type, payload = {}) {

        this.id =
            crypto.randomUUID();

        this.type = type;

        this.payload = payload;

        this.timestamp =
            new Date();

    }

}
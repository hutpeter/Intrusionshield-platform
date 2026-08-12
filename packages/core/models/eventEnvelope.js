class EventEnvelope {


    constructor(data={}){


        this.eventId =
            data.eventId;


        this.type =
            data.type;


        this.source =
            data.source;


        this.version =
            data.version || 1;


        this.tenantId =
            data.tenantId;


        this.correlationId =
            data.correlationId;


        this.occurredAt =
            data.occurredAt ||
            new Date();


        this.actor =
            data.actor;


        this.payload =
            data.payload || {};

    }


}


module.exports = EventEnvelope;
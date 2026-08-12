import { Container } from "./container.js";


class ServiceRegistry {


    private container =
        new Container();



    async initialize(){


        console.log(
            "Initializing dependency container"
        );


        /*
            Future registrations:

            Database
            Authentication Service
            Workflow Engine
            Compliance Engine
            AI Hub
            Event Bus
            Tenant Resolver
        */


        return true;

    }



    register(
        name:string,
        service:any
    ){

        this.container.register(
            name,
            service
        );

    }



    get<T>(
        name:string
    ):T{

        return this.container.resolve<T>(
            name
        );

    }


}


export const serviceRegistry =
    new ServiceRegistry();
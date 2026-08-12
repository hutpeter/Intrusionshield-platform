/**
 * IntrusionShield Dependency Injection Container
 *
 * Provides:
 * - dependency registration
 * - dependency resolution
 * - singleton lifecycle management
 */


export interface Registration {

    factory:
        (container: Container) => unknown;


    singleton:
        boolean;


    instance?:
        unknown;

}




export class Container {


    private registry:
        Map<symbol, Registration>;



    constructor() {

        this.registry =
            new Map();

    }





    register(

        token: symbol,

        factory:
            (container: Container) => unknown,

        options:
        {
            singleton?: boolean;

        } = {}

    ): void {


        if(this.registry.has(token)) {


            throw new Error(

                `Dependency already registered: ${
                    String(token.description)
                }`

            );

        }




        this.registry.set(

            token,

            {

                factory,

                singleton:
                    options.singleton ?? true

            }

        );


    }







    resolve<T>(

        token: symbol

    ): T {


        const registration =
            this.registry.get(token);




        if(!registration) {


            throw new Error(

                `Dependency not registered: ${
                    String(token.description)
                }`

            );

        }






        if(
            registration.singleton
            &&
            registration.instance
        ) {


            return registration.instance as T;

        }







        const instance =
            registration.factory(this);






        if(registration.singleton) {


            registration.instance =
                instance;


        }






        return instance as T;

    }







    has(

        token: symbol

    ): boolean {


        return this.registry.has(token);


    }







    clear(): void {


        this.registry.clear();


    }


}
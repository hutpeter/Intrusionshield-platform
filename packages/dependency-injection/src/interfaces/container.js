/**
 * Simple Dependency Injection Container
 *
 * Responsibilities:
 * - Register dependencies
 * - Resolve dependencies
 * - Manage singleton lifecycle
 */

class Container {

    constructor() {
        this.registry = new Map();
    }


    register(token, factory, options = {}) {

        if (this.registry.has(token)) {
            throw new Error(
                `Dependency already registered: ${String(token.description)}`
            );
        }


        this.registry.set(token, {

            factory,

            singleton:
                options.singleton ?? true,

            instance: null

        });
    }



    resolve(token) {

        const dependency = this.registry.get(token);


        if (!dependency) {

            throw new Error(
                `Dependency not registered: ${String(token.description)}`
            );
        }



        if (dependency.singleton) {

            if (!dependency.instance) {

                dependency.instance =
                    dependency.factory(this);

            }


            return dependency.instance;
        }



        return dependency.factory(this);
    }



    has(token) {

        return this.registry.has(token);

    }



    clear() {

        this.registry.clear();

    }

}


export default Container;
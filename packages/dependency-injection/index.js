import Container from "./container.js";
import { registerCoreServices } from "./serviceRegistry.js";


export function createContainer() {

    const container = new Container();


    registerCoreServices(container);


    return container;

}



export {
    Container
};
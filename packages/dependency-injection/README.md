# @intrusionshield/dependency-injection


Enterprise dependency injection framework
for the IntrusionShield Platform.


## Purpose

Provides centralized service registration
and dependency resolution.


## Responsibilities

- Service lifecycle management
- Dependency abstraction
- Platform service wiring
- Test mocking support


## Usage


```typescript

import {

 Container,
 registerServices

}

from "@intrusionshield/dependency-injection";



const container =
    new Container();



registerServices(
    container
);



const logger =
    container.resolve(
        TOKENS.LOGGER
    );


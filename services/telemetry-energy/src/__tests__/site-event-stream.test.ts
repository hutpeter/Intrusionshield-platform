import {
    describe,
    expect,
    jest,
    test
} from "@jest/globals";
import { EventEmitter } from "node:events";
import type {
    Request,
    Response
} from "express";
import {
    SiteEventStream
} from "../application/SiteEventStream.js";

class FakeResponse extends EventEmitter {
    public writableEnded = false;
    public readonly chunks: string[] = [];
    public status = jest.fn(() => this);
    public setHeader = jest.fn(() => this);
    public flushHeaders = jest.fn();
    public write = jest.fn((chunk: string) => {
        this.chunks.push(chunk);
        return true;
    });
}

describe("SiteEventStream", () => {
    test("publishes only to the matching tenant and site", () => {
        const stream = new SiteEventStream();
        const requestA = new EventEmitter();
        const requestB = new EventEmitter();
        const responseA = new FakeResponse();
        const responseB = new FakeResponse();

        stream.connect({
            tenantId: "tenant-a",
            siteId: "site-a",
            request: requestA as unknown as Request,
            response: responseA as unknown as Response
        });
        stream.connect({
            tenantId: "tenant-b",
            siteId: "site-b",
            request: requestB as unknown as Request,
            response: responseB as unknown as Response
        });

        responseA.chunks.length = 0;
        responseB.chunks.length = 0;

        stream.publish({
            tenantId: "tenant-a",
            siteId: "site-a",
            type: "energy-flow",
            data: { id: "flow-1" }
        });

        expect(responseA.chunks).toHaveLength(1);
        expect(responseA.chunks[0]).toContain("event: energy-flow");
        expect(responseA.chunks[0]).toContain('"id":"flow-1"');
        expect(responseB.chunks).toHaveLength(0);

        requestA.emit("close");
        requestB.emit("close");
        expect(stream.subscriberCount()).toBe(0);
    });

    test("removes a subscriber when the request closes", () => {
        const stream = new SiteEventStream();
        const request = new EventEmitter();
        const response = new FakeResponse();

        stream.connect({
            tenantId: "tenant-a",
            siteId: "site-a",
            request: request as unknown as Request,
            response: response as unknown as Response
        });

        expect(stream.subscriberCount()).toBe(1);
        request.emit("close");
        expect(stream.subscriberCount()).toBe(0);
    });
});

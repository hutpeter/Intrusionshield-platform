
import {
    beforeEach,
    describe,
    expect,
    jest,
    test
} from "@jest/globals";

const connectMock = jest.fn<() => Promise<void>>();
const closeMock = jest.fn<() => Promise<void>>();

jest.unstable_mockModule("mssql", () => ({
    default: {
        ConnectionPool: class {
            connected = false;

            constructor(_options: unknown) {}

            async connect(): Promise<void> {
                await connectMock();
                this.connected = true;
            }

            async close(): Promise<void> {
                await closeMock();
                this.connected = false;
            }
        }
    }
}));

const { SqlServerProvider } = await import(
    "./SqlServerProvider.js"
);

const options = {
    server: "localhost",
    port: 1433,
    database: "Ruby_Mock_Test",
    user: "test",
    password: "test",
    encrypt: false,
    trustServerCertificate: true
};

describe("SqlServerProvider connection cleanup", () => {
    beforeEach(() => {
        connectMock.mockReset();
        closeMock.mockReset();
    });

    test("closes temporary pool when connection fails", async () => {
        const connectionError = new Error(
            "Simulated connection failure"
        );

        connectMock.mockRejectedValue(connectionError);
        closeMock.mockResolvedValue(undefined);

        const provider = new SqlServerProvider(options);

        await expect(
            provider.connect()
        ).rejects.toBe(connectionError);

        expect(connectMock).toHaveBeenCalledTimes(1);
        expect(closeMock).toHaveBeenCalledTimes(1);
        expect(provider.isConnected()).toBe(false);
    });

    test("preserves connection and cleanup errors", async () => {
        const connectionError = new Error(
            "Simulated connection failure"
        );

        const cleanupError = new Error(
            "Simulated pool cleanup failure"
        );

        connectMock.mockRejectedValue(connectionError);
        closeMock.mockRejectedValue(cleanupError);

        const provider = new SqlServerProvider(options);

        await expect(
            provider.connect()
        ).rejects.toMatchObject({
            name: "AggregateError",
            errors: [
                connectionError,
                cleanupError
            ]
        });

        expect(connectMock).toHaveBeenCalledTimes(1);
        expect(closeMock).toHaveBeenCalledTimes(1);
        expect(provider.isConnected()).toBe(false);
    });
    
test("successful connection disconnects cleanly", async () => {
    connectMock.mockResolvedValue(undefined);
    closeMock.mockResolvedValue(undefined);

    const provider = new SqlServerProvider(options);

    await provider.connect();

    expect(provider.isConnected()).toBe(true);
    expect(connectMock).toHaveBeenCalledTimes(1);

    await provider.disconnect();

    expect(closeMock).toHaveBeenCalledTimes(1);
    expect(provider.isConnected()).toBe(false);

    // Repeated disconnect must not close the pool again.
    await provider.disconnect();

    expect(closeMock).toHaveBeenCalledTimes(1);
});

test("failed disconnect can be retried", async () => {
    connectMock.mockResolvedValue(undefined);

    const cleanupError = new Error(
        "Simulated disconnect failure"
    );

    closeMock
        .mockRejectedValueOnce(cleanupError)
        .mockResolvedValueOnce(undefined);

    const provider = new SqlServerProvider(options);

    await provider.connect();

    expect(provider.isConnected()).toBe(true);

    await expect(
        provider.disconnect()
    ).rejects.toBe(cleanupError);

    expect(closeMock).toHaveBeenCalledTimes(1);

    // The provider retains its pool reference so cleanup
    // can be attempted again.
    await expect(
        provider.disconnect()
    ).resolves.toBeUndefined();

    expect(closeMock).toHaveBeenCalledTimes(2);
    expect(provider.isConnected()).toBe(false);
});

});

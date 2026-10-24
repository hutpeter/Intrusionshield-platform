
import { describe, expect, test } from "@jest/globals";

import { SqlServerProvider } from "./SqlServerProvider.js";

describe("SqlServerProvider connection failure handling", () => {
    test("failed connection does not mark provider as connected", async () => {
        const provider = new SqlServerProvider({
            server: "127.0.0.1",
            port: 1,
            database: "Ruby_Connection_Test",
            user: "test",
            password: "test",
            encrypt: false,
            trustServerCertificate: true
        });

        await expect(
            provider.connect()
        ).rejects.toThrow();

        expect(provider.isConnected()).toBe(false);

        await expect(
            provider.disconnect()
        ).resolves.toBeUndefined();
    });
});

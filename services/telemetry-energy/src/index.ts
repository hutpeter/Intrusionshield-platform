import { getDatabaseConfiguration } from "@intrusionshield/config";
import {
    SqlServerProvider,
    resolveDatabaseRoleConfiguration
} from "@intrusionshield/database";
import { createApp } from "./app.js";

const configuration = getDatabaseConfiguration();
if (!configuration.username || !configuration.password) {
    throw new Error("DB_USERNAME/DB_USER and DB_PASSWORD are required.");
}
const defaults = {
    server: configuration.server,
    port: configuration.port,
    database: configuration.database,
    user: configuration.username,
    password: configuration.password,
    encrypt: configuration.encrypt,
    trustServerCertificate: configuration.trustServerCertificate
};
const energy = resolveDatabaseRoleConfiguration("BAS_EMS", defaults);
const isolated = process.env.RUBY_TELEMETRY_ENERGY_SPLIT_DATABASES === "true";
if (isolated && (!process.env.RUBY_TELEMETRY_DB_DATABASE || !process.env.RUBY_BAS_EMS_DB_DATABASE)) {
    throw new Error("Split mode requires RUBY_TELEMETRY_DB_DATABASE and RUBY_BAS_EMS_DB_DATABASE.");
}
const telemetry = isolated
    ? resolveDatabaseRoleConfiguration("TELEMETRY", defaults)
    : energy;
if (isolated && telemetry.options.database.toLowerCase() === energy.options.database.toLowerCase()
    && telemetry.options.server.toLowerCase() === energy.options.server.toLowerCase()
    && telemetry.options.port === energy.options.port) {
    throw new Error("Split mode requires distinct Telemetry and BAS/EMS databases.");
}
const energyProvider = new SqlServerProvider(energy.options);
await energyProvider.connect();
let telemetryProvider = energyProvider;
try {
    if (isolated) {
        telemetryProvider = new SqlServerProvider(telemetry.options);
        await telemetryProvider.connect();
    }
    const port = Number(process.env.TELEMETRY_ENERGY_PORT ?? 4401);
    createApp(telemetryProvider, energyProvider).listen(port, () =>
        console.log(`Ruby Telemetry & Energy service listening on http://localhost:${port} (split databases: ${isolated})`)
    );
} catch (error) {
    await energyProvider.disconnect();
    throw error;
}

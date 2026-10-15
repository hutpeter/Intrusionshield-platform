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
const resolved = resolveDatabaseRoleConfiguration("BAS_EMS", {
    server: configuration.server,
    port: configuration.port,
    database: configuration.database,
    user: configuration.username,
    password: configuration.password,
    encrypt: configuration.encrypt,
    trustServerCertificate: configuration.trustServerCertificate
});
const database = new SqlServerProvider(resolved.options);
await database.connect();
const port = Number(process.env.TELEMETRY_ENERGY_PORT ?? 4401);
createApp(database).listen(port, () =>
    console.log(`Ruby Telemetry & Energy service listening on http://localhost:${port}`)
);

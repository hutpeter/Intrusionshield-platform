# EIS Miramichi Energy Simulator

API-driven simulator for the EIS Telemetry & Energy service. It does not connect directly to SQL Server.

Defaults:
- API: http://localhost:4400
- Miramichi tenant: 73c28616-633a-46b5-bd4d-2ad7971af02c
- Miramichi site: 138c8b96-04ae-402d-93f9-89b3677734e1
- Real cadence: 5 seconds
- Simulated step: 5 minutes
- PV: 3.75 kW
- Battery: 10 kWh, 15%-95% operating window

Environment overrides:
TELEMETRY_ENERGY_BASE_URL, SIMULATOR_TENANT_ID, SIMULATOR_SITE_ID,
SIMULATOR_INTERVAL_MS, SIMULATOR_STEP_MINUTES, SIMULATOR_SOURCE.

## BAS sample

Run `pnpm --filter @intrusionshield/energy-simulator build` and
`pnpm --filter @intrusionshield/energy-simulator start:bas` after starting
telemetry-energy and applying its existing SQL migrations. The default tenant
and site are the Miramichi demo site and must already exist. Use
`TELEMETRY_ENERGY_BASE_URL`, `SIMULATOR_TENANT_ID`, and `SIMULATOR_SITE_ID`
to select another deployment. `BAS_DEVICE_CODE`, `BAS_INTERVAL_MS` (5000)
and `BAS_STEP_MINUTES` (5) control the simulated controller and cadence.

The simulator creates `BAS-ZONE-001`, `HVAC-COMM-44092`, and three definitions
if absent. It submits temperature (F), relative humidity (%), and operating
state (COOLING/OFF) through the existing readings endpoint. View stored
samples at `GET /api/v1/telemetry/sites/<siteId>/readings` and live events at
`GET /api/v1/telemetry/sites/<siteId>/stream`, both with `x-tenant-id`.
`sample-data/bas-zone-001.csv` has one day of five-minute samples for a
static dashboard. Values are simulated, not measurements from an HVAC system.

This package contains backend services only. The HVAC example file and Solar
dashboard source were not included in the supplied archives. Raw controller
payload archival and the two React dashboard views therefore remain pending;
the three normalized readings use the existing SQL persistence and SSE feed.

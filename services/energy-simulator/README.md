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

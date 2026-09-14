import {
  getDatabaseConfiguration
} from "@intrusionshield/config";

import {
  SqlServerProvider
} from "@intrusionshield/database";

import {
  FacilityService,
  PatientService,
  PersonService,
  PractitionerService
} from "./application/index.js";

import {
  SqlFacilityRepository,
  SqlPatientRepository,
  SqlPersonRepository,
  SqlPractitionerRepository
} from "./infrastructure/repositories/index.js";

import {
  createApp
} from "./app.js";

async function start(): Promise<void> {
  const configuration =
    getDatabaseConfiguration();

  if (!configuration.username) {
    throw new Error(
      "DB_USERNAME or DB_USER must be supplied for the HIS service."
    );
  }

  if (!configuration.password) {
    throw new Error(
      "DB_PASSWORD must be supplied for the HIS service."
    );
  }

  const database =
    new SqlServerProvider({
      server: configuration.server,
      port: configuration.port,
      database: configuration.database,
      user: configuration.username,
      password: configuration.password,
      encrypt: configuration.encrypt,
      trustServerCertificate:
        configuration.trustServerCertificate
    });

  await database.connect();

  const personRepository =
    new SqlPersonRepository(database);

  const patientRepository =
    new SqlPatientRepository(database);

  const practitionerRepository =
    new SqlPractitionerRepository(database);

  const facilityRepository =
    new SqlFacilityRepository(database);

  const personService =
    new PersonService(
      personRepository
    );

  const patientService =
    new PatientService(
      patientRepository
    );

  const practitionerService =
    new PractitionerService(
      practitionerRepository
    );

  const facilityService =
    new FacilityService(
      facilityRepository
    );

  const app = createApp({
    personService,
    patientService,
    practitionerService,
    facilityService
  });

  const port =
    Number(
      process.env.HIS_PORT ?? 4300
    );

  app.listen(port, () => {
    console.log(
      `Athena HIS service listening on port ${port}`
    );
  });
}

start().catch((error: unknown) => {
  const message =
    error instanceof Error
      ? error.message
      : String(error);

  console.error(
    `Athena HIS service failed to start: ${message}`
  );

  process.exitCode = 1;
});

export {
  createApp
} from "./app.js";
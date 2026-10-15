import {
  getDatabaseConfiguration
} from "@intrusionshield/config";

import {
  SqlServerProvider,
  resolveDatabaseRoleConfiguration
} from "@intrusionshield/database";

import {
  AdmissionService,
  AppointmentService,
  AvailabilityService,
  AdtService,
  BedService,
  ClinicalLocationService,
  EncounterService,
  FacilityService,
  PatientRegistrationService,
  PatientService,
  PersonService,
  PractitionerService
} from "./application/index.js";

import {
  SqlAdmissionRepository,
  SqlAppointmentRepository,
  SqlAvailabilityRepository,
  SqlAdtRepository,
  SqlBedAssignmentRepository,
  SqlBedRepository,
  SqlClinicalLocationRepository,
  SqlEncounterRepository,
  SqlFacilityRepository,
  SqlPatientRegistrationRepository,
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

  const connection = resolveDatabaseRoleConfiguration("ATHENA", {
    server: configuration.server,
    port: configuration.port,
    database: configuration.database,
    user: configuration.username,
    password: configuration.password,
    encrypt: configuration.encrypt,
    trustServerCertificate: configuration.trustServerCertificate
  });

  const database = new SqlServerProvider(connection.options);

  await database.connect();

  const personRepository =
    new SqlPersonRepository(database);

  const patientRepository =
    new SqlPatientRepository(database);

  const patientRegistrationRepository =
    new SqlPatientRegistrationRepository(
      database
    );

  const encounterRepository =
    new SqlEncounterRepository(database);

  const admissionRepository =
    new SqlAdmissionRepository(database);

  const appointmentRepository =
    new SqlAppointmentRepository(
      database
    );

  const availabilityRepository =
    new SqlAvailabilityRepository(
      database
    );

  const bedAssignmentRepository =
    new SqlBedAssignmentRepository(
      database
    );

  const adtRepository =
    new SqlAdtRepository(database);

  const practitionerRepository =
    new SqlPractitionerRepository(
      database
    );

  const facilityRepository =
    new SqlFacilityRepository(database);

  const clinicalLocationRepository =
    new SqlClinicalLocationRepository(
      database
    );

  const bedRepository =
    new SqlBedRepository(database);

  const personService =
    new PersonService(
      personRepository
    );

  const patientService =
    new PatientService(
      patientRepository
    );

  const patientRegistrationService =
    new PatientRegistrationService(
      patientRegistrationRepository
    );

  const encounterService =
    new EncounterService(
      encounterRepository
    );

  const admissionService =
    new AdmissionService(
      admissionRepository
    );

  const appointmentService =
    new AppointmentService(
      appointmentRepository,
      encounterRepository,
      database
    );

  const availabilityService =
    new AvailabilityService(
      availabilityRepository,
      appointmentRepository
    );

  const adtService =
    new AdtService(
      admissionRepository,
      bedAssignmentRepository,
      adtRepository
    );

  const practitionerService =
    new PractitionerService(
      practitionerRepository
    );

  const facilityService =
    new FacilityService(
      facilityRepository
    );

  const clinicalLocationService =
    new ClinicalLocationService(
      clinicalLocationRepository
    );

  const bedService =
    new BedService(
      bedRepository
    );

  const app = createApp({
    personService,
    patientService,
    patientRegistrationService,
    encounterService,
    admissionService,
    appointmentService,
    availabilityService,
    adtService,
    practitionerService,
    facilityService,
    clinicalLocationService,
    bedService
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

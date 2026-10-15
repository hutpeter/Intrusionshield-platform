import type {
  IDatabaseProvider
} from "@intrusionshield/database";

import type {
  Encounter
} from "@intrusionshield/his";

export interface EncounterRepository {
  findById(
    id: string,
    tenantId: string
  ): Promise<Encounter | null>;

  findByPatientId(
    patientId: string,
    tenantId: string
  ): Promise<readonly Encounter[]>;

  create(
    encounter: Encounter
  ): Promise<Encounter>;

  update(
    encounter: Encounter
  ): Promise<Encounter>;
}

export class SqlEncounterRepository
implements EncounterRepository {
  public constructor(
    private readonly database: IDatabaseProvider
  ) {}

  public async findById(
    id: string,
    tenantId: string
  ): Promise<Encounter | null> {
    const result =
      await this.database.query<EncounterRow>(
        `${this.selectSql()}
         WHERE encounter.id = @id
           AND encounter.tenant_id = @tenantId`,
        [
          { name: "id", value: id },
          { name: "tenantId", value: tenantId }
        ]
      );

    const row = result.rows[0];

    return row
      ? this.toDomain(row)
      : null;
  }

  public async findByPatientId(
    patientId: string,
    tenantId: string
  ): Promise<readonly Encounter[]> {
    const result =
      await this.database.query<EncounterRow>(
        `${this.selectSql()}
         WHERE encounter.patient_id = @patientId
           AND encounter.tenant_id = @tenantId
         ORDER BY
           encounter.started_at DESC,
           encounter.id DESC`,
        [
          {
            name: "patientId",
            value: patientId
          },
          {
            name: "tenantId",
            value: tenantId
          }
        ]
      );

    return result.rows.map(
      (row) => this.toDomain(row)
    );
  }

  public async create(
    encounter: Encounter
  ): Promise<Encounter> {
    await this.database.execute(
      `INSERT INTO HIS.Encounters
       (
         id,
         tenant_id,
         patient_id,
         facility_id,
         registration_id,
         attending_practitioner_id,
         encounter_number,
         encounter_type,
         status,
         source,
         started_at,
         ended_at,
         reason_for_encounter,
         referral_source,
         location_description,
         created_at,
         updated_at,
         version
       )
       VALUES
       (
         @id,
         @tenantId,
         @patientId,
         @facilityId,
         @registrationId,
         @attendingPractitionerId,
         @encounterNumber,
         @encounterType,
         @status,
         @source,
         @startedAt,
         @endedAt,
         @reasonForEncounter,
         @referralSource,
         @locationDescription,
         @createdAt,
         @updatedAt,
         @version
       )`,
      this.parameters(encounter)
    );

    return encounter;
  }

  public async update(
    encounter: Encounter
  ): Promise<Encounter> {
    const nextVersion =
      encounter.version + 1;

    const rows =
      await this.database.execute(
        `UPDATE HIS.Encounters
         SET
           patient_id = @patientId,
           facility_id = @facilityId,
           registration_id = @registrationId,
           attending_practitioner_id =
             @attendingPractitionerId,
           encounter_number = @encounterNumber,
           encounter_type = @encounterType,
           status = @status,
           source = @source,
           started_at = @startedAt,
           ended_at = @endedAt,
           reason_for_encounter =
             @reasonForEncounter,
           referral_source = @referralSource,
           location_description =
             @locationDescription,
           updated_at = @updatedAt,
           version = @nextVersion
         WHERE id = @id
           AND tenant_id = @tenantId
           AND version = @version`,
        [
          ...this.parameters(encounter),
          {
            name: "nextVersion",
            value: nextVersion
          }
        ]
      );

    if (rows !== 1) {
      throw new Error(
        "Encounter was modified or does not exist"
      );
    }

    return {
      ...encounter,
      version: nextVersion
    };
  }

  private selectSql(): string {
    return `SELECT
              encounter.id,
              encounter.tenant_id AS tenantId,
              encounter.patient_id AS patientId,
              encounter.facility_id AS facilityId,
              encounter.registration_id
                AS registrationId,
              encounter.attending_practitioner_id
                AS attendingPractitionerId,
              encounter.encounter_number
                AS encounterNumber,
              encounter.encounter_type
                AS encounterType,
              encounter.status,
              encounter.source,
              encounter.started_at AS startedAt,
              encounter.ended_at AS endedAt,
              encounter.reason_for_encounter
                AS reasonForEncounter,
              encounter.referral_source
                AS referralSource,
              encounter.location_description
                AS locationDescription,
              encounter.created_at AS createdAt,
              encounter.updated_at AS updatedAt,
              encounter.version
            FROM HIS.Encounters encounter`;
  }

  private parameters(
    encounter: Encounter
  ) {
    return [
      {
        name: "id",
        value: encounter.id
      },
      {
        name: "tenantId",
        value: encounter.tenantId
      },
      {
        name: "patientId",
        value: encounter.patientId
      },
      {
        name: "facilityId",
        value: encounter.facilityId
      },
      {
        name: "registrationId",
        value: encounter.registrationId ?? null
      },
      {
        name: "attendingPractitionerId",
        value:
          encounter.attendingPractitionerId ??
          null
      },
      {
        name: "encounterNumber",
        value: encounter.encounterNumber
      },
      {
        name: "encounterType",
        value: encounter.encounterType
      },
      {
        name: "status",
        value: encounter.status
      },
      {
        name: "source",
        value: encounter.source
      },
      {
        name: "startedAt",
        value: encounter.startedAt
      },
      {
        name: "endedAt",
        value: encounter.endedAt ?? null
      },
      {
        name: "reasonForEncounter",
        value:
          encounter.reasonForEncounter ?? null
      },
      {
        name: "referralSource",
        value: encounter.referralSource ?? null
      },
      {
        name: "locationDescription",
        value:
          encounter.locationDescription ?? null
      },
      {
        name: "createdAt",
        value: encounter.createdAt
      },
      {
        name: "updatedAt",
        value: encounter.updatedAt
      },
      {
        name: "version",
        value: encounter.version
      }
    ];
  }

  private toDomain(
    row: EncounterRow
  ): Encounter {
    return {
      id: row.id,
      tenantId: row.tenantId,
      patientId: row.patientId,
      facilityId: row.facilityId,
      registrationId:
        row.registrationId ?? undefined,
      attendingPractitionerId:
        row.attendingPractitionerId ??
        undefined,
      encounterNumber: row.encounterNumber,
      encounterType: row.encounterType,
      status: row.status,
      source: row.source,
      startedAt: row.startedAt,
      endedAt: row.endedAt ?? undefined,
      reasonForEncounter:
        row.reasonForEncounter ?? undefined,
      referralSource:
        row.referralSource ?? undefined,
      locationDescription:
        row.locationDescription ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      version: row.version
    };
  }
}

interface EncounterRow {
  id: string;
  tenantId: string;
  patientId: string;
  facilityId: string;
  registrationId: string | null;
  attendingPractitionerId: string | null;
  encounterNumber: string;
  encounterType: Encounter["encounterType"];
  status: Encounter["status"];
  source: Encounter["source"];
  startedAt: Date;
  endedAt: Date | null;
  reasonForEncounter: string | null;
  referralSource: string | null;
  locationDescription: string | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

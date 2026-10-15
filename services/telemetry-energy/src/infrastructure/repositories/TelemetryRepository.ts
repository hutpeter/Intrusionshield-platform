import {



    normalizeUuid,



    type IDatabaseProvider



} from "@intrusionshield/database";







import {



    createTelemetryReading,



    type TelemetryQuality,



    type TelemetryReading



} from "@intrusionshield/telemetry";







import {



    SqlTelemetryStoragePolicyRepository



} from "./TelemetryStoragePolicyRepository.js";







export interface CreateTelemetryReadingRepositoryInput {



    readonly tenantId: string;



    readonly siteId: string;



    readonly deviceId: string;



    readonly measurementDefinitionId: string;



    readonly observedAt: Date;



    readonly numericValue?: number;



    readonly booleanValue?: boolean;



    readonly stringValue?: string;



    readonly quality?: TelemetryQuality;



    readonly source: string;



    readonly receivedAt?: Date;



}







export class SqlTelemetryRepository {



    private readonly storagePolicies:



        SqlTelemetryStoragePolicyRepository;







    public constructor(



        private readonly database: IDatabaseProvider



    ) {



        this.storagePolicies =



            new SqlTelemetryStoragePolicyRepository(



                database



            );



    }







    public async create(



        input: CreateTelemetryReadingRepositoryInput



    ): Promise<TelemetryReading> {



        const reading =



            createTelemetryReading({



                tenantId: input.tenantId,



                siteId: input.siteId,



                deviceId: input.deviceId,



                measurementDefinitionId:



                    input.measurementDefinitionId,



                observedAt: input.observedAt,



                numericValue:



                    input.numericValue,



                booleanValue:



                    input.booleanValue,



                stringValue:



                    input.stringValue,



                quality:



                    input.quality ?? "GOOD",



                source: input.source,



                receivedAt:



                    input.receivedAt



            });







        const policy =



            await this.storagePolicies.resolve({



                tenantId:



                    reading.tenantId,



                siteId:



                    reading.siteId,



                deviceId:



                    reading.deviceId,



                measurementDefinitionId:



                    reading.measurementDefinitionId



            });







        /*



         \* The telemetry observation has still been accepted by Ruby,



         \* but this effective policy explicitly disables durable



         \* persistence for the matching telemetry stream.



         */



        if (!policy.enabled) {



            return reading;



        }







        // Use ingestion time for the persistence cadence. observedAt remains
        // the device event timestamp and may be delayed or out of order.
        // A transaction-scoped SQL application lock serializes each stream
        // across API instances; the decision and insert are atomic.
        await this.database.execute(
            `SET XACT_ABORT ON;
             BEGIN TRY
                 BEGIN TRANSACTION;
                 DECLARE @lockResult INT;
                 DECLARE @lockResource NVARCHAR(255) =
                     N'RubyTelemetry:' +
                     CONVERT(VARCHAR(64), HASHBYTES('SHA2_256',
                         CONCAT(CONVERT(NVARCHAR(36), @tenantId), N':',
                                CONVERT(NVARCHAR(36), @siteId), N':',
                                CONVERT(NVARCHAR(36), @deviceId), N':',
                                CONVERT(NVARCHAR(36), @measurementDefinitionId))), 2);
                 EXEC @lockResult = sys.sp_getapplock
                     @Resource = @lockResource,
                     @LockMode = 'Exclusive',
                     @LockOwner = 'Transaction',
                     @LockTimeout = 10000;
                 IF @lockResult < 0
                     THROW 51001, 'Telemetry stream lock could not be acquired', 1;

                 IF NOT EXISTS (
                     SELECT 1 FROM Telemetry.Readings
                     WHERE tenant_id = @tenantId
                       AND site_id = @siteId
                       AND device_id = @deviceId
                       AND measurement_definition_id = @measurementDefinitionId
                       AND received_at > DATEADD(SECOND, -@storageIntervalSeconds, @receivedAt)
                       AND received_at <= @receivedAt
                 )
                 AND NOT EXISTS (
                     SELECT 1 FROM Telemetry.Readings
                     WHERE tenant_id = @tenantId
                       AND site_id = @siteId
                       AND device_id = @deviceId
                       AND measurement_definition_id = @measurementDefinitionId
                       AND received_at > @receivedAt
                 )
                 BEGIN
                     INSERT INTO Telemetry.Readings
                     (id, tenant_id, site_id, device_id,
                      measurement_definition_id, observed_at, received_at,
                      numeric_value, boolean_value, string_value, quality, source)
                     VALUES
                     (@id, @tenantId, @siteId, @deviceId,
                      @measurementDefinitionId, @observedAt, @receivedAt,
                      @numericValue, @booleanValue, @stringValue, @quality, @source);
                 END;
                 COMMIT TRANSACTION;
             END TRY
             BEGIN CATCH
                 IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
                 THROW;
             END CATCH;`,
            [



                {



                    name: "id",



                    value: reading.id



                },



                {



                    name: "tenantId",



                    value: reading.tenantId



                },



                {



                    name: "siteId",



                    value: reading.siteId



                },



                {



                    name: "deviceId",



                    value: reading.deviceId



                },



                {



                    name: "measurementDefinitionId",



                    value:



                        reading.measurementDefinitionId



                },



                {



                    name: "observedAt",



                    value: reading.observedAt



                },



                {



                    name: "receivedAt",



                    value: reading.receivedAt



                },



                {



                    name: "numericValue",



                    value:



                        reading.numericValue ?? null



                },



                {



                    name: "booleanValue",



                    value:



                        reading.booleanValue ?? null



                },



                {



                    name: "stringValue",



                    value:



                        reading.stringValue ?? null



                },



                {



                    name: "quality",



                    value: reading.quality



                },



                {



                    name: "source",



                    value: reading.source



                }



                ,{
                    name: "storageIntervalSeconds",
                    value: policy.storageIntervalSeconds
                }
            ]




        );

        return reading;



    }







    public async bySite(



        siteId: string,



        tenantId: string



    ): Promise<readonly TelemetryReading[]> {



        const result =



            await this.database.query<TelemetryReadingRow>(



                `SELECT TOP (100)



                     id,



                     tenant_id AS tenantId,



                     site_id AS siteId,



                     device_id AS deviceId,



                     measurement_definition_id



                         AS measurementDefinitionId,



                     observed_at AS observedAt,



                     received_at AS receivedAt,



                     numeric_value AS numericValue,



                     boolean_value AS booleanValue,



                     string_value AS stringValue,



                     quality,



                     source



                 FROM Telemetry.Readings



                 WHERE tenant_id = @tenantId



                   AND site_id = @siteId



                 ORDER BY observed_at DESC`,



                [



                    {



                        name: "tenantId",



                        value: tenantId



                    },



                    {



                        name: "siteId",



                        value: siteId



                    }



                ]



            );







        return result.rows.map(



            mapTelemetryReading



        );



    }







    public async byDevice(



        siteId: string,



        deviceId: string,



        tenantId: string



    ): Promise<readonly TelemetryReading[]> {



        const result =



            await this.database.query<TelemetryReadingRow>(



                `SELECT TOP (500)



                     id,



                     tenant_id AS tenantId,



                     site_id AS siteId,



                     device_id AS deviceId,



                     measurement_definition_id



                         AS measurementDefinitionId,



                     observed_at AS observedAt,



                     received_at AS receivedAt,



                     numeric_value AS numericValue,



                     boolean_value AS booleanValue,



                     string_value AS stringValue,



                     quality,



                     source



                 FROM Telemetry.Readings



                 WHERE tenant_id = @tenantId



                   AND site_id = @siteId



                   AND device_id = @deviceId



                 ORDER BY observed_at DESC`,



                [



                    {



                        name: "tenantId",



                        value: tenantId



                    },



                    {



                        name: "siteId",



                        value: siteId



                    },



                    {



                        name: "deviceId",



                        value: deviceId



                    }



                ]



            );







        return result.rows.map(



            mapTelemetryReading



        );



    }











}







interface TelemetryReadingRow {



    readonly id: string;



    readonly tenantId: string;



    readonly siteId: string;



    readonly deviceId: string;



    readonly measurementDefinitionId: string;



    readonly observedAt: Date;



    readonly receivedAt: Date;



    readonly numericValue: number | null;



    readonly booleanValue: boolean | null;



    readonly stringValue: string | null;



    readonly quality: TelemetryQuality;



    readonly source: string;



}







interface LastPersistedReadingRow {



    readonly receivedAt: Date;



}







function mapTelemetryReading(



    row: TelemetryReadingRow



): TelemetryReading {



    return {



        id: normalizeUuid(row.id),



        tenantId:



            normalizeUuid(row.tenantId),



        siteId:



            normalizeUuid(row.siteId),



        deviceId:



            normalizeUuid(row.deviceId),



        measurementDefinitionId:



            normalizeUuid(



                row.measurementDefinitionId



            ),



        observedAt:



            row.observedAt,



        receivedAt:



            row.receivedAt,



        numericValue:



            row.numericValue ?? undefined,



        booleanValue:



            row.booleanValue ?? undefined,



        stringValue:



            row.stringValue ?? undefined,



        quality:



            row.quality,



        source:



            row.source



    };



}
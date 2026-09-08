IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = N'HIS')
    EXEC(N'CREATE SCHEMA HIS');
GO

CREATE TABLE HIS.Persons
(
    id UNIQUEIDENTIFIER NOT NULL,
    tenant_id UNIQUEIDENTIFIER NOT NULL,
    first_name NVARCHAR(100) NOT NULL,
    middle_name NVARCHAR(100) NULL,
    last_name NVARCHAR(100) NOT NULL,
    preferred_name NVARCHAR(100) NULL,
    date_of_birth DATE NULL,
    sex NVARCHAR(20) NOT NULL,
    gender NVARCHAR(100) NULL,
    status NVARCHAR(20) NOT NULL,
    contact_email NVARCHAR(320) NULL,
    contact_phone NVARCHAR(50) NULL,
    contact_mobile_phone NVARCHAR(50) NULL,
    created_at DATETIME2(7) NOT NULL,
    updated_at DATETIME2(7) NOT NULL,
    version INT NOT NULL,
    CONSTRAINT PK_HIS_Persons PRIMARY KEY (id),
    CONSTRAINT UQ_HIS_Persons_TenantId UNIQUE (tenant_id, id),
    CONSTRAINT CK_HIS_Persons_Version CHECK (version >= 1),
    CONSTRAINT CK_HIS_Persons_Status CHECK (status IN (N'ACTIVE', N'INACTIVE', N'DECEASED'))
);
GO

CREATE TABLE HIS.PersonIdentifiers
(
    tenant_id UNIQUEIDENTIFIER NOT NULL,
    person_id UNIQUEIDENTIFIER NOT NULL,
    system_name NVARCHAR(200) NOT NULL,
    identifier_value NVARCHAR(200) NOT NULL,
    CONSTRAINT PK_HIS_PersonIdentifiers PRIMARY KEY (tenant_id, person_id, system_name, identifier_value),
    CONSTRAINT FK_HIS_PersonIdentifiers_Person FOREIGN KEY (tenant_id, person_id) REFERENCES HIS.Persons(tenant_id, id)
);
GO

CREATE TABLE HIS.PersonAddresses
(
    id UNIQUEIDENTIFIER NOT NULL,
    tenant_id UNIQUEIDENTIFIER NOT NULL,
    person_id UNIQUEIDENTIFIER NOT NULL,
    line1 NVARCHAR(200) NOT NULL,
    line2 NVARCHAR(200) NULL,
    city NVARCHAR(100) NOT NULL,
    province_or_state NVARCHAR(100) NULL,
    postal_code NVARCHAR(30) NULL,
    country NVARCHAR(100) NOT NULL,
    CONSTRAINT PK_HIS_PersonAddresses PRIMARY KEY (id),
    CONSTRAINT UQ_HIS_PersonAddresses_TenantId UNIQUE (tenant_id, id),
    CONSTRAINT FK_HIS_PersonAddresses_Person FOREIGN KEY (tenant_id, person_id) REFERENCES HIS.Persons(tenant_id, id)
);
GO

CREATE TABLE HIS.Patients
(
    id UNIQUEIDENTIFIER NOT NULL,
    tenant_id UNIQUEIDENTIFIER NOT NULL,
    person_id UNIQUEIDENTIFIER NOT NULL,
    medical_record_number NVARCHAR(100) NOT NULL,
    patient_number NVARCHAR(100) NOT NULL,
    status NVARCHAR(20) NOT NULL,
    registration_date DATETIME2(7) NOT NULL,
    deceased_date DATETIME2(7) NULL,
    preferred_language NVARCHAR(20) NULL,
    preferred_contact_method NVARCHAR(20) NULL,
    created_at DATETIME2(7) NOT NULL,
    updated_at DATETIME2(7) NOT NULL,
    version INT NOT NULL,
    CONSTRAINT PK_HIS_Patients PRIMARY KEY (id),
    CONSTRAINT UQ_HIS_Patients_TenantId UNIQUE (tenant_id, id),
    CONSTRAINT FK_HIS_Patients_Person FOREIGN KEY (tenant_id, person_id) REFERENCES HIS.Persons(tenant_id, id),
    CONSTRAINT CK_HIS_Patients_Version CHECK (version >= 1),
    CONSTRAINT CK_HIS_Patients_Status CHECK (status IN (N'ACTIVE', N'INACTIVE', N'DECEASED', N'MERGED')),
    CONSTRAINT UQ_HIS_Patients_TenantMRN UNIQUE (tenant_id, medical_record_number),
    CONSTRAINT UQ_HIS_Patients_TenantPatientNumber UNIQUE (tenant_id, patient_number)
);
GO

CREATE TABLE HIS.PatientEmergencyContacts
(
    tenant_id UNIQUEIDENTIFIER NOT NULL,
    patient_id UNIQUEIDENTIFIER NOT NULL,
    person_id UNIQUEIDENTIFIER NOT NULL,
    CONSTRAINT PK_HIS_PatientEmergencyContacts PRIMARY KEY (tenant_id, patient_id, person_id),
    CONSTRAINT FK_HIS_PatientEmergencyContacts_Patient FOREIGN KEY (tenant_id, patient_id) REFERENCES HIS.Patients(tenant_id, id),
    CONSTRAINT FK_HIS_PatientEmergencyContacts_Person FOREIGN KEY (tenant_id, person_id) REFERENCES HIS.Persons(tenant_id, id)
);
GO

CREATE TABLE HIS.Practitioners
(
    id UNIQUEIDENTIFIER NOT NULL,
    tenant_id UNIQUEIDENTIFIER NOT NULL,
    person_id UNIQUEIDENTIFIER NOT NULL,
    practitioner_number NVARCHAR(100) NOT NULL,
    practitioner_type NVARCHAR(30) NOT NULL,
    status NVARCHAR(20) NOT NULL,
    effective_from DATETIME2(7) NOT NULL,
    effective_until DATETIME2(7) NULL,
    created_at DATETIME2(7) NOT NULL,
    updated_at DATETIME2(7) NOT NULL,
    version INT NOT NULL,
    CONSTRAINT PK_HIS_Practitioners PRIMARY KEY (id),
    CONSTRAINT UQ_HIS_Practitioners_TenantId UNIQUE (tenant_id, id),
    CONSTRAINT FK_HIS_Practitioners_Person FOREIGN KEY (tenant_id, person_id) REFERENCES HIS.Persons(tenant_id, id),
    CONSTRAINT CK_HIS_Practitioners_Version CHECK (version >= 1),
    CONSTRAINT CK_HIS_Practitioners_Status CHECK (status IN (N'ACTIVE', N'INACTIVE', N'SUSPENDED')),
    CONSTRAINT UQ_HIS_Practitioners_TenantNumber UNIQUE (tenant_id, practitioner_number),
    CONSTRAINT CK_HIS_Practitioners_EffectiveDates CHECK (effective_until IS NULL OR effective_until > effective_from)
);
GO

CREATE TABLE HIS.PractitionerLicenses
(
    tenant_id UNIQUEIDENTIFIER NOT NULL,
    practitioner_id UNIQUEIDENTIFIER NOT NULL,
    jurisdiction NVARCHAR(100) NOT NULL,
    license_number NVARCHAR(100) NOT NULL,
    issued_at DATETIME2(7) NULL,
    expires_at DATETIME2(7) NULL,
    CONSTRAINT PK_HIS_PractitionerLicenses PRIMARY KEY (tenant_id, practitioner_id, jurisdiction, license_number),
    CONSTRAINT FK_HIS_PractitionerLicenses_Practitioner FOREIGN KEY (tenant_id, practitioner_id) REFERENCES HIS.Practitioners(tenant_id, id),
    CONSTRAINT CK_HIS_PractitionerLicenses_Dates CHECK (expires_at IS NULL OR issued_at IS NULL OR expires_at > issued_at)
);
GO

CREATE TABLE HIS.PractitionerSpecialties
(
    tenant_id UNIQUEIDENTIFIER NOT NULL,
    practitioner_id UNIQUEIDENTIFIER NOT NULL,
    specialty NVARCHAR(200) NOT NULL,
    CONSTRAINT PK_HIS_PractitionerSpecialties PRIMARY KEY (tenant_id, practitioner_id, specialty),
    CONSTRAINT FK_HIS_PractitionerSpecialties_Practitioner FOREIGN KEY (tenant_id, practitioner_id) REFERENCES HIS.Practitioners(tenant_id, id)
);
GO

CREATE TABLE HIS.Facilities
(
    id UNIQUEIDENTIFIER NOT NULL,
    tenant_id UNIQUEIDENTIFIER NOT NULL,
    parent_facility_id UNIQUEIDENTIFIER NULL,
    facility_type NVARCHAR(30) NOT NULL,
    code NVARCHAR(100) NOT NULL,
    name NVARCHAR(200) NOT NULL,
    description NVARCHAR(1000) NULL,
    address_line1 NVARCHAR(200) NULL,
    address_line2 NVARCHAR(200) NULL,
    address_city NVARCHAR(100) NULL,
    address_province_or_state NVARCHAR(100) NULL,
    address_postal_code NVARCHAR(30) NULL,
    address_country NVARCHAR(100) NULL,
    contact_email NVARCHAR(320) NULL,
    contact_phone NVARCHAR(50) NULL,
    contact_mobile_phone NVARCHAR(50) NULL,
    status NVARCHAR(20) NOT NULL,
    created_at DATETIME2(7) NOT NULL,
    updated_at DATETIME2(7) NOT NULL,
    version INT NOT NULL,
    CONSTRAINT PK_HIS_Facilities PRIMARY KEY (id),
    CONSTRAINT UQ_HIS_Facilities_TenantId UNIQUE (tenant_id, id),
    CONSTRAINT FK_HIS_Facilities_Parent FOREIGN KEY (tenant_id, parent_facility_id) REFERENCES HIS.Facilities(tenant_id, id),
    CONSTRAINT CK_HIS_Facilities_Version CHECK (version >= 1),
    CONSTRAINT CK_HIS_Facilities_Status CHECK (status IN (N'ACTIVE', N'INACTIVE')),
    CONSTRAINT UQ_HIS_Facilities_TenantCode UNIQUE (tenant_id, code),
    CONSTRAINT CK_HIS_Facilities_NotSelfParent CHECK (parent_facility_id IS NULL OR parent_facility_id <> id)
);
GO

CREATE INDEX IX_HIS_Persons_Tenant ON HIS.Persons (tenant_id);
CREATE INDEX IX_HIS_Patients_TenantPerson ON HIS.Patients (tenant_id, person_id);
CREATE INDEX IX_HIS_Practitioners_TenantPerson ON HIS.Practitioners (tenant_id, person_id);
CREATE INDEX IX_HIS_Facilities_TenantParent ON HIS.Facilities (tenant_id, parent_facility_id);
GO

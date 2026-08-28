/* IntrusionShield Identity Platform - ABAC policy schema
   Migration: 002_abac_schema
   Target: SQL Server 2025
*/

CREATE TABLE [identity].[AbacPolicies] (
    PolicyId uniqueidentifier NOT NULL CONSTRAINT PK_Identity_AbacPolicies PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    TenantId uniqueidentifier NOT NULL,
    Name nvarchar(200) NOT NULL,
    Effect varchar(10) NOT NULL,
    Priority int NOT NULL CONSTRAINT DF_Identity_AbacPolicies_Priority DEFAULT 0,
    IsActive bit NOT NULL CONSTRAINT DF_Identity_AbacPolicies_IsActive DEFAULT 1,
    CreatedAt datetime2(3) NOT NULL CONSTRAINT DF_Identity_AbacPolicies_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt datetime2(3) NOT NULL CONSTRAINT DF_Identity_AbacPolicies_UpdatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_Identity_AbacPolicies_Tenant FOREIGN KEY (TenantId) REFERENCES [identity].[Tenants](TenantId),
    CONSTRAINT CK_Identity_AbacPolicies_Effect CHECK (Effect IN ('ALLOW','DENY')),
    CONSTRAINT UQ_Identity_AbacPolicies_Tenant_Name UNIQUE (TenantId, Name)
);
GO

CREATE TABLE [identity].[AbacPolicyRules] (
    PolicyRuleId uniqueidentifier NOT NULL CONSTRAINT PK_Identity_AbacPolicyRules PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    PolicyId uniqueidentifier NOT NULL,
    AttributeScope varchar(20) NOT NULL,
    AttributeName nvarchar(200) NOT NULL,
    Operator varchar(20) NOT NULL,
    ExpectedValue nvarchar(max) NULL,
    CreatedAt datetime2(3) NOT NULL CONSTRAINT DF_Identity_AbacPolicyRules_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_Identity_AbacPolicyRules_Policy FOREIGN KEY (PolicyId) REFERENCES [identity].[AbacPolicies](PolicyId) ON DELETE CASCADE,
    CONSTRAINT CK_Identity_AbacPolicyRules_Scope CHECK (AttributeScope IN ('subject','resource','environment','tenant')),
    CONSTRAINT CK_Identity_AbacPolicyRules_Operator CHECK (Operator IN ('equals','notEquals','in','contains','exists'))
);
GO

CREATE TABLE [identity].[AbacPolicyActions] (
    PolicyId uniqueidentifier NOT NULL,
    Action nvarchar(100) NOT NULL,
    CONSTRAINT PK_Identity_AbacPolicyActions PRIMARY KEY (PolicyId, Action),
    CONSTRAINT FK_Identity_AbacPolicyActions_Policy FOREIGN KEY (PolicyId) REFERENCES [identity].[AbacPolicies](PolicyId) ON DELETE CASCADE
);
GO

CREATE TABLE [identity].[AbacPolicyResources] (
    PolicyId uniqueidentifier NOT NULL,
    Resource nvarchar(150) NOT NULL,
    CONSTRAINT PK_Identity_AbacPolicyResources PRIMARY KEY (PolicyId, Resource),
    CONSTRAINT FK_Identity_AbacPolicyResources_Policy FOREIGN KEY (PolicyId) REFERENCES [identity].[AbacPolicies](PolicyId) ON DELETE CASCADE
);
GO

CREATE INDEX IX_Identity_AbacPolicies_Tenant_Active_Priority
    ON [identity].[AbacPolicies](TenantId, IsActive, Priority DESC);
CREATE INDEX IX_Identity_AbacPolicyRules_Policy
    ON [identity].[AbacPolicyRules](PolicyId);
GO

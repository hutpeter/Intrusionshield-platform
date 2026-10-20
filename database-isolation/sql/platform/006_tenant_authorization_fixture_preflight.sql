/*
 Ruby tenant authorization positive-fixture preflight (READ ONLY).
 Execute in SSMS as ruby_platform_test_svc, with rehearsal DB selected.
 No roles, users, grants or rows are created.
*/
SET NOCOUNT ON;
IF DB_NAME() <> N'Ruby_Isolation_Rehearsal_Platform'
    THROW 51000, 'Refusing to run outside Ruby_Isolation_Rehearsal_Platform', 1;

SELECT DB_NAME() AS DatabaseName, USER_NAME() AS DatabaseUser;

SELECT t.name AS TableName, c.column_id AS Ordinal, c.name AS ColumnName,
       ty.name AS SqlType, c.max_length AS MaxLength,
       c.is_nullable AS Nullable, c.is_identity AS IsIdentity,
       dc.definition AS DefaultDefinition
FROM sys.tables t
JOIN sys.schemas s ON s.schema_id=t.schema_id
JOIN sys.columns c ON c.object_id=t.object_id
JOIN sys.types ty ON ty.user_type_id=c.user_type_id
LEFT JOIN sys.default_constraints dc ON dc.object_id=c.default_object_id
WHERE s.name=N'Identity'
  AND t.name IN (N'Identities',N'Permissions',N'Roles',N'RolePermissions',N'PlatformRoleAssignments')
ORDER BY t.name,c.column_id;

SELECT fk.name AS ForeignKeyName,
       OBJECT_SCHEMA_NAME(fk.parent_object_id)+N'.'+OBJECT_NAME(fk.parent_object_id) AS SourceTable,
       pc.name AS SourceColumn,
       OBJECT_SCHEMA_NAME(fk.referenced_object_id)+N'.'+OBJECT_NAME(fk.referenced_object_id) AS TargetTable,
       rc.name AS TargetColumn
FROM sys.foreign_keys fk
JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id=fk.object_id
JOIN sys.columns pc ON pc.object_id=fkc.parent_object_id AND pc.column_id=fkc.parent_column_id
JOIN sys.columns rc ON rc.object_id=fkc.referenced_object_id AND rc.column_id=fkc.referenced_column_id
WHERE OBJECT_SCHEMA_NAME(fk.parent_object_id)=N'Identity'
  AND OBJECT_NAME(fk.parent_object_id) IN
      (N'Identities',N'Roles',N'Permissions',N'RolePermissions',N'PlatformRoleAssignments')
ORDER BY SourceTable,fk.name,fkc.constraint_column_id;

SELECT
  (SELECT COUNT(*) FROM [Identity].[Identities]) AS ExistingIdentities,
  (SELECT COUNT(*) FROM [Identity].[Roles] WHERE Scope=N'PLATFORM') AS ExistingPlatformRoles,
  (SELECT COUNT(*) FROM [Identity].[Permissions]
   WHERE Scope=N'PLATFORM' AND Resource=N'platform.tenants') AS ExistingTenantAdminPermissions,
  (SELECT COUNT(*) FROM [Identity].[PlatformRoleAssignments]) AS ExistingPlatformAssignments;

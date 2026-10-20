/*
 Ruby Tenant Administration — read-only preflight.
 Execute in SSMS against an explicitly selected disposable DEVELOPMENT Platform database.
 Does not create, alter, seed, or delete any data.
*/
SET NOCOUNT ON;
SELECT DB_NAME() AS DatabaseName, SUSER_SNAME() AS LoginName, USER_NAME() AS DatabaseUser;
SELECT
    v.ObjectName,
    CASE WHEN OBJECT_ID(v.ObjectName, N'U') IS NOT NULL THEN N'PRESENT' ELSE N'MISSING' END AS ObjectStatus
FROM (VALUES
    (N'Platform.Tenants'),
    (N'EIS.TenantConfigurations'),
    (N'Identity.Identities'),
    (N'Identity.Permissions'),
    (N'Identity.Roles'),
    (N'Identity.RolePermissions'),
    (N'Identity.PlatformRoleAssignments'),
    (N'Identity.AuthorizationAudit')
) AS v(ObjectName);
SELECT
    s.name AS SchemaName,
    t.name AS TableName,
    c.name AS ColumnName,
    TYPE_NAME(c.user_type_id) AS DataType,
    c.max_length AS MaxLength,
    c.is_nullable AS IsNullable
FROM sys.tables AS t
JOIN sys.schemas AS s ON s.schema_id = t.schema_id
JOIN sys.columns AS c ON c.object_id = t.object_id
WHERE (s.name = N'Platform' AND t.name = N'Tenants')
   OR (s.name = N'EIS' AND t.name = N'TenantConfigurations')
   OR (s.name = N'Identity' AND t.name IN
       (N'Identities', N'Permissions', N'Roles', N'RolePermissions',
        N'PlatformRoleAssignments', N'AuthorizationAudit'))
ORDER BY s.name, t.name, c.column_id;
SELECT
    SCHEMA_NAME(o.schema_id) AS SchemaName,
    OBJECT_NAME(i.object_id) AS TableName,
    i.name AS IndexName,
    i.is_unique AS IsUnique,
    i.is_primary_key AS IsPrimaryKey
FROM sys.indexes AS i
JOIN sys.objects AS o ON o.object_id = i.object_id
WHERE o.type = N'U'
  AND ((SCHEMA_NAME(o.schema_id) = N'Platform' AND o.name = N'Tenants')
       OR (SCHEMA_NAME(o.schema_id) = N'Identity' AND o.name IN
           (N'Permissions', N'Roles', N'RolePermissions', N'PlatformRoleAssignments')))
  AND i.index_id > 0
ORDER BY SchemaName, TableName, IndexName;

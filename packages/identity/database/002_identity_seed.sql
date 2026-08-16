/* Minimal platform permissions/roles. Tenant-specific application roles are created by provisioning. */

IF NOT EXISTS (SELECT 1 FROM [identity].[Permissions] WHERE Name = N'identity.read')
    INSERT INTO [identity].[Permissions] (Name, Resource, Action, Description)
    VALUES (N'identity.read', N'identity', N'read', N'Read identity information');

IF NOT EXISTS (SELECT 1 FROM [identity].[Permissions] WHERE Name = N'identity.manage')
    INSERT INTO [identity].[Permissions] (Name, Resource, Action, Description)
    VALUES (N'identity.manage', N'identity', N'manage', N'Manage identities and lifecycle');

IF NOT EXISTS (SELECT 1 FROM [identity].[Permissions] WHERE Name = N'authorization.manage')
    INSERT INTO [identity].[Permissions] (Name, Resource, Action, Description)
    VALUES (N'authorization.manage', N'authorization', N'manage', N'Manage roles and permissions');
GO

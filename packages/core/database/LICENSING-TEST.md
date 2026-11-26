# Licensing SQL Server integration test

Run only against a newly provisioned, dedicated empty test database named RubyLicensingTest_<unique suffix>. Never use a Tiger, Athena, identity or production database. Provision the database and a dedicated test login with schema/table creation and test-data permissions limited to that database using approved administration tools.

From the repository root, build:
```powershell
pnpm --filter @intrusionshield/database build
pnpm --filter @intrusionshield/core build
```

Set connection configuration in the current PowerShell session:
```powershell
$env:RUBY_LICENSING_TEST_SERVER = 'localhost'
$env:RUBY_LICENSING_TEST_PORT = '1433'
$env:RUBY_LICENSING_TEST_DATABASE = 'RubyLicensingTest_01'
$credential = Get-Credential -Message 'Dedicated licensing test SQL login'
$env:RUBY_LICENSING_TEST_USER = $credential.UserName
$env:RUBY_LICENSING_TEST_PASSWORD = $credential.GetNetworkCredential().Password
$env:RUBY_LICENSING_TEST = '1'
try {
    node --test packages/database/test/licensing-live.test.mjs
} finally {
    Remove-Item Env:RUBY_LICENSING_TEST_PASSWORD, Env:RUBY_LICENSING_TEST -ErrorAction SilentlyContinue
    Remove-Variable credential -ErrorAction SilentlyContinue
}
```

Use the server hostname matching the SQL Server certificate and the existing trusted CA configuration (NODE_EXTRA_CA_CERTS if required). Do not disable certificate validation. Never paste credentials into chat or commit them.

Expected: one test passed, zero failures, zero skips. A skipped test is not acceptance. The test creates schema and records only in the dedicated empty database and leaves them for inspection. For a repeat run provision a new empty test database; do not reset or drop any existing database automatically.

This test checks repository behavior and composite foreign key integrity, not runtime role permissions, production migration readiness or API authorization.

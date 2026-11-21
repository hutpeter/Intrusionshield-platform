param(
    [Parameter(Mandatory = $true)]
    [string]$Config
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if (-not [System.IO.Path]::IsPathRooted($Config)) { throw 'Use an absolute account configuration path.' }
$Config = (Resolve-Path -LiteralPath $Config).Path
$account = Get-Content -LiteralPath $Config -Raw | ConvertFrom-Json
$secrets = Join-Path (Split-Path -Parent $Config) 'secrets'
$sqlFile = Join-Path $secrets 'administrator-user.sql'
$grantFile = Join-Path $secrets 'administrator-access.json'
if ((Test-Path -LiteralPath $sqlFile) -or (Test-Path -LiteralPath $grantFile)) {
    throw 'Administrator setup files already exist. Preserve them and resume their existing setup; do not recreate or overwrite.'
}
$null = Get-Command sqlcmd -ErrorAction Stop
$null = Get-Command pnpm -ErrorAction Stop
Push-Location (Split-Path -Parent $PSScriptRoot)
try {
    & pnpm --filter '@intrusionshield/sterile-processing-service' build:account
    if ($LASTEXITCODE -ne 0) { throw 'Account dependency build failed; no account or grant was created.' }
    $password = Read-Host 'Choose password for sterile.admin.test (20-128 characters)' -AsSecureString
    $confirmation = $null
    $previousEncoding = $OutputEncoding
    try {
        $confirmation = Read-Host 'Confirm administrator password' -AsSecureString
        if ([System.Net.NetworkCredential]::new('', $password).Password -cne [System.Net.NetworkCredential]::new('', $confirmation).Password) {
            throw 'Passwords do not match. No account or grant was created.'
        }
        $OutputEncoding = [System.Text.UTF8Encoding]::new($false)
        @{ administratorPassword = [System.Net.NetworkCredential]::new('', $password).Password } |
            ConvertTo-Json -Compress |
            node scripts/sterile-account-prepare-administrator.mjs --config $Config
        if ($LASTEXITCODE -ne 0) { throw 'Private administrator preparation failed; no SQL account or access grant was applied.' }
    }
    finally {
        $OutputEncoding = $previousEncoding
        if ($null -ne $password) { $password.Dispose() }
        if ($null -ne $confirmation) { $confirmation.Dispose() }
    }
    # Dedicated provisioning uses the current Windows administrator connection.
    # The running account application's SQL reader and its privileges are unchanged.
    $previousErrorPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $sqlOutput = & sqlcmd -S 'tcp:localhost,1433' -E -N -b -d intrusionshield -f 65001 -i $sqlFile 2>&1
        $sqlExitCode = $LASTEXITCODE
    }
    finally { $ErrorActionPreference = $previousErrorPreference }
    if ($sqlExitCode -ne 0) {
        $logFile = Join-Path $secrets ('administrator-sql-failure-' + [guid]::NewGuid().ToString() + '.log')
        $sqlOutput | Out-File -LiteralPath $logFile -Encoding utf8 -NoClobber
        throw "SQL provisioning did not report success. No access grant was applied. Keep the existing setup files. Private diagnostics: $logFile"
    }
    & pnpm sterile:account:access --store $account.accessFile --change $grantFile
    if ($LASTEXITCODE -ne 0) {
        throw 'The SQL identity was created, but access enrollment failed. Preserve administrator-access.json and resume that grant; do not recreate the identity.'
    }
    Write-Host 'Dedicated local administrator created: sterile.admin.test'
    Write-Host 'Access management only. No processing, inspection, release or platform-superuser permission was granted.'
    Write-Host ('Restart Ruby Sterile Management and sign in at ' + $account.origin + ' using the password you chose.')
}
finally { Pop-Location }

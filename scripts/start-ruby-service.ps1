param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("gateway", "authentication", "his", "telemetry-energy")]
    [string]$Service
)

$ErrorActionPreference = "Stop"

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$secretDirectory = Join-Path $env:APPDATA "Ruby\Secrets"

$databaseCredentialPath = Join-Path $secretDirectory "database.credential.xml"
$authenticationSecretPath = Join-Path $secretDirectory "authentication-secret.xml"

if (-not (Test-Path $databaseCredentialPath)) {
    throw "Ruby encrypted database credential was not found."
}

if (-not (Test-Path $authenticationSecretPath)) {
    throw "Ruby encrypted authentication secret was not found."
}

$credential = Import-Clixml -Path $databaseCredentialPath

if ($credential -isnot [System.Management.Automation.PSCredential]) {
    throw "Ruby database credential is invalid."
}

$env:DB_USERNAME = $credential.UserName
$env:DB_USER = $credential.UserName
$env:DB_PASSWORD = $credential.GetNetworkCredential().Password

Remove-Variable credential -ErrorAction SilentlyContinue

$encryptedSecret = [System.IO.File]::ReadAllText(
    $authenticationSecretPath
).Trim()

$secureSecret = ConvertTo-SecureString -String $encryptedSecret

$secretPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR(
    $secureSecret
)

try {
    $env:AUTH_TOKEN_SECRET = [Runtime.InteropServices.Marshal]::PtrToStringBSTR(
        $secretPointer
    )
}
finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretPointer)
    Remove-Variable secureSecret -ErrorAction SilentlyContinue
    Remove-Variable encryptedSecret -ErrorAction SilentlyContinue
}

$packageName = switch ($Service) {
    "gateway"          { "@intrusionshield/gateway-service" }
    "authentication"   { "@intrusionshield/authentication-service" }
    "his"              { "@intrusionshield/his-service" }
    "telemetry-energy" { "@intrusionshield/telemetry-energy-service" }
}

Set-Location $repositoryRoot

Write-Host "[Ruby Startup] Starting $Service"

try {
    pnpm --filter $packageName start

    if ($LASTEXITCODE -ne 0) {
        throw "Ruby service '$Service' exited with code $LASTEXITCODE."
    }
}
finally {
    Remove-Item Env:DB_PASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:AUTH_TOKEN_SECRET -ErrorAction SilentlyContinue
}
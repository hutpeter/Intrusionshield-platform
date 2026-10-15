$ErrorActionPreference = "Stop"

$root = "D:\Projects\Latest\CMS\NodeJS\Versions\intrusionshield-platform"
$node = "C:\nvm4w\nodejs\node.exe"
$envFile = Join-Path $root ".env.local"
$entryPoint = Join-Path $root "services\platform-operations\dist\index.js"
$logDirectory = Join-Path $env:LOCALAPPDATA "Ruby\Logs"

New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null

$logFile = Join-Path $logDirectory "platform-operations.log"

Set-Location $root

if (-not (Test-Path $node)) {
    throw "Node.js executable not found."
}

if (-not (Test-Path $envFile)) {
    throw "Ruby environment configuration not found."
}

if (-not (Test-Path $entryPoint)) {
    throw "Platform Operations build not found."
}

$listener = Get-NetTCPConnection `
    -LocalPort 4402 `
    -State Listen `
    -ErrorAction SilentlyContinue

if ($listener) {
    Add-Content $logFile "[$(Get-Date -Format o)] Platform Operations already running."
    exit 0
}

Add-Content $logFile "[$(Get-Date -Format o)] Starting Ruby Platform Operations."

& $node "--env-file=$envFile" $entryPoint *>> $logFile

$exitCode = $LASTEXITCODE

Add-Content $logFile "[$(Get-Date -Format o)] Platform Operations exited with code $exitCode."

exit $exitCode
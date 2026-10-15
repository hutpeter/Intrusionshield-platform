
# Export-RubyDevelopment.ps1
# Run from the root of Intrusionshield-platform.
# Creates small, categorized ZIP archives for Ruby BAS/EMS development.

param(
    [string]$ProjectRoot = $PSScriptRoot,
    [string]$OutputFolder = "Ruby-Development-Export"
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
    $ProjectRoot = (Get-Location).Path
}

$ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
$ExportRoot = Join-Path $ProjectRoot $OutputFolder

# Prevent exporting into the project root accidentally.
if ($ExportRoot -eq $ProjectRoot) {
    throw "Export directory must differ from project root."
}

# Files and directories never included.
$ExcludedDirectories = @(
    "node_modules", ".git", ".turbo", "dist", "build",
    "coverage", ".next", ".cache", ".pnpm-store",
    ".vscode", ".idea", "tmp", "temp", "logs",
    "Ruby-Development-Export"
)

$ExcludedFileNames = @(
    ".env", ".env.local", ".env.production",
    ".env.development", ".env.test",
    ".npmrc", ".pypirc",
    "id_rsa", "id_ed25519",
    "credentials.json", "service-account.json"
)

$ExcludedExtensions = @(
    ".zip", ".7z", ".rar", ".exe", ".dll", ".pdb",
    ".db", ".sqlite", ".bak", ".log", ".pem",
    ".pfx", ".p12", ".key", ".cer", ".crt"
)

# Separate logical development packages.
$Groups = [ordered]@{
    "01-BAS-Telemetry-Service" = @(
        "services/telemetry-energy"
    )

    "02-BAS-Simulator" = @(
        "services/energy-simulator"
    )

    "03-Shared-Platform-Packages" = @(
        "packages/common",
        "packages/config",
        "packages/core",
        "packages/contracts",
        "packages/dependency-injection",
        "packages/infrastructure",
        "packages/logging",
        "packages/platform-kernel",
        "packages/security",
        "packages/validation"
    )

    "04-Database-And-Repositories" = @(
        "packages/database",
        "packages/repositories"
    )

    "05-Admin-Portal" = @(
        "apps/admin-portal"
    )

    "06-Authentication-And-Identity" = @(
        "services/authentication",
        "packages/identity"
    )

    "07-Project-Configuration" = @(
        "package.json",
        "pnpm-workspace.yaml",
        "pnpm-lock.yaml",
        "turbo.json",
        "tsconfig.json",
        "tsconfig.base.json",
        "vitest.config.ts"
    )
}

# Only export code, tests, schemas, and configuration files.
$AllowedExtensions = @(
    ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
    ".json", ".jsonc", ".yaml", ".yml",
    ".sql", ".prisma", ".graphql", ".gql",
    ".md", ".css", ".scss", ".html",
    ".xml", ".toml", ".txt", ".ps1"
)

$AllowedSpecialFiles = @(
    "Dockerfile",
    ".gitignore",
    ".dockerignore"
)

function Test-ExportableFile {
    param([System.IO.FileInfo]$File)

    $relative = $File.FullName.Substring($ProjectRoot.Length).
        TrimStart([char[]]@('\', '/'))

    $segments = $relative -split '[\\/]'

    foreach ($segment in $segments) {
        if ($ExcludedDirectories -contains $segment) {
            return $false
        }
    }

    $name = $File.Name

    if ($name -in $ExcludedFileNames) {
        return $false
    }

    # Exclude every .env variant, except example templates.
    if ($name -match '^\.env($|\.)' -and
        $name -notmatch '^\.env\.example$') {
        return $false
    }

    # Exclude obvious private or secret configuration.
    if ($name -match '(?i)(secret|credential|private[-_.]?key|token)' -and
        $name -notmatch '(?i)(test|spec|example)') {
        return $false
    }

    if ($File.Extension -in $ExcludedExtensions) {
        return $false
    }

    if ($File.Extension -in $AllowedExtensions) {
        return $true
    }

    if ($name -in $AllowedSpecialFiles) {
        return $true
    }

    return $false
}

function Export-Group {
    param(
        [string]$GroupName,
        [string[]]$Paths
    )

    $StagingRoot = Join-Path $ExportRoot "_staging_$GroupName"
    $ZipPath = Join-Path $ExportRoot "$GroupName.zip"

    New-Item -ItemType Directory -Path $StagingRoot -Force |
        Out-Null

    $CopiedFiles = 0

    foreach ($relativePath in $Paths) {
        $sourcePath = Join-Path $ProjectRoot $relativePath

        if (-not (Test-Path -LiteralPath $sourcePath)) {
            Write-Host "  Skipping missing path: $relativePath" `
                -ForegroundColor DarkYellow
            continue
        }

        $item = Get-Item -LiteralPath $sourcePath

        if ($item.PSIsContainer) {
            $files = Get-ChildItem -LiteralPath $sourcePath `
                -File -Recurse -Force

            foreach ($file in $files) {
                if (-not (Test-ExportableFile -File $file)) {
                    continue
                }

                $relative = $file.FullName.
                    Substring($ProjectRoot.Length).
                    TrimStart([char[]]@('\', '/'))

                $destination = Join-Path $StagingRoot $relative
                $destinationDirectory = Split-Path $destination -Parent

                New-Item -ItemType Directory `
                    -Path $destinationDirectory -Force | Out-Null

                Copy-Item -LiteralPath $file.FullName `
                    -Destination $destination -Force

                $CopiedFiles++
            }
        }
        else {
            if (Test-ExportableFile -File $item) {
                $destination = Join-Path $StagingRoot $relativePath
                $destinationDirectory = Split-Path $destination -Parent

                New-Item -ItemType Directory `
                    -Path $destinationDirectory -Force | Out-Null

                Copy-Item -LiteralPath $item.FullName `
                    -Destination $destination -Force

                $CopiedFiles++
            }
        }
    }

    if ($CopiedFiles -gt 0) {
        if (Test-Path -LiteralPath $ZipPath) {
            Remove-Item -LiteralPath $ZipPath -Force
        }

        Compress-Archive `
            -Path (Join-Path $StagingRoot "*") `
            -DestinationPath $ZipPath `
            -CompressionLevel Optimal

        $sizeMB = [math]::Round(
            (Get-Item $ZipPath).Length / 1MB, 2
        )

        Write-Host (
            "Created: {0} | {1} files | {2} MB" -f
            $GroupName, $CopiedFiles, $sizeMB
        ) -ForegroundColor Green
    }
    else {
        Write-Host "No files found for $GroupName" `
            -ForegroundColor Yellow
    }

    Remove-Item -LiteralPath $StagingRoot `
        -Recurse -Force

    return [PSCustomObject]@{
        Group = $GroupName
        Files = $CopiedFiles
        Zip = $ZipPath
    }
}

Write-Host ""
Write-Host "Ruby BAS/EMS Development Export" -ForegroundColor Cyan
Write-Host "Project: $ProjectRoot"
Write-Host ""

New-Item -ItemType Directory -Path $ExportRoot -Force |
    Out-Null

$results = @()

foreach ($group in $Groups.GetEnumerator()) {
    $results += Export-Group `
        -GroupName $group.Key `
        -Paths $group.Value
}

Write-Host ""
Write-Host "Export Summary" -ForegroundColor Cyan
$results | Format-Table Group, Files, Zip -AutoSize

Write-Host "Export location: $ExportRoot" -ForegroundColor Green
Write-Host ""
Write-Host "Review ZIP contents for sensitive data before uploading." `
    -ForegroundColor Yellow

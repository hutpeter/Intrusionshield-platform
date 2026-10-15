$ErrorActionPreference = "Stop"

$baseUrl = "http://localhost:4401"
$tenant = "11111111-1111-4111-8111-111111111111"
$siteId = "f304a249-4bfd-4bae-908b-42f6f843770f"
$deviceId = "2231579b-dc0b-4b19-91e0-73159e8212cb"
$tempDefinitionId = "d22514ce-12e7-4fa8-9da6-d46b6da42fd3"
$humidityDefinitionId = "05bf1b31-963d-4427-98a0-6c89cf59c2f2"
$stateDefinitionId = "c70833d5-8d86-47a5-973a-ac6101eb9b11"

$headers = @{ "x-tenant-id" = $tenant; "Content-Type" = "application/json" }
$commandUri = "$baseUrl/api/v1/telemetry/sites/$siteId/devices/$deviceId/bas-command"

function Send-Reading([string]$definitionId, [Nullable[double]]$numericValue, [string]$stringValue) {
    $body = @{
        siteId = $siteId; deviceId = $deviceId; measurementDefinitionId = $definitionId
        observedAt = (Get-Date).ToUniversalTime().ToString("o"); quality = "GOOD"; source = "BAS-SIMULATOR"
    }
    if ($null -ne $numericValue) { $body.numericValue = $numericValue }
    if ($stringValue) { $body.stringValue = $stringValue }
    Invoke-RestMethod -Method Post -Uri "$baseUrl/api/v1/telemetry/readings" -Headers $headers -Body ($body | ConvertTo-Json) | Out-Null
}

Write-Host ""
Write-Host "Ruby BAS Backend-Controlled Simulator" -ForegroundColor Cyan
Write-Host "-------------------------------------"
Write-Host "Service: $baseUrl"
Write-Host "Device:  HVAC-COMM-44092"
Write-Host "Polling backend command every 5 seconds. Ctrl+C to stop."
Write-Host ""

$temperature = 72.0
$humidity = 45.0

while ($true) {
    try {
        $command = Invoke-RestMethod -Method Get -Uri $commandUri -Headers $headers
        $hvacState = "IDLE"
        $target = $null
        $mode = "NONE"

        if ($null -ne $command) {
            $mode = $command.mode
            $target = $command.setpointF
            if ($command.enabled) { $hvacState = $command.command }
        }

        if ($hvacState -eq "HEATING") {
            if ($null -ne $target -and $temperature -ge $target) { $hvacState = "IDLE" }
            else { $temperature += 0.2; $humidity -= 0.02 }
        }
        elseif ($hvacState -eq "COOLING") {
            if ($null -ne $target -and $temperature -le $target) { $hvacState = "IDLE" }
            else { $temperature -= 0.2; $humidity -= 0.03 }
        }
        else {
            if ($temperature -lt 72.0) { $temperature += 0.03 }
            elseif ($temperature -gt 72.0) { $temperature -= 0.03 }
            $humidity += (45.0 - $humidity) * 0.05
        }

        $temperature = [Math]::Round([Math]::Max(55.0, [Math]::Min(90.0, $temperature)), 1)
        $humidity = [Math]::Round([Math]::Max(20.0, [Math]::Min(80.0, $humidity)), 1)

        Send-Reading $tempDefinitionId $temperature ""
        Send-Reading $humidityDefinitionId $humidity ""
        Send-Reading $stateDefinitionId $null $hvacState

        $targetText = if ($null -eq $target) { "--" } else { "{0:N1}" -f [double]$target }
        Write-Host ("{0} | {1} | Target {2} F | Temp {3:N1} F | RH {4:N1}% | HVAC {5}" -f (Get-Date -Format "HH:mm:ss"), $mode, $targetText, $temperature, $humidity, $hvacState)
    }
    catch {
        Write-Host "Simulator failed: $($_.Exception.Message)" -ForegroundColor Red
        if ($_.ErrorDetails.Message) { Write-Host $_.ErrorDetails.Message -ForegroundColor Yellow }
        exit 1
    }
    Start-Sleep -Seconds 5
}

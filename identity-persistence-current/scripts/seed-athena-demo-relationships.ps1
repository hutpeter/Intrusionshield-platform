$ErrorActionPreference = "Stop"

$BaseUrl = "http://localhost:4300/api/v1/his"
$TenantId = "11111111-1111-4111-8111-111111111111"

$Headers = @{
    "x-tenant-id" = $TenantId
    "Content-Type" = "application/json"
}

function Invoke-AthenaPost {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,

        [Parameter(Mandatory = $true)]
        [hashtable]$Body
    )

    $json = $Body | ConvertTo-Json -Depth 10

    try {
        return Invoke-RestMethod `
            -Method Post `
            -Uri "$BaseUrl/$Path" `
            -Headers $Headers `
            -Body $json
    }
    catch {
        Write-Host ""
        Write-Host "POST FAILED: $Path" -ForegroundColor Red

        if ($_.ErrorDetails.Message) {
            Write-Host $_.ErrorDetails.Message -ForegroundColor Red
        }
        else {
            Write-Host $_.Exception.Message -ForegroundColor Red
        }

        throw
    }
}

function Get-DemoPerson {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Identifier
    )

    Write-Host "Resolving Person $Identifier ..."

    $encodedSearch = [System.Uri]::EscapeDataString($Identifier)

    $response = Invoke-RestMethod `
        -Method Get `
        -Uri "$BaseUrl/persons?page=1&pageSize=25&search=$encodedSearch" `
        -Headers $Headers

    $person = $response.items |
        Where-Object {
            $_.primaryIdentifier -eq $Identifier
        } |
        Select-Object -First 1

    if (-not $person) {
        throw "Could not resolve Person with identifier $Identifier."
    }

    Write-Host "  -> $($person.id)" -ForegroundColor DarkGray

    return $person
}

Write-Host ""
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host " Athena Demo Relationship Seed" -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Checking Athena HIS service..." -ForegroundColor Yellow

try {
    $health = Invoke-RestMethod `
        -Method Get `
        -Uri "http://localhost:4300/health"
}
catch {
    throw "Athena HIS service is not available on port 4300."
}

Write-Host "Athena HIS service: $($health.status)" -ForegroundColor Green
Write-Host ""

# ------------------------------------------------------------
# Resolve the eight existing demo Persons
# ------------------------------------------------------------

$Sarah   = Get-DemoPerson "PER-100001"
$Michael = Get-DemoPerson "PER-100002"
$James   = Get-DemoPerson "PER-100003"
$Emily   = Get-DemoPerson "PER-100004"
$Rachel  = Get-DemoPerson "PER-100005"
$Daniel  = Get-DemoPerson "PER-100006"
$Priya   = Get-DemoPerson "PER-100007"
$Robert  = Get-DemoPerson "PER-100008"

Write-Host ""
Write-Host "All demo Persons resolved." -ForegroundColor Green
Write-Host ""

# ------------------------------------------------------------
# Facilities
# ------------------------------------------------------------

Write-Host "Creating facilities..." -ForegroundColor Yellow
Write-Host ""

$CentralHospital = Invoke-AthenaPost `
    -Path "facilities" `
    -Body @{
        code = "CENTRAL-HOSP"
        name = "Central Hospital"
        facilityType = "HOSPITAL"
        status = "ACTIVE"
    }

Write-Host "CREATE FACILITY: Central Hospital"
Write-Host "  -> $($CentralHospital.id)" -ForegroundColor Green

$WestsideMedical = Invoke-AthenaPost `
    -Path "facilities" `
    -Body @{
        code = "WESTSIDE-MED"
        name = "Westside Medical"
        facilityType = "HOSPITAL"
        status = "ACTIVE"
    }

Write-Host "CREATE FACILITY: Westside Medical"
Write-Host "  -> $($WestsideMedical.id)" -ForegroundColor Green

$NorthClinic = Invoke-AthenaPost `
    -Path "facilities" `
    -Body @{
        code = "NORTH-CLINIC"
        name = "North Clinic"
        facilityType = "CLINIC"
        status = "ACTIVE"
    }

Write-Host "CREATE FACILITY: North Clinic"
Write-Host "  -> $($NorthClinic.id)" -ForegroundColor Green

Write-Host ""

# ------------------------------------------------------------
# Patients
# ------------------------------------------------------------

Write-Host "Creating patient roles..." -ForegroundColor Yellow
Write-Host ""

$SarahPatient = Invoke-AthenaPost `
    -Path "patients" `
    -Body @{
        personId = $Sarah.id
        medicalRecordNumber = "MRN-100024"
        patientNumber = "PAT-100024"
        status = "ACTIVE"
        registrationDate = "2026-01-15T09:00:00.000Z"
        communicationPreferences = @{
            preferredLanguage = "en"
            preferredContactMethod = "EMAIL"
        }
        emergencyContactPersonIds = @()
    }

Write-Host "CREATE PATIENT: Sarah Mitchell"
Write-Host "  -> $($SarahPatient.id)" -ForegroundColor Green

$JamesPatient = Invoke-AthenaPost `
    -Path "patients" `
    -Body @{
        personId = $James.id
        medicalRecordNumber = "MRN-100019"
        patientNumber = "PAT-100019"
        status = "ACTIVE"
        registrationDate = "2026-02-03T10:30:00.000Z"
        communicationPreferences = @{
            preferredLanguage = "en"
            preferredContactMethod = "PHONE"
        }
        emergencyContactPersonIds = @()
    }

Write-Host "CREATE PATIENT: James Wilson"
Write-Host "  -> $($JamesPatient.id)" -ForegroundColor Green

$DanielPatient = Invoke-AthenaPost `
    -Path "patients" `
    -Body @{
        personId = $Daniel.id
        medicalRecordNumber = "MRN-100031"
        patientNumber = "PAT-100031"
        status = "ACTIVE"
        registrationDate = "2026-03-12T13:15:00.000Z"
        communicationPreferences = @{
            preferredLanguage = "en"
            preferredContactMethod = "EMAIL"
        }
        emergencyContactPersonIds = @()
    }

Write-Host "CREATE PATIENT: Daniel Rodriguez"
Write-Host "  -> $($DanielPatient.id)" -ForegroundColor Green

$PriyaPatient = Invoke-AthenaPost `
    -Path "patients" `
    -Body @{
        personId = $Priya.id
        medicalRecordNumber = "MRN-100042"
        patientNumber = "PAT-100042"
        status = "ACTIVE"
        registrationDate = "2026-04-20T08:45:00.000Z"
        communicationPreferences = @{
            preferredLanguage = "en"
            preferredContactMethod = "EMAIL"
        }
        emergencyContactPersonIds = @()
    }

Write-Host "CREATE PATIENT: Priya Sharma"
Write-Host "  -> $($PriyaPatient.id)" -ForegroundColor Green

$RobertPatient = Invoke-AthenaPost `
    -Path "patients" `
    -Body @{
        personId = $Robert.id
        medicalRecordNumber = "MRN-100057"
        patientNumber = "PAT-100057"
        status = "ACTIVE"
        registrationDate = "2026-05-09T11:00:00.000Z"
        communicationPreferences = @{
            preferredLanguage = "en"
            preferredContactMethod = "PHONE"
        }
        emergencyContactPersonIds = @()
    }

Write-Host "CREATE PATIENT: Robert Campbell"
Write-Host "  -> $($RobertPatient.id)" -ForegroundColor Green

Write-Host ""

# ------------------------------------------------------------
# Practitioners
# ------------------------------------------------------------

Write-Host "Creating practitioner roles..." -ForegroundColor Yellow
Write-Host ""

$MichaelPractitioner = Invoke-AthenaPost `
    -Path "practitioners" `
    -Body @{
        personId = $Michael.id
        practitionerNumber = "PRAC-00481"
        practitionerType = "PHYSICIAN"
        status = "ACTIVE"
        effectiveFrom = "2025-01-01T00:00:00.000Z"
        licenses = @(
            @{
                jurisdiction = "Ontario"
                licenseNumber = "DEMO-LIC-00481"
                issuedAt = "2025-01-01T00:00:00.000Z"
                expiresAt = "2027-01-01T00:00:00.000Z"
            }
        )
        specialties = @(
            "Internal Medicine"
        )
    }

Write-Host "CREATE PRACTITIONER: Michael Chen"
Write-Host "  -> $($MichaelPractitioner.id)" -ForegroundColor Green

$RachelPractitioner = Invoke-AthenaPost `
    -Path "practitioners" `
    -Body @{
        personId = $Rachel.id
        practitionerNumber = "PRAC-00217"
        practitionerType = "PHYSICIAN"
        status = "ACTIVE"
        effectiveFrom = "2025-01-01T00:00:00.000Z"
        licenses = @(
            @{
                jurisdiction = "Ontario"
                licenseNumber = "DEMO-LIC-00217"
                issuedAt = "2025-01-01T00:00:00.000Z"
                expiresAt = "2027-01-01T00:00:00.000Z"
            }
        )
        specialties = @(
            "Cardiology"
        )
    }

Write-Host "CREATE PRACTITIONER: Rachel Patel"
Write-Host "  -> $($RachelPractitioner.id)" -ForegroundColor Green

$PriyaPractitioner = Invoke-AthenaPost `
    -Path "practitioners" `
    -Body @{
        personId = $Priya.id
        practitionerNumber = "PRAC-00625"
        practitionerType = "PHYSICIAN"
        status = "ACTIVE"
        effectiveFrom = "2025-01-01T00:00:00.000Z"
        licenses = @(
            @{
                jurisdiction = "Ontario"
                licenseNumber = "DEMO-LIC-00625"
                issuedAt = "2025-01-01T00:00:00.000Z"
                expiresAt = "2027-01-01T00:00:00.000Z"
            }
        )
        specialties = @(
            "Family Medicine"
        )
    }

Write-Host "CREATE PRACTITIONER: Priya Sharma"
Write-Host "  -> $($PriyaPractitioner.id)" -ForegroundColor Green

Write-Host ""
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host " Athena relationship seed completed" -ForegroundColor Green
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Facilities created:"
Write-Host "  Central Hospital : $($CentralHospital.id)"
Write-Host "  Westside Medical : $($WestsideMedical.id)"
Write-Host "  North Clinic     : $($NorthClinic.id)"

Write-Host ""
Write-Host "Patients created:"
Write-Host "  Sarah Mitchell   : $($SarahPatient.id)"
Write-Host "  James Wilson     : $($JamesPatient.id)"
Write-Host "  Daniel Rodriguez : $($DanielPatient.id)"
Write-Host "  Priya Sharma     : $($PriyaPatient.id)"
Write-Host "  Robert Campbell  : $($RobertPatient.id)"

Write-Host ""
Write-Host "Practitioners created:"
Write-Host "  Michael Chen     : $($MichaelPractitioner.id)"
Write-Host "  Rachel Patel     : $($RachelPractitioner.id)"
Write-Host "  Priya Sharma     : $($PriyaPractitioner.id)"

Write-Host ""
Write-Host "Emily Thompson remains Person-only." -ForegroundColor DarkGray
Write-Host "Priya Sharma intentionally has both Patient and Practitioner roles." -ForegroundColor DarkGray
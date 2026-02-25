# Run this script in an elevated (Admin) PowerShell
# Usage: powershell -ExecutionPolicy Bypass -File deploy.ps1

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$env:PATH = "C:\Users\garretm\AppData\Local\Programs\Podman;$env:PATH"
$env:CONTAINERS_MACHINE_PROVIDER = "wsl"
$env:ASPIRE_CONTAINER_RUNTIME = "podman"
$env:Azure__SubscriptionId = "7166c8c2-b903-48cb-a55c-ad5c5a3e656d"
$env:Azure__Location = "westus2"
$env:Azure__ResourceGroup = "utctux"

$state = podman machine list --format '{{.LastUp}}' 2>$null
if ($state -eq "Currently running") {
    Write-Host "Podman machine already running." -ForegroundColor Green
} else {
    Write-Host "Starting podman machine..." -ForegroundColor Cyan
    podman machine start
}

Write-Host "Verifying podman..." -ForegroundColor Cyan
podman info --format '{{.Host.OSType}}'

Write-Host "Starting aspire deploy..." -ForegroundColor Cyan
aspire deploy --project src\utctux.AppHost\utctux.AppHost.csproj --log-level debug

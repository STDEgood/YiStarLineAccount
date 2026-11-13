# YiStarLine Account Unified App - uninstaller (ASCII only)
param(
    [switch]$Silent,
    [switch]$KeepData
)

$ErrorActionPreference = 'SilentlyContinue'
$installDir = Split-Path -Parent $PSScriptRoot

function Write-Step([string]$text) { if (-not $Silent) { Write-Host "  $text" } }

if (-not $Silent) {
    Write-Host ''
    Write-Host 'YiStarLine Account Unified App - Uninstall'
    Write-Host '------------------------------------------'
    $answer = Read-Host "Remove $installDir, shortcuts, autostart entry and the uninstall registry key? (y/N)"
    if ($answer -notmatch '^[Yy]') { Write-Host 'Cancelled.'; exit 0 }
}

Write-Step 'Stopping client/service...'
Get-Process 'YiStarLine Account Unified App' -ErrorAction SilentlyContinue | Stop-Process -Force
Get-CimInstance Win32_Process -Filter "Name='pythonw.exe' OR Name='python.exe'" |
    Where-Object { $_.CommandLine -like '*YiStarLineAccount*server.py*' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Start-Sleep -Milliseconds 600

Write-Step 'Removing shortcuts...'
$lnk1 = Join-Path ([Environment]::GetFolderPath('Desktop')) 'YiStarLine Account.lnk'
$lnk2 = Join-Path ([Environment]::GetFolderPath('Programs')) 'YiStarLine Account.lnk'
Remove-Item $lnk1, $lnk2 -Force

Write-Step 'Removing autostart and uninstall entry...'
reg delete 'HKCU\Software\Microsoft\Windows\CurrentVersion\Run' /v YiStarLineAccount /f | Out-Null
Remove-Item 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\YiStarLineAccount' -Recurse -Force

$dataDir = Join-Path $env:USERPROFILE 'YiStarLineAccount'
if (-not $KeepData) {
    if ($Silent) {
        $removeData = $false
    } else {
        $answer = Read-Host "Also delete account data at $dataDir ? This cannot be undone. (y/N)"
        $removeData = $answer -match '^[Yy]'
    }
    if ($removeData) {
        Write-Step 'Removing account data...'
        Remove-Item $dataDir -Recurse -Force
    }
}

Write-Step 'Removing program files...'
Set-Location $env:TEMP
Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', "ping -n 2 127.0.0.1 >nul & rd /s /q `"$installDir`"" -WindowStyle Hidden

if (-not $Silent) {
    Write-Host ''
    Write-Host 'Uninstalled.' -ForegroundColor Green
    Write-Host ''
    Start-Sleep -Seconds 2
}

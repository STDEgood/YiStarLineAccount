# YiStarLine Account Unified App - installer
# ASCII only on purpose: Windows PowerShell 5.1 reads BOM-less files as ANSI.
param(
    [string]$InstallDir = (Join-Path $env:LOCALAPPDATA 'Programs\YiStarLineAccount'),
    [switch]$NoShortcuts,
    [switch]$NoRegistry,
    [switch]$NoAutostart
)

$ErrorActionPreference = 'Stop'
$source = Split-Path -Parent $PSScriptRoot
$exeName = 'YiStarLine Account Unified App.exe'

function Write-Step([string]$text) { Write-Host "  $text" }

function Stop-YauaProcesses {
    Get-Process 'YiStarLine Account Unified App' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Get-CimInstance Win32_Process -Filter "Name='pythonw.exe' OR Name='python.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -like '*YiStarLineAccount*server.py*' } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Milliseconds 600
}

Write-Host ''
Write-Host 'YiStarLine Account Unified App - Setup'
Write-Host '-------------------------------------'
Write-Host "Target: $InstallDir"
Write-Host ''

Write-Step 'Stopping running client/service...'
Stop-YauaProcesses

Write-Step 'Copying files...'
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
$items = @('app', 'web', 'desktop', 'run', 'integration', 'installer', 'docs', 'README.md', $exeName, "$exeName.config")
foreach ($item in $items) {
    $src = Join-Path $source $item
    if (Test-Path $src) {
        Copy-Item $src -Destination $InstallDir -Recurse -Force
    }
}

$installedExe = Join-Path $InstallDir $exeName
if (-not (Test-Path $installedExe)) {
    throw "Install failed: $exeName not found after copy."
}

if (-not $NoShortcuts) {
    Write-Step 'Creating shortcuts...'
    $shell = New-Object -ComObject WScript.Shell
    $icon = Join-Path $InstallDir 'desktop\app.ico'
    $targets = @(
        (Join-Path ([Environment]::GetFolderPath('Desktop')) 'YiStarLine Account.lnk'),
        (Join-Path ([Environment]::GetFolderPath('Programs')) 'YiStarLine Account.lnk')
    )
    foreach ($lnkPath in $targets) {
        $lnk = $shell.CreateShortcut($lnkPath)
        $lnk.TargetPath = $installedExe
        $lnk.WorkingDirectory = $InstallDir
        $lnk.Description = 'YiStarLine Account Unified App'
        if (Test-Path $icon) { $lnk.IconLocation = "$icon,0" }
        $lnk.Save()
    }
}

if (-not $NoAutostart) {
    Write-Step 'Enabling start with Windows (can be turned off in the app)...'
    $vbs = Join-Path $InstallDir 'run\start-service.vbs'
    if (Test-Path $vbs) {
        $runValue = 'wscript.exe "' + $vbs + '"'
        reg add 'HKCU\Software\Microsoft\Windows\CurrentVersion\Run' /v YiStarLineAccount /t REG_SZ /d $runValue /f | Out-Null
    }
}

if (-not $NoRegistry) {
    Write-Step 'Registering uninstall entry...'
    $key = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\YiStarLineAccount'
    New-Item -Path $key -Force | Out-Null
    $sizeKb = [int]((Get-ChildItem $InstallDir -Recurse -File | Measure-Object Length -Sum).Sum / 1KB)
    $uninstallScript = Join-Path $InstallDir 'installer\uninstall.ps1'
    $uninstallCmd = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "' + $uninstallScript + '"'
    Set-ItemProperty -Path $key -Name DisplayName -Value 'YiStarLine Account Unified App'
    Set-ItemProperty -Path $key -Name DisplayVersion -Value '1.2.0'
    Set-ItemProperty -Path $key -Name Publisher -Value 'YiStarLine'
    Set-ItemProperty -Path $key -Name InstallLocation -Value $InstallDir
    Set-ItemProperty -Path $key -Name DisplayIcon -Value $installedExe
    Set-ItemProperty -Path $key -Name UninstallString -Value $uninstallCmd
    Set-ItemProperty -Path $key -Name QuietUninstallString -Value $uninstallCmd
    Set-ItemProperty -Path $key -Name EstimatedSize -Value $sizeKb -Type DWord
    Set-ItemProperty -Path $key -Name NoModify -Value 1 -Type DWord
    Set-ItemProperty -Path $key -Name NoRepair -Value 1 -Type DWord
}

Write-Host ''
Write-Host 'Install complete.' -ForegroundColor Green
Write-Host "  Location : $InstallDir"
Write-Host '  Launch   : desktop / Start Menu shortcut "YiStarLine Account"'
Write-Host ''

if (-not $NoAutostart) {
    $answer = Read-Host 'Start now? (Y/n)'
    if ($answer -eq '' -or $answer -match '^[Yy]') {
        Start-Process -FilePath $installedExe -WorkingDirectory $InstallDir
    }
}

@echo off
rem YiStarLine Account - start the local service automatically when this Windows user signs in.
rem Only the background service starts; open the desktop client when you need the manager window.
setlocal EnableExtensions
cd /d "%~dp0.."

set "VBS=%~dp0start-service.vbs"
if not exist "%VBS%" (
  echo start-service.vbs not found.
  pause
  exit /b 1
)

reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v YiStarLineAccount /t REG_SZ /d "wscript.exe \"%VBS%\"" /f
if errorlevel 1 (
  echo Failed to write the startup entry.
) else (
  echo Autostart enabled: %VBS%
)
timeout /t 2 >nul
exit /b 0

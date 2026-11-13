@echo off
rem YiStarLine Account - remove the autostart entry
setlocal EnableExtensions
cd /d "%~dp0.."

reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v YiStarLineAccount /f >nul 2>nul
if errorlevel 1 (
  echo No autostart entry was found.
) else (
  echo Autostart disabled.
)
timeout /t 2 >nul
exit /b 0

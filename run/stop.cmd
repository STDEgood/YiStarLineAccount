@echo off
rem YiStarLine Account - stop the background service using data\runtime.json
setlocal EnableExtensions
cd /d "%~dp0.."

if not exist "data\runtime.json" (
  echo Service is not running ^(no data\runtime.json^).
  timeout /t 2 >nul
  exit /b 0
)

set "PID="
for /f "usebackq delims=" %%A in (`powershell -NoProfile -Command "try { (Get-Content 'data/runtime.json' -Raw -ErrorAction Stop | ConvertFrom-Json).pid } catch { '' }"`) do set "PID=%%A"

if not defined PID (
  echo Could not read the service PID.
  timeout /t 3 >nul
  exit /b 1
)

echo Stopping YiStarLine Account ^(PID %PID%^)...
taskkill /PID %PID% /F >nul 2>nul
if errorlevel 1 (
  echo Process not found; it may already be stopped.
) else (
  echo Stopped.
)
timeout /t 2 >nul
exit /b 0

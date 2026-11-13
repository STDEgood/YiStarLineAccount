@echo off
rem YiStarLine Account - start the local SSO service only (no window), for autostart.
setlocal EnableExtensions
cd /d "%~dp0.."

set "PYCMD="
where pythonw.exe >nul 2>nul && set "PYCMD=pythonw.exe"
if not defined PYCMD where pyw.exe >nul 2>nul && set "PYCMD=pyw.exe -3"
if not defined PYCMD where python.exe >nul 2>nul && set "PYCMD=python.exe"
if not defined PYCMD where py.exe >nul 2>nul && set "PYCMD=py.exe -3"

if not defined PYCMD (
  if not exist "logs" mkdir "logs"
  >>"logs\launcher.log" echo [%date% %time%] Python 3 not found in PATH. Install Python 3.9+ or add it to PATH.
  exit /b 1
)

start "" %PYCMD% "app\server.py" --quiet
exit /b 0

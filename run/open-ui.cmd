@echo off
rem YiStarLine Account - open the management UI in the default browser
setlocal EnableExtensions
cd /d "%~dp0.."

set "URL="
for /f "usebackq delims=" %%A in (`powershell -NoProfile -Command "try { (Get-Content 'data/runtime.json' -Raw -ErrorAction Stop | ConvertFrom-Json).base_url } catch { 'http://127.0.0.1:8600' }"`) do set "URL=%%A"

start "" "%URL%"
exit /b 0

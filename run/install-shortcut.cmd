@echo off
rem YiStarLine Account - create a desktop shortcut for the desktop client.
setlocal EnableExtensions
cd /d "%~dp0.."

set "EXE=%CD%\YiStarLine Account Unified App.exe"
set "LNK=%USERPROFILE%\Desktop\YiStarLine Account Unified App.lnk"

if not exist "%EXE%" (
  echo Desktop client not found: %EXE%
  echo Build it first with desktop\build-desktop.cmd
  pause
  exit /b 1
)

powershell -NoProfile -Command ^
  "$s=(New-Object -ComObject WScript.Shell).CreateShortcut('%LNK%');" ^
  "$s.TargetPath='%EXE%';" ^
  "$s.WorkingDirectory='%CD%';" ^
  "$s.IconLocation='%EXE%,0';" ^
  "$s.Description='YiStarLine Account Unified App - offline single sign-on';" ^
  "$s.Save()"

if errorlevel 1 (
  echo Failed to create the shortcut.
) else (
  echo Shortcut created: %LNK%
)
timeout /t 2 >nul
exit /b 0

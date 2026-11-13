@echo off
rem YiStarLine Account - run in console mode (keeps the window open, shows logs).
setlocal EnableExtensions
cd /d "%~dp0.."
title YiStarLine Account - local SSO service

set "PYCMD="
where python.exe >nul 2>nul && set "PYCMD=python.exe"
if not defined PYCMD where py.exe >nul 2>nul && set "PYCMD=py.exe -3"
if not defined PYCMD (
  echo Python 3 was not found in PATH.
  pause
  exit /b 1
)

%PYCMD% "app\server.py" --console --open
echo.
echo Service stopped.
pause

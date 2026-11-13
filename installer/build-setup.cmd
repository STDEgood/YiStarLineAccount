@echo off
rem Build the distributable Setup package (offline, no external tools).
setlocal EnableExtensions
cd /d "%~dp0.."

set "ROOT=%CD%"
set "DIST=%ROOT%\dist"
set "STAGE=%DIST%\stage\YiStarLineAccount"
set "ZIP=%DIST%\YiStarLine Account Unified App Setup.zip"
set "EXE=%DIST%\YiStarLine Account Unified App Setup.exe"
set "PAYLOAD=%DIST%\payload.zip"
set "CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe"

echo.
echo  YiStarLine Account Unified App - package build
echo.

if exist "%DIST%" rmdir /s /q "%DIST%"
mkdir "%STAGE%"

echo [1/5] copying files
for %%D in (app web desktop run integration installer docs) do (
  xcopy "%%D" "%STAGE%\%%D\" /E /I /Y /Q >nul
)
copy /y "README.md" "%STAGE%\README.md" >nul
copy /y "YiStarLine Account Unified App.exe" "%STAGE%\" >nul
copy /y "YiStarLine Account Unified App.exe.config" "%STAGE%\" >nul

> "%STAGE%\Setup.cmd" echo @echo off
>>"%STAGE%\Setup.cmd" echo cd /d "%%~dp0"
>>"%STAGE%\Setup.cmd" echo powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%%~dp0installer\install.ps1"
>>"%STAGE%\Setup.cmd" echo pause

echo [2/5] creating zip
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "Compress-Archive -Path '%STAGE%' -DestinationPath '%ZIP%' -CompressionLevel Optimal -Force"
if not exist "%ZIP%" ( echo  zip build FAILED & exit /b 1 )

echo [3/5] compiling self-extracting setup host
if not exist "%CSC%" ( echo  csc not found, skipping exe & goto :summary )
copy /y "%ZIP%" "%PAYLOAD%" >nul
"%CSC%" /nologo /target:winexe /optimize+ "/out:%EXE%" "/resource:%PAYLOAD%,payload.zip" ^
  /reference:System.IO.Compression.dll /reference:System.IO.Compression.FileSystem.dll ^
  installer\SetupHost.cs
if errorlevel 1 ( echo  exe build FAILED & del "%PAYLOAD%" & goto :summary )
del "%PAYLOAD%"

:summary
echo [4/5] cleanup stage
rmdir /s /q "%DIST%\stage"

echo [5/5] done
for %%F in ("%ZIP%") do echo  Package (zip): %%~fF  (%%~zF bytes)
if exist "%EXE%" for %%F in ("%EXE%") do echo  Setup  (exe): %%~fF  (%%~zF bytes)
echo.

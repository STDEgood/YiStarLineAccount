@echo off
rem YiStarLine Account - build the desktop client with the in-box .NET Framework compiler.
rem No internet access and no SDK required.
setlocal EnableExtensions
cd /d "%~dp0.."

set "CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if not exist "%CSC%" (
  echo .NET Framework 4.x C# compiler not found: %CSC%
  pause
  exit /b 1
)

if not exist "desktop\lib\Microsoft.Web.WebView2.Core.dll" (
  echo Missing desktop\lib\Microsoft.Web.WebView2.Core.dll - see README for details.
  pause
  exit /b 1
)

echo Compiling desktop client...
"%CSC%" /nologo /target:winexe /platform:x64 /optimize+ /langversion:5 ^
  /win32icon:"desktop\app.ico" /resource:"desktop\app.ico",app.ico ^
  /out:"YiStarLine Account Unified App.exe" ^
  /reference:System.dll ^
  /reference:System.Core.dll ^
  /reference:System.Drawing.dll ^
  /reference:System.Windows.Forms.dll ^
  /reference:"desktop\lib\Microsoft.Web.WebView2.Core.dll" ^
  /reference:"desktop\lib\Microsoft.Web.WebView2.WinForms.dll" ^
  "desktop\YiStarLineAccount.cs"

if errorlevel 1 (
  echo Build failed.
  pause
  exit /b 1
)

echo.
echo Build OK: %CD%\YiStarLine Account Unified App.exe
echo.
exit /b 0

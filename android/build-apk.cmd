@echo off
rem YiStarLine Account Unified App - build a signed Android APK fully offline.
rem Pipeline: javac -> d8 -> aapt2 -> zipalign -> apksigner (no Gradle, no network).
setlocal EnableExtensions
cd /d "%~dp0.."

set "SDK=%LOCALAPPDATA%\Android\Sdk"
set "BT=%SDK%\build-tools\36.0.0"
set "PLATFORM=%SDK%\platforms\android-37.0\android.jar"
set "PROJ=%CD%\android"
set "SRC=%PROJ%\app\src\main"
set "BUILD=%PROJ%\build"
set "OUT=%PROJ%\out"
set "KS=%PROJ%\keystore\yaua-release.jks"
set "JAVAC=%JAVA_HOME%bin\javac.exe"
set "JARTOOL=%JAVA_HOME%bin\jar.exe"
set "KEYTOOL=%JAVA_HOME%bin\keytool.exe"

if not exist "%PLATFORM%" (
  echo [x] android.jar not found: %PLATFORM%
  pause
  exit /b 1
)
if not exist "%BT%\aapt2.exe" (
  echo [x] build-tools not found: %BT%
  pause
  exit /b 1
)
if not exist "%JAVAC%" (
  echo [x] javac not found, set JAVA_HOME
  pause
  exit /b 1
)

echo.
echo  YiStarLine Account Unified App - Android build
echo  SDK       : %SDK%
echo  build-tool: 36.0.0
echo.

if exist "%BUILD%" rmdir /s /q "%BUILD%"
mkdir "%BUILD%\classes" 2>nul
mkdir "%BUILD%\dex" 2>nul
mkdir "%OUT%" 2>nul
mkdir "%PROJ%\keystore" 2>nul

echo [1/8] copy web assets
xcopy "web\*" "%SRC%\assets\www\" /E /I /Y /Q /EXCLUDE:%PROJ%\exclude.txt >nul
if errorlevel 1 (
  echo [x] failed to copy web assets
  goto :fail
)

echo [2/8] javac
"%JAVAC%" -encoding UTF-8 -source 8 -target 8 -bootclasspath "%PLATFORM%" -d "%BUILD%\classes" "%SRC%\java\com\yistarline\yaua\MainActivity.java"
if errorlevel 1 goto :fail

echo [3/8] jar + d8
"%JARTOOL%" --create --file "%BUILD%\classes.jar" -C "%BUILD%\classes" .
if errorlevel 1 goto :fail
call "%BT%\d8.bat" --lib "%PLATFORM%" --min-api 23 --release --output "%BUILD%\dex" "%BUILD%\classes.jar"
if errorlevel 1 goto :fail

echo [4/8] aapt2 compile
"%BT%\aapt2.exe" compile --dir "%SRC%\res" -o "%BUILD%\res.zip"
if errorlevel 1 goto :fail

echo [5/8] aapt2 link
"%BT%\aapt2.exe" link -I "%PLATFORM%" --manifest "%SRC%\AndroidManifest.xml" -R "%BUILD%\res.zip" -A "%SRC%\assets" --min-sdk-version 23 --target-sdk-version 36 --version-code 10200 --version-name 1.2.0 --auto-add-overlay -o "%BUILD%\unsigned.apk"
if errorlevel 1 goto :fail

echo [6/8] add classes.dex
python "%PROJ%\tools\add_dex.py" "%BUILD%\unsigned.apk" "%BUILD%\dex\classes.dex"
if errorlevel 1 goto :fail

echo [7/8] zipalign
"%BT%\zipalign.exe" -f 4 "%BUILD%\unsigned.apk" "%BUILD%\aligned.apk"
if errorlevel 1 goto :fail

echo [8/8] sign
if not exist "%KS%" (
  "%KEYTOOL%" -genkeypair -keystore "%KS%" -storepass yaua123456 -keypass yaua123456 -alias yaua -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=YiStarLine, OU=YAUA, O=YiStarLine Account Unified App, C=CN" >nul 2>&1
  if errorlevel 1 (
    echo [x] failed to create keystore
    goto :fail
  )
  echo      created signing key: %KS%
)
call "%BT%\apksigner.bat" sign --ks "%KS%" --ks-pass pass:yaua123456 --key-pass pass:yaua123456 --ks-key-alias yaua --out "%OUT%\YiStarLine Account Unified App.apk" "%BUILD%\aligned.apk"
if errorlevel 1 goto :fail

call "%BT%\apksigner.bat" verify --print-certs "%OUT%\YiStarLine Account Unified App.apk" > "%OUT%\signature.txt" 2>&1
"%BT%\aapt2.exe" dump badging "%OUT%\YiStarLine Account Unified App.apk" > "%OUT%\badging.txt" 2>&1

echo.
echo  Build OK
echo  APK: %OUT%\YiStarLine Account Unified App.apk
echo.
type "%OUT%\badging.txt" | findstr /b "package:" 
echo.
exit /b 0

:fail
echo.
echo  Build FAILED
echo.
exit /b 1

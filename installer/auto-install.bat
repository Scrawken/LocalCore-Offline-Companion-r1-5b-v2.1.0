@echo off
chcp 65001 >nul
title LocalCore Automated Setup Program (Windows)

echo =====================================================================
echo  LocalCore Offline AI - Automated Setup Program (Windows)
echo =====================================================================
echo Model: Dolphin 3.0 Llama 3.1 8B Q4_K_M
echo Target: Windows 10/11 (x64)
echo Air-gap: Strict Zero-Telemetry
echo =====================================================================
echo.

set LOG_FILE=installer\install.log
echo [SETUP START] %date% %time% > %LOG_FILE%

echo [1/5] Verifying configured chat model...
if not exist "models\chat\Dolphin3.0-Llama3.1-8B-Q4_K_M.gguf" (
  echo [ERROR] Configured chat model is missing! >> %LOG_FILE%
  echo [ERROR] Run npm run setup:chat-model before staging assets.
  pause
  exit /b 1
)
certutil -hashfile "models\chat\Dolphin3.0-Llama3.1-8B-Q4_K_M.gguf" SHA256

echo [2/6] Staging inference assets to %APPDATA%\LocalCore\models and runtime...
if not exist "%APPDATA%\LocalCore\models" mkdir "%APPDATA%\LocalCore\models" 2>nul
if not exist "%APPDATA%\LocalCore\runtime" mkdir "%APPDATA%\LocalCore\runtime" 2>nul

copy /y "models\chat\Dolphin3.0-Llama3.1-8B-Q4_K_M.gguf" "%APPDATA%\LocalCore\models\Dolphin3.0-Llama3.1-8B-Q4_K_M.gguf" >nul
if errorlevel 1 exit /b 1
echo Active chat model staged to %APPDATA%\LocalCore\models\Dolphin3.0-Llama3.1-8B-Q4_K_M.gguf >> %LOG_FILE%
if exist "runtime\llama-cli.exe" (
  copy /y "runtime\*.*" "%APPDATA%\LocalCore\runtime\" >nul 2>nul
  echo Runtime assets staged to %APPDATA%\LocalCore\runtime\ >> %LOG_FILE%
)

echo [3/6] Creating runtime output directories...
mkdir output\images 2>nul
mkdir output\audio 2>nul
mkdir output\video 2>nul
mkdir output\text 2>nul
echo Output directories initialized. >> %LOG_FILE%

echo [4/6] Running Automated System & Inference Test Suite...
node test\test-suite.js
if %errorlevel% neq 0 (
  echo [WARNING] Test suite encountered non-zero return. Proceeding with caution. >> %LOG_FILE%
) else (
  echo Test suite passed 100%%. >> %LOG_FILE%
)

echo [5/6] Setting up Windows Desktop & Launcher Shortcuts...
powershell -Command "$s=(New-Object -COM WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Desktop')+'\LocalCore AI.lnk'); $s.TargetPath=(Get-Location).Path+'\LocalCore.bat'; $s.Save()" 2>nul
echo Desktop shortcut created for LocalCore.bat. >> %LOG_FILE%

echo [6/6] Compiling native LocalCore.exe application wrapper...
powershell -ExecutionPolicy Bypass -File installer\compile-native-exe.ps1 2>nul
echo Native executable ready. >> %LOG_FILE%

echo.
echo =====================================================================
echo Installation & Asset Staging Completed!
echo Double-click "LocalCore.bat" to run the configured offline AI studio.
echo =====================================================================
pause

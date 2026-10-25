@echo off
chcp 65001 >nul
title LocalCore Inference Asset Stager
echo =====================================================================
echo  LocalCore AI - Asset Stager & Provisioner
echo =====================================================================
echo Target: %APPDATA%\LocalCore\models\Dolphin3.0-Llama3.1-8B-Q4_K_M.gguf
echo Target: runtime\llama-cli.exe (Windows x64) + DLLs
echo =====================================================================

if not exist "%APPDATA%\LocalCore\models" mkdir "%APPDATA%\LocalCore\models" 2>nul
if not exist "%APPDATA%\LocalCore\runtime" mkdir "%APPDATA%\LocalCore\runtime" 2>nul

echo Staging Dolphin chat model...
if not exist "models\chat\Dolphin3.0-Llama3.1-8B-Q4_K_M.gguf" (
  echo [ERROR] Chat model missing. Run npm run setup:chat-model first.
  exit /b 1
)
copy /y "models\chat\Dolphin3.0-Llama3.1-8B-Q4_K_M.gguf" "%APPDATA%\LocalCore\models\Dolphin3.0-Llama3.1-8B-Q4_K_M.gguf" >nul
if errorlevel 1 exit /b 1
echo [OK] Active chat model staged.

echo Staging Windows x64 runtime...
if exist "runtime\llama-cli.exe" (
  copy /y "runtime\*.*" "%APPDATA%\LocalCore\runtime\" >nul 2>nul
  echo [OK] Runtime assets copied to %APPDATA%\LocalCore\runtime\
)

echo.
echo =====================================================================
echo All assets staged! Ready to run "LocalCore.bat" or "npm start".
echo =====================================================================
timeout /t 2 >nul

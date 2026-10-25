@echo off
chcp 65001 >nul
title LocalCore Offline AI Desktop
cd /d "%~dp0"
echo =====================================================================
echo  LocalCore AI - Offline Desktop Launcher
echo =====================================================================
echo Initializing local offline daemon...

REM Start the local HTTP inference & media daemon in background
start /b "" node engine/local-inference-daemon.js --port 11434

timeout /t 1 /nobreak >nul

REM Launch UI: prefers Electron if available, falls back to standalone browser app mode
if exist node_modules\electron (
  start "" npx electron .
) else (
  start "" msedge --app="http://localhost:11434" 2>nul || start "" chrome --app="http://localhost:11434" 2>nul || start "" renderer\index.html
)
exit

@echo off
chcp 65001 >nul
title LocalCore Offline AI Desktop
cd /d "%~dp0"
echo =====================================================================
echo  LocalCore AI - Offline Desktop Launcher
echo =====================================================================
echo.

REM The current launch path is the npm development flow, which builds the
REM avatar runtime and starts the Electron app (the app spawns its own
REM inference daemon). Requires Node.js 20+ and "npm install" first.
where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js is not installed or not on PATH.
  echo Install Node.js 20 or newer, then run: npm install
  pause
  exit /b 1
)
if not exist node_modules (
  echo Dependencies not installed. Running npm install...
  call npm install
)
echo Starting LocalCore (npm start)...
call npm start
exit

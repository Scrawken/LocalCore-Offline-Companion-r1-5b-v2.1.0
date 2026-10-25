@echo off
cd /d "%~dp0\.."
node engine\local-inference-daemon.js --cli %*

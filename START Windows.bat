@echo off
title Nexus Analytics
echo.
echo  Starting Nexus Analytics...
echo  Your browser will open automatically.
echo  Close this window to stop the server.
echo.
node "%~dp0nexus-analytics.js"
if %ERRORLEVEL% NEQ 0 (
  echo.
  echo  ERROR: Node.js not found.
  echo  Please install Node.js from https://nodejs.org
  echo.
  pause
)

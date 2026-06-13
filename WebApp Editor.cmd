@echo off
setlocal

cd /d "%~dp0"
title WebApp Editor

echo Starting WebApp Editor...
echo.

if not exist "package.json" (
  echo package.json was not found. This launcher must stay in the WebApp Editor framework folder.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo npm was not found on PATH. Install Node.js, then run this launcher again.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo.
    echo npm install failed.
    pause
    exit /b 1
  )
  echo.
)

echo The editor will open at http://127.0.0.1:5173/editor
echo Use Open Project inside the editor, or run npm run dev:project -- "project-folder" for a specific project.
echo.

call npm run dev -- --host 127.0.0.1 --open /editor

echo.
echo WebApp Editor stopped.
pause

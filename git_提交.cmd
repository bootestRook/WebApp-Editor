@echo off
setlocal

cd /d "%~dp0"
title WebApp Editor - Git Commit

if not exist ".git" (
  echo This folder is not a Git repository.
  exit /b 1
)

echo Checking framework root...
call npm run check-root
if errorlevel 1 exit /b 1

echo Staging changes...
git add -A
if errorlevel 1 exit /b 1

git diff --cached --quiet
if not errorlevel 1 (
  echo No changes to commit.
  exit /b 0
)

for /f "usebackq tokens=*" %%i in (`powershell -NoProfile -Command "Get-Date -Format 'yyyy-MM-dd HH:mm:ss'"`) do set COMMIT_TIME=%%i

echo Creating commit...
git commit -m "Update %COMMIT_TIME%"
exit /b %ERRORLEVEL%

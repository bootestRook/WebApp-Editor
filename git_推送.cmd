@echo off
setlocal

cd /d "%~dp0"
title WebApp Editor - Git Push

if not exist ".git" (
  echo This folder is not a Git repository.
  exit /b 1
)

echo Pushing current branch...
git push
exit /b %ERRORLEVEL%

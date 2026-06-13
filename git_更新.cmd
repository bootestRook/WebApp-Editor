@echo off
setlocal

cd /d "%~dp0"
title WebApp Editor - Git Pull

if not exist ".git" (
  echo This folder is not a Git repository.
  exit /b 1
)

echo Pulling current branch with fast-forward only...
git pull --ff-only
exit /b %ERRORLEVEL%

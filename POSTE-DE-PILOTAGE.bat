@echo off
rem ============================================================
rem  Poste de pilotage inerWeb - tout l'ecosysteme en une page.
rem  Double-clic : demarre le serveur (s'il ne tourne pas deja)
rem  et ouvre http://localhost:2020 dans le navigateur.
rem ============================================================
title Poste de pilotage inerWeb
cd /d "%~dp0"

rem Deja en marche ? On ouvre juste la page.
powershell -NoProfile -Command "exit !(Test-NetConnection -ComputerName 127.0.0.1 -Port 2020 -InformationLevel Quiet -WarningAction SilentlyContinue)" >nul 2>nul
if %errorlevel%==0 (
  start "" http://localhost:2020
  exit /b
)

start "Poste de pilotage inerWeb" /min node poste-pilotage.mjs
timeout /t 2 /nobreak >nul
start "" http://localhost:2020

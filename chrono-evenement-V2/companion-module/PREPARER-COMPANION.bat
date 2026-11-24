@echo off
echo === Preparation du module Companion (une seule fois, connexion internet requise) ===
call npm install
if errorlevel 1 goto err
call npm run package
if errorlevel 1 goto err
echo.
echo Termine. Le fichier .tgz a ete cree dans ce dossier.
echo Dans Companion : Modules > importer un module (Import module package) > choisir ce fichier .tgz.
pause
exit /b 0
:err
echo Erreur. Verifiez que Node.js est installe (https://nodejs.org, version LTS).
pause

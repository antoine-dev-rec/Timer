@echo off
echo === Installation des composants (connexion internet requise) ===
call npm install
if errorlevel 1 goto err
echo === Creation de l'executable ===
call npm run build
if errorlevel 1 goto err
echo.
echo Termine. L'executable se trouve dans le dossier "dist".
pause
exit /b 0
:err
echo Une erreur est survenue. Verifiez que Node.js est installe (https://nodejs.org).
pause

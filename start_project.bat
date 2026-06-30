@echo off
title FaceAccess Restaurant - Launcher
color 0A

echo ============================================
echo     FaceAccess Restaurant - Demarrage
echo ============================================
echo.

:: 1. MongoDB
echo [1/4] Demarrage MongoDB...
net start MongoDB >nul 2>&1
if %errorlevel%==0 (echo      MongoDB demarre.) else (echo      MongoDB deja actif.)

timeout /t 2 /nobreak >nul

:: 2. Python Face Engine
echo [2/4] Demarrage Python Face Engine...
start "FaceAccess - Face Engine" /min cmd /k "cd /d %~dp0face_engine && python face_engine.py"
timeout /t 3 /nobreak >nul

:: 3. Node.js Server
echo [3/4] Demarrage Serveur Node.js...
start "FaceAccess - Server" /min cmd /k "cd /d %~dp0server && node server.js"
timeout /t 3 /nobreak >nul

:: 4. Expo Mobile App
echo [4/4] Demarrage App Mobile (Expo)...
start "FaceAccess - Mobile" cmd /k "cd /d %~dp0mobile && npx expo start --clear --port 8082"

timeout /t 5 /nobreak >nul

:: Open dashboard in browser
echo.
echo [OK] Ouverture du dashboard...
start http://localhost:3000

echo.
echo ============================================
echo  Tout est demarre !
echo  Dashboard : http://localhost:3000
echo  Login     : admin / admin123
echo  Mobile    : Scanner le QR code Expo Go
echo ============================================
echo.
pause

@echo off
REM Start all services for Zoom Engagement Tool
REM Run this from the project root directory

echo.
echo ================================
echo  Starting All Services
echo ================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed or not in PATH
    exit /b 1
)

echo Starting Backend Server (port 3000)...
start "Backend Server" cmd /k "cd server && node index.js"
timeout /t 2 >nul

echo Starting Zoom Auth Endpoint (port 4000)...
start "Zoom Auth" cmd /k "cd zoomapp\meetingsdk-auth-endpoint-sample && npm start"
timeout /t 2 >nul

echo Starting Zoom App (port 8080)...
start "Zoom App" cmd /k "cd zoomapp && npx serve -p 8080"
timeout /t 2 >nul

echo Starting Client Frontend (port 5173)...
start "Client Frontend" cmd /k "cd client && npm run dev"

echo.
echo ================================
echo  All Services Started!
echo ================================
echo.
echo Services running:
echo   Backend:       http://localhost:3000
echo   Zoom Auth:     http://localhost:4000
echo   Zoom App:      http://localhost:8080
echo   Client:        http://localhost:5173
echo.
echo Close this window or press Ctrl+C to exit
echo Individual services will remain running in their own windows
echo.
pause

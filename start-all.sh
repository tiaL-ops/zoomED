#!/bin/bash
# Start all services for Zoom Engagement Tool
# Run this from the project root directory

echo
echo "================================"
echo " Starting All Services"
echo "================================"
echo

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed or not in PATH"
    exit 1
fi

echo "Starting Backend Server (port 3000)..."
osascript -e 'tell app "Terminal" to do script "cd '"$(pwd)"'/server && node index.js"' &
sleep 2

echo "Starting Zoom Auth Endpoint (port 4000)..."
osascript -e 'tell app "Terminal" to do script "cd '"$(pwd)"'/zoomapp/meetingsdk-auth-endpoint-sample && npm start"' &
sleep 2

echo "Starting Zoom App (port 8080)..."
osascript -e 'tell app "Terminal" to do script "cd '"$(pwd)"'/zoomapp && npx serve -p 8080"' &
sleep 2

echo "Starting Client Frontend (port 5173)..."
osascript -e 'tell app "Terminal" to do script "cd '"$(pwd)"'/client && npm run dev"' &

echo
echo "================================"
echo " All Services Started!"
echo "================================"
echo
echo "Services running:"
echo "  Backend:       http://localhost:3000"
echo "  Zoom Auth:     http://localhost:4000"
echo "  Zoom App:      http://localhost:8080"
echo "  Client:        http://localhost:5173"
echo
echo "Each service is running in its own Terminal window"
echo "Close individual Terminal windows to stop services"
echo

#!/bin/bash

# Quick start script for Zoom Engagement Tool with Notes Integration
# Run this from the project root directory

echo ""
echo "================================"
echo " Zoom Engagement Tool - Setup"
echo "================================"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed"
    exit 1
fi

echo "[1/5] Installing server dependencies..."
cd server
npm install > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to install server dependencies"
    exit 1
fi
echo "OK - Server dependencies installed"
cd ..

echo ""
echo "[2/5] Installing Zoom auth endpoint dependencies..."
cd zoomapp/meetingsdk-auth-endpoint-sample
npm install > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to install auth endpoint dependencies"
    exit 1
fi
echo "OK - Auth endpoint dependencies installed"
cd ../../

echo ""
echo "[3/5] Installing client dependencies..."
cd client
npm install > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to install client dependencies"
    exit 1
fi
echo "OK - Client dependencies installed"
cd ..

echo ""
echo "================================"
echo " Setup Complete!"
echo "================================"
echo ""
echo "Next steps:"
echo ""
echo "1. Set environment variable (required):"
echo "   export CLAUDE_API_KEY=your_api_key_here"
echo ""
echo "2. Start services (in separate terminals):"
echo ""
echo "   Terminal 1 - Backend:"
echo "   cd server"
echo "   node index.js"
echo ""
echo "   Terminal 2 - Auth Server:"
echo "   cd zoomapp/meetingsdk-auth-endpoint-sample"
echo "   npm start"
echo ""
echo "   Terminal 3 - Zoom App:"
echo "   cd zoomapp"
echo "   npx serve -p 8080"
echo ""
echo "   Terminal 4 - Frontend (optional):"
echo "   cd client"
echo "   npm run dev"
echo ""
echo "3. Open http://localhost:8080 in your browser"
echo ""
echo "4. (Optional) Simulate transcript:"
echo "   cd server"
echo "   npx tsx transcript-simulator.ts machine-learning test-meeting-001"
echo ""
echo "For more details, see:"
echo "- ZOOM_NOTES_README.md"
echo "- NOTES_INTEGRATION.md"
echo "- IMPLEMENTATION_CHECKLIST.md"
echo ""

#!/bin/bash

# LinkedIn Profile Picture Auto Updater - Startup Script

echo "🚀 Starting LinkedIn Profile Picture Auto Updater"
echo "================================================"

# Check if backend is running
if curl -s http://localhost:3000/health > /dev/null 2>&1; then
    echo "✅ Backend server is already running"
else
    echo "🔄 Starting backend server..."
    cd backend
    
    # Check if dependencies are installed
    if [ ! -d "node_modules" ]; then
        echo "📦 Installing dependencies..."
        npm install
    fi
    
    # Check if .env exists in project root
    if [ ! -f "../.env" ]; then
        echo "⚠️  .env file not found in project root. Please run ./install.sh first"
        exit 1
    fi
    
    # Start server in background
    npm start &
    SERVER_PID=$!
    
    # Wait for server to start
    echo "⏳ Waiting for server to start..."
    for i in {1..10}; do
        if curl -s http://localhost:3000/health > /dev/null 2>&1; then
            echo "✅ Backend server started successfully"
            break
        fi
        sleep 1
    done
    
    if [ $i -eq 10 ]; then
        echo "❌ Failed to start backend server"
        kill $SERVER_PID 2>/dev/null
        exit 1
    fi
    
    cd ..
fi

echo ""
echo "🎉 LinkedIn Profile Picture Auto Updater is ready!"
echo ""
echo "📋 Next steps:"
echo "1. Open Chrome and go to chrome://extensions/"
echo "2. Enable 'Developer mode'"
echo "3. Click 'Load unpacked' and select the 'extension' folder"
echo "4. Click the extension icon in your browser to start using it"
echo ""
echo "🔧 Backend server: http://localhost:3000"
echo "📚 Documentation: README.md"
echo ""
echo "Press Ctrl+C to stop the backend server"

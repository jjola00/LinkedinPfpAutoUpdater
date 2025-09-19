#!/bin/bash

# LinkedIn Profile Picture Auto Updater - Installation Script

echo "🚀 LinkedIn Profile Picture Auto Updater - Installation"
echo "=================================================="

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    echo "   Visit: https://nodejs.org/"
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

echo "✅ Node.js and npm are installed"

# Install backend dependencies
echo "📦 Installing backend dependencies..."
cd backend
npm install

if [ $? -ne 0 ]; then
    echo "❌ Failed to install backend dependencies"
    exit 1
fi

echo "✅ Backend dependencies installed"

# Check for .env file in project root
if [ ! -f "../.env" ]; then
    echo "⚠️  .env file not found in project root. Creating from template..."
    cp ../.env.example ../.env
    echo "📝 Please edit .env in project root and add your AI API key:"
    echo "   AI_API_KEY=your_api_key_here"
    echo ""
    echo "   You can get an API key from: https://platform.openai.com/api-keys"
    echo ""
    read -p "Press Enter to continue after adding your API key..."
fi

# Check if API key is set
if grep -q "your_api_key_here" ../.env; then
    echo "⚠️  Please update your OpenAI API key in .env (project root)"
    echo "   Current value: AI_API_KEY=your_api_key_here"
    echo "   Replace with your actual API key"
    exit 1
fi

# Check if API key looks valid (starts with sk-)
if ! grep -q "AI_API_KEY=sk-" ../.env; then
    echo "⚠️  API key doesn't look valid. Please check your .env file"
    echo "   Expected format: AI_API_KEY=sk-..."
    exit 1
fi

echo "✅ API key configuration found"

# Create necessary directories
mkdir -p generated-images
mkdir -p temp

echo "✅ Directories created"

# Test backend server
echo "🧪 Testing backend server..."
timeout 10s node server.js &
SERVER_PID=$!
sleep 3

# Check if server is running
if curl -s http://localhost:3000/health > /dev/null; then
    echo "✅ Backend server is working"
    kill $SERVER_PID 2>/dev/null
else
    echo "❌ Backend server test failed"
    kill $SERVER_PID 2>/dev/null
    exit 1
fi

cd ..

echo ""
echo "🎉 Installation completed successfully!"
echo ""
echo "Next steps:"
echo "1. Start the backend server:"
echo "   cd backend && npm start"
echo ""
echo "2. Load the Chrome extension:"
echo "   - Open Chrome and go to chrome://extensions/"
echo "   - Enable 'Developer mode'"
echo "   - Click 'Load unpacked' and select the 'extension' folder"
echo ""
echo "3. Use the extension:"
echo "   - Click the extension icon in your browser"
echo "   - Upload a base photo"
echo "   - Generate image variations"
echo "   - Configure auto-update settings"
echo ""
echo "📚 For more information, see README.md"

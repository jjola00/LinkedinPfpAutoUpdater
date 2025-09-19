# Quick Setup Guide

## 🚀 Quick Start

### 1. Install Dependencies
```bash
./install.sh
```

### 2. Configure API Key
Edit `backend/.env` and add your OpenAI API key:
```
AI_API_KEY=your_actual_api_key_here
```

### 3. Start the Application
```bash
./start.sh
```

### 4. Load Chrome Extension
1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" and select the `extension` folder
4. The extension icon should appear in your browser toolbar

## 📱 Using the Extension

1. **Upload Base Photo**: Click the extension icon and upload your profile picture
2. **Generate Variations**: Set number of images (1-50) and click "Generate Images"
3. **Configure Schedule**: Choose update frequency (daily/weekly/custom)
4. **Enable Auto-Updates**: Toggle the switch to enable automatic updates
5. **Manual Update**: Use "Update Now" button for immediate updates

## 🔧 Development

### Backend Development
```bash
cd backend
npm install
npm start
```

### Extension Development
1. Make changes to extension files
2. Go to `chrome://extensions/`
3. Click the refresh button on your extension
4. Test changes

## 🧪 Testing

```bash
# Test backend
cd backend
npm test

# Test image generation
node image-generator.js path/to/photo.jpg 5
```

## 📁 Project Structure

```
LinkedinPfpAutoUpdater/
├── extension/           # Chrome extension
│   ├── manifest.json   # Extension manifest
│   ├── background.js   # Service worker
│   ├── content.js     # LinkedIn automation
│   ├── popup.html     # UI
│   └── popup.js       # UI logic
├── backend/            # Backend server
│   ├── server.js      # Express server
│   ├── image-generator.js # AI image generation
│   └── package.json   # Dependencies
├── install.sh         # Installation script
├── start.sh          # Startup script
└── README.md         # Full documentation
```

## 🛠️ Troubleshooting

### Extension not loading
- Check `chrome://extensions/` for errors
- Verify manifest.json syntax
- Ensure all files are in the extension folder

### Backend connection failed
- Ensure server is running on port 3000
- Check if API key is configured
- Verify OpenAI API key is valid

### LinkedIn automation fails
- Make sure you're on LinkedIn profile page
- Check browser console for errors
- Verify extension permissions

## 📞 Support

- Check README.md for detailed documentation
- Review Chrome extension logs
- Check backend server logs
- Open an issue on GitHub

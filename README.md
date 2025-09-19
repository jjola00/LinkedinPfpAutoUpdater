# LinkedIn Profile Picture Auto Updater

A Chrome extension + backend utility that automatically rotates your LinkedIn profile picture on a schedule using AI-generated variations.

## Features

- **AI Image Generation**: Pre-generate 1-50 profile picture variations using OpenAI's image API
- **Automatic Updates**: Schedule weekly (default) or custom frequency updates
- **Local Storage**: Images stored locally for privacy
- **Chrome Extension**: Easy-to-use popup interface with controls
- **Rate Limiting**: Built-in API rate limiting to prevent overuse
- **Safe Defaults**: Weekly updates to avoid LinkedIn flagging

## Project Structure

```
LinkedinPfpAutoUpdater/
├── extension/                 # Chrome extension files
│   ├── manifest.json         # Extension manifest (v3)
│   ├── background.js         # Service worker for scheduling
│   ├── content.js           # LinkedIn automation script
│   ├── popup.html           # Extension popup UI
│   ├── popup.js            # Popup logic
│   └── icons/              # Extension icons
├── backend/                 # Backend image generation
│   ├── image-generator.js   # Core image generation logic
│   ├── server.js           # Express server for extension communication
│   ├── package.json        # Node.js dependencies
│   ├── generated-images/   # Local storage for generated images
│   └── temp/              # Temporary files
└── README.md
```

## Setup

### 1. Backend Setup

```bash
cd backend
npm install
```

Create a `.env` file:
```bash
cp env.example .env
# Edit .env and add your OpenAI API key
```

Start the backend server:
```bash
npm start
# or
node server.js
```

### 2. Chrome Extension Setup

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" and select the `extension` folder
4. The extension should now appear in your extensions list

### 3. Usage

1. **Upload Base Photo**: Click the extension icon and upload your base profile picture
2. **Generate Images**: Set the number of variations (1-50) and click "Generate Images"
3. **Configure Schedule**: Choose update frequency (daily/weekly/custom)
4. **Enable Auto-Updates**: Toggle the switch to enable automatic updates
5. **Manual Update**: Use "Update Now" button for immediate updates

## API Endpoints

The backend server provides these endpoints:

- `GET /health` - Health check
- `POST /generate-images-base64` - Generate images from base64 data
- `GET /images` - List stored images
- `GET /images/:filename` - Serve specific image
- `DELETE /images` - Clear all stored images

## Configuration

### Extension Settings

- **Frequency**: Daily, Weekly, or Custom interval
- **Number of Images**: 1-50 variations to generate
- **Auto-Update**: Enable/disable automatic updates
- **Storage Path**: Local directory for generated images

### Rate Limiting

- Maximum 5 API requests per minute
- Maximum 50 images per session
- Automatic retry with exponential backoff

## Safety Features

- **Weekly Default**: Reduces risk of LinkedIn flagging
- **Local Storage**: No cloud dependency for privacy
- **Rate Limiting**: Prevents API overuse
- **Error Handling**: Graceful failure recovery
- **User Control**: Easy pause/resume functionality

## Development

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

### Testing

```bash
# Test image generation
node backend/image-generator.js path/to/base-photo.jpg 10

# Test server endpoints
curl http://localhost:3000/health
```

## Troubleshooting

### Common Issues

1. **Extension not loading**: Check manifest.json syntax
2. **Backend connection failed**: Ensure server is running on port 3000
3. **API key issues**: Verify OpenAI API key in .env file
4. **LinkedIn automation fails**: Check if you're on the correct LinkedIn page

### Debug Mode

Enable Chrome DevTools for the extension:
1. Go to `chrome://extensions/`
2. Click "Details" on your extension
3. Enable "Allow in incognito"
4. Open DevTools to see console logs

## License

MIT License - see LICENSE file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## Support

For issues and questions:
1. Check the troubleshooting section
2. Review Chrome extension logs
3. Check backend server logs
4. Open an issue on GitHub
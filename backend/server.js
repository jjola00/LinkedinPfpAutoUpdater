// Express server for Chrome extension communication
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { ImageGenerator } = require('./image-generator');
require('dotenv').config({ path: '../.env' });

class ImageGenerationServer {
  constructor() {
    this.app = express();
    this.port = process.env.PORT || 3000;
    this.generator = new ImageGenerator();
    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    // Enable CORS for Chrome extension
    this.app.use(cors({
      origin: true, // Allow all origins for development
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    }));

    this.app.use(express.json({ limit: '50mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '50mb' }));

    // Configure multer for file uploads
    this.upload = multer({
      storage: multer.memoryStorage(),
      limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
      },
      fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
          cb(null, true);
        } else {
          cb(new Error('Only image files are allowed'), false);
        }
      }
    });
  }

  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // Generate images from uploaded file
    this.app.post('/generate-images', this.upload.single('basePhoto'), async (req, res) => {
      try {
        if (!req.file) {
          return res.status(400).json({ 
            success: false, 
            error: 'No base photo provided' 
          });
        }

        const numImages = parseInt(req.body.numImages) || 10;
        
        if (numImages < 1 || numImages > 50) {
          return res.status(400).json({ 
            success: false, 
            error: 'Number of images must be between 1 and 50' 
          });
        }

        // Save uploaded file temporarily
        const tempPath = path.join(__dirname, 'temp', `base_${Date.now()}.jpg`);
        await fs.mkdir(path.dirname(tempPath), { recursive: true });
        await fs.writeFile(tempPath, req.file.buffer);

        // Generate images
        const result = await this.generator.generateImages(tempPath, numImages);

        // Clean up temp file
        await fs.unlink(tempPath).catch(() => {});

        if (result.success) {
          res.json({
            success: true,
            count: result.count,
            images: result.images.map(img => ({
              filename: img.filename,
              prompt: img.prompt,
              generatedAt: img.generatedAt
            }))
          });
        } else {
          res.status(500).json({
            success: false,
            error: result.error
          });
        }

      } catch (error) {
        console.error('Error in /generate-images:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Generate images from base64 data
    this.app.post('/generate-images-base64', async (req, res) => {
      try {
        const { basePhoto, numImages = 10 } = req.body;

        if (!basePhoto) {
          return res.status(400).json({ 
            success: false, 
            error: 'No base photo provided' 
          });
        }

        if (numImages < 1 || numImages > 50) {
          return res.status(400).json({ 
            success: false, 
            error: 'Number of images must be between 1 and 50' 
          });
        }

        // Save base64 data to temp file
        const base64Data = basePhoto.replace(/^data:image\/[a-z]+;base64,/, '');
        const tempPath = path.join(__dirname, 'temp', `base_${Date.now()}.jpg`);
        await fs.mkdir(path.dirname(tempPath), { recursive: true });
        await fs.writeFile(tempPath, base64Data, 'base64');

        // Generate images
        const result = await this.generator.generateImages(tempPath, numImages);

        // Clean up temp file
        await fs.unlink(tempPath).catch(() => {});

        if (result.success) {
          res.json({
            success: true,
            count: result.count,
            images: result.images.map(img => ({
              filename: img.filename,
              prompt: img.prompt,
              generatedAt: img.generatedAt
            }))
          });
        } else {
          res.status(500).json({
            success: false,
            error: result.error
          });
        }

      } catch (error) {
        console.error('Error in /generate-images-base64:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Get stored images
    this.app.get('/images', async (req, res) => {
      try {
        const images = await this.generator.getStoredImages();
        res.json({
          success: true,
          count: images.length,
          images: images.map(img => ({
            filename: img.filename,
            filepath: img.filepath
          }))
        });
      } catch (error) {
        console.error('Error in /images:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Get specific image file
    this.app.get('/images/:filename', async (req, res) => {
      try {
        const filename = req.params.filename;
        const filepath = path.join(this.generator.storagePath, filename);
        
        // Check if file exists
        await fs.access(filepath);
        
        // Set appropriate headers
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
        
        // Stream the file
        const fileStream = require('fs').createReadStream(filepath);
        fileStream.pipe(res);

      } catch (error) {
        console.error('Error serving image:', error);
        res.status(404).json({
          success: false,
          error: 'Image not found'
        });
      }
    });

    // Clear stored images
    this.app.delete('/images', async (req, res) => {
      try {
        const result = await this.generator.clearStoredImages();
      
        if (result.success) {
          res.json({
            success: true,
            message: `Cleared ${result.count} images`
          });
        } else {
          res.status(500).json({
            success: false,
            error: result.error
          });
        }
      } catch (error) {
        console.error('Error clearing images:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Error handling middleware
    this.app.use((error, req, res, next) => {
      console.error('Server error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    });
  }

  start() {
    this.app.listen(this.port, () => {
      console.log(`🚀 Image generation server running on port ${this.port}`);
      console.log(`📁 Storage path: ${this.generator.storagePath}`);
      console.log(`🔑 API key configured: ${this.generator.apiKey ? 'Yes' : 'No'}`);
    });
  }
}

// Start server if called directly
if (require.main === module) {
  const server = new ImageGenerationServer();
  server.start();
}

module.exports = ImageGenerationServer;

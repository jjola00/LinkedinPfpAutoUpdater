import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'fs';
import dotenv from 'dotenv';
import sharp from 'sharp';
import { ImageGenerator } from './image-generator';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ROOT = path.resolve(process.cwd());
const DATA_DIR = path.resolve(ROOT, 'generated-images'); // default if STORAGE_PATH missing
const STORAGE_PATH = path.resolve(process.env.STORAGE_PATH || DATA_DIR);
const TEMP_DIR = path.resolve(ROOT, 'temp');

// Express server for Chrome extension communication
class ImageGenerationServer {
  constructor() {
    this.app = express();
    this.port = process.env.PORT || 3000;
    this.generator = new ImageGenerator();

    // Configure base folder for local base profile photo
    const defaultBaseDir = path.join(__dirname, 'base-pfp');
    this.basePfpDir = process.env.BASE_PFP_DIR
      ? (path.isAbsolute(process.env.BASE_PFP_DIR)
          ? process.env.BASE_PFP_DIR
          : path.join(__dirname, process.env.BASE_PFP_DIR))
      : defaultBaseDir;

    this.setupMiddleware();
    this.setupRoutes();
  }

  async ensureDirectories() {
    await fs.mkdir(this.basePfpDir, { recursive: true }).catch(() => {});
    await fs.mkdir(this.generator.storagePath, { recursive: true }).catch(() => {});
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

    // Configure multer for file uploads (kept for backward compatibility)
    this.upload = multer({
      storage: multer.memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new Error('Only image files are allowed'), false);
      }
    });
  }

  setupRoutes() {
    // Health check
    this.app.get('/health', async (req, res) => {
      try {
        await this.ensureDirectories();
        const images = await this.generator.getStoredImages();
        res.json({ status: 'ok', timestamp: new Date().toISOString(), images: images.length, baseDir: this.basePfpDir });
      } catch (e) {
        res.status(500).json({ status: 'error', error: e.message });
      }
    });

    // New: Generate images from local base folder (no upload)
    this.app.post('/generate-from-base', async (req, res) => {
      try {
        await this.ensureDirectories();

        const { numImages = 10 } = req.body || {};
        const count = Math.max(1, Math.min(50, parseInt(numImages)));

        // Find a base photo file in basePfpDir
        const allowed = ['.png', '.jpg', '.jpeg', '.webp'];
        const files = await fs.readdir(this.basePfpDir);
        const base = files.find(f => allowed.includes(path.extname(f).toLowerCase()));
        if (!base) {
          return res.status(400).json({ success: false, error: `No base photo found in ${this.basePfpDir}. Add a .png/.jpg/.jpeg/.webp file.` });
        }

        const basePath = path.join(this.basePfpDir, base);
        const result = await this.generator.generateImages(basePath, count);

        if (result.success) {
          res.json({ success: true, count: result.count, images: result.images.map(i => ({ filename: i.filename })) });
        } else {
          res.status(500).json({ success: false, error: result.error });
        }
      } catch (error) {
        console.error('Error in /generate-from-base:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Existing endpoints retained for compatibility
    this.app.post('/generate-images', this.upload.single('basePhoto'), async (req, res) => {
      // ...existing code...
      try {
        if (!req.file) {
          return res.status(400).json({ success: false, error: 'No base photo provided' });
        }
        const numImages = parseInt(req.body.numImages) || 10;
        if (numImages < 1 || numImages > 50) {
          return res.status(400).json({ success: false, error: 'Number of images must be between 1 and 50' });
        }
        const tempPath = path.join(__dirname, 'temp', `base_${Date.now()}.jpg`);
        await fs.mkdir(path.dirname(tempPath), { recursive: true });
        await fs.writeFile(tempPath, req.file.buffer);
        const result = await this.generator.generateImages(tempPath, numImages);
        await fs.unlink(tempPath).catch(() => {});
        if (result.success) {
          res.json({ success: true, count: result.count, images: result.images.map(img => ({ filename: img.filename })) });
        } else {
          res.status(500).json({ success: false, error: result.error });
        }
      } catch (error) {
        console.error('Error in /generate-images:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.post('/generate-images-base64', async (req, res) => {
      // ...existing code...
      try {
        const { basePhoto, numImages = 10 } = req.body;
        if (!basePhoto) {
          return res.status(400).json({ success: false, error: 'No base photo provided' });
        }
        if (numImages < 1 || numImages > 50) {
          return res.status(400).json({ success: false, error: 'Number of images must be between 1 and 50' });
        }
        const base64Data = basePhoto.replace(/^data:image\/[a-z]+;base64,/, '');
        const tempPath = path.join(__dirname, 'temp', `base_${Date.now()}.jpg`);
        await fs.mkdir(path.dirname(tempPath), { recursive: true });
        await fs.writeFile(tempPath, base64Data, 'base64');
        const result = await this.generator.generateImages(tempPath, numImages);
        await fs.unlink(tempPath).catch(() => {});
        if (result.success) {
          res.json({ success: true, count: result.count, images: result.images.map(img => ({ filename: img.filename })) });
        } else {
          res.status(500).json({ success: false, error: result.error });
        }
      } catch (error) {
        console.error('Error in /generate-images-base64:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.get('/images', async (req, res) => {
      // ...existing code...
      try {
        const images = await this.generator.getStoredImages();
        res.json({ success: true, count: images.length, images: images.map(img => ({ filename: img.filename, filepath: img.filepath })) });
      } catch (error) {
        console.error('Error in /images:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.get('/images/:filename', async (req, res) => {
      // ...existing code...
      try {
        const filename = req.params.filename;
        const filepath = path.join(this.generator.storagePath, filename);
        await fs.access(filepath);
        const stream = fsSync.createReadStream(filepath);
        stream.on('open', () => {
          res.setHeader('Content-Type', 'image/png');
          res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
        });
        stream.pipe(res);
      } catch (error) {
        console.error('Error serving image:', error);
        res.status(404).json({ success: false, error: 'Image not found' });
      }
    });

    this.app.delete('/images', async (req, res) => {
      // ...existing code...
      try {
        const result = await this.generator.clearStoredImages();
        if (result.success) {
          res.json({ success: true, message: `Cleared ${result.count} images` });
        } else {
          res.status(500).json({ success: false, error: result.error });
        }
      } catch (error) {
        console.error('Error clearing images:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Error handling middleware
    this.app.use((error, req, res, next) => {
      console.error('Server error:', error);
      res.status(500).json({ success: false, error: error.message });
    });
  }

  start() {
    this.ensureDirectories().then(() => {
      this.app.listen(this.port, () => {
        console.log(`🚀 Image generation server running on port ${this.port}`);
        console.log(`📁 Storage path: ${this.generator.storagePath}`);
        console.log(`🖼️ Base photo dir: ${this.basePfpDir}`);
        console.log(`🔑 API key configured: ${this.generator.apiKey ? 'Yes' : 'No'}`);
      });
    });
  }
}

// Start server if called directly
if (require.main === module) {
  const server = new ImageGenerationServer();
  server.start();
}

module.exports = ImageGenerationServer;

await fs.mkdir(STORAGE_PATH, { recursive: true });
await fs.mkdir(TEMP_DIR, { recursive: true });

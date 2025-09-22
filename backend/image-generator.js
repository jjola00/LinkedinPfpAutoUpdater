// Backend image generation script using OpenAI API
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const sharp = require('sharp');
const { execFile } = require('child_process');
const os = require('os');
require('dotenv').config({ path: '../.env' });

class ImageGenerator {
  constructor() {
    this.apiKey = process.env.AI_API_KEY;
    this.baseUrl = 'https://api.openai.com/v1';
    this.rateLimiter = new RateLimiter(5, 60000); // 5 requests per minute
    this.maxImagesPerSession = 50;
    // Use env STORAGE_PATH or default to backend/generated-images
    const defaultStorage = path.join(__dirname, 'generated-images');
    this.storagePath = process.env.STORAGE_PATH
      ? path.isAbsolute(process.env.STORAGE_PATH)
        ? process.env.STORAGE_PATH
        : path.join(__dirname, process.env.STORAGE_PATH)
      : defaultStorage;

    // Local mode toggles
    this.localMode = /^1|true$/i.test(process.env.LOCAL_VARIATIONS || '');
    this.useRembg = /^1|true$/i.test(process.env.USE_REMBG || '');

    if (!this.apiKey && !this.localMode) {
      throw new Error('AI_API_KEY not found (set LOCAL_VARIATIONS=1 for local background replacement)');
    }
  }

  async generateImages(basePhotoPath, numImages = 10) {
    try {
      if (numImages < 1 || numImages > 50) throw new Error('Number of images must be between 1 and 50');
      if (numImages > this.maxImagesPerSession) throw new Error(`Maximum ${this.maxImagesPerSession} images per session`);

      await this.ensureStorageDirectory();

      const basePhotoBuffer = await fs.readFile(basePhotoPath);
      const basePhotoBase64 = basePhotoBuffer.toString('base64');

      const generatedImages = [];

      if (this.localMode) {
        // Local: remove background → composite on professional gradients
        const subjectPng = await this.extractSubject(basePhotoBuffer);
        for (let i = 0; i < numImages; i++) {
          try {
            const background = await this.createBackgroundSVG(i, 1024, 1024);
            const outBuffer = await sharp(background)
              .composite([{ input: subjectPng, gravity: 'center' }])
              .png({ quality: 92 })
              .toBuffer();
            const filename = `generated_${Date.now()}_${i + 1}.png`;
            const filepath = path.join(this.storagePath, filename);
            await fs.writeFile(filepath, outBuffer);
            generatedImages.push({ filename, filepath, prompt: 'local-background', generatedAt: new Date().toISOString() });
            console.log(`Generated (local bg) image ${i + 1}/${numImages}: ${filename}`);
          } catch (e) {
            console.error(`Local background gen failed ${i + 1}:`, e.message);
          }
        }
      } else {
        // API path with fallback to local background
        const variations = this.generateVariationPrompts();
        for (let i = 0; i < numImages; i++) {
          try {
            await this.rateLimiter.wait();
            const prompt = variations[i % variations.length];
            const imageData = await this.generateSingleImage(basePhotoBase64, prompt);
            const filename = `generated_${Date.now()}_${i + 1}.png`;
            const filepath = path.join(this.storagePath, filename);
            await fs.writeFile(filepath, imageData);
            generatedImages.push({ filename, filepath, prompt, generatedAt: new Date().toISOString() });
            console.log(`Generated image ${i + 1}/${numImages}: ${filename}`);
          } catch (error) {
            console.error(`API gen failed ${i + 1}:`, error.message);
            // Fallback: local background replacement
            try {
              const subjectPng = await this.extractSubject(basePhotoBuffer);
              const background = await this.createBackgroundSVG(i, 1024, 1024);
              const outBuffer = await sharp(background)
                .composite([{ input: subjectPng, gravity: 'center' }])
                .png({ quality: 92 })
                .toBuffer();
              const filename = `generated_${Date.now()}_${i + 1}.png`;
              const filepath = path.join(this.storagePath, filename);
              await fs.writeFile(filepath, outBuffer);
              generatedImages.push({ filename, filepath, prompt: 'local-fallback', generatedAt: new Date().toISOString() });
              console.log(`Fallback (local bg) image ${i + 1}/${numImages}: ${filename}`);
            } catch (e2) {
              console.error(`Fallback failed ${i + 1}:`, e2.message);
            }
          }
        }
      }

      await this.saveMetadata(generatedImages);
      return { success: true, images: generatedImages, count: generatedImages.length };

    } catch (error) {
      console.error('Error in generateImages:', error);
      return { success: false, error: error.message };
    }
  }

  async extractSubject(basePhotoBuffer) {
    // Try rembg if requested
    if (this.useRembg) {
      try {
        const tmpDir = path.join(__dirname, 'temp');
        await fs.mkdir(tmpDir, { recursive: true }).catch(() => {});
        const inPath = path.join(tmpDir, `in_${Date.now()}.png`);
        const outPath = path.join(tmpDir, `out_${Date.now()}.png`);
        await fs.writeFile(inPath, basePhotoBuffer);
        await this.execCmd('rembg', ['i', inPath, outPath], 60_000);
        const out = await fs.readFile(outPath);
        // cleanup best-effort
        fs.unlink(inPath).catch(() => {});
        fs.unlink(outPath).catch(() => {});
        return out;
      } catch (e) {
        console.warn('rembg failed or not available, falling back to white-threshold method:', e.message);
      }
    }
    // Fallback: treat near-white background as transparent
    // Build alpha mask = invert(threshold(grayscale(image)))
    const alpha = await sharp(basePhotoBuffer)
      .greyscale()
      .threshold(245) // pixels >=245 (near white) -> 255 (white)
      .negate()       // background -> black (0), subject -> white (255)
      .toColourspace('b-w')
      .toBuffer();

    // Ensure RGB base and add alpha channel
    const { width, height } = await sharp(basePhotoBuffer).metadata();
    const rgb = await sharp(basePhotoBuffer).removeAlpha().toBuffer();
    const withAlpha = await sharp(rgb)
      .joinChannel(alpha)
      .png()
      .toBuffer();

    // Slight feather on edges to soften cutout
    const feathered = await sharp(withAlpha).blur(0.3).toBuffer();
    return feathered;
  }

  async createBackgroundSVG(i, width, height) {
    const palettes = [
      ['#0E5E9C', '#0B4170'], // deep blue gradient
      ['#0077B5', '#004E75'], // LinkedIn blues
      ['#1F2937', '#111827'], // neutral dark
      ['#4B5563', '#1F2937'], // gray
      ['#2563EB', '#1D4ED8'], // blue
      ['#64748B', '#334155'], // slate
      ['#10B981', '#047857'], // teal/green
      ['#6D28D9', '#4C1D95'], // purple
      ['#F59E0B', '#D97706'], // amber
      ['#0EA5E9', '#0369A1']  // cyan
    ];
    const [c1, c2] = palettes[i % palettes.length];
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${c1}"/>
      <stop offset="100%" stop-color="${c2}"/>
    </linearGradient>
    <filter id="grain">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" stitchTiles="stitch"/>
      <feColorMatrix type="saturate" values="0"/>
      <feComponentTransfer>
        <feFuncA type="table" tableValues="0 0.05"/>
      </feComponentTransfer>
      <feBlend mode="multiply"/>
    </filter>
  </defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <rect width="100%" height="100%" fill="#000" opacity="0.06" filter="url(#grain)"/>
</svg>`;
    return await sharp(Buffer.from(svg)).png().toBuffer();
  }

  async execCmd(cmd, args, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      const proc = execFile(cmd, args, { timeout: timeoutMs }, (err, stdout, stderr) => {
        if (err) return reject(err);
        resolve({ stdout, stderr });
      });
    });
  }

  async generateSingleImage(basePhotoBase64, prompt) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/images/variations`,
        { image: `data:image/png;base64,${basePhotoBase64}`, n: 1, size: '1024x1024', response_format: 'b64_json' },
        { headers: { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' } }
      );
      if (response.data.data && response.data.data[0]) {
        return Buffer.from(response.data.data[0].b64_json, 'base64');
      } else {
        throw new Error('No image data received from API');
      }
    } catch (error) {
      if (error.response) throw new Error(`API Error: ${error.response.status} - ${error.response.data.error?.message || 'Unknown error'}`);
      throw new Error(`Network Error: ${error.message}`);
    }
  }

  generateVariationPrompts() {
    return [
      "Professional headshot with a modern office background",
      "Business portrait with a clean white background",
      "Professional photo with a subtle gradient background",
      "Corporate headshot with a minimalist background",
      "Professional portrait with a soft blue background",
      "Business photo with a neutral gray background",
      "Professional headshot with a contemporary office setting",
      "Corporate portrait with a clean, modern background",
      "Business photo with a subtle pattern background",
      "Professional headshot with a warm, neutral background",
      "Corporate photo with a sleek, modern background",
      "Professional portrait with a soft, professional lighting",
      "Business headshot with a contemporary studio background",
      "Professional photo with a clean, minimalist setting",
      "Corporate portrait with a modern, professional environment",
      "Business photo with a subtle, professional background",
      "Professional headshot with a contemporary office backdrop",
      "Corporate photo with a clean, modern aesthetic",
      "Professional portrait with a sophisticated background",
      "Business headshot with a professional, contemporary look"
    ];
  }

  async ensureStorageDirectory() {
    try {
      await fs.access(this.storagePath);
    } catch {
      await fs.mkdir(this.storagePath, { recursive: true });
      console.log(`Created storage directory: ${this.storagePath}`);
    }
  }

  async saveMetadata(images) {
    const metadata = {
      generatedAt: new Date().toISOString(),
      count: images.length,
      images: images.map(img => ({
        filename: img.filename,
        prompt: img.prompt,
        generatedAt: img.generatedAt
      }))
    };

    const metadataPath = path.join(this.storagePath, 'metadata.json');
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
  }

  async getStoredImages() {
    try {
      const files = await fs.readdir(this.storagePath);
      const imageFiles = files.filter(file => 
        file.endsWith('.png') || file.endsWith('.jpg') || file.endsWith('.jpeg')
      );
      
      return imageFiles.map(filename => ({
        filename,
        filepath: path.join(this.storagePath, filename)
      }));
    } catch (error) {
      console.error('Error reading stored images:', error);
      return [];
    }
  }

  async clearStoredImages() {
    try {
      const files = await fs.readdir(this.storagePath);
      const imageFiles = files.filter(file => 
        file.endsWith('.png') || file.endsWith('.jpg') || file.endsWith('.jpeg')
      );
      
      for (const file of imageFiles) {
        await fs.unlink(path.join(this.storagePath, file));
      }
      
      console.log(`Cleared ${imageFiles.length} stored images`);
      return { success: true, count: imageFiles.length };
    } catch (error) {
      console.error('Error clearing stored images:', error);
      return { success: false, error: error.message };
    }
  }
}

// Rate limiter class
class RateLimiter {
  constructor(maxRequests, timeWindow) {
    this.maxRequests = maxRequests;
    this.timeWindow = timeWindow;
    this.requests = [];
  }

  async wait() {
    const now = Date.now();
    this.requests = this.requests.filter(time => now - time < this.timeWindow);
    if (this.requests.length >= this.maxRequests) {
      const oldestRequest = Math.min(...this.requests);
      const waitTime = this.timeWindow - (now - oldestRequest) + 1000;
      console.log(`Rate limit reached. Waiting ${Math.ceil(waitTime / 1000)} seconds...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    this.requests.push(now);
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.log('Usage: node image-generator.js <base-photo-path> [num-images]');
    console.log('Example: node image-generator.js ./base-photo.jpg 10');
    process.exit(1);
  }
  const basePhotoPath = args[0];
  const numImages = parseInt(args[1]) || 10;
  try {
    const generator = new ImageGenerator();
    const result = await generator.generateImages(basePhotoPath, numImages);
    if (result.success) {
      console.log(`\n✅ Successfully generated ${result.count} images`);
      console.log(`📁 Images saved to: ${generator.storagePath}`);
      console.log(`📋 Metadata saved to: ${path.join(generator.storagePath, 'metadata.json')}`);
    } else {
      console.error(`❌ Error: ${result.error}`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`❌ Fatal error: ${error.message}`);
    process.exit(1);
  }
}

module.exports = { ImageGenerator, RateLimiter };

if (require.main === module) {
  main();
}

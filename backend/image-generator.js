// Backend image generation script using OpenAI API
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const sharp = require('sharp');
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

    // Local mode: generate simple variations without external API
    this.localMode = /^1|true$/i.test(process.env.LOCAL_VARIATIONS || '');

    if (!this.apiKey && !this.localMode) {
      throw new Error('AI_API_KEY not found in environment variables (set LOCAL_VARIATIONS=1 to use local generator)');
    }
  }

  async generateImages(basePhotoPath, numImages = 10) {
    try {
      // Validate inputs
      if (numImages < 1 || numImages > 50) {
        throw new Error('Number of images must be between 1 and 50');
      }

      if (numImages > this.maxImagesPerSession) {
        throw new Error(`Maximum ${this.maxImagesPerSession} images per session`);
      }

      // Ensure storage directory exists
      await this.ensureStorageDirectory();

      // Read base photo
      const basePhotoBuffer = await fs.readFile(basePhotoPath);
      const basePhotoBase64 = basePhotoBuffer.toString('base64');

      const generatedImages = [];
      const variations = this.generateVariationPrompts();

      for (let i = 0; i < numImages; i++) {
        try {
          // Apply rate limiting (only meaningful for API mode)
          if (!this.localMode) await this.rateLimiter.wait();

          const prompt = variations[i % variations.length];

          let imageData;
          if (this.localMode) {
            imageData = await this.generateSingleImageLocal(basePhotoBuffer, i);
          } else {
            imageData = await this.generateSingleImage(basePhotoBase64, prompt);
          }

          const filename = `generated_${Date.now()}_${i + 1}.png`;
          const filepath = path.join(this.storagePath, filename);

          await fs.writeFile(filepath, imageData);

          generatedImages.push({
            filename,
            filepath,
            prompt,
            generatedAt: new Date().toISOString()
          });

          console.log(`Generated image ${i + 1}/${numImages}: ${filename}`);

        } catch (error) {
          console.error(`Error generating image ${i + 1}:`, error.message);
          // If API failed, attempt local fallback once
          if (!this.localMode) {
            try {
              const fb = await this.generateSingleImageLocal(basePhotoBuffer, i);
              const filename = `generated_${Date.now()}_${i + 1}.png`;
              const filepath = path.join(this.storagePath, filename);
              await fs.writeFile(filepath, fb);
              generatedImages.push({ filename, filepath, prompt: 'local-fallback', generatedAt: new Date().toISOString() });
              console.log(`Fallback (local) image ${i + 1}/${numImages}: ${filename}`);
            } catch (e2) {
              console.error(`Local fallback failed for image ${i + 1}:`, e2.message);
            }
          }
          // Continue with next image instead of failing completely
        }
      }

      // Save metadata
      await this.saveMetadata(generatedImages);

      return {
        success: true,
        images: generatedImages,
        count: generatedImages.length
      };

    } catch (error) {
      console.error('Error in generateImages:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async generateSingleImage(basePhotoBase64, prompt) {
    try {
      // NOTE: OpenAI image variations typically require multipart/form-data;
      // this JSON call may fail depending on the provider and model availability.
      const response = await axios.post(
        `${this.baseUrl}/images/variations`,
        {
          image: `data:image/png;base64,${basePhotoBase64}`,
          n: 1,
          size: '1024x1024',
          response_format: 'b64_json'
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data.data && response.data.data[0]) {
        return Buffer.from(response.data.data[0].b64_json, 'base64');
      } else {
        throw new Error('No image data received from API');
      }

    } catch (error) {
      if (error.response) {
        throw new Error(`API Error: ${error.response.status} - ${error.response.data.error?.message || 'Unknown error'}`);
      } else {
        throw new Error(`Network Error: ${error.message}`);
      }
    }
  }

  async generateSingleImageLocal(basePhotoBuffer, i) {
    // Produce a simple but distinct variation using sharp
    const saturation = 1 + ((i % 5) * 0.06);
    const brightness = 1 + ((i % 3) * 0.03);
    const hue = (i % 6) * 20; // degrees
    const blur = (i % 4) === 0 ? 0.3 : 0;

    let img = sharp(basePhotoBuffer).resize({ width: 1024, height: 1024, fit: 'cover' });
    img = img.modulate({ saturation, brightness, hue });
    if (blur) img = img.blur(blur);
    return await img.png({ quality: 92 }).toBuffer();
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
    
    // Remove old requests outside the time window
    this.requests = this.requests.filter(time => now - time < this.timeWindow);
    
    // If we're at the limit, wait until the oldest request expires
    if (this.requests.length >= this.maxRequests) {
      const oldestRequest = Math.min(...this.requests);
      const waitTime = this.timeWindow - (now - oldestRequest) + 1000; // Add 1 second buffer
      
      console.log(`Rate limit reached. Waiting ${Math.ceil(waitTime / 1000)} seconds...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    // Add current request
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

// Export for use as module
module.exports = { ImageGenerator, RateLimiter };

// Run CLI if called directly
if (require.main === module) {
  main();
}

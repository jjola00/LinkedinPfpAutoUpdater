import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs/promises';
import dotenv from 'dotenv';
import sharp from 'sharp';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ROOT = path.resolve(process.cwd());
const DATA_DIR = path.resolve(ROOT, 'generated-images'); // default if STORAGE_PATH missing
const STORAGE_PATH = path.resolve(process.env.STORAGE_PATH || DATA_DIR);
const TEMP_DIR = path.resolve(ROOT, 'temp');

await fs.mkdir(STORAGE_PATH, { recursive: true });
await fs.mkdir(TEMP_DIR, { recursive: true });

app.use(cors({ origin: true }));
app.use(express.json({ limit: '25mb' }));

// Serve generated images
app.use('/images', express.static(STORAGE_PATH));

app.get('/health', async (_req, res) => {
  const files = await fs.readdir(STORAGE_PATH).catch(() => []);
  res.json({ ok: true, images: files.length });
});

// Upload base photo to temp
const upload = multer({ dest: TEMP_DIR, limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB
app.post('/upload-base', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: 'No file' });
    const ext = path.extname(req.file.originalname || '.jpg') || '.jpg';
    const basePath = path.join(TEMP_DIR, `base${ext}`);
    await fs.rename(req.file.path, basePath);
    res.json({ ok: true, tempPath: basePath, filename: path.basename(basePath) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Upload failed' });
  }
});

// Generate N simple variants to STORAGE_PATH
app.post('/generate-images', async (req, res) => {
  try {
    const count = Math.max(1, Math.min(50, Number(req.body?.count || 1)));
    // Find latest base file in TEMP_DIR
    const temps = await fs.readdir(TEMP_DIR);
    const baseName = temps.find(n => n.startsWith('base'));
    if (!baseName) return res.status(400).json({ ok: false, error: 'No base photo uploaded' });
    const basePath = path.join(TEMP_DIR, baseName);

    const created = [];
    for (let i = 1; i <= count; i++) {
      const out = path.join(STORAGE_PATH, `pfp_${Date.now()}_${i}.jpg`);
      // Create a small variation so files differ (resize + slight blur for demo)
      await sharp(basePath).resize(800).jpeg({ quality: 92 }).modulate({
        saturation: 1 + (i % 5) * 0.05,
        brightness: 1 + (i % 3) * 0.02
      }).toFile(out);
      created.push(path.basename(out));
    }
    res.json({ ok: true, files: created, base: path.basename(basePath) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Generation failed' });
  }
});

// List images
app.get('/list-images', async (_req, res) => {
  const files = await fs.readdir(STORAGE_PATH).catch(() => []);
  res.json({ ok: true, files });
});

app.listen(PORT, () => {
  console.log(`Backend on http://localhost:${PORT}`);
  console.log(`Images at http://localhost:${PORT}/images/<file>`);
});

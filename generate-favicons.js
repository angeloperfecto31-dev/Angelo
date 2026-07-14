import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define the required sizes
const SIZES = [16, 32, 48, 64, 180, 192, 512];

async function generate() {
  console.log('Starting high-fidelity Favicon Asset Generation...');
  
  const publicDir = path.join(__dirname, 'public');
  const svgPath = path.join(publicDir, 'favicon.svg');
  
  if (!fs.existsSync(svgPath)) {
    console.error('Error: favicon.svg not found in public directory!');
    process.exit(1);
  }

  // Launch Puppeteer
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();

  // Create an HTML page containing the SVG at full page size
  const svgContent = fs.readFileSync(svgPath, 'utf8');
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        html, body {
          margin: 0;
          padding: 0;
          width: 100%;
          height: 100%;
          background: transparent;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        svg {
          width: 100%;
          height: 100%;
          display: block;
        }
      </style>
    </head>
    <body>
      ${svgContent}
    </body>
    </html>
  `;

  await page.setContent(htmlContent);

  // Store buffers for ICO creation
  const pngBuffers = {};

  for (const size of SIZES) {
    console.log(`Rendering ${size}x${size} png icon...`);
    
    // Set viewport exactly to the target size
    await page.setViewport({
      width: size,
      height: size,
      deviceScaleFactor: 1,
    });

    // Take screenshot with transparent background
    const pngBuffer = await page.screenshot({
      type: 'png',
      omitBackground: true,
    });

    pngBuffers[size] = pngBuffer;

    // Write individual PNG file
    const outputName = size === 180 
      ? 'apple-touch-icon.png' 
      : `favicon-${size}xsize.png`.replace('xsize', `x${size}`);
    
    fs.writeFileSync(path.join(publicDir, outputName), pngBuffer);
    console.log(`Saved /public/${outputName}`);
  }

  // Generate multi-size favicon.ico (containing 16x16 and 32x32 PNGs)
  console.log('Packaging 16x16 and 32x32 PNGs into favicon.ico...');
  const icoBuffer = createIco([
    { width: 16, height: 16, data: pngBuffers[16] },
    { width: 32, height: 32, data: pngBuffers[32] }
  ]);
  
  fs.writeFileSync(path.join(publicDir, 'favicon.ico'), icoBuffer);
  console.log('Saved /public/favicon.ico successfully!');

  await browser.close();
  console.log('All favicon assets generated successfully!');
}

/**
 * Standard ICO file format packager
 * https://en.wikipedia.org/wiki/ICO_(file_format)
 */
function createIco(images) {
  const HEADER_SIZE = 6;
  const DIRECTORY_ENTRY_SIZE = 16;
  
  const count = images.length;
  const header = Buffer.alloc(HEADER_SIZE);
  
  // Write ICO Header
  header.writeUInt16LE(0, 0); // Reserved. Must always be 0.
  header.writeUInt16LE(1, 2); // Specities image type: 1 for icon (.ICO)
  header.writeUInt16LE(count, 4); // Specifies number of images

  const directories = [];
  const entriesBuffer = Buffer.alloc(DIRECTORY_ENTRY_SIZE * count);
  
  let currentOffset = HEADER_SIZE + DIRECTORY_ENTRY_SIZE * count;
  
  for (let i = 0; i < count; i++) {
    const img = images[i];
    const size = img.data.length;
    const entry = Buffer.alloc(DIRECTORY_ENTRY_SIZE);
    
    entry.writeUInt8(img.width, 0);  // Width, in pixels (1-255). 0 means 256.
    entry.writeUInt8(img.height, 1); // Height, in pixels (1-255). 0 means 256.
    entry.writeUInt8(0, 2);          // Color count. 0 if >= 8bpp
    entry.writeUInt8(0, 3);          // Reserved. Should be 0
    entry.writeUInt16LE(1, 4);       // Color planes (1)
    entry.writeUInt16LE(32, 6);      // Bits per pixel (32-bit for ARGB transparent PNG)
    entry.writeUInt32LE(size, 8);    // Size of image data in bytes
    entry.writeUInt32LE(currentOffset, 12); // Offset of image data from beginning of file
    
    entry.copy(entriesBuffer, i * DIRECTORY_ENTRY_SIZE);
    currentOffset += size;
  }
  
  // Concatenate all parts: Header + Directory Entries + Image Raw PNG Data
  const buffers = [header, entriesBuffer];
  for (const img of images) {
    buffers.push(img.data);
  }
  
  return Buffer.concat(buffers);
}

generate().catch(err => {
  console.error('Generation failed:', err);
  process.exit(1);
});

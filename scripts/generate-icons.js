import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { deflateSync } from 'zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const typeBuffer = Buffer.from(type);
  const crcData = Buffer.concat([typeBuffer, data]);
  const crc = crc32(crcData);

  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc >>> 0, 0);

  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

function crc32(data) {
  let crc = 0xFFFFFFFF;
  const table = getCrcTable();

  for (let i = 0; i < data.length; i++) {
    crc = table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  }

  return crc ^ 0xFFFFFFFF;
}

let crcTable = null;
function getCrcTable() {
  if (crcTable) return crcTable;

  crcTable = new Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) {
        c = 0xEDB88320 ^ (c >>> 1);
      } else {
        c = c >>> 1;
      }
    }
    crcTable[n] = c;
  }
  return crcTable;
}

function createPng(size) {
  const width = size;
  const height = size;

  // Create raw pixel data (RGBA)
  const pixelData = [];
  for (let y = 0; y < height; y++) {
    pixelData.push(0); // Filter byte (none)
    for (let x = 0; x < width; x++) {
      // Dark purple-ish color matching the HUD theme
      const r = 26;
      const g = 26;
      const b = 42;
      pixelData.push(r, g, b, 255);
    }
  }

  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8);  // bit depth
  ihdrData.writeUInt8(6, 9);  // color type (RGBA)
  ihdrData.writeUInt8(0, 10); // compression
  ihdrData.writeUInt8(0, 11); // filter
  ihdrData.writeUInt8(0, 12); // interlace
  const ihdr = createChunk('IHDR', ihdrData);

  // IDAT chunk
  const compressed = deflateSync(Buffer.from(pixelData));
  const idat = createChunk('IDAT', compressed);

  // IEND chunk
  const iend = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

function main() {
  const sizes = [16, 32, 48, 128];
  const outDir = `${__dirname}/../public/icons`;

  mkdirSync(outDir, { recursive: true });

  for (const size of sizes) {
    const png = createPng(size);
    writeFileSync(`${outDir}/icon${size}.png`, png);
    console.log(`Created icon${size}.png`);
  }
}

main();

#!/usr/bin/env node
/**
 * Placeholder PWA icon generator.
 *
 * Writes minimal PNGs to `public/icons/` using only Node built-ins (no `sharp`
 * or `canvas` required). Each icon is a dark-background square with a bold
 * amber "T" centered. The venue owner will replace these with branded assets.
 *
 * Run: `node scripts/generate-icons.js`
 */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

// --- CRC-32 ----------------------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

// --- PNG encoder -----------------------------------------------------------
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function makePng(width, height, rgb) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // Each scanline is prefixed with a filter byte (0 = None).
  const rowBytes = width * 3;
  const raw = Buffer.alloc(height * (rowBytes + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (rowBytes + 1)] = 0;
    rgb.copy(raw, y * (rowBytes + 1) + 1, y * rowBytes, (y + 1) * rowBytes);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- Drawing ---------------------------------------------------------------
const BG = [0x0f, 0x0f, 0x23]; // surface background
const FG = [0xf5, 0x9e, 0x0b]; // amber-500

function drawT(size, maskable) {
  const px = Buffer.alloc(size * size * 3);
  for (let i = 0; i < size * size; i++) {
    px[i * 3] = BG[0];
    px[i * 3 + 1] = BG[1];
    px[i * 3 + 2] = BG[2];
  }

  // Maskable icons need extra padding to stay inside the 80% safe zone.
  const pad = maskable ? 0.26 : 0.18;
  const left = Math.round(size * pad);
  const right = Math.round(size * (1 - pad));
  const top = Math.round(size * pad);
  const bottom = Math.round(size * (1 - pad));
  const thickness = Math.max(2, Math.round(size * (maskable ? 0.12 : 0.14)));

  const setPx = (x, y) => {
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    const i = (y * size + x) * 3;
    px[i] = FG[0];
    px[i + 1] = FG[1];
    px[i + 2] = FG[2];
  };

  // Horizontal bar (top of the T)
  for (let y = top; y < top + thickness; y++) {
    for (let x = left; x < right; x++) setPx(x, y);
  }
  // Vertical stem
  const cx = Math.round((left + right) / 2);
  const vxStart = cx - Math.floor(thickness / 2);
  const vxEnd = vxStart + thickness;
  for (let y = top; y < bottom; y++) {
    for (let x = vxStart; x < vxEnd; x++) setPx(x, y);
  }

  return px;
}

// --- Main ------------------------------------------------------------------
const outDir = path.join(__dirname, "..", "public", "icons");
fs.mkdirSync(outDir, { recursive: true });

const targets = [
  { file: "icon-192.png", size: 192, maskable: false },
  { file: "icon-512.png", size: 512, maskable: false },
  { file: "icon-maskable-192.png", size: 192, maskable: true },
  { file: "icon-maskable-512.png", size: 512, maskable: true },
  { file: "apple-touch-icon.png", size: 180, maskable: false },
];

for (const t of targets) {
  const png = makePng(t.size, t.size, drawT(t.size, t.maskable));
  fs.writeFileSync(path.join(outDir, t.file), png);
  process.stdout.write(`  wrote ${t.file}  (${png.length} bytes)\n`);
}

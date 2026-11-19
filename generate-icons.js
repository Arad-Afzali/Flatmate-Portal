#!/usr/bin/env node
// ============================================================
//  Flatmate Portal — PWA Icon Generator
//  Zero dependencies. Uses only Node.js built-in `zlib`.
//  Design: concentric portal ring + centre dot on dark navy.
//    • Outer ring  — indigo-500  #6366f1
//    • Thin inner ring — indigo-300  #a5b4fc  (depth accent)
//    • Centre dot  — indigo-200  #c7d2fe
//    • Background  — near-black navy  #0d0d1f
//  Run:  node generate-icons.js
// ============================================================
'use strict';
const zlib = require('zlib');
const fs   = require('fs');
const path = require('path');

// ── Colour palette ───────────────────────────────────────────
const BG        = [0x0d, 0x0d, 0x1f, 0xff]; // #0d0d1f  near-black navy
const RING      = [0x63, 0x66, 0xf1, 0xff]; // #6366f1  indigo-500
const RING_INNER= [0xa5, 0xb4, 0xfc, 0xff]; // #a5b4fc  indigo-300
const DOT       = [0xc7, 0xd2, 0xfe, 0xff]; // #c7d2fe  indigo-200

// ── PNG encoder (no deps) ────────────────────────────────────
function makePng(w, h, pixels) {
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    crcTable[n] = c;
  }
  function crc32(buf) {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  function chunk(type, data) {
    const tb = Buffer.from(type);
    const db = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const lb = Buffer.alloc(4); lb.writeUInt32BE(db.length);
    const cb = Buffer.alloc(4); cb.writeUInt32BE(crc32(Buffer.concat([tb, db])));
    return Buffer.concat([lb, tb, db, cb]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA

  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter: None
    for (let x = 0; x < w; x++) {
      const si = (y * w + x) * 4;
      const di = y * (w * 4 + 1) + 1 + x * 4;
      raw[di]     = pixels[si];
      raw[di + 1] = pixels[si + 1];
      raw[di + 2] = pixels[si + 2];
      raw[di + 3] = pixels[si + 3];
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG signature
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Rounded-rect clip ────────────────────────────────────────
function inRoundedRect(px, py, x0, y0, w, h, r) {
  if (px < x0 || px > x0 + w || py < y0 || py > y0 + h) return false;
  const dx = Math.max(x0 + r - px, px - (x0 + w - r), 0);
  const dy = Math.max(y0 + r - py, py - (y0 + h - r), 0);
  return dx * dx + dy * dy <= r * r;
}

// ── Per-subpixel sample (portal ring design) ─────────────────
// Layers (back → front):
//   1. Transparent outside rounded-bg
//   2. #0d0d1f  background
//   3. #6366f1  thick outer ring (38–44% of s radius)
//   4. #a5b4fc  thin separator gap kept as bg then second thin ring at ~28–30%
//   5. #c7d2fe  centre dot (≤12% radius)
function sample(px, py, s) {
  const cx = s / 2, cy = s / 2;

  // Clip to rounded background square
  if (!inRoundedRect(px, py, 0, 0, s, s, s * 0.22)) return [0, 0, 0, 0];

  const dx   = px - cx, dy = py - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Geometry as fraction of size
  const outerO = s * 0.430;  // outer ring – outside edge
  const outerI = s * 0.330;  // outer ring – inside edge   (stroke = 10%)
  const innerO = s * 0.275;  // inner ring – outside edge
  const innerI = s * 0.235;  // inner ring – inside edge   (stroke = 4%)
  const dotR   = s * 0.120;  // centre dot

  if (dist <= dotR)                        return DOT;
  if (dist >= innerI && dist <= innerO)    return RING_INNER;
  if (dist >= outerI && dist <= outerO)    return RING;
  return BG;
}

// ── Draw icon at given size ───────────────────────────────────
function drawIcon(size) {
  const s = size;
  const pixels = new Uint8Array(s * s * 4);

  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const idx = (y * s + x) * 4;
      // 3×3 supersampling (9 samples) for smooth circles
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < 3; sy++) {
        for (let sx = 0; sx < 3; sx++) {
          const col = sample(x + (sx + 0.5) / 3, y + (sy + 0.5) / 3, s);
          r += col[0]; g += col[1]; b += col[2]; a += col[3];
        }
      }
      pixels[idx]     = Math.round(r / 9);
      pixels[idx + 1] = Math.round(g / 9);
      pixels[idx + 2] = Math.round(b / 9);
      pixels[idx + 3] = Math.round(a / 9);
    }
  }

  return makePng(s, s, pixels);
}

// ── Generate files ───────────────────────────────────────────
const outDir = path.join(__dirname, 'frontend');

const targets = [
  { size: 512, file: 'icon-512.png' },
  { size: 192, file: 'icon-192.png' },
  { size: 180, file: 'apple-touch-icon.png' },
];

for (const { size, file } of targets) {
  const buf      = drawIcon(size);
  const outPath  = path.join(outDir, file);
  fs.writeFileSync(outPath, buf);
  console.log(`✓  ${file.padEnd(24)}  ${size}×${size}  (${(buf.length / 1024).toFixed(1)} KB)`);
}

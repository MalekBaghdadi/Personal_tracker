// Generates the PWA icons into public/. No dependencies: draws with 4x
// supersampling and writes PNGs with zlib. Run with `npm run icons`.
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [0x0e, 0x14, 0x20];
const BARS = [
  // [colour, length as fraction of the content width]
  [[0x66, 0x90, 0xe6], 0.92],
  [[0xbd, 0x86, 0x38], 0.6],
  [[0x28, 0xa5, 0x92], 0.78],
  [[0xa0, 0x7e, 0xe3], 0.42],
  [[0xde, 0x63, 0x80], 0.68],
];

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size, rgb) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    rgb.copy(raw, y * (size * 3 + 1) + 1, y * size * 3, (y + 1) * size * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Inside a rounded rect (x, y, w, h, r)? */
function inRound(px, py, x, y, w, h, r) {
  if (px < x || px > x + w || py < y || py > y + h) return false;
  const cx = Math.min(Math.max(px, x + r), x + w - r);
  const cy = Math.min(Math.max(py, y + r), y + h - r);
  return (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
}

/** safe: fraction of the canvas the artwork occupies (maskable needs ~0.6). */
function draw(size, safe) {
  const S = 4;
  const out = Buffer.alloc(size * size * 3);
  const content = size * safe;
  const ox = (size - content) / 2;
  const barH = content / (BARS.length * 2 - 1);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const px = x + (sx + 0.5) / S;
          const py = y + (sy + 0.5) / S;
          let c = BG;
          BARS.forEach(([col, len], i) => {
            const by = ox + i * barH * 2;
            if (inRound(px, py, ox, by, content * len, barH, barH / 2)) c = col;
          });
          r += c[0]; g += c[1]; b += c[2];
        }
      }
      const o = (y * size + x) * 3;
      out[o] = r / (S * S);
      out[o + 1] = g / (S * S);
      out[o + 2] = b / (S * S);
    }
  }
  return png(size, out);
}

mkdirSync('public', { recursive: true });
writeFileSync('public/icon-192.png', draw(192, 0.68));
writeFileSync('public/icon-512.png', draw(512, 0.68));
writeFileSync('public/icon-maskable-512.png', draw(512, 0.52));
writeFileSync('public/apple-touch-icon.png', draw(180, 0.64));

const svgBars = BARS.map(([c, len], i) => {
  const hex = '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
  return `<rect x="5" y="${5 + i * 6}" width="${(22 * len).toFixed(1)}" height="3" rx="1.5" fill="${hex}"/>`;
}).join('');
writeFileSync('public/favicon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#0e1420"/>${svgBars}</svg>\n`);
console.log('Icons written to public/');

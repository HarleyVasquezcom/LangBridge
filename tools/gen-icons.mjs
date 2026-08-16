import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const png = (w, h, rgba) => {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const i = y * (w * 4 + 1) + 1 + x * 4;
      const j = (y * w + x) * 4;
      raw[i] = rgba[j];
      raw[i + 1] = rgba[j + 1];
      raw[i + 2] = rgba[j + 2];
      raw[i + 3] = rgba[j + 3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body) >>> 0, 0);
    return Buffer.concat([len, body, crc]);
  };
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

const S = 128;
const img = Buffer.alloc(S * S * 4);
const px = (x, y, r, g, b, a = 255) => {
  if (x < 0 || y < 0 || x >= S || y >= S) return;
  const i = (y * S + x) * 4;
  const m = Math.min(1, a);
  img[i] = Math.round(r * m + img[i] * (1 - m));
  img[i + 1] = Math.round(g * m + img[i + 1] * (1 - m));
  img[i + 2] = Math.round(b * m + img[i + 2] * (1 - m));
  img[i + 3] = Math.max(img[i + 3], a);
};

const AMBER = [245, 158, 11];
const HONEY = [251, 191, 36];
const DARK = [30, 18, 2];

function fillRound(cx, cy, rx, ry, color) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1) px(x, y, color[0], color[1], color[2]);
    }
  }
}

fillRound(44, 58, 30, 34, AMBER);
fillRound(88, 66, 30, 34, HONEY);
fillRound(44, 58, 13, 15, DARK);
fillRound(88, 66, 13, 15, DARK);

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'icons');
fs.mkdirSync(outDir, { recursive: true });
for (const [size, name] of [[16, 'icon16.png'], [48, 'icon48.png'], [128, 'icon128.png']]) {
  const scaled = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sx = Math.min(S - 1, Math.floor((x * S) / size));
      const sy = Math.min(S - 1, Math.floor((y * S) / size));
      const si = (sy * S + sx) * 4;
      const di = (y * size + x) * 4;
      scaled[di] = img[si];
      scaled[di + 1] = img[si + 1];
      scaled[di + 2] = img[si + 2];
      scaled[di + 3] = img[si + 3];
    }
  }
  fs.writeFileSync(path.join(outDir, name), png(size, size, scaled));
  console.log('icon: ' + path.join(outDir, name));
}
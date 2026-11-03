// Draws the Tabhush logo (rounded ink square, white "T", sage hush dot) and
// writes the app icon and the tray icons as PNG. Pure Node: shapes are rasterized with 4x4
// supersampling and encoded with zlib, so no image tools are needed.
import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const out = fileURLToPath(new URL("../apps/desktop/public/icons/", import.meta.url));
mkdirSync(out, { recursive: true });
const INK = [29, 33, 37]; // #1D2125
const SAGE = [134, 181, 166]; // #86B5A6

// Shapes in a 0..1 box.
const roundRect = (x, y, x0, y0, x1, y1, r) => {
  const cx = Math.min(Math.max(x, x0 + r), x1 - r), cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r && x >= x0 && x <= x1 && y >= y0 && y <= y1;
};
const circle = (x, y, cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;

function sample(x, y) {
  if (!roundRect(x, y, 0, 0, 1, 1, 0.24)) return null;
  let c = INK;
  const stem = roundRect(x, y, 0.425, 0.24, 0.575, 0.78, 0.07);
  const foot = roundRect(x, y, 0.22, 0.24, 0.78, 0.39, 0.07); // the T's top bar
  const dot = circle(x, y, 0.74, 0.72, 0.075);
  if (stem || foot) c = [255, 255, 255];
  if (dot) c = SAGE;
  return c;
}

function png(size, sampler = sample) {
  const ss = 4;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let py = 0; py < size; py++) {
    raw[py * (size * 4 + 1)] = 0;
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
        const c = sampler((px + (sx + 0.5) / ss) / size, (py + (sy + 0.5) / ss) / size);
        if (c) { r += c[0]; g += c[1]; b += c[2]; a++; }
      }
      const o = py * (size * 4 + 1) + 1 + px * 4;
      raw[o] = a ? r / a : 0; raw[o + 1] = a ? g / a : 0; raw[o + 2] = a ? b / a : 0; raw[o + 3] = (a / (ss * ss)) * 255;
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

// The Windows tray icon.
writeFileSync(`${out}icon-32.png`, png(32));

// Desktop app (Q-70): the app icon on Apple's grid (artwork inset ~10%), and a menu-bar template
// image (black glyph on transparent; macOS tints it for light and dark menu bars).
const res = fileURLToPath(new URL("../apps/desktop/build-res/", import.meta.url));
mkdirSync(res, { recursive: true });
const inset = (x, y) => {
  const m = 0.1;
  const u = (x - m) / (1 - 2 * m), v = (y - m) / (1 - 2 * m);
  return u < 0 || u > 1 || v < 0 || v > 1 ? null : sample(u, v);
};
writeFileSync(`${res}icon.png`, png(1024, inset));
const tray = (x, y) => {
  const stem = roundRect(x, y, 0.43, 0.14, 0.57, 0.86, 0.06);
  const bar = roundRect(x, y, 0.16, 0.14, 0.84, 0.29, 0.06);
  const dot = circle(x, y, 0.8, 0.78, 0.09);
  return stem || bar || dot ? [0, 0, 0] : null;
};
writeFileSync(`${out}trayTemplate.png`, png(18, tray));
writeFileSync(`${out}trayTemplate@2x.png`, png(36, tray));
console.log("icons written to", out, "and", res);

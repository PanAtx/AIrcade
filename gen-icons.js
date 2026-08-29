/* gen-icons.js — procedurally generates the AIrcade joystick icons
   (icons/joystick-192.png and icons/joystick-512.png) with no dependencies.
   Usage: node gen-icons.js */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/* ---------- minimal PNG encoder ---------- */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const tb = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([tb, data])), 0);
  return Buffer.concat([len, tb, data, crc]);
}
function encodePNG(w, h, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // 8-bit RGBA, no interlace
  const stride = w * 4 + 1;
  const raw = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    raw[y * stride] = 0; // filter type: none
    rgba.copy(raw, y * stride + 1, y * w * 4, (y + 1) * w * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0))]);
}

/* ---------- shape helpers (unit square, 0..1) ---------- */
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
function lerpColor(stops, t) {
  t = clamp(t, 0, 1);
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [t0, c0] = stops[i - 1], [t1, c1] = stops[i];
      const k = (t1 === t0) ? 0 : (t - t0) / (t1 - t0);
      return mix(c0, c1, k);
    }
  }
  return stops[stops.length - 1][1];
}
function sdCircle(px, py, cx, cy, r) { return Math.hypot(px - cx, py - cy) - r; }
function sdRoundRect(px, py, cx, cy, hw, hh, r) {
  const dx = Math.abs(px - cx) - hw + r;
  const dy = Math.abs(py - cy) - hh + r;
  return Math.min(Math.max(dx, dy), 0) + Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) - r;
}
function sdCapsule(px, py, ax, ay, bx, by, r) {
  const abx = bx - ax, aby = by - ay;
  const t = clamp(((px - ax) * abx + (py - ay) * aby) / (abx * abx + aby * aby), 0, 1);
  return Math.hypot(px - (ax + abx * t), py - (ay + aby * t)) - r;
}
/* draw a signed-distance shape with ~1px antialiased edges over `col`.
   `AA` is the 1-px width in unit space (set per render by renderIcon). */
function over(col, color, sd) {
  const cov = clamp(0.5 - sd / (2 * AA), 0, 1);
  if (cov <= 0) return col;
  return mix(col, color, cov);
}
/* ---------- the AIrcade joystick artwork ---------- */
let AA = 1 / 1024; // 1px in unit space; updated by renderIcon before sampling
function sample(x, y) {
  // background: dark vertical gradient + soft pink glow + synthwave horizon lines
  let col = lerpColor([[0, [14, 7, 42]], [1, [4, 2, 16]]], y);
  const gd = Math.hypot(x - 0.5, y - 0.55) / 0.7;
  col = mix(col, [255, 47, 214], Math.max(0, 1 - gd) * 0.20);
  for (let i = 0; i < 4; i++) {
    const ly = 0.90 + i * 0.028;
    if (y >= ly && y <= ly + 0.006 && x >= 0.12 && x <= 0.88) {
      col = mix(col, [41, 247, 255], 0.12 * (1 - i / 4));
    }
  }

  // console base (rounded slab, pink -> purple)
  const dBase = sdRoundRect(x, y, 0.5, 0.72, 0.32, 0.115, 0.05);
  if (dBase < AA) {
    const base = lerpColor([[0, [255, 96, 232]], [1, [132, 28, 186]]], clamp((y - 0.605) / 0.23, 0, 1));
    col = over(col, base, dBase);
  }
  // dark bottom lip for a sense of depth
  col = over(col, [20, 8, 40], sdRoundRect(x, y, 0.5, 0.83, 0.29, 0.028, 0.02));

  // D-pad cross (left)
  const dp = [25, 25, 58];
  col = over(col, dp, sdRoundRect(x, y, 0.315, 0.715, 0.078, 0.030, 0.012));
  col = over(col, dp, sdRoundRect(x, y, 0.315, 0.715, 0.030, 0.078, 0.012));
  col = over(col, [52, 52, 96], Math.max(
    sdRoundRect(x, y, 0.315, 0.715, 0.074, 0.024, 0.010),
    sdRoundRect(x, y, 0.315, 0.715, 0.024, 0.074, 0.010)));

  // A / B buttons (right)
  col = over(col, [255, 70, 70], sdCircle(x, y, 0.585, 0.70, 0.048));
  col = over(col, [255, 200, 200], sdCircle(x, y, 0.571, 0.686, 0.016));
  col = over(col, [41, 247, 255], sdCircle(x, y, 0.705, 0.70, 0.048));
  col = over(col, [190, 250, 255], sdCircle(x, y, 0.691, 0.686, 0.016));

  // joystick stick (silver, drawn on top of the base)
  const dStick = sdCapsule(x, y, 0.5, 0.44, 0.5, 0.70, 0.034);
  if (dStick < AA) {
    const stick = lerpColor([[0, [238, 240, 252]], [1, [130, 138, 176]]], clamp((y - 0.40) / 0.30, 0, 1));
    col = over(col, stick, dStick);
  }

  // joystick ball (glossy yellow)
  const dBall = sdCircle(x, y, 0.5, 0.30, 0.145);
  if (dBall < AA) {
    const t = Math.hypot(x - 0.455, y - 0.255) / 0.21;
    const ball = lerpColor([[0, [255, 252, 220]], [0.4, [255, 230, 0]], [1, [209, 154, 0]]], t);
    col = over(col, ball, dBall);
    col = over(col, [255, 255, 255], sdCircle(x, y, 0.44, 0.235, 0.026)); // specular dot
  }

  return [Math.round(clamp(col[0], 0, 255)), Math.round(clamp(col[1], 0, 255)), Math.round(clamp(col[2], 0, 255)), 255];
}

/* ---------- SSAA render + downsample ---------- */
function renderIcon(size) {
  const SS = 4;
  const big = size * SS;
  AA = 1 / big; // 1px AA band in unit space
  const buf = Buffer.alloc(big * big * 4);
  for (let py = 0; py < big; py++) {
    const y = (py + 0.5) / big;
    for (let px = 0; px < big; px++) {
      const x = (px + 0.5) / big;
      const [r, g, b, a] = sample(x, y);
      const o = (py * big + px) * 4;
      buf[o] = r; buf[o + 1] = g; buf[o + 2] = b; buf[o + 3] = a;
    }
  }
  const out = Buffer.alloc(size * size * 4);
  const block = SS * SS;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let dy = 0; dy < SS; dy++) {
        for (let dx = 0; dx < SS; dx++) {
          const o = ((y * SS + dy) * big + (x * SS + dx)) * 4;
          r += buf[o]; g += buf[o + 1]; b += buf[o + 2]; a += buf[o + 3];
        }
      }
      const o = (y * size + x) * 4;
      out[o] = Math.round(r / block); out[o + 1] = Math.round(g / block);
      out[o + 2] = Math.round(b / block); out[o + 3] = Math.round(a / block);
    }
  }
  return out;
}

/* ---------- main ---------- */
const outDir = path.join(__dirname, 'icons');
fs.mkdirSync(outDir, { recursive: true });
for (const size of [192, 512]) {
  const rgba = renderIcon(size);
  const file = path.join(outDir, 'joystick-' + size + '.png');
  fs.writeFileSync(file, encodePNG(size, size, rgba));
  console.log('wrote', file, (fs.statSync(file).size / 1024).toFixed(1) + ' KB');
}

/* sanity checks: sample a few pixels of the 192 render */
const img = renderIcon(192);
const px = (x, y) => img.slice((y * 192 + x) * 4, (y * 192 + x) * 4 + 3).join(',');
console.log('corner (bg):     ', px(4, 4));
console.log('ball center:     ', px(96, 58));
console.log('base left:       ', px(40, 138));
console.log('A button (red):  ', px(112, 134));
console.log('B button (cyan): ', px(135, 134));
console.log('stick:           ', px(96, 92));
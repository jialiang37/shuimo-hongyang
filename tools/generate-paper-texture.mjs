// 程序化生成无缝平铺的宣纸纹理 T_Paper.png（1024×1024，零依赖，仅用 Node 内置模块）
// 用法：node tools/generate-paper-texture.mjs
// 之后可用 AI 生图的同名文件直接替换（建议 1024×1024、可无缝平铺）。
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const W = 1024;
const H = 1024;

// ---------- 可复现随机数 ----------
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260906);

// ---------- 无缝值噪声（网格环绕采样，天然可平铺） ----------
function smooth(t) {
  return t * t * (3 - 2 * t);
}
function makeValueNoise(gridSize, seed) {
  const r = mulberry32(seed);
  const g = new Float32Array(gridSize * gridSize);
  for (let i = 0; i < g.length; i++) g[i] = r();
  return (x, y) => {
    // x,y ∈ [0,1)
    const fx = x * gridSize;
    const fy = y * gridSize;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const x0 = ((ix % gridSize) + gridSize) % gridSize;
    const y0 = ((iy % gridSize) + gridSize) % gridSize;
    const x1 = (x0 + 1) % gridSize;
    const y1 = (y0 + 1) % gridSize;
    const tx = smooth(fx - ix);
    const ty = smooth(fy - iy);
    const v00 = g[y0 * gridSize + x0];
    const v10 = g[y0 * gridSize + x1];
    const v01 = g[y1 * gridSize + x0];
    const v11 = g[y1 * gridSize + x1];
    return (
      (v00 + (v10 - v00) * tx) * (1 - ty) +
      (v01 + (v11 - v01) * tx) * ty
    );
  };
}
const noiseA = makeValueNoise(8, 101); // 大块斑驳
const noiseB = makeValueNoise(32, 202); // 中等云纹
const noiseC = makeValueNoise(128, 303); // 细颗粒

// ---------- 画布：浮点 RGB ----------
const img = new Float32Array(W * H * 3);
const BASE = [243, 238, 224]; // 宣纸底色（略带米黄）

for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const u = x / W;
    const v = y / H;
    const m =
      (noiseA(u, v) - 0.5) * 10 +
      (noiseB(u, v) - 0.5) * 6 +
      (noiseC(u, v) - 0.5) * 4; // ±10 内的明度起伏
    const i = (y * W + x) * 3;
    img[i] = BASE[0] + m;
    img[i + 1] = BASE[1] + m;
    img[i + 2] = BASE[2] + m;
  }
}

// 在 (x,y) 处以透明度 a 混入颜色 c，坐标环绕保证无缝
function blend(x, y, c, a) {
  const xi = ((Math.round(x) % W) + W) % W;
  const yi = ((Math.round(y) % H) + H) % H;
  const i = (yi * W + xi) * 3;
  for (let k = 0; k < 3; k++) {
    img[i + k] = img[i + k] * (1 - a) + c[k] * a;
  }
}

// ---------- 大块柔和晕斑（宣纸的不均匀感） ----------
for (let n = 0; n < 50; n++) {
  const cx = rand() * W;
  const cy = rand() * H;
  const rx = 80 + rand() * 160;
  const ry = 80 + rand() * 160;
  const darker = rand() < 0.5;
  const c = darker ? [228, 220, 200] : [250, 246, 235];
  const aMax = 0.02 + rand() * 0.02;
  const r = Math.ceil(Math.max(rx, ry));
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const q = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
      if (q > 1) continue;
      blend(cx + dx, cy + dy, c, aMax * (1 - q));
    }
  }
}

// ---------- 纸纤维（细短随机线痕） ----------
for (let n = 0; n < 5200; n++) {
  let x = rand() * W;
  let y = rand() * H;
  // 多数纤维略平行于横向，少量纵向
  const angle = rand() < 0.72 ? (rand() - 0.5) * 0.9 : Math.PI / 2 + (rand() - 0.5) * 0.9;
  const len = 12 + rand() * 70;
  const darker = rand() < 0.6;
  const c = darker ? [226, 219, 200] : [251, 248, 238];
  const a = 0.025 + rand() * 0.045;
  const stepX = Math.cos(angle);
  const stepY = Math.sin(angle);
  for (let s = 0; s < len; s++) {
    blend(x + s * stepX + (rand() - 0.5) * 0.8, y + s * stepY + (rand() - 0.5) * 0.8, c, a);
  }
}

// ---------- 细小杂点（纸浆颗粒） ----------
for (let n = 0; n < 2600; n++) {
  const c = rand() < 0.5 ? [222, 214, 194] : [248, 244, 232];
  blend(rand() * W, rand() * H, c, 0.02 + rand() * 0.04);
}

// ---------- 编码 PNG（RGB8，无依赖） ----------
const crcTable = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

const raw = Buffer.alloc(H * (1 + W * 3));
for (let y = 0; y < H; y++) {
  const row = y * (1 + W * 3);
  raw[row] = 0; // filter: none
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3;
    const o = row + 1 + x * 3;
    raw[o] = Math.max(0, Math.min(255, Math.round(img[i])));
    raw[o + 1] = Math.max(0, Math.min(255, Math.round(img[i + 1])));
    raw[o + 2] = Math.max(0, Math.min(255, Math.round(img[i + 2])));
  }
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 2; // color type: RGB
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

// ---------- 统计平均色并写出 ----------
let ar = 0,
  ag = 0,
  ab = 0;
for (let i = 0; i < img.length; i += 3) {
  ar += img[i];
  ag += img[i + 1];
  ab += img[i + 2];
}
const n = img.length / 3;
const hex = (v) =>
  Math.round(v)
    .toString(16)
    .padStart(2, '0');

const outPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets', 'textures', 'T_Paper.png');
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, png);
console.log(`已生成 ${outPath} (${W}x${H}, ${Math.round(png.length / 1024)} KB)`);
console.log(`平均色: #${hex(ar / n)}${hex(ag / n)}${hex(ab / n)}  ← 场景雾色请与此一致`);

// 从 OSM 实测数据（tools/_hy_water.json）生成洪阳水系场景数据
// 用法：node tools/generate-water-data.mjs
// 输出：public/assets/data/hongyang-water.json（米制坐标，x=东，z=南）
//
// 数据来源与取舍（2026-09 抓取的 OSM 实测）：
// - 主河「榕江南河」：OSM waterway=river 的 31 个实测点，在洪阳镇区北侧，走向西南→东北
// - 「城内河」：镇区内 OSM 实测的南北向小河碎段（西经 116.211~116.221 一带），合并后
//   向南延伸至田野、向北弯接主河（衔接段为写意补全）
// - 「护城河」：洪阳老县城明清城垣的护城河，OSM 无完整测绘，按老城格局写意成圆角矩形环
// - 「水塘」：取镇中心 1.5km 内的 OSM 水面多边形，简化为圆（潮汕村落特有的池塘肌理）
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ANCHOR = { lon: 116.2181, lat: 23.4375 }; // 洪阳镇中心（OSM 节点）
const M_PER_DEG_LNG = 111320 * Math.cos((ANCHOR.lat * Math.PI) / 180); // ≈102,140
const M_PER_DEG_LAT = 110880;

const toScene = (lon, lat) => ({
  x: +((lon - ANCHOR.lon) * M_PER_DEG_LNG).toFixed(1),
  z: -((lat - ANCHOR.lat) * M_PER_DEG_LAT).toFixed(1), // 北为负
});

const osm = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '_hy_water.json'), 'utf8'),
);

const ways = osm.elements.filter((e) => e.type === 'way' && e.geometry);

// ---------- 1. 主河（榕江南河）：只保留场景附近的实测点（出景后截断） ----------
const mainRiver = ways.find((w) => w.tags?.waterway === 'river');
if (!mainRiver) throw new Error('未在 OSM 数据中找到 river');
const rongjiang = [];
for (const p of mainRiver.geometry) {
  const s = toScene(p.lon, p.lat);
  rongjiang.push(s);
  if (Math.max(Math.abs(s.x), Math.abs(s.z)) > 2800) break; // 多留出景后一个点
}

// ---------- 2. 城内河：收集镇区内南北向碎段，按纬度排序成一条南→北的水线 ----------
const IN_TOWN = (p) =>
  p.lon > 116.208 && p.lon < 116.222 && p.lat > 23.424 && p.lat < 23.45;
const townPts = [];
for (const w of ways.filter((w) => ['stream', 'ditch'].includes(w.tags?.waterway))) {
  for (const p of w.geometry) {
    if (IN_TOWN(p)) townPts.push({ lon: p.lon, lat: p.lat });
  }
}
townPts.sort((a, b) => a.lat - b.lat); // 南→北
// 去掉过近的重复点
const neihe = [];
for (const p of townPts) {
  const s = toScene(p.lon, p.lat);
  const last = neihe[neihe.length - 1];
  if (!last || Math.hypot(s.x - last.x, s.z - last.z) > 15) neihe.push(s);
}
// 碎段按纬度排序后横向会折返，做滑窗平滑让东西向坐标随纬度渐变
{
  const W = 7;
  const smoothed = neihe.map((_, i) => {
    const a = Math.max(0, i - W);
    const b = Math.min(neihe.length - 1, i + W);
    let sx = 0, sz = 0;
    for (let k = a; k <= b; k++) {
      sx += neihe[k].x;
      sz += neihe[k].z;
    }
    const n = b - a + 1;
    return { x: +(sx / n).toFixed(1), z: +(sz / n).toFixed(1) };
  });
  neihe.length = 0;
  neihe.push(...smoothed);
  // 平滑后再次去重
  for (let i = neihe.length - 2; i >= 0; i--) {
    if (Math.hypot(neihe[i].x - neihe[i + 1].x, neihe[i].z - neihe[i + 1].z) < 20) {
      neihe.splice(i, 1);
    }
  }
}

// 写意补全：南端延到田野边缘，北端弯向主河汇合
const southTail = [
  { x: neihe[0].x + 60, z: 1650 },
  { x: neihe[0].x + 20, z: 1250 },
];
const joinAt = rongjiang[Math.floor(rongjiang.length / 3)];
const northTail = [
  { x: neihe[neihe.length - 1].x - 30, z: neihe[neihe.length - 1].z - 260 },
  { x: neihe[neihe.length - 1].x - 150, z: neihe[neihe.length - 1].z - 520 },
  { x: joinAt.x + 60, z: joinAt.z + 40 },
];
const neiheFull = [...southTail, ...neihe, ...northTail];

// ---------- 3. 护城河（写意圆角矩形环，位于城内河东侧的老城核心区外沿） ----------
const moat = [];
{
  const cx = 320, cz = -40; // 老城核心中心（城内河以东，城内河贴其西缘北流）
  const hw = 300, hh = 240; // 半宽/半高
  const r = 120;
  const N = 12; // 每条边中段点数
  const edge = (x0, y0, x1, y1) => {
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      moat.push({ x: cx + x0 + (x1 - x0) * t, z: cz + y0 + (y1 - y0) * t });
    }
  };
  // 从东南角圆弧开始顺时针
  const arc = (ax, ay, a0, a1) => {
    for (let i = 0; i <= 6; i++) {
      const a = a0 + ((a1 - a0) * i) / 6;
      moat.push({ x: cx + ax + r * Math.cos(a), z: cz + ay + r * Math.sin(a) });
    }
  };
  arc(hw - r, hh - r, 0, Math.PI / 2); // 东南角
  edge(hw - r, hh, -hw + r, hh); // 南边（z+）
  arc(-hw + r, hh - r, Math.PI / 2, Math.PI); // 西南角
  edge(-hw, hh - r, -hw, -hh + r); // 西边
  arc(-hw + r, -hh + r, Math.PI, (3 * Math.PI) / 2); // 西北角
  edge(-hw + r, -hh, hw - r, -hh); // 北边
  arc(hw - r, -hh + r, (3 * Math.PI) / 2, 2 * Math.PI); // 东北角
  edge(hw, -hh + r, hw, hh - r); // 东边
  moat.push({ ...moat[0] }); // 闭合
}

// ---------- 4. 水塘（镇中心 1.5km 内的水面多边形 → 圆） ----------
const ponds = [];
for (const w of ways) {
  if (w.tags?.natural !== 'water' || !w.geometry) continue;
  const lons = w.geometry.map((p) => p.lon);
  const lats = w.geometry.map((p) => p.lat);
  const clon = (Math.min(...lons) + Math.max(...lons)) / 2;
  const clat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const c = toScene(clon, clat);
  if (Math.hypot(c.x, c.z) > 1500) continue;
  const wM = (Math.max(...lons) - Math.min(...lons)) * M_PER_DEG_LNG;
  const hM = (Math.max(...lats) - Math.min(...lats)) * M_PER_DEG_LAT;
  ponds.push({ ...c, r: +Math.min(120, Math.max(30, (Math.min(wM, hM) / 2) * 0.85)).toFixed(1) });
}
ponds.sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));

const out = {
  anchor: ANCHOR,
  unit: 'meter_x_east_z_south',
  source: 'OpenStreetMap 实测 + 写意补全（tools/generate-water-data.mjs）',
  rivers: [
    { name: '榕江南河', width: 70, points: rongjiang },
    { name: '城内河（洪阳河）', width: 26, points: neiheFull },
    { name: '护城河', width: 16, points: moat, closed: true },
  ],
  ponds: ponds.slice(0, 4),
};

const outPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'public',
  'assets',
  'data',
  'hongyang-water.json',
);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(out, null, 1));
console.log(`已生成 ${outPath}`);
for (const r of out.rivers) {
  console.log(`- ${r.name}: ${r.points.length} 点, 宽 ${r.width}m, 起(${r.points[0].x},${r.points[0].z}) 终(${r.points.at(-1).x},${r.points.at(-1).z})`);
}
console.log(`- 水塘 x${out.ponds.length}:`, out.ponds.map((p) => `(${p.x},${p.z},r${p.r})`).join(' '));

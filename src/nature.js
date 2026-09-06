// 草木与点睛（M6）：水墨树撒点 / 飞鸟绕塔 / 远景云雾 / 竖排标题+朱印
// v2：返回 treeMats/title/clouds 供浮现动画注册
// 树：Canvas 程序化水墨树三款（用户生图后可放 assets/textures/ 替换），合并几何按款分 3 次 draw call
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const ptOf = (p) => (Array.isArray(p) ? { x: p[0], z: p[1] } : p);

// ---- 程序化水墨树贴图（透明底，透明度硬裁切 alphaTest 出剪影感） ----
function treeTexture(seed, style) {
  const rand = mulberry32(seed);
  const c = document.createElement('canvas');
  c.width = 128; c.height = 160;
  const ctx = c.getContext('2d');

  // 树干：自下而上的弯曲粗线（多段递减宽）
  ctx.strokeStyle = '#2e2a24';
  ctx.lineCap = 'round';
  let x = 64 + (rand() - 0.5) * 10, y = 158;
  const segs = 5;
  let sway = (rand() - 0.5) * 26;
  for (let i = 0; i < segs; i++) {
    const nx = x + sway / segs + (rand() - 0.5) * 6;
    const ny = y - (150 / segs) * (0.8 + rand() * 0.4);
    ctx.lineWidth = 9 - i * 1.4;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(nx, ny); ctx.stroke();
    x = nx; y = ny;
  }
  // 枝
  for (let i = 0; i < 4; i++) {
    const bx = x, by = y - i * 8;
    const dir = i % 2 === 0 ? 1 : -1;
    ctx.lineWidth = 3 - i * 0.5;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.quadraticCurveTo(bx + dir * 16, by - 10, bx + dir * 26, by - 18);
    ctx.stroke();
  }

  // 树冠：墨色团簇（径向渐变淡出），style 决定冠形
  const dabs = 10 + Math.floor(rand() * 5);
  const tones = ['rgba(74,82,68,', 'rgba(93,102,83,', 'rgba(57,65,58,'];
  for (let i = 0; i < dabs; i++) {
    let bx, by, br;
    if (style === 0) { // 圆冠
      bx = 64 + (rand() - 0.5) * 74; by = 52 + (rand() - 0.5) * 44; br = 16 + rand() * 14;
    } else if (style === 1) { // 窄高
      bx = 64 + (rand() - 0.5) * 44; by = 30 + rand() * 80; br = 12 + rand() * 10;
    } else { // 宽展
      bx = 64 + (rand() - 0.5) * 100; by = 62 + (rand() - 0.5) * 36; br = 14 + rand() * 12;
    }
    const tone = tones[Math.floor(rand() * tones.length)];
    const g = ctx.createRadialGradient(bx, by, 2, bx, by, br);
    g.addColorStop(0, tone + '0.75)');
    g.addColorStop(1, tone + '0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
  }
  // 淡墨点苔
  ctx.fillStyle = 'rgba(46,42,36,0.5)';
  for (let i = 0; i < 10; i++) {
    ctx.beginPath();
    ctx.arc(64 + (rand() - 0.5) * 90, 40 + rand() * 70, 1 + rand() * 2, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---- 远景云雾贴图 ----
function cloudTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const ctx = c.getContext('2d');
  for (let i = 0; i < 7; i++) {
    const bx = 40 + Math.random() * 176, by = 50 + Math.random() * 40, br = 34 + Math.random() * 42;
    const g = ctx.createRadialGradient(bx, by, 4, bx, by, br);
    g.addColorStop(0, 'rgba(243,238,227,0.85)');
    g.addColorStop(1, 'rgba(243,238,227,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---- 竖排标题贴图（楷体"水墨洪阳"+朱印） ----
function titleTexture() {
  const c = document.createElement('canvas');
  c.width = 300; c.height = 900;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(40,36,30,0.92)';
  ctx.font = 'bold 168px KaiTi, STKaiti, SimSun, serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const chars = ['水', '墨', '洪', '阳'];
  chars.forEach((ch, i) => ctx.fillText(ch, 150, 130 + i * 178));
  // 朱印
  ctx.fillStyle = '#a03a2a';
  ctx.fillRect(105, 790, 90, 90);
  ctx.fillStyle = '#f6f2e7';
  ctx.font = 'bold 36px KaiTi, serif';
  ctx.fillText('洪', 135, 826);
  ctx.fillText('阳', 135, 862);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildNature(streets, waterData, landmarks) {
  const rand = mulberry32(4261);
  const group = new THREE.Group();
  const CENTER = { x: 320, z: -40 };
  const tower = landmarks.find((l) => l.name === '培风塔') || { x: 820, z: -700, r: 65 };

  // ---- 水墨树撒点 ----
  const texs = [treeTexture(11, 0), treeTexture(22, 1), treeTexture(33, 2)];
  const geos = [[], [], []];
  const plant = (x, z, s = 1) => {
    const vi = Math.floor(rand() * 3);
    const g = new THREE.PlaneGeometry(15 * s, 19 * s);
    g.rotateY(rand() * Math.PI * 2);
    g.translate(x, 9.2 * s, z);
    geos[vi].push(g);
  };

  // 净空：道路半宽+3、水系半宽内不种
  const segs = [];
  const pushPoly = (pts, hw) => {
    const P = pts.map(ptOf);
    for (let i = 0; i < P.length - 1; i++) {
      segs.push({ x1: P[i].x, z1: P[i].z, x2: P[i + 1].x, z2: P[i + 1].z, hw });
    }
  };
  for (const r of streets.roads) pushPoly(r.pts, r.width / 2 + 3);
  const clearRoad = (x, z) => {
    let best = Infinity;
    for (const s of segs) {
      const dx = s.x2 - s.x1, dz = s.z2 - s.z1;
      const len2 = dx * dx + dz * dz;
      let t = len2 > 0 ? ((x - s.x1) * dx + (z - s.z1) * dz) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(x - (s.x1 + dx * t), z - (s.z1 + dz * t)) - s.hw;
      if (d < best) best = d;
    }
    return best;
  };
  const inLandmark = (x, z, k = 0.85) =>
    landmarks.some((L) => Math.hypot(x - L.x, z - L.z) < L.r * k);

  // 沿河：两岸交错
  for (const river of waterData.rivers) {
    const P = river.points.map(ptOf);
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[i], b = P[i + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      const n = Math.max(1, Math.floor(len / 38));
      const dx = (b.x - a.x) / len, dz = (b.z - a.z) / len;
      for (let k = 0; k < n; k++) {
        const t = (k + rand()) / n;
        const mx = a.x + (b.x - a.x) * t, mz = a.z + (b.z - a.z) * t;
        const side = rand() < 0.5 ? 1 : -1;
        const off = river.width / 2 + 5 + rand() * 9;
        const x = mx - dz * off * side, z = mz + dx * off * side;
        const rCenter = Math.hypot(x - CENTER.x, z - CENTER.z);
        if (rCenter < 300 && rand() < 0.6) continue; // 城内沿河少种
        if (rand() < 0.72) plant(x, z, 0.9 + rand() * 0.8);
      }
    }
  }
  // 沿街（城外路段为主）
  for (const road of streets.roads) {
    if (road.cls !== 'main' || road.closed) continue;
    const P = road.pts.map(ptOf);
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[i], b = P[i + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      const n = Math.max(1, Math.floor(len / 60));
      for (let k = 0; k < n; k++) {
        const t = (k + rand()) / n;
        const mx = a.x + (b.x - a.x) * t, mz = a.z + (b.z - a.z) * t;
        const rr = Math.hypot(mx - CENTER.x, mz - CENTER.z);
        if (rr < 420) continue; // 城内已密，不再行道树
        if (clearRoad(mx, mz) < 5) continue;
        const side = rand() < 0.5 ? 1 : -1;
        const dx = (b.x - a.x) / len, dz = (b.z - a.z) / len;
        const off = road.width / 2 + 5 + rand() * 6;
        if (rand() < 0.45) plant(mx - dz * off * side, mz + dx * off * side, 0.9 + rand() * 0.7);
      }
    }
  }
  // 池塘边
  for (const p of waterData.ponds) {
    for (let k = 0; k < 7; k++) {
      const a = rand() * Math.PI * 2;
      const x = p.x + Math.cos(a) * (p.r + 6 + rand() * 6);
      const z = p.z + Math.sin(a) * (p.r + 6 + rand() * 6);
      if (rand() < 0.8) plant(x, z, 0.8 + rand() * 0.6);
    }
  }
  // 英歌广场 / 城隍庙广场 边角
  plant(505, -122, 0.9); plant(575, -122, 0.85); plant(540, -108, 0.8);
  plant(352, -140, 0.8); plant(428, -140, 0.8);
  // 城外疏林
  for (let i = 0; i < 260; i++) {
    const a = rand() * Math.PI * 2, rr = 480 + rand() * 780;
    const x = CENTER.x + Math.cos(a) * rr, z = CENTER.z + Math.sin(a) * rr;
    if (Math.hypot(x - tower.x, z - tower.z) < tower.r + 15) continue;
    if (clearRoad(x, z) < 4) continue;
    if (inLandmark(x, z, 0.9)) continue;
    if (rand() < 0.3) plant(x, z, 0.8 + rand() * 0.9);
  }

  const treeMats = texs.map((tex) => new THREE.MeshBasicMaterial({
    map: tex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide,
  }));
  geos.forEach((arr, i) => {
    if (!arr.length) return;
    const mesh = new THREE.Mesh(mergeGeometries(arr), treeMats[i]);
    mesh.renderOrder = 3;
    group.add(mesh);
  });

  // ---- 远景淡墨云雾（缓慢环绕漂移） ----
  const cloudTex = cloudTexture();
  const clouds = [];
  for (let i = 0; i < 9; i++) {
    const ang = rand() * Math.PI * 2, R = 1250 + rand() * 750, y = 90 + rand() * 170;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: cloudTex, transparent: true, opacity: 0.32 + rand() * 0.2, fog: false, depthWrite: false,
    }));
    s.scale.set(380 + rand() * 340, 110 + rand() * 90, 1);
    s.userData = { ang, R, y };
    clouds.push(s);
    group.add(s);
  }

  // ---- 飞鸟绕塔（5 只，扇翅） ----
  const birdMat = new THREE.MeshBasicMaterial({ color: 0x3a352b, side: THREE.DoubleSide });
  const wingGeo = (dir) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(
      [0, 0, 0.55, 0, 0, -0.55, dir * 2.3, 0, 0.2], 3));
    g.computeVertexNormals();
    return g;
  };
  const birds = [];
  for (let i = 0; i < 5; i++) {
    const g = new THREE.Group();
    const L = new THREE.Mesh(wingGeo(-1), birdMat);
    const R = new THREE.Mesh(wingGeo(1), birdMat);
    g.add(L, R);
    group.add(g);
    const b = { g, L, R, phase: rand() * 6.28, spd: 0.32 + rand() * 0.22, radius: 45 + rand() * 48, h: 56 + rand() * 24 };
    // 初始即落位塔边（不依赖首帧 update，防后台节流时闪现在原点）
    const a0 = b.phase;
    b.g.position.set(tower.x + Math.cos(a0) * b.radius, b.h, tower.z + Math.sin(a0) * b.radius);
    birds.push(b);
  }

  // ---- 竖排标题 + 朱印 ----
  const title = new THREE.Sprite(new THREE.SpriteMaterial({
    map: titleTexture(), transparent: true, fog: false, depthWrite: false,
  }));
  title.scale.set(58, 174, 1);
  title.position.set(742, 96, -408);
  group.add(title);

  // ---- 每帧动画：云漂移 + 鸟绕塔扇翅 ----
  const update = (t) => {
    for (const c of clouds) {
      const a = c.userData.ang + t * 0.0045;
      c.position.set(CENTER.x + Math.cos(a) * c.userData.R, c.userData.y, CENTER.z + Math.sin(a) * c.userData.R);
    }
    for (const b of birds) {
      const a = t * b.spd + b.phase;
      const x = tower.x + Math.cos(a) * b.radius;
      const z = tower.z + Math.sin(a) * b.radius;
      const y = b.h + Math.sin(t * 0.8 + b.phase) * 4;
      b.g.position.set(x, y, z);
      const a2 = a + 0.06;
      b.g.lookAt(tower.x + Math.cos(a2) * b.radius, y, tower.z + Math.sin(a2) * b.radius);
      const flap = Math.sin(t * 9 + b.phase) * 0.7;
      b.L.rotation.z = flap;
      b.R.rotation.z = -flap;
    }
  };

  return { group, update, treeMats, title, clouds };
}

// 程序化潮汕民居生成器（M4）
// 三种原型：下山虎（U形+前埕）、四点金（四角房+主座）、小屋（单体）
// 布局：网格抖动撒点 + 沿街概率加成 + 中心密周边疏 + 净距检查（防穿模）
// 性能：所有墙/屋顶分别合并成两份几何体（各一次 draw call）；
//       描边用 UV 边缘墨线 + fBm 笔触抖动（等效 EdgesGeometry，可整体合并且更快）
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const NOISE_GLSL = /* glsl */ `
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p){
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * vnoise(p); p *= 2.03; a *= 0.5; }
    return v;
  }
`;

// 白墙/屋面通用：UV 边缘墨线描边（每面 UV 0..1，靠近边界即墨线+晕）
// 导出供地标模块复用
export function makeBuildingMaterial(wallColor, inkColor, lineStrength) {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uWall: { value: new THREE.Color(wallColor) },
      uInk: { value: new THREE.Color(inkColor) },
      uLineK: { value: lineStrength },
      uReveal: { value: 1 }, // 晕染浮现阈值 0→1
    }]),
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vWorld;
      #include <fog_pars_vertex>
      void main() {
        vUv = uv;
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorld = worldPos.xyz;
        vec4 mvPosition = viewMatrix * worldPos;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uWall;
      uniform vec3 uInk;
      uniform float uLineK;
      uniform float uReveal;
      varying vec2 vUv;
      varying vec3 vWorld;
      #include <fog_pars_fragment>
      ${NOISE_GLSL}
      void main() {
        // 晕染浮现剪裁 + 湿墨边缘
        float rn = fbm(vWorld.xz * 0.012);
        if (rn > uReveal) discard;
        float wet = 1.0 - smoothstep(uReveal - 0.10, uReveal, rn);

        // 到面边界的距离（Box/屋面每面 UV 0..1）
        float e = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
        // fBm 笔触抖动：让墨线粗细沿边界自然变化
        float jit = (fbm(vec2((vWorld.x + vWorld.z) * 0.02, vUv.x * 3.0 + vUv.y * 5.0)) - 0.5) * 0.05;
        float line = 1.0 - smoothstep(0.015 + jit, 0.055 + jit, e);
        float halo = 1.0 - smoothstep(0.04 + jit, 0.20 + jit, e);
        vec3 col = uWall;
        col *= 0.94 + 0.06 * vUv.y;                     // 微弱上下渐变，避免死白
        col += (fbm(vec2(vWorld.x * 0.05, vWorld.z * 0.05)) - 0.5) * 0.04; // 纸面污渍感
        col = mix(col, uInk, halo * 0.15 * uLineK);
        col = mix(col, uInk, line * uLineK);
        // 浮现边缘的湿墨
        col = mix(col, uInk, wet * 0.35);
        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
      }
    `,
    fog: true,
    side: THREE.DoubleSide,
  });
}

// ---- 可复现随机数 ----
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- 原型定义（局部坐标：x 东，z 南；单位米） ----
// 返回 { boxes:[{x,z,w,d,h}], roofs:[{x,z,w,d,h,hr,axis}] }
function prototypeXiashanhu() {
  // 下山虎：主座在后，两厢夹护，前为埕（天井暗示），前墙矮
  return {
    boxes: [
      { x: 0, z: -3.2, w: 10, d: 5, h: 4 },
      { x: -6.3, z: -2.8, w: 3, d: 6, h: 3 },
      { x: 6.3, z: -2.8, w: 3, d: 6, h: 3 },
      { x: 0, z: 3.2, w: 14, d: 0.8, h: 2 },
    ],
    roofs: [
      { x: 0, z: -3.2, w: 10.6, d: 5.6, h: 4, hr: 1.3, axis: 'x' },
      { x: -6.3, z: -2.8, w: 3.4, d: 6.4, h: 3, hr: 0.8, axis: 'z' },
      { x: 6.3, z: -2.8, w: 3.4, d: 6.4, h: 3, hr: 0.8, axis: 'z' },
    ],
  };
}
function prototypeSidianjin() {
  // 四点金：主座 + 四角房 + 前墙，口字形围合
  return {
    boxes: [
      { x: 0, z: -3.2, w: 10, d: 5, h: 4 },
      { x: -6.3, z: -2.8, w: 3, d: 6, h: 3 },
      { x: 6.3, z: -2.8, w: 3, d: 6, h: 3 },
      { x: -6.3, z: 2.6, w: 3, d: 3.4, h: 3 },
      { x: 6.3, z: 2.6, w: 3, d: 3.4, h: 3 },
      { x: 0, z: 3.4, w: 9.4, d: 0.8, h: 2 },
    ],
    roofs: [
      { x: 0, z: -3.2, w: 10.6, d: 5.6, h: 4, hr: 1.3, axis: 'x' },
      { x: -6.3, z: -2.8, w: 3.4, d: 6.4, h: 3, hr: 0.8, axis: 'z' },
      { x: 6.3, z: -2.8, w: 3.4, d: 6.4, h: 3, hr: 0.8, axis: 'z' },
      { x: -6.3, z: 2.6, w: 3.4, d: 3.8, h: 3, hr: 0.7, axis: 'z' },
      { x: 6.3, z: 2.6, w: 3.4, d: 3.8, h: 3, hr: 0.7, axis: 'z' },
    ],
  };
}
function prototypeXiaowu() {
  // 小屋：单体 + 屋顶（随机朝向的长边）
  const along = Math.random() < 0.5;
  return {
    boxes: [{ x: 0, z: 0, w: along ? 9 : 6, d: along ? 6 : 9, h: 3 + Math.random() * 1.2 }],
    roofs: [{
      x: 0, z: 0,
      w: along ? 9.6 : 6.5, d: along ? 6.5 : 9.6,
      h: 3 + Math.random() * 1.2, hr: 1.0, axis: along ? 'x' : 'z',
    }],
  };
}

// ---- 屋顶几何（双坡缓坡 + 出檐，非索引三角形） ----
function pushRoof(arrs, cx, cz, w, d, h, hr, axis) {
  const o = 0.45;
  const w2 = w / 2, d2 = d / 2;
  const quad = (a, b, c, dd) => {
    arrs.pos.push(...a, ...b, ...c, ...a, ...c, ...dd);
    arrs.uv.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
  };
  if (axis === 'x') {
    // 正脊沿 x；南北两坡 + 东西山墙三角
    quad(
      [cx - w2 - o, h, cz - d2 - o], [cx + w2 + o, h, cz - d2 - o],
      [cx + w2, h + hr, cz], [cx - w2, h + hr, cz]);
    quad(
      [cx - w2 - o, h, cz + d2 + o], [cx + w2 + o, h, cz + d2 + o],
      [cx + w2, h + hr, cz], [cx - w2, h + hr, cz]);
    // 山墙
    const tri = (a, b, c) => { arrs.pos.push(...a, ...b, ...c); arrs.uv.push(0, 0, 1, 0, 0.5, 1); };
    tri([cx - w2 - o, h, cz - d2 - o], [cx - w2 - o, h, cz + d2 + o], [cx - w2, h + hr, cz]);
    tri([cx + w2 + o, h, cz - d2 - o], [cx + w2 + o, h, cz + d2 + o], [cx + w2, h + hr, cz]);
  } else {
    // 正脊沿 z
    quad(
      [cx - w2 - o, h, cz + d2 + o], [cx - w2 - o, h, cz - d2 - o],
      [cx, h + hr, cz - d2], [cx, h + hr, cz + d2]);
    quad(
      [cx + w2 + o, h, cz + d2 + o], [cx + w2 + o, h, cz - d2 - o],
      [cx, h + hr, cz - d2], [cx, h + hr, cz + d2]);
    const tri = (a, b, c) => { arrs.pos.push(...a, ...b, ...c); arrs.uv.push(0, 0, 1, 0, 0.5, 1); };
    tri([cx - w2 - o, h, cz - d2 - o], [cx + w2 + o, h, cz - d2 - o], [cx, h + hr, cz - d2]);
    tri([cx - w2 - o, h, cz + d2 + o], [cx + w2 + o, h, cz + d2 + o], [cx, h + hr, cz + d2]);
  }
}

// ---- 布局：撒点 + 净距 ----
const ptOf = (p) => (Array.isArray(p) ? { x: p[0], z: p[1] } : p);

// 返回 (x,z) 到所有线段的"净空"= 距离 - 道路半宽（负数即在道路内）
function distToSegments(x, z, segs) {
  let best = Infinity;
  for (const s of segs) {
    const dx = s.x2 - s.x1, dz = s.z2 - s.z1;
    const len2 = dx * dx + dz * dz;
    let t = len2 > 0 ? ((x - s.x1) * dx + (z - s.z1) * dz) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const px = s.x1 + dx * t, pz = s.z1 + dz * t;
    const d = Math.hypot(x - px, z - pz);
    const clear = d - s.hw;
    if (clear < best) best = clear;
  }
  return best;
}

export function buildBuildings(streets, waterData, exclusions = []) {
  const rand = mulberry32(20261);
  const CENTER = { x: 320, z: -40 }; // 老城中心

  // 地标预留区：建筑不得侵入
  const inExclusion = (x, z) => {
    for (const L of exclusions) {
      if (Math.hypot(x - L.x, z - L.z) < L.r) return true;
    }
    return false;
  };

  // 障碍线段：道路中心线（含环城路，按道路等级带半宽）、水系中心线
  const segs = [];
  const pushPoly = (pts, halfWidth) => {
    const P = pts.map(ptOf);
    for (let i = 0; i < P.length - 1; i++) {
      segs.push({ x1: P[i].x, z1: P[i].z, x2: P[i + 1].x, z2: P[i + 1].z, hw: halfWidth + 4 });
    }
  };
  for (const r of streets.roads) pushPoly(r.pts, r.width / 2);
  for (const r of waterData.rivers) pushPoly(r.points, r.width / 2);

  const ponds = waterData.ponds;

  // 候选格点撒点
  const units = [];
  const placed = []; // {x,z,r}
  const CELL = 24;
  const hash = new Map(); // 粗空间哈希
  const cellKey = (x, z) => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
  const nearby = (x, z, r) => {
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const arr = hash.get(cellKey(x + i * CELL, z + j * CELL));
        if (!arr) continue;
        for (const p of arr) if (Math.hypot(p.x - x, p.z - z) < p.r + r + 0.5) return true;
      }
    }
    return false;
  };
  const occupy = (x, z, r) => {
    placed.push({ x, z, r });
    const k = cellKey(x, z);
    if (!hash.has(k)) hash.set(k, []);
    hash.get(k).push({ x, z, r });
  };

  for (let gx = -1500; gx <= 1500; gx += 22) {
    for (let gz = -1700; gz <= 1400; gz += 22) {
      const x = gx + (rand() - 0.5) * 14;
      const z = gz + (rand() - 0.5) * 14;
      const r = Math.hypot(x - CENTER.x, z - CENTER.z);
      // 中心密周边疏
      const keep = r < 380 ? 0.92 : r < 650 ? 0.5 : r < 950 ? 0.18 : 0.05;
      if (rand() > keep) continue;
      // 沿街加成：靠近路网中心线的更容易保留
      const dRoad = distToSegments(x, z, segs);
      if (rand() > Math.min(1, keep * 1.25)) continue;
      // 净距：道路（含肩）之外才可建
      if (dRoad < 2.5) continue;
      let bad = false;
      for (const river of waterData.rivers) {
        const buf = river.width / 2 + 12;
        for (let i = 0; i < river.points.length - 1 && !bad; i++) {
          const a = river.points[i], b = river.points[i + 1];
          const dx = b.x - a.x, dz = b.z - a.z;
          const len2 = dx * dx + dz * dz || 1;
          let t = ((x - a.x) * dx + (z - a.z) * dz) / len2;
          t = Math.max(0, Math.min(1, t));
          if (Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t)) < buf) bad = true;
        }
        if (bad) break;
      }
      if (bad) continue;
      for (const p of ponds) if (Math.hypot(x - p.x, z - p.z) < p.r + 14) { bad = true; break; }
      if (bad) continue;
      if (inExclusion(x, z)) continue;
      // 原型：老城内多宅院，城外多小屋
      const type = r < 380 ? (rand() < 0.42 ? 'xsh' : rand() < 0.55 ? 'sdj' : 'xw') : 'xw';
      const proto = type === 'xsh' ? prototypeXiashanhu() : type === 'sdj' ? prototypeSidianjin() : prototypeXiaowu();
      const rot = (Math.floor(rand() * 4) * Math.PI) / 2 + (rand() - 0.5) * 0.12;
      const scale = 0.85 + rand() * 0.3;
      const radius = (type === 'xw' ? 5.2 : 8.5) * scale;
      if (nearby(x, z, radius)) continue;
      occupy(x, z, radius);
      units.push({ x, z, rot, scale, proto });
    }
  }

  // 沿街成排：主干道两侧面街而建（老城肌理的关键），每 24m 一户，两侧交错
  for (const road of streets.roads) {
    if (road.cls !== 'main' || road.closed) continue;
    const pts = road.pts.map(ptOf);
    let carry = 12;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const segLen = Math.hypot(b.x - a.x, b.z - a.z);
      const dirx = (b.x - a.x) / segLen, dirz = (b.z - a.z) / segLen;
      let s = carry;
      while (s < segLen) {
        const px = a.x + dirx * s, pz = a.z + dirz * s;
        s += 24 + rand() * 10;
        const rr = Math.hypot(px - CENTER.x, pz - CENTER.z);
        if (rr > 750) continue;
        const baseRot = Math.atan2(dirz, dirx);
        const side = rand() < 0.5 ? 1 : -1;
        const type0 = rand() < 0.55 ? 'xsh' : rand() < 0.6 ? 'sdj' : 'xw';
        const extent = (type0 === 'xw' ? 3.2 : 5) * (0.9 + rand() * 0.25);
        const off = side * (road.width / 2 + 4 + extent + 1.5 + rand() * 5);
        const bx = px - dirz * off, bz = pz + dirx * off;
        // 净距检查
        if (distToSegments(bx, bz, segs) < 1.5) continue;
        let bad = false;
        for (const river of waterData.rivers) {
          const buf = river.width / 2 + 10;
          for (let k = 0; k < river.points.length - 1 && !bad; k++) {
            const a2 = river.points[k], b2 = river.points[k + 1];
            const dx = b2.x - a2.x, dz = b2.z - a2.z;
            const len2 = dx * dx + dz * dz || 1;
            let t = ((bx - a2.x) * dx + (bz - a2.z) * dz) / len2;
            t = Math.max(0, Math.min(1, t));
            if (Math.hypot(bx - (a2.x + dx * t), bz - (a2.z + dz * t)) < buf) bad = true;
          }
          if (bad) break;
        }
        if (bad) continue;
        for (const p of ponds) if (Math.hypot(bx - p.x, bz - p.z) < p.r + 12) { bad = true; break; }
        if (bad) continue;
        if (inExclusion(bx, bz)) continue;
        const type = type0;
        const proto = type === 'xsh' ? prototypeXiashanhu() : type === 'sdj' ? prototypeSidianjin() : prototypeXiaowu();
        const rot = baseRot + (rand() < 0.5 ? 0 : Math.PI) + (rand() - 0.5) * 0.1;
        const scale = 0.9 + rand() * 0.25;
        const radius = (type === 'xw' ? 5.2 : 8.5) * scale;
        if (nearby(bx, bz, radius)) continue;
        occupy(bx, bz, radius);
        units.push({ x: bx, z: bz, rot, scale, proto });
      }
      carry = s - segLen;
    }
  }

  // ---- 几何合并：白墙一份、屋面一份 ----
  const wallGeos = [];
  const roofGeos = [];

  for (const u of units) {
    const s = Math.cos(u.rot), sn = Math.sin(u.rot);
    const place = (bx, bz) => ({
      x: u.x + bx * s - bz * sn,
      z: u.z + bx * sn + bz * s,
    });
    for (const b of u.proto.boxes) {
      const p = place(b.x, b.z);
      const g = new THREE.BoxGeometry(b.w * u.scale, b.h, b.d * u.scale).toNonIndexed();
      g.rotateY(u.rot);
      g.translate(p.x, b.h / 2, p.z);
      wallGeos.push(g);
    }
    const arrs = { pos: [], uv: [] };
    for (const rf of u.proto.roofs) {
      const p = place(rf.x, rf.z);
      // 屋顶随整体旋转：把轴与尺寸旋回去最简单——按 rot 旋转的矩形近似（旋转都是近直角）
      const w = rf.w * u.scale, d = rf.d * u.scale;
      pushRoof(arrs, 0, 0, w, d, rf.h, rf.hr, rf.axis);
      // 平移+旋转各顶点（局部顶点已含高度，只旋转 x/z 再平移）
      for (let i = 0; i < arrs.pos.length; i += 3) {
        const lx = arrs.pos[i], lz = arrs.pos[i + 2];
        arrs.pos[i] = p.x + lx * s - lz * sn;
        arrs.pos[i + 2] = p.z + lx * sn + lz * s;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(arrs.pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(arrs.uv, 2));
      g.computeVertexNormals();
      roofGeos.push(g);
      arrs.pos = []; arrs.uv = [];
    }
  }

  const wallMerged = mergeGeometries(wallGeos);
  const roofMerged = mergeGeometries(roofGeos);
  wallGeos.forEach((g) => g.dispose());
  roofGeos.forEach((g) => g.dispose());

  const wallMat = makeBuildingMaterial(0xf3efe4, 0x55503f, 1.0);
  const roofMat = makeBuildingMaterial(0xd8cfba, 0x55503f, 1.15);
  const walls = new THREE.Mesh(wallMerged, wallMat);
  const roofs = new THREE.Mesh(roofMerged, roofMat);
  walls.renderOrder = 2;
  roofs.renderOrder = 2;

  const group = new THREE.Group();
  group.add(walls, roofs);
  const materials = [wallMat, roofMat];
  return { group, materials, units: units.length };
}

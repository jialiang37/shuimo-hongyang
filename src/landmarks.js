// 地标六件套（M5）：德安里 / 普宁学宫 / 城隍庙 / 培风塔 / 老街牌坊 / 英歌广场
// 代码参数化建模；某一地标造型不满意时，可退化为"水墨画片立牌"（makePlateBillboard）
// 名牌：楷体 Canvas 贴图 + 朱红印章占位（书法字体素材到位后可替换）
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeBuildingMaterial } from './buildings.js';

// 地标位置与预留半径（x 东，z 南；建筑撒点会避开这些圆）
export const LANDMARKS = [
  { name: '德安里', x: 430, z: 80, r: 120 },
  { name: '普宁学宫', x: 140, z: -160, r: 75 },
  { name: '城隍庙', x: 390, z: -170, r: 58 },
  { name: '培风塔', x: 820, z: -700, r: 65 },
  { name: '老街牌坊', x: 321, z: 60, r: 24 },
  { name: '英歌广场', x: 540, z: -150, r: 50 },
];

const INK = 0x55503f;

// ---- 小工具：盒子（白墙材质，UV 边缘自动带墨线） ----
function box(list, x, y, z, w, h, d, rotY = 0) {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  if (rotY) g.rotateY(rotY);
  g.translate(x, y + h / 2, z);
  list.push(g);
}
function plane(list, x, y, z, w, d, color) {
  const g = new THREE.PlaneGeometry(w, d).toNonIndexed();
  g.rotateX(-Math.PI / 2);
  g.translate(x, y, z);
  list.push(g);
  return g;
}
// 双坡屋顶（与民居一致，缓坡 + 出檐）
function gableRoof(list, cx, cz, w, d, h, hr, axis = 'x') {
  const o = 0.5, w2 = w / 2, d2 = d / 2;
  const pos = [], uv = [];
  const quad = (a, b, c, dd) => {
    pos.push(...a, ...b, ...c, ...a, ...c, ...dd);
    uv.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
  };
  const tri = (a, b, c) => { pos.push(...a, ...b, ...c); uv.push(0, 0, 1, 0, 0.5, 1); };
  if (axis === 'x') {
    quad([cx - w2 - o, h, cz - d2 - o], [cx + w2 + o, h, cz - d2 - o], [cx + w2, h + hr, cz], [cx - w2, h + hr, cz]);
    quad([cx - w2 - o, h, cz + d2 + o], [cx + w2 + o, h, cz + d2 + o], [cx + w2, h + hr, cz], [cx - w2, h + hr, cz]);
    tri([cx - w2 - o, h, cz - d2 - o], [cx - w2 - o, h, cz + d2 + o], [cx - w2, h + hr, cz]);
    tri([cx + w2 + o, h, cz - d2 - o], [cx + w2 + o, h, cz + d2 + o], [cx + w2, h + hr, cz]);
  } else {
    quad([cx - w2 - o, h, cz + d2 + o], [cx - w2 - o, h, cz - d2 - o], [cx, h + hr, cz - d2], [cx, h + hr, cz + d2]);
    quad([cx + w2 + o, h, cz + d2 + o], [cx + w2 + o, h, cz - d2 - o], [cx, h + hr, cz - d2], [cx, h + hr, cz + d2]);
    tri([cx - w2 - o, h, cz - d2 - o], [cx + w2 + o, h, cz - d2 - o], [cx, h + hr, cz - d2]);
    tri([cx - w2 - o, h, cz + d2 + o], [cx + w2 + o, h, cz + d2 + o], [cx, h + hr, cz + d2]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  list.push(g);
}
// 庑殿顶（四坡，带正脊）：重檐由上下两座庑殿叠合
function hipRoof(list, cx, cz, w, d, h, hr, ridgeRatio = 0.25) {
  const o = 0.5, w2 = w / 2, d2 = d / 2, rx = w * ridgeRatio / 2;
  const pos = [], uv = [];
  const quad = (a, b, c, dd) => {
    pos.push(...a, ...b, ...c, ...a, ...c, ...dd);
    uv.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
  };
  const tri = (a, b, c) => { pos.push(...a, ...b, ...c); uv.push(0, 0, 1, 0, 0.5, 1); };
  quad([cx - w2, h, cz + d2], [cx + w2, h, cz + d2], [cx + rx, h + hr, cz], [cx - rx, h + hr, cz]);
  quad([cx - w2, h, cz - d2], [cx + w2, h, cz - d2], [cx + rx, h + hr, cz], [cx - rx, h + hr, cz]);
  tri([cx - w2, h, cz + d2], [cx - w2, h, cz - d2], [cx - rx, h + hr, cz]);
  tri([cx + w2, h, cz + d2], [cx + w2, h, cz - d2], [cx + rx, h + hr, cz]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  list.push(g);
}

// ---- 名牌（楷体 Canvas + 朱印；半透明小匾，避免遮挡建筑） ----
function makePlate(text, worldY) {
  const c = document.createElement('canvas');
  c.width = 320; c.height = 110;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(246,242,231,0.58)';
  ctx.fillRect(0, 0, 320, 110);
  ctx.strokeStyle = 'rgba(85,80,63,0.85)'; ctx.lineWidth = 7;
  ctx.strokeRect(8, 8, 304, 94);
  ctx.fillStyle = 'rgba(63,58,46,0.92)';
  ctx.font = 'bold 46px KaiTi, STKaiti, SimSun, serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 148, 57);
  ctx.fillStyle = '#a03a2a';
  ctx.fillRect(258, 58, 34, 34);
  ctx.fillStyle = '#f6f2e7';
  ctx.font = 'bold 20px KaiTi, serif';
  ctx.fillText('印', 275, 76);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.85, depthWrite: false }));
  spr.scale.set(19, 6.5, 1);
  spr.position.y = worldY;
  return spr;
}

// ---- 各地标 ----
function buildDeanli(walls, roofs) {
  // 德安里：三进府第 + 两侧从厝（占两个街区），主轴南北
  const cx = 430, cz = 80;
  for (const dz of [-38, 0, 38]) {
    box(walls, cx, 0, cz + dz, 56, 5.5, 13);
    gableRoof(roofs, cx, cz + dz, 57, 14, 5.5, 1.6, 'x');
  }
  // 两侧从厝长列
  for (const sx of [-38, 38]) {
    box(walls, cx + sx, 0, cz - 5, 12, 3.6, 70);
    gableRoof(roofs, cx + sx, cz - 5, 13, 71, 3.6, 0.9, 'z');
  }
  // 门楼
  box(walls, cx, 0, cz + 50, 20, 4, 4);
  gableRoof(roofs, cx, cz + 50, 22, 5, 4, 1.0, 'x');
}

function buildXuegong(walls, roofs) {
  // 普宁学宫：台基 + 重檐庑殿顶大成殿 + 两庑
  const cx = 140, cz = -160;
  // 台基两层
  box(walls, cx, 0, cz, 84, 1.4, 58);
  box(walls, cx, 1.4, cz, 74, 1.2, 50);
  const base = 2.6;
  // 大成殿：重檐庑殿
  box(walls, cx, base, cz, 30, 7, 16);
  hipRoof(roofs, cx, cz, 34, 20, base + 7, 1.6, 0.3);
  hipRoof(roofs, cx, cz, 24, 14, base + 10.2, 1.8, 0.3);
  // 两庑
  for (const sx of [-26, 26]) {
    box(walls, cx + sx, base, cz, 12, 3.4, 34);
    gableRoof(roofs, cx + sx, cz, 13, 35, 3.4, 0.8, 'z');
  }
  // 大成门
  box(walls, cx, base, cz + 24, 18, 4, 4);
  gableRoof(roofs, cx, cz + 24, 20, 5, 4, 1.0, 'x');
}

function buildChenghuang(walls, roofs, planes) {
  // 城隍庙：硬山正殿 + 门前广场
  const cx = 390, cz = -170;
  box(walls, cx, 0, cz, 30, 1.2, 20);
  box(walls, cx, 1.2, cz, 24, 6, 13);
  gableRoof(roofs, cx, cz, 25, 14, 7.2, 1.4, 'x');
  // 山门
  box(walls, cx, 0, cz + 15, 12, 3.6, 4);
  gableRoof(roofs, cx, cz + 15, 13.5, 5, 3.6, 0.9, 'x');
  // 门前广场（浅色铺地）
  const g = plane(planes, cx, 0.15, cz + 36, 42, 26);
  const mat = new THREE.MeshBasicMaterial({ color: 0xe9e2d0 });
  g.material = mat;
}

function buildPeifeng(walls, roofs) {
  // 培风塔：八角七层，逐层收分 + 塔刹
  const cx = 820, cz = -700;
  const tiers = 7;
  let y = 0;
  // 塔基
  const base = new THREE.CylinderGeometry(15, 16, 2, 8).toNonIndexed();
  base.translate(cx, 1, cz);
  walls.push(base);
  y = 2;
  for (let i = 0; i < tiers; i++) {
    const rad = 9.5 - i * 0.62;
    const th = 4.6;
    const tier = new THREE.CylinderGeometry(rad * 0.92, rad, th, 8).toNonIndexed();
    tier.translate(cx, y + th / 2, cz);
    walls.push(tier);
    // 檐（略宽的薄八边形）
    const eave = new THREE.CylinderGeometry(rad + 1.3, rad + 1.7, 0.7, 8).toNonIndexed();
    eave.translate(cx, y + th + 0.35, cz);
    roofs.push(eave);
    y += th + 0.7;
  }
  // 塔刹
  const spike = new THREE.ConeGeometry(1.1, 6, 8).toNonIndexed();
  spike.translate(cx, y + 3, cz);
  roofs.push(spike);
  const ball = new THREE.SphereGeometry(1.4, 10, 8).toNonIndexed();
  ball.translate(cx, y + 1.2, cz);
  roofs.push(ball);
}

function buildPaifang(walls, roofs) {
  // 老街牌坊：四柱三间，横枋 + 顶板小坡顶，骑在中山路上
  const cx = 321, cz = 60;
  for (const sx of [-6.5, -2.2, 2.2, 6.5]) box(walls, cx + sx, 0, cz, 0.9, sx === -6.5 || sx === 6.5 ? 7.2 : 5.8, 0.9);
  box(walls, cx, 7.2, cz, 15.5, 0.7, 1.4);
  box(walls, cx, 5.8, cz, 12.5, 0.5, 1.1);
  box(walls, cx, 7.9, cz, 16.5, 0.5, 2.6);
  gableRoof(roofs, cx, cz, 17, 3.2, 8.4, 0.8, 'x');
}

function buildYingge(group, walls, roofs) {
  // 英歌广场：圆形水墨铺地 + 中央戏台（台基四柱坡顶）+ 大鼓 + 三面"英"字旗 + 脸谱旗
  const cx = 540, cz = -150;

  // 圆形铺地：Canvas 画同心墨圈 + 中心"英歌"字
  const pc = document.createElement('canvas');
  pc.width = pc.height = 512;
  const px = pc.getContext('2d');
  px.fillStyle = '#e9e2d0';
  px.fillRect(0, 0, 512, 512);
  px.strokeStyle = 'rgba(85,80,63,0.55)';
  px.lineWidth = 10;
  px.beginPath(); px.arc(256, 256, 236, 0, Math.PI * 2); px.stroke();
  px.lineWidth = 4;
  px.beginPath(); px.arc(256, 256, 196, 0, Math.PI * 2); px.stroke();
  px.beginPath(); px.arc(256, 256, 120, 0, Math.PI * 2); px.stroke();
  px.fillStyle = 'rgba(85,80,63,0.75)';
  px.font = 'bold 92px KaiTi, STKaiti, SimSun, serif';
  px.textAlign = 'center'; px.textBaseline = 'middle';
  px.fillText('英歌', 256, 256);
  const ptex = new THREE.CanvasTexture(pc);
  ptex.colorSpace = THREE.SRGBColorSpace;
  const plaza = new THREE.Mesh(
    new THREE.CircleGeometry(30, 48).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: ptex })
  );
  plaza.position.set(cx, 0.18, cz);
  plaza.renderOrder = 1;
  group.add(plaza);

  // 中央戏台：台基 + 四柱 + 后墙 + 坡顶
  box(walls, cx, 0, cz, 14, 1.4, 10);
  for (const [sx, sz] of [[-6, -4], [6, -4], [-6, 4], [6, 4]]) {
    box(walls, cx + sx, 1.4, cz + sz, 0.55, 3, 0.55);
  }
  box(walls, cx, 1.4, cz - 4.4, 12.6, 2.6, 0.4); // 后墙
  gableRoof(roofs, cx, cz, 16.5, 12.5, 4.4, 1.5, 'x');

  // 台上大鼓（斜放，鼓面朝观众）
  const drum = new THREE.CylinderGeometry(1.15, 1.15, 1.5, 18).toNonIndexed();
  drum.rotateZ(Math.PI / 2 - 0.25);
  drum.translate(cx - 3.5, 3.1, cz + 1.5);
  roofs.push(drum);

  // 三面"英"字旗
  const flagTex = (() => {
    const c = document.createElement('canvas');
    c.width = 96; c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#f0ebdc';
    g.fillRect(0, 0, 96, 128);
    g.strokeStyle = 'rgba(85,80,63,0.8)'; g.lineWidth = 5;
    g.strokeRect(4, 4, 88, 120);
    g.fillStyle = '#8f2b22';
    g.font = 'bold 64px KaiTi, STKaiti, SimSun, serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('英', 48, 66);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  for (const ang of [Math.PI / 2, (Math.PI / 2) + (2 * Math.PI) / 3, (Math.PI / 2) + (4 * Math.PI) / 3]) {
    const px2 = cx + Math.cos(ang) * 22, pz2 = cz + Math.sin(ang) * 22;
    const pole = new THREE.CylinderGeometry(0.14, 0.18, 13, 8).toNonIndexed();
    pole.translate(px2, 6.5, pz2);
    walls.push(pole);
    const flag = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 4.6),
      new THREE.MeshBasicMaterial({ map: flagTex, side: THREE.DoubleSide })
    );
    flag.position.set(px2 + 1.8, 11.5, pz2);
    flag.rotation.y = -ang;
    group.add(flag);
  }

  // 脸谱画片：三款英歌脸谱（参考传统戏曲脸谱：满脸分色+黑眼窝+白鼻梁+对称云纹）
  // 配色：红脸 / 黑脸 / 绿脸
  const palettes = [
    { base: '#c0392b', panel: '#f3ecd8', patch: '#1a1a1a', swirl: '#f3ecd8', acc: '#e8c66a' },
    { base: '#2b2b2b', panel: '#f3ecd8', patch: '#000000', swirl: '#c94f3d', acc: '#c94f3d' },
    { base: '#3e7c4f', panel: '#f3ecd8', patch: '#1a1a1a', swirl: '#f3ecd8', acc: '#c0392b' },
  ];
  for (let v = 0; v < 3; v++) {
    const P = palettes[v];
    const c = document.createElement('canvas');
    c.width = 256; c.height = 320;
    const ctx = c.getContext('2d');

    // 脸型底色 + 勾边
    ctx.fillStyle = P.base;
    ctx.beginPath();
    ctx.ellipse(128, 168, 110, 142, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 8; ctx.strokeStyle = '#141210';
    ctx.stroke();

    const mirror = (fn) => { ctx.save(); fn(1); ctx.restore(); ctx.save(); fn(-1); ctx.restore(); };

    // 1) 眉心面板（白色长叶形，自额顶延伸到鼻梁）
    ctx.fillStyle = P.panel;
    ctx.beginPath();
    ctx.moveTo(128, 34);
    ctx.quadraticCurveTo(158, 80, 140, 170);
    ctx.quadraticCurveTo(128, 190, 116, 170);
    ctx.quadraticCurveTo(98, 80, 128, 34);
    ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = '#141210';
    ctx.stroke();
    // 面板上的额纹（红色小火焰）
    ctx.fillStyle = P.acc;
    ctx.beginPath();
    ctx.moveTo(128, 58);
    ctx.quadraticCurveTo(140, 78, 128, 96);
    ctx.quadraticCurveTo(116, 78, 128, 58);
    ctx.fill();

    // 2) 黑色眼窝（大块，上挑至眉弓、外扩到脸颊）
    mirror((s) => {
      ctx.fillStyle = P.patch;
      ctx.beginPath();
      ctx.moveTo(128, 130);
      ctx.quadraticCurveTo(128 + s * 88, 118, 128 + s * 96, 172);
      ctx.quadraticCurveTo(128 + s * 96, 204, 128 + s * 52, 200);
      ctx.quadraticCurveTo(128 + s * 26, 190, 128, 168);
      ctx.closePath(); ctx.fill();
    });

    // 3) 眼睛：白底 + 黑瞳（嵌在眼窝里）
    mirror((s) => {
      ctx.fillStyle = '#f3ecd8';
      ctx.beginPath(); ctx.ellipse(128 + s * 54, 172, 19, 11, s * 0.25, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#141210';
      ctx.beginPath(); ctx.arc(128 + s * 56, 173, 6.5, 0, Math.PI * 2); ctx.fill();
    });

    // 4) 眉：白色卷云粗眉（压在眼窝上缘）
    mirror((s) => {
      ctx.strokeStyle = P.panel; ctx.lineWidth = 9; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(128 + s * 34, 128);
      ctx.quadraticCurveTo(128 + s * 66, 106, 128 + s * 92, 130);
      ctx.stroke();
      ctx.strokeStyle = P.acc; ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(128 + s * 38, 134);
      ctx.quadraticCurveTo(128 + s * 64, 118, 128 + s * 86, 134);
      ctx.stroke();
    });

    // 5) 脸颊云纹旋涡（对称）
    mirror((s) => {
      ctx.strokeStyle = P.swirl; ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(128 + s * 34, 214);
      ctx.quadraticCurveTo(128 + s * 72, 220, 128 + s * 78, 246);
      ctx.quadraticCurveTo(128 + s * 74, 264, 128 + s * 52, 258);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(128 + s * 58, 248, 7, 0, Math.PI * 1.4);
      ctx.stroke();
    });

    // 6) 鼻翼 + 嘴：浓墨胡须曲线 + 朱唇
    mirror((s) => {
      ctx.fillStyle = '#141210';
      ctx.beginPath();
      ctx.moveTo(128 + s * 10, 216);
      ctx.quadraticCurveTo(128 + s * 44, 226, 128 + s * 52, 252);
      ctx.quadraticCurveTo(128 + s * 30, 244, 128 + s * 10, 232);
      ctx.closePath(); ctx.fill();
    });
    ctx.fillStyle = '#7e2f24';
    ctx.beginPath(); ctx.ellipse(128, 262, 22, 11, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#141210'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.ellipse(128, 262, 22, 11, 0, 0, Math.PI * 2); ctx.stroke();
    // 下巴须
    ctx.fillStyle = '#141210';
    ctx.beginPath();
    ctx.moveTo(106, 276);
    ctx.quadraticCurveTo(128, 300, 150, 276);
    ctx.quadraticCurveTo(128, 288, 106, 276);
    ctx.fill();

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    // 脸谱旗：立杆挂旗，围合戏台
    const ang = (2 * Math.PI * v) / 3 + 0.5;
    const fx = cx + Math.cos(ang) * 13, fz = cz + Math.sin(ang) * 10;
    const pole = new THREE.CylinderGeometry(0.12, 0.15, 9, 8).toNonIndexed();
    pole.translate(fx, 4.5, fz);
    walls.push(pole);
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(7.5, 9.5),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, transparent: true })
    );
    m.position.set(fx + Math.cos(ang) * 0.4, 9.6, fz + Math.sin(ang) * 0.4);
    m.rotation.y = ang + Math.PI / 2;
    group.add(m);
  }
}

// 名牌机位
const PLATES = [
  { name: '德安里', x: 430, z: 155, y: 14 },
  { name: '普宁学宫', x: 140, z: -108, y: 16 },
  { name: '城隍庙', x: 390, z: -128, y: 13 },
  { name: '培风塔', x: 820, z: -668, y: 30 },
  { name: '老街牌坊', x: 321, z: 84, y: 13 },
  { name: '英歌广场', x: 540, z: -116, y: 12 },
];

export function buildLandmarks() {
  const group = new THREE.Group();
  const materials = [];
  // 各地标独立材质实例（颜色略有区分），全部走 UV 墨线描边 shader
  const wallMat = makeBuildingMaterial(0xf3efe4, INK, 1.0);
  const roofMat = makeBuildingMaterial(0xd6cdb8, INK, 1.15);
  const auxMat = makeBuildingMaterial(0xe9e2d0, INK, 0.8);
  materials.push(wallMat, roofMat, auxMat);

  const walls = [], roofs = [], planes = [];
  buildDeanli(walls, roofs);
  buildXuegong(walls, roofs);
  buildChenghuang(walls, roofs, planes);
  buildPeifeng(walls, roofs);
  buildPaifang(walls, roofs);
  buildYingge(group, walls, roofs); // 戏台/鼓/旗并入墙顶几何

  const wallMesh = new THREE.Mesh(mergeGeometries(walls), wallMat);
  const roofMesh = new THREE.Mesh(mergeGeometries(roofs), roofMat);
  group.add(wallMesh, roofMesh);
  for (const g of planes) {
    // 广场铺地自带简单材质
    const mesh = new THREE.Mesh(g, g.material || auxMat);
    mesh.renderOrder = 1;
    group.add(mesh);
  }

  // 名牌
  for (const p of PLATES) {
    const spr = makePlate(p.name, p.y);
    spr.position.set(p.x, p.y, p.z);
    group.add(spr);
  }

  return { group, materials };
}

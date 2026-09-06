// 水墨洪阳 · M2 地与河
// 地面 = 平铺宣纸纹理的大平面；水系 = OSM 实测走向的榕江南河/城内河/护城河 + 水塘，
// 水面用自定义 shader（淡墨基色 + 流动微波纹 + 噪声抖动的浓墨岸线）。
// 宣纸底纹仍由页面 CSS 平铺提供，WebGL 画布透明叠加。
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildWater } from './water.js';
import { loadStreets, buildRoads } from './roads.js';

// ---- 渲染器（透明底） ----
const canvas = document.querySelector('#scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 0);

// ---- 场景与雾 ----
const scene = new THREE.Scene();
const PAPER_TONE = 0xf2eddf; // 宣纸纹理平均色（tools/generate-paper-texture.mjs 输出）
scene.fog = new THREE.FogExp2(PAPER_TONE, 0.0033); // 初始浓度≈贴地可视300m，主循环中按相机距离自适应

// ---- 相机与交互 ----
const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,

  4000
);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI / 2 - 0.02;
controls.minDistance = 10;
controls.maxDistance = 2500;

// 视角切换（调试/验收用）：?view=top 斜俯视看水系走向，默认平视沿城内河
function setView(name = 'ground') {
  if (name === 'top') {
    camera.position.set(450, 380, 700);
    controls.target.set(-300, 0, -400);
  } else {
    camera.position.set(-320, 36, -470);
    controls.target.set(-500, 0, -1080);
  }
  controls.update();
}
setView(new URLSearchParams(location.search).get('view') || 'ground');
window.__setView = setView; // 浏览器控制台可随时切换

// 支持 ?cam=x,y,z&tgt=x,y,z 直达任意机位（定点验收用），优先于 ?view=
{
  const p = new URLSearchParams(location.search);
  const cam = p.get('cam');
  const tgt = p.get('tgt');
  if (cam && tgt) {
    const c = cam.split(',').map(Number);
    const t = tgt.split(',').map(Number);
    camera.position.set(c[0], c[1], c[2]);
    controls.target.set(t[0], t[1], t[2]);
    controls.update();
  }
}

// ---- 地面：大平面浅色纸面（宣纸纹理平铺，远处被雾融进纸底） ----
const groundMat = new THREE.MeshBasicMaterial({ color: PAPER_TONE });
new THREE.TextureLoader().load('/assets/textures/T_Paper.png', (tex) => {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(500, 500); // 8000m / 16m 一格，保持与页面底纹相近的颗粒密度
  groundMat.map = tex;
  groundMat.needsUpdate = true;
});
const ground = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000), groundMat);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// ---- 水系：读取实测数据文件构建 ----
const waterMaterials = [];
fetch('/assets/data/hongyang-water.json')
  .then((r) => {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  })
  .then((data) => {
    const { group, materials } = buildWater(data);
    waterMaterials.push(...materials);
    scene.add(group);
  });

// ---- 街巷：优先手描 GeoJSON，否则写意格局（洪阳老城十字街） ----
const roadMaterials = [];
loadStreets().then((streets) => {
  const { group, materials } = buildRoads(streets);
  roadMaterials.push(...materials);
  scene.add(group);
});

// ---- 主循环 ----
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  // 雾浓度按"期望可视距离"自适应：FogExp2 在距离=V 处雾化因子恰为 e⁻¹，
  // 故 density = 1/V。贴地 V=300m（浓墨意境）；拉远时 V 随相机距离放大（中景清晰，仅远端入雾）
  const dist = camera.position.distanceTo(controls.target);
  scene.fog.density = 1 / Math.max(300, 2.2 * dist);
  const time = clock.getElapsedTime();
  for (const m of waterMaterials) m.uniforms.uTime.value = time;
  controls.update();
  renderer.render(scene, camera);
});

// ---- 窗口自适应 ----
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

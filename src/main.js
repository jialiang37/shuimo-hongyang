// 水墨洪阳 · M2 地与河
// 地面 = 平铺宣纸纹理的大平面；水系 = OSM 实测走向的榕江南河/城内河/护城河 + 水塘，
// 水面用自定义 shader（淡墨基色 + 流动微波纹 + 噪声抖动的浓墨岸线）。
// 宣纸底纹仍由页面 CSS 平铺提供，WebGL 画布透明叠加。
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildWater } from './water.js';
import { loadStreets, buildRoads } from './roads.js';
import { buildBuildings } from './buildings.js';
import { buildLandmarks, LANDMARKS } from './landmarks.js';
import { buildNature } from './nature.js?v=3';

// ---- 渲染器（透明底） ----
const canvas = document.querySelector('#scene');
// 移动端降级：粗指针/小屏视为手机或平板——关闭抗锯齿、限制像素比
const IS_MOBILE = window.matchMedia('(pointer: coarse)').matches || Math.min(window.innerWidth, window.innerHeight) < 500;
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: !IS_MOBILE,
  alpha: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, IS_MOBILE ? 1.5 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 0);
window.__renderer = renderer; // 验收期临时暴露

// ---- 场景与雾 ----
const scene = new THREE.Scene();
window.__scene = scene; // 验收期临时暴露
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
window.__camera = camera; // 验收期临时暴露
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI / 2 - 0.02;
controls.minDistance = 10;
controls.maxDistance = 2500;

// 视角切换：默认=老城正上空斜俯瞰（地标民居尽收眼底）；?view=top 看水系走向
function setView(name = 'ground') {
  if (name === 'top') {
    camera.position.set(450, 380, 700);
    controls.target.set(-300, 0, -400);
  } else {
    camera.position.set(60, 280, 560);
    controls.target.set(320, 0, -80);
  }
  controls.update();
}

// ---- M7 开场运镜：双样条（机位+注视点）从培风塔推入老城，落到十字街上空 ----
const INTRO_DUR = 17; // 秒
const camPath = new THREE.CatmullRomCurve3([
  new THREE.Vector3(1010, 95, -830),
  new THREE.Vector3(760, 70, -560),
  new THREE.Vector3(430, 55, -980),
  new THREE.Vector3(60, 45, -760),
  new THREE.Vector3(-380, 30, -430),
  new THREE.Vector3(-180, 40, -120),
  new THREE.Vector3(120, 90, 180),
  new THREE.Vector3(60, 280, 560),
]);
const tgtPath = new THREE.CatmullRomCurve3([
  new THREE.Vector3(820, 20, -700),
  new THREE.Vector3(430, 0, -880),
  new THREE.Vector3(60, 0, -700),
  new THREE.Vector3(-380, 0, -400),
  new THREE.Vector3(60, 0, -180),
  new THREE.Vector3(320, 0, -60),
  new THREE.Vector3(330, 0, -80),
  new THREE.Vector3(320, 0, -80),
]);
const intro = { active: false, t0: 0 };
function endIntro() {
  if (!intro.active) return;
  intro.active = false;
  controls.enabled = true;
  camera.position.set(60, 280, 560);
  controls.target.set(320, 0, -80);
  controls.update();
  // 运镜中断/结束时，所有浮现动画直接置为完成
  for (const rv of revealAnims) {
    if (rv.mode === 'u') rv.mat.uniforms.uReveal.value = 1;
    else rv.mat.opacity = 1;
  }
}

// 首次加载（URL 无 cam/view/nointro 参数）播放开场运镜
const urlParams = new URLSearchParams(location.search);
const playIntro = !urlParams.has('cam') && !urlParams.has('view') && !urlParams.has('nointro');
if (playIntro) {
  camera.position.copy(camPath.getPoint(0));
  controls.target.copy(tgtPath.getPoint(0));
  controls.enabled = false;
  camera.lookAt(controls.target);
  canvas.addEventListener('pointerdown', () => endIntro(), { once: true });
} else {
  setView(urlParams.get('view') || 'ground');
}
window.__setView = setView; // 浏览器控制台可随时切换

// 支持 ?cam=x,y,z&tgt=x,y,z 直达任意机位（定点验收用），优先级最高
{
  const cam = urlParams.get('cam');
  const tgt = urlParams.get('tgt');
  if (cam && tgt) {
    const c = cam.split(',').map(Number);
    const t = tgt.split(',').map(Number);
    camera.position.set(c[0], c[1], c[2]);
    controls.target.set(t[0], t[1], t[2]);
    controls.update();
  }
}

// ---- M7 晕染浮现注册表 ----
const revealAnims = []; // {mat, start, dur, mode}
function addReveal(mats, start, dur, mode = 'u') {
  for (const m of mats) {
    if (mode === 'u') m.uniforms.uReveal.value = 0;
    else m.opacity = 0;
    revealAnims.push({ mat: m, start, dur, mode });
  }
}

// ---- 地面：大平面浅色纸面（宣纸纹理平铺，远处被雾融进纸底） ----
const groundMat = new THREE.MeshBasicMaterial({ color: PAPER_TONE });
new THREE.TextureLoader().load('assets/textures/T_Paper.png', (tex) => {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(500, 500); // 8000m / 16m 一格，保持与页面底纹相近的颗粒密度
  groundMat.map = tex;
  groundMat.needsUpdate = true;
});
const ground = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000), groundMat);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// ---- 加载健壮性：失败可见 + 自动重试（避免偶发请求失败导致无声白屏） ----
function showLoadError(msg) {
  let d = document.getElementById('load-error');
  if (!d) {
    d = document.createElement('div');
    d.id = 'load-error';
    d.style.cssText =
      'position:fixed;top:12px;left:50%;transform:translateX(-50%);background:#7e2f24;color:#f6f2e7;padding:8px 18px;font:14px KaiTi,serif;letter-spacing:.12em;z-index:10;border-radius:4px;';
    document.body.appendChild(d);
  }
  d.textContent = '加载失败：' + msg + ' · 正在自动重试，若反复出现请刷新页面';
}
function loadJSON(url, tries = 3) {
  return new Promise((resolve, reject) => {
    const attempt = (k) => {
      fetch(url)
        .then((r) => {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        })
        .then(resolve)
        .catch((e) => {
          if (k < tries) setTimeout(() => attempt(k + 1), 600 * k);
          else {
            showLoadError(url.split('/').pop() + ' 加载失败');
            reject(e);
          }
        });
    };
    attempt(1);
  });
}

// ---- 水系：读取实测数据文件构建 ----
const waterMaterials = [];
const waterLoad = loadJSON('assets/data/hongyang-water.json');
waterLoad
  .then((data) => {
    const { group, materials } = buildWater(data);
    waterMaterials.push(...materials);
    scene.add(group);
  })
  .catch((e) => showLoadError('水系构建失败：' + (e.message || e)));

// ---- 街巷：优先手描 GeoJSON，否则写意格局（洪阳老城十字街） ----
// ---- 建筑：沿街排布的潮汕民居群（依赖街巷与水系数据做净距检查） ----
const roadMaterials = [];
const buildingMaterials = [];
const natureUpdates = []; // 草木点睛的每帧动画（云漂移/鸟扇翅）
loadStreets()
  .then((streets) => {
    const { group, materials } = buildRoads(streets);
    roadMaterials.push(...materials);
    scene.add(group);

    return waterLoad.then((waterData) => {
      const { group: bg, materials: bm, units } = buildBuildings(streets, waterData, LANDMARKS);
      buildingMaterials.push(...bm);
      scene.add(bg);
      window.__build = { units };

      // ---- 地标六件套 ----
      const lm = buildLandmarks();
      scene.add(lm.group);

      // ---- 草木与点睛：树 / 飞鸟 / 云雾 / 标题 ----
      const nature = buildNature(streets, waterData, LANDMARKS, { mobile: IS_MOBILE });
      scene.add(nature.group);
      natureUpdates.push(nature.update);

      // ---- M7: 注册分批浮现时间表并启动开场运镜 ----
      const t0 = clock.getElapsedTime() + 0.2;
      addReveal(roadMaterials, t0 + 0.8, 2.4, 'u');
      addReveal(waterMaterials, t0 + 1.8, 3.0, 'u');
      addReveal(buildingMaterials, t0 + 3.2, 4.5, 'u');
      addReveal(lm.materials, t0 + 5.0, 3.0, 'u');
      addReveal(nature.treeMats, t0 + 6.0, 3.5, 'opacity');
      addReveal(nature.clouds.map((s) => s.material), t0 + 11.0, 2.5, 'opacity');
      addReveal([nature.title.material], t0 + 13.0, 2.0, 'opacity');
      addReveal(lm.plates.map((s) => s.material), t0 + 13.5, 2.0, 'opacity');
      intro.active = true;
      intro.t0 = t0;
    }).catch((e) => {
      window.__chainErr = String(e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e);
      showLoadError('建筑/地标构建失败，请刷新重试');
      console.error(e);
    });
  })
  .catch((e) => {
    console.error('街巷/建筑构建失败:', e);
  });

// ---- 主循环 ----
const clock = new THREE.Clock();
let loopErrCount = 0;
let lastTime = 0;
renderer.setAnimationLoop(() => {
  try {
    // 雾浓度按"期望可视距离"自适应：FogExp2 在距离=V 处雾化因子恰为 e⁻¹，
    // 故 density = 1/V。贴地 V=300m（浓墨意境）；拉远时 V 随相机距离放大（中景清晰，仅远端入雾）
    const dist = camera.position.distanceTo(controls.target);
    scene.fog.density = 1 / Math.max(300, 2.2 * dist);
    const time = clock.getElapsedTime();
    for (const m of waterMaterials) m.uniforms.uTime.value = time;
    for (const u of natureUpdates) u(time);
    // M7 开场运镜：样条插值机位与注视点，平滑缓动
    if (intro.active) {
      const u = Math.min(Math.max((time - intro.t0) / INTRO_DUR, 0), 1);
      const e = u * u * (3 - 2 * u);
      camPath.getPoint(e, camera.position);
      tgtPath.getPoint(e, controls.target);
      camera.lookAt(controls.target);
      if (u >= 1) endIntro();
    }
    // 分批浮现：按 (time-start)/dur 推进各材质的 uReveal / 透明度
    for (const rv of revealAnims) {
      const k = THREE.MathUtils.clamp((time - rv.start) / rv.dur, 0, 1);
      const v = k * k * (3 - 2 * k);
      if (rv.mode === 'u') rv.mat.uniforms.uReveal.value = v;
      else rv.mat.opacity = v;
    }
    controls.update();
    renderer.render(scene, camera);
  } catch (e) {
    // 单帧异常不让动画循环静默死亡：记录并继续下一帧
    loopErrCount++;
    window.__loopErr = { n: loopErrCount, msg: String(e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e) };
    if (loopErrCount <= 3) console.error('渲染循环异常:', e);
  }
});

// ---- 窗口自适应 ----
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

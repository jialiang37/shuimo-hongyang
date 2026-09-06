// 水墨洪阳 · M1 宣纸与雾
// 宣纸底纹由页面 CSS 提供（T_Paper.png 平铺），WebGL 画布保持透明；
// FogExp2 指数雾负责"墨分五色"：越远的物体越淡，最终融进纸色。
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ---- 渲染器（透明底） ----
const canvas = document.querySelector('#scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 0);

// ---- 场景与雾 ----
const scene = new THREE.Scene();
// 雾色 = 宣纸纹理的平均色（tools/generate-paper-texture.mjs 输出），二者一致才能"淡入纸底"
const PAPER_TONE = 0xf2eddf;
scene.fog = new THREE.FogExp2(PAPER_TONE, 0.004);

// ---- 相机 ----
const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  2000
);
camera.position.set(28, 20, 95);

// ---- 鼠标/触摸交互 ----
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 3, -60); // 视线投向场景纵深，好同时看到近/远白盒
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI / 2 - 0.02;
controls.minDistance = 10;
controls.maxDistance = 500;

// ---- M1 测试白盒：验证"墨分五色" ----
// 近盒清晰、远盒被雾吃得只剩淡淡影子——这正是水墨的浓淡层次
function whiteBox(x, y, z, size) {
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(size, size, size),
    new THREE.MeshBasicMaterial({ color: 0xfdfaf2 })
  );
  box.position.set(x, y, z);
  scene.add(box);
  return box;
}
whiteBox(0, 4, -10, 10); // 近景：清晰浓墨
whiteBox(0, 8, -260, 16); // 远景：只剩淡淡影子

// ---- 地面参考网格（浅色，远处同样会被雾淡出） ----
const grid = new THREE.GridHelper(400, 80, 0xcfc5ac, 0xdfd7c2);
grid.position.set(0, 0, -60);
scene.add(grid);

// ---- 主循环 ----
renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});

// ---- 窗口自适应 ----
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

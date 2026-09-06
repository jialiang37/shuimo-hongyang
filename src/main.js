// 水墨洪阳 · M0 项目骨架
// 当前只有一个占位场景（纸色背景 + 线框方块 + 地面网格），
// 用于验证渲染与鼠标交互，后续里程碑逐步替换成水墨场景。
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ---- 渲染器 ----
const canvas = document.querySelector('#scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

// ---- 场景 ----
const scene = new THREE.Scene();
// 宣纸色（M1 里程碑将换成真实的宣纸纹理 + 指数雾）
scene.background = new THREE.Color(0xf5f1e6);

// ---- 相机 ----
const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  2000
);
camera.position.set(60, 45, 60);

// ---- 鼠标/触摸交互 ----
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; // 阻尼，让拖动手感柔滑
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI / 2 - 0.02; // 不允许钻到地面以下
controls.minDistance = 10;
controls.maxDistance = 500;

// ---- M0 占位物：让"拖动"看得见 ----
const cube = new THREE.Mesh(
  new THREE.BoxGeometry(8, 8, 8),
  new THREE.MeshBasicMaterial({ color: 0x4a4436, wireframe: true })
);
scene.add(cube);

const grid = new THREE.GridHelper(200, 40, 0xb9ae97, 0xd8d0be);
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

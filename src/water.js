// 水墨水系：河道条带 / 池塘圆面 + 自定义水面着色器
// 效果构成：淡墨→浓墨的沿程墨韵、时间流动的微波纹、噪声抖动的浓墨岸线（笔触感）
import * as THREE from 'three';

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

export function makeWaterMaterial() {
  return new THREE.ShaderMaterial({
    // fog:true 时 three 会在渲染中刷新 fogColor/fogDensity 等 uniforms，
    // 必须把 UniformsLib.fog 合并进来，否则每帧渲染到这里直接抛异常
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 },
      uMode: { value: 0 }, // 0=河道条带(uv.y为米) 1=池塘(uv为径向)
      uInkShallow: { value: new THREE.Color(0xc9c0ab) }, // 淡墨水面
      uInkDeep: { value: new THREE.Color(0x948a74) }, // 浓墨段
      uInkLine: { value: new THREE.Color(0x55503f) }, // 岸线墨线
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
      uniform float uTime;
      uniform float uMode;
      uniform vec3 uInkShallow;
      uniform vec3 uInkDeep;
      uniform vec3 uInkLine;
      varying vec2 vUv;
      varying vec3 vWorld;
      #include <fog_pars_fragment>
      ${NOISE_GLSL}
      void main() {
        // 沿程坐标：河道用 uv.y（米），池塘用世界坐标
        float along = mix(vUv.y, (vWorld.x + vWorld.z) * 0.7, uMode);
        float across = vUv.x;

        // 墨韵：淡墨与浓墨段沿河变化 + 横向梯度（岸边淡、河心浓，如水墨晕染）
        float tone = fbm(vec2(along * 0.006, across * 1.5));
        float acrossBand = sin(across * 3.14159);
        vec3 col = mix(uInkShallow, uInkDeep, smoothstep(0.25, 0.75, tone) * (0.3 + 0.7 * acrossBand));

        // 微波纹（缓慢流动）
        float rip = fbm(vec2(along * 0.025 - uTime * 0.55, across * 7.0 + uTime * 0.06));
        col += (rip - 0.5) * 0.10;

        // 浓墨岸线：河道在 uv.x≈0/1，池塘在径向≈1；噪声抖动线宽形成笔触
        float e = mix(min(across, 1.0 - across), 1.0 - length(vUv - 0.5) * 2.0, uMode);
        float jit = (fbm(vec2(along * 0.02, 7.7)) - 0.5) * 0.10;
        float line = 1.0 - smoothstep(0.018 + jit * 0.5, 0.08 + jit, e);
        col = mix(col, uInkLine, line * 0.85);

        // 大块浓淡晕染
        col *= 0.90 + 0.20 * fbm(vec2(along * 0.0025, 3.3));

        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
      }
    `,
    fog: true,
    side: THREE.DoubleSide, // 水面从上往下看，避免三角形环绕方向导致背面剔除
  });
}

// 沿中心线把宽度 width 的条带铺成网格；uv.x=横跨(0~1)，uv.y=沿程累计米数
// y 抬高到 4m：远离地面（y=0）以避开远距离深度缓冲精度导致的 Z 冲突
export function ribbonGeometry(points, width, y = 4, closed = false) {
  // 去除相邻过近点：零长度段会让 CatmullRom 切线翻转，条带会捏出"裂口"
  // 点格式兼容 {x,z} 对象（水系数据）与 [x,z] 数组（街巷数据）
  const pts = [];
  for (const p of points) {
    const v = Array.isArray(p) ? new THREE.Vector3(p[0], y, p[1]) : new THREE.Vector3(p.x, y, p.z);
    const last = pts[pts.length - 1];
    if (!last || last.distanceTo(v) > 0.5) pts.push(v);
  }
  // 闭合水系：首尾重合时去掉尾点，改用闭合曲线，保证接缝天衣无缝
  if (closed && pts.length > 2 && pts[0].distanceTo(pts[pts.length - 1]) < 1) {
    pts.pop();
  }
  const curve = new THREE.CatmullRomCurve3(pts, closed, 'catmullrom', 0.5);
  const SEGS = 400;
  const positions = [];
  const uvs = [];
  const indices = [];
  const up = new THREE.Vector3(0, 1, 0);
  const side = new THREE.Vector3();
  let acc = 0;
  let prev = curve.getPointAt(0);
  for (let i = 0; i <= SEGS; i++) {
    const t = i / SEGS;
    const P = curve.getPointAt(t);
    const T = curve.getTangentAt(t);
    side.crossVectors(up, T).normalize();
    const half = width / 2;
    positions.push(P.x - side.x * half, y, P.z - side.z * half);
    positions.push(P.x + side.x * half, y, P.z + side.z * half);
    if (i > 0) acc += P.distanceTo(prev);
    prev = P.clone();
    uvs.push(0, acc, 1, acc);
    if (i < SEGS) {
      const a = i * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  return g;
}

// 从 hongyang-water.json 构建整片水系（河道 + 护城河 + 池塘）
export function buildWater(data) {
  const group = new THREE.Group();
  const materials = [];
  for (const r of data.rivers) {
    const mat = makeWaterMaterial();
    materials.push(mat);
    const mesh = new THREE.Mesh(ribbonGeometry(r.points, r.width, 4, r.closed === true), mat);
    mesh.renderOrder = 1;
    group.add(mesh);
  }
  for (const p of data.ponds) {
    const mat = makeWaterMaterial();
    mat.uniforms.uMode.value = 1;
    materials.push(mat);
    const geo = new THREE.CircleGeometry(p.r, 56);
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(p.x, 3.5, p.z);
    mesh.renderOrder = 1;
    group.add(mesh);
  }
  return { group, materials };
}

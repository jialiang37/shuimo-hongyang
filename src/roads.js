// 水墨街巷：两级路网（主干道/老街巷）+ 环城路 + 四门桥
// 数据优先读 public/assets/data/hongyang.geojson（手描路网），
// 不存在时使用内置写意格局（参考洪阳老城十字街：一横一纵穿城，街巷在城内有机生长）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ribbonGeometry } from './water.js';

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

// 道路材质：淡墨路身 + 沿路浓淡变化 + 墨线晕边（宽晕 + 细线两层）
export function makeRoadMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uRoad: { value: new THREE.Color(0xded6c2) }, // 路身（略深于宣纸地面）
      uRoadDeep: { value: new THREE.Color(0xccc2a8) }, // 路身浓墨段
      uInkLine: { value: new THREE.Color(0x5f5947) }, // 边缘墨线
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
      uniform vec3 uRoad;
      uniform vec3 uRoadDeep;
      uniform vec3 uInkLine;
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

        float along = vUv.y;
        float across = vUv.x;

        // 路身：沿路淡淡的浓淡变化
        float tone = fbm(vec2(along * 0.006, across * 1.5));
        vec3 col = mix(uRoad, uRoadDeep, smoothstep(0.3, 0.7, tone) * 0.7);

        // 边缘墨线 + 晕开：噪声抖动的细线外有一圈渐淡的墨晕
        float e = min(across, 1.0 - across);
        float jit = (fbm(vec2(along * 0.02, 7.7)) - 0.5) * 0.10;
        float halo = 1.0 - smoothstep(0.05 + jit, 0.30 + jit, e);
        col = mix(col, uInkLine, halo * 0.16);
        float line = 1.0 - smoothstep(0.025 + jit * 0.5, 0.10 + jit, e);
        col = mix(col, uInkLine, line * 0.65);

        // 浮现边缘的湿墨
        col = mix(col, uInkLine, wet * 0.4);

        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
      }
    `,
    fog: true,
    side: THREE.DoubleSide,
  });
}

// ---- 写意路网（洪阳老城格局：护城河环内十字街，城外乡道放射） ----
// 坐标体系与水系一致：x=东，z=南；护城河环中心(320,-40)，老城十字街穿四门
function roundedRectPoints(cx, cz, hw, hh, r) {
  const pts = [];
  const N = 10;
  const edge = (x0, z0, x1, z1) => {
    for (let i = 0; i <= N; i++) pts.push({ x: cx + x0 + (x1 - x0) * (i / N), z: cz + z0 + (z1 - z0) * (i / N) });
  };
  const arc = (ax, az, a0, a1) => {
    for (let i = 0; i <= 6; i++) {
      const a = a0 + ((a1 - a0) * i) / 6;
      pts.push({ x: cx + ax + r * Math.cos(a), z: cz + az + r * Math.sin(a) });
    }
  };
  arc(hw - r, hh - r, 0, Math.PI / 2);
  edge(hw - r, hh, -hw + r, hh);
  arc(-hw + r, hh - r, Math.PI / 2, Math.PI);
  edge(-hw, hh - r, -hw, -hh + r);
  arc(-hw + r, -hh + r, Math.PI, (3 * Math.PI) / 2);
  edge(-hw + r, -hh, hw - r, -hh);
  arc(hw - r, -hh + r, (3 * Math.PI) / 2, 2 * Math.PI);
  edge(hw, -hh + r, hw, hh - r);
  return pts;
}

function defaultStreets() {
  const L = 8; // 老街巷宽度
  return {
    roads: [
      // 主干道：中山路（南北）与大街（东西），在护城河四门处断开，由石桥跨接
      // （路段末端延长至桥下，接缝藏在桥体与道路的重叠里）
      { name: '中山路·南', cls: 'main', width: 16, pts: [[300, 860], [295, 540], [318, 240], [319, 195]] },
      { name: '中山路·城内', cls: 'main', width: 16, pts: [[320, 180], [321, -30], [318, -265]] },
      { name: '中山路·北', cls: 'main', width: 16, pts: [[330, -320], [345, -600], [352, -880], [400, -1150]] },
      { name: '大街·西', cls: 'main', width: 16, pts: [[-140, -160], [-40, -125], [10, -106]] },
      { name: '大街·城内', cls: 'main', width: 16, pts: [[30, -104], [320, -60], [610, -26]] },
      { name: '大街·东', cls: 'main', width: 16, pts: [[630, -24], [860, -5]] },
      // 环城路：贴护城河外的环
      { name: '环城路', cls: 'main', width: 12, closed: true, pts: roundedRectPoints(320, -40, 345, 285, 140) },
      // 乡道
      { name: '西南村道', cls: 'main', width: 12, pts: [[-260, -520], [-120, -380], [-30, -225]] },
      // 老街巷：城内有机生长，避免规整网格
      { name: '巷·南北', cls: 'lane', width: L, pts: [[240, 150], [232, 40], [246, -60], [238, -160]] },
      { name: '巷·东西', cls: 'lane', width: L, pts: [[110, 45], [220, 38], [322, 20], [450, 28], [552, 15]] },
      { name: '斜巷一', cls: 'lane', width: L, pts: [[150, -165], [240, -85], [316, -45]] },
      { name: '斜巷二', cls: 'lane', width: L, pts: [[425, 125], [362, 32], [324, -25]] },
      { name: '巷三', cls: 'lane', width: L, pts: [[482, -180], [470, -60], [450, 28]] },
      { name: '巷四', cls: 'lane', width: L, pts: [[158, 122], [230, 62], [244, -58]] },
      { name: '死巷', cls: 'lane', width: L, pts: [[540, -140], [502, -58]] },
    ],
    // 四门石桥：跨护城河（略高于水面）
    bridges: [
      { name: '南门桥', pts: [[320, 235], [320, 165]] },
      { name: '北门桥', pts: [[318, -255], [330, -315]] },
      { name: '西门桥', pts: [[-14, -107], [54, -101]] },
      { name: '东门桥', pts: [[590, -27], [654, -23]] },
    ],
  };
}

// 手描 GeoJSON（可选）：FeatureCollection，LineString，
// properties.class = 'main' | 'lane'（缺省 'lane'），坐标为经纬度
const ANCHOR = { lon: 116.2181, lat: 23.4375 };
const toScene = (lon, lat) => ({
  x: +((lon - ANCHOR.lon) * 111320 * Math.cos((ANCHOR.lat * Math.PI) / 180)).toFixed(1),
  z: -((lat - ANCHOR.lat) * 110880).toFixed(1),
});

async function tryLoadGeoJson() {
  try {
    const r = await fetch('assets/data/hongyang.geojson');
    if (!r.ok) return null;
    const j = await r.json();
    const roads = [];
    for (const f of j.features || []) {
      if (f.geometry?.type !== 'LineString') continue;
      const cls = f.properties?.class === 'main' || f.properties?.highway === 'main' ? 'main' : 'lane';
      roads.push({
        cls,
        width: cls === 'main' ? 16 : 8,
        name: f.properties?.name || '路',
        pts: f.geometry.coordinates.map((c) => toScene(c[0], c[1])),
      });
    }
    return roads.length ? { roads, bridges: defaultStreets().bridges } : null;
  } catch {
    return null;
  }
}

export async function loadStreets() {
  return (await tryLoadGeoJson()) || defaultStreets();
}

export function buildRoads(streets) {
  const group = new THREE.Group();
  const mat = makeRoadMaterial();
  // 全部路网合并为单一几何体（1 次 draw call）；高度差已烘焙进顶点
  const geos = [];
  for (const r of streets.roads) {
    // 主干道与街巷分层高度，交叉处上层自然盖住下层，避免同高闪面
    geos.push(ribbonGeometry(r.pts, r.width, r.cls === 'main' ? 2.8 : 2.5, r.closed === true));
  }
  // 四门石桥：略高于水面（4），跨接护城河两岸
  for (const b of streets.bridges || []) geos.push(ribbonGeometry(b.pts, 18, 4.6));
  const mesh = new THREE.Mesh(mergeGeometries(geos), mat);
  mesh.renderOrder = 1;
  group.add(mesh);
  return { group, materials: [mat] };
}

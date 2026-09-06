# 项目状态快照（上下文交接文档）

> ⚠️ 本文档是 AI 助手的完整工作状态交接，每次大版本更新后应同步刷新。
> 最后更新：M11 完成后（2026-09-07）

## 一、项目身份

- **名称**：水墨普宁·洪阳镇中心（Three.js 水墨风三维古镇）
- **线上正式网址**：https://jialiang37.github.io/shuimo-hongyang/
- **GitHub 仓库**：https://github.com/jialiang37/shuimo-hongyang（public；master=源码，gh-pages=发布分支）
- **本地路径**：E:\AI个人项目\水墨普宁
- **本地开发**：`npm run dev` → http://localhost:5173 （构建：`npm run build`；发布：`npx gh-pages -d dist`）
- **参考原版**：gamemcu《水墨杭州》https://gamemcu.com/hz（BV1yG411Z7sw）
- **环境**：Windows + Git Bash；Node v24.14.1；three 0.180.0；Vite 7.3.6；gh CLI 2.100.0 已安装并已登录（账号 jialiang37）
- **用户**：零基础，全程复制粘贴话术驱动 AI，验收看截图，沟通用中文

## 二、坐标与数据体系（改动前必读）

- **锚点**：洪阳镇中心 OSM 节点（116.2181E, 23.4375N）
- **场景坐标**：x=东，z=南（北为负）；换算 `x=(lon-锚点)*102140`，`z=-(lat-锚点)*110880`
- **地标预留区**（buildBuildings 会避开）：德安里(430,80,r120)、普宁学宫(140,-160,r75)、城隍庙(390,-170,r58)、培风塔(820,-700,r65)、老街牌坊(321,60,r24)、英歌广场(540,-150,r50)
- **护城河环**：中心(320,-40) 半宽(300,240) 圆角r120；**榕江南河**：镇北约800m SW→NE；**城内河**：镇西 N-S 纵贯，北端汇入主河
- **水系数据**：public/assets/data/hongyang-water.json（由 tools/generate-water-data.mjs 从 OSM 生成；原始提取 tools/_hy_water.json 已删，需要时用 Overpass 重拉：`way["waterway"]/["natural"="water"] bbox(23.40,116.17,23.48,116.27)`）

## 三、文件结构与职责

| 文件 | 职责与关键点 |
|---|---|
| src/main.js | 渲染器(透明底+powerPreference)/场景/相机/自适应雾(density=1/max(300,2.2*dist))/主循环tick()+250ms兜底渲染(防后台rAF节流冻结)/按钮接线/加载重试loadJSON |
| src/water.js | makeWaterMaterial(雾uniform合并/uTime/uMode/uReveal/uDusk/淡墨渐变/岸线墨晕/流动波纹)、ribbonGeometry(点/宽/y/closed/main→aMain属性, y默认4防Z冲突)、buildWater(河道+池塘各合并1 Mesh) |
| src/roads.js | makeRoadMaterial(uRoad/uRoadDeep/uInkLine/uReveal, fwidth抗锯齿格扇)、buildRoads(全部路网+桥合并单Mesh, 主干道2.8/街巷2.5高差防闪面, aMain主干道标志→中线虚线) |
| src/buildings.js | **导出makeBuildingMaterial**(uWall/uInk/uLineK/uReveal/uTile/uDusk/uGrain程序化颗粒, vNormalW立面判定, 格扇窗/双扇门/瓦线/湿墨/淡墨罩染0.12)，三原型(下山虎/四点金/小屋)+撒点(网格抖动+沿街成排+净距+地标避让)+接地阴影合并，buildBuildings(streets,waterData,exclusions) |
| src/landmarks.js | LANDMARKS六地标配置、buildLandmarks→{group,materials,plates}（德安里三进/学宫重檐/城隍庙/培风塔八角七层/牌坊/英歌广场+8舞者+脸谱旗）、Canvas楷体名牌+朱印 |
| src/nature.js | buildNature(streets,waterData,landmarks,opts{mobile})→{group,update,treeMats,title,clouds}：水墨树三款撒点(沿河/沿街/池塘/疏林, mobile树减半)、5飞鸟绕培风塔(radius字段！)、9云雾漂移、竖排"水墨洪阳"标题朱印 |
| src/audio.js | createAudioController：程序化古筝(五声音阶随机游走拨弦)+鸟鸣+风声，toggleMusic()(默认关)/setCameraHeight(h)(环境音随高度衰减) |
| tools/generate-paper-texture.mjs | 程序化宣纸纹理1024px→public/assets/textures/T_Paper.png（输出平均色#f2eddf=雾色基准） |
| tools/generate-water-data.mjs | OSM提取(tools/_hy_water.json)→public/assets/data/hongyang-water.json |
| index.html | 宣纸CSS底纹(相对路径!)/OSM署名/#dusk-tint暮色滤镜层/#music-btn♪/#dusk-btn日暮切换/#hint |
| vite.config.js | base './'（GitHub Pages 子目录兼容，**勿删**） |

**调试暴露（验收期临时保留）**：window.__renderer/__scene/__camera/__THREE/__setView/__build；URL参数：?view=top、?cam=x,y,z&tgt=x,y,z、?nointro

## 四、渲染管线要点（新功能必读）

1. 所有自研 ShaderMaterial **必须** `UniformsUtils.merge([THREE.UniformsLib.fog, {...}])`，否则雾 uniform 缺失导致每帧抛错、画面冻结
2. 晕染浮现：材质带 uReveal，片元 `if (rn > uReveal) discard`（rn=fbm(vWorld.xz*0.012)），主循环/注册表 revealAnims 按时间推进；新元素由 main.js 的 addReveal 统一注册（无 uReveal 的材质自动降级为透明度渐显）
3. 湿墨公式方向：`smoothstep(uReveal-0.08, uReveal-0.02, rn)` ——只洇边缘，**不是** `1.0-smoothstep`（反向会把全区域染墨→建筑远看变白不可见，M11 曾栽此坑）
4. 条带 ribbonGeometry：uv.x=横跨(0..1)、uv.y=沿程米数；aMain 属性区分主干道（画中线虚线）
5. 接地阴影：建筑与树各合并一个 Mesh（y=0.28/0.16 深墨椭圆，opacity 0.4/0.32, depthWrite false）
6. 移动端 IS_MOBILE（粗指针/小屏）：关抗锯齿、像素比1.5、树减半
7. 相机 far=4000、near=0.1；条带抬升至 y=4 防 Z 冲突

## 五、里程碑状态

| 里程碑 | 状态 | 提交要点 |
|---|---|---|
| M0 骨架 | ✅ | Vite+Three.js、OrbitControls |
| M1 宣纸与雾 | ✅ | 程序化宣纸纹理、FogExp2、测试白盒（已删） |
| M2 地与河 | ✅ | OSM实测水系+水面shader+宣纸大地面 |
| M3 街巷 | ✅ | 两级路网+四门石桥+环城路，合并单Mesh |
| M4 民居 | ✅ | 1043栋三原型+接地阴影，沿街成排 |
| M5 地标 | ✅ | 六件套+8英歌舞者+脸谱旗+Canvas楷体名牌朱印 |
| M6 点睛 | ✅ | 水墨树三款撒点+5飞鸟绕塔+9云雾+竖排标题 |
| M7 运镜 | ✅ | 17s双样条开场飞行+fBm晕染浮现+点击跳过 |
| M8 性能 | ✅ | 合并+移动端降级，实测144FPS |
| M9 部署 | ✅ | GitHub Pages（gh-pages分支），OSM署名 |
| M10 画质 | ✅ | 宣纸颗粒+格扇窗(fwidth AA)+瓦线+接地阴影+中线虚线 |
| M11 动效 | ✅ | 程序化古筝BGM+鸟鸣风声+8舞者+日暮切换(uDusk) |

**待做**：M12 内容深度（地标史料卡片/街巷名牌/导览路线/数据刷新脚本）→ M13 交互（小地图/第一人称/分享视角）→ M14 工程健壮（清理调试暴露/自动部署workflow/FPS显示器/WebGL兜底/README）→ M15 传播（OG分享卡片/二维码海报/研墨loading）

话术与详细方案：《M10-M15进阶优化路线.md》附录（每条含验收条件）

## 六、重大教训（防再踩）

1. ShaderMaterial 必须 `UniformsUtils.merge([UniformsLib.fog, ...])`，否则雾 uniform 缺失
2. 片元引用变量前先确认声明（M11 的 `win`→应为 `inWin`，编译失败致全建筑消失，排查耗 30 分钟）
3. 数据点格式一律 `ptOf` 归一化（[x,z] 与 {x,z} 混用曾引发三次 bug：道路净距失效/护城河裂口/虚线异常）
4. 鸟对象字段勿重名（b.R 曾被半径覆盖翅膀引用→每帧异常循环假死）
5. 湿墨公式方向曾反（1-smoothstep 全区域染墨→建筑远看变白不可见）
6. `git checkout` 分支切换会冲掉未提交修改——**改完立即提交**
7. 模块编辑后浏览器可能用旧缓存：import 路径加 ?v=N（如 nature.js?v=3，M14 清理）或硬刷新
8. Vite 构建警告 chunk>500KB：可接受，暂不处理

## 七、当前 UI 控制

| 控件 | 位置 | 功能 |
|---|---|---|
| ♪ 按钮 | 右下 | 程序化古筝 BGM 开关（默认关） |
| 日/暮 按钮 | 右上 | 昼夜切换（暮色：暖染滤镜+窗光+雾色变化） |
| URL ?view=top | — | 水系俯瞰验收机位 |
| URL ?cam=x,y,z&tgt=x,y,z | — | 定点机位 |
| URL ?nointro | — | 跳过 17s 开场运镜 |
| 点击画面（运镜中） | — | 跳过开场运镜 |

// M11 程序化音频：古筝风格五声音阶拨弦（Karplus 简化合成）+ 鸟鸣 + 风声
// 无需音频文件、无版权问题；用户点击页面后才初始化 AudioContext（浏览器自动播放限制）。
// 之后可将 assets/audio/guzheng.mp3 放入并改用文件播放。

const SCALE = [261.6, 293.7, 329.6, 392.0, 440.0, 523.3, 587.3]; // 宫商角徵羽 + 高音

export function createAudioController() {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let ambGain = null;
  let started = false;
  let musicOn = false;
  let nextPluck = 0;
  let nextBird = 0;
  let lastNote = 2;

  function ensure() {
    if (started) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 1;
    master.connect(ctx.destination);
    musicGain = ctx.createGain();
    musicGain.gain.value = 0; // 默认静音
    musicGain.connect(master);
    ambGain = ctx.createGain();
    ambGain.gain.value = 0.8;
    ambGain.connect(master);
    started = true;
    startLoops();
  }

  // 古筝拨弦：双振荡器微失谐 + 低通 + 指数衰减
  function pluck(freq, when, vol = 0.22) {
    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    o1.type = 'triangle';
    o2.type = 'sine';
    o1.frequency.value = freq;
    o2.frequency.value = freq * 2.003; // 泛音
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 2200;
    g.gain.setValueAtTime(vol, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 1.4);
    o1.connect(g); o2.connect(g);
    g.connect(f); f.connect(musicGain);
    o1.start(when); o2.start(when);
    o1.stop(when + 1.5); o2.stop(when + 1.5);
  }

  function scheduleMusic() {
    if (!started) return;
    const now = ctx.currentTime;
    while (nextPluck < now + 1.2) {
      const when = Math.max(nextPluck, now + 0.05);
      // 随机游走选音（五声音阶内）
      lastNote = Math.max(0, Math.min(SCALE.length - 1, lastNote + Math.round((Math.random() - 0.5) * 3)));
      pluck(SCALE[lastNote], when);
      if (Math.random() < 0.3) pluck(SCALE[lastNote] * 0.5, when + 0.18, 0.14); // 低八度 accompanies
      nextPluck = when + 0.45 + Math.random() * 0.7;
    }
    setTimeout(scheduleMusic, 400);
  }

  function chirp(when) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    const f0 = 2500 + Math.random() * 900;
    o.frequency.setValueAtTime(f0, when);
    o.frequency.exponentialRampToValueAtTime(f0 * 1.4, when + 0.06);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.8, when + 0.16);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(0.12, when + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.18);
    o.connect(g); g.connect(ambGain);
    o.start(when); o.stop(when + 0.2);
  }

  function startLoops() {
    // 鸟鸣：随机短促叫声明
    const birdLoop = () => {
      if (!started) return;
      const now = ctx.currentTime;
      const chirps = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < chirps; i++) chirp(now + i * (0.12 + Math.random() * 0.1));
      setTimeout(birdLoop, 2500 + Math.random() * 5000);
    };
    setTimeout(birdLoop, 1200);
    // 风声：循环噪声经低通
    const len = 2 * ctx.sampleRate;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 380;
    const g = ctx.createGain(); g.gain.value = 0.045;
    src.connect(f); f.connect(g); g.connect(ambGain);
    src.start();
    scheduleMusic();
  }

  return {
    // 首次用户交互时调用：初始化 AudioContext
    ensureStarted: ensure,
    // 音乐开关（默认关）
    toggleMusic() {
      ensure();
      musicOn = !musicOn;
      const now = ctx.currentTime;
      musicGain.gain.cancelScheduledValues(now);
      musicGain.gain.linearRampToValueAtTime(musicOn ? 0.42 : 0, now + 0.6);
      return musicOn;
    },
    // 相机高度 → 环境音衰减（越高越安静），每帧调用
    setCameraHeight(h) {
      if (!started || !ctx) return;
      const k = Math.max(0.15, Math.min(1, 1 - Math.max(0, h - 25) / 280));
      ambGain.gain.value = 0.8 * k;
    },
  };
}

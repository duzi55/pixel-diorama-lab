'use strict';
/* ------------------------------------------------------------------
 * 场景底图模式（scene-import.js）
 *
 * 让已有场景（village / autumn / forest / demo）进入编辑：
 *
 *   同源 iframe 加载场景页 → 烘焙完成后 → 从 iframe 里取出
 *   bakedPix / bakedZ / ground / groundZ / W / H → 拷进编辑器缓冲
 *
 * 底图模式下：
 *   - 地形笔刷/塑形工具禁用（那些场景的地面是烘焙产物，笔刷会毁掉它）
 *   - 构件放置/选择/拖拽/缩放/碰撞体全功能开放（直接画在底图之上）
 *   - 保存场景时底图以 base64 PNG 附在 JSON 里，载入时还原
 * ------------------------------------------------------------------ */

const SCENE_IMPORT = {
  busy: false,

  /**
   * 从场景页抓底图。
   * @param {string} url 场景页地址（如 '../village/index.html'）
   * @param {number} settleMs 等待烘焙/动画的毫秒数
   */
  capture(url, settleMs) {
    if (SCENE_IMPORT.busy) { studioStatus('正在抓取场景…', 'busy'); return; }
    SCENE_IMPORT.busy = true;
    studioStatus('正在加载场景并抓取底图…', 'busy');

    const frame = document.createElement('iframe');
    frame.src = url;
    frame.style.cssText = 'position:fixed;left:-99999px;top:0;width:800px;height:900px;border:0;';
    document.body.appendChild(frame);

    const done = (ok, msg) => {
      setTimeout(() => frame.remove(), 50);
      SCENE_IMPORT.busy = false;
      studioStatus(msg, ok ? 'ok' : 'err');
    };

    frame.onerror = () => done(false, '场景页加载失败: ' + url);

    setTimeout(() => {
      try {
        const win = frame.contentWindow, doc = frame.contentDocument;
        if (!win || !doc) return done(false, '无法访问场景页（跨域？）');

        const src = win.bakedPix, srcZ = win.bakedZ;
        if (!(src instanceof win.Uint32Array) || src.length !== win.W * win.H) {
          return done(false, '场景页没有可抓取的烘焙底图（bakedPix）');
        }

        /* 拷贝缓冲到编辑器作用域（类型化数组跨 iframe 构造器不同，逐项拷） */
        const n = win.W * win.H;
        const pix2 = new Uint32Array(n), z2 = new Float32Array(n);
        const g2 = new Uint8Array(n), gz2 = new Float32Array(n);
        pix2.set(src); z2.set(srcZ);
        if (win.ground instanceof win.Uint8Array) g2.set(win.ground);
        if (win.groundZ instanceof win.Float32Array) gz2.set(win.groundZ);

        const meta = {
          url,
          W: win.W, H: win.H,
          pix: Array.from(pix2),
          z: Array.from(z2),
          ground: Array.from(g2),
          groundZ: Array.from(gz2),
        };
        ED_setBaseMap(meta);
        done(true, `已导入场景底图（${win.W}×${win.H}）—— 地形工具已锁定，构件编辑全功能开放`);
      } catch (e) {
        done(false, '抓取失败：' + (e && e.message || e));
      }
    }, settleMs || 2600);
  },

  /** 底图 → base64 PNG（随场景 JSON 存档） */
  toDataURL() {
    if (!ED.baseMap) return null;
    const c = document.createElement('canvas');
    c.width = ED.baseMap.W; c.height = ED.baseMap.H;
    const g = c.getContext('2d');
    const img = g.createImageData(ED.baseMap.W, ED.baseMap.H);
    const u32 = new Uint32Array(img.data.buffer);
    u32.set(ED.baseMap.pix);
    g.putImageData(img, 0, 0);
    return c.toDataURL('image/png');
  },

  /** base64 PNG → 底图（载入场景时还原） */
  async fromDataURL(dataUrl, w, h) {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = dataUrl; });
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, w, h);
    const u32 = new Uint32Array(d.data.buffer);
    ED_setBaseMap({
      url: '(存档还原)', W: w, H: h,
      pix: Array.from(u32),
      z: null,          /* 存档里没有深度，按平面深度重建 */
      ground: null,
      groundZ: null,
    });
  },
};

/* ---------------- 底图模式 ---------------- */

/**
 * 进入/退出底图模式。
 * meta = { url, W, H, pix[], z[]|null, ground[]|null, groundZ[]|null }
 */
function ED_setBaseMap(meta) {
  /* 底图尺寸与当前画布不符时：按场景尺寸重建画布（engine 的 PP_setSize
     会重建全部缓冲），这样 300×520 的竖幅场景也能进编辑器 */
  if (meta && (meta.W !== W || meta.H !== H)) {
    if (meta.W < 80 || meta.H < 60 || meta.W > 2048 || meta.H > 2048) {
      studioStatus(`底图尺寸 ${meta.W}×${meta.H} 超出支持范围`, 'err');
      return;
    }
    PP_setSize(meta.W, meta.H);
    ED_fit();
    studioStatus(`画布已切换为 ${meta.W}×${meta.H}（跟随场景）`);
  }
  if (!meta) {
    ED.baseMap = null;
    ED_setTool('paint');
    const ex = document.getElementById('btn-exit-basemap');
    if (ex) ex.style.display = 'none';
    for (const id of ['sec-tools', 'sec-mats']) {
      const el = document.getElementById(id);
      if (el) el.style.opacity = '';
    }
    ED.dirty = true;
    return;
  }

  ED.baseMap = meta;

  /* 深度/地面标记缺失时按平面重建（存档还原路径） */
  const n = W * H;
  ED.baseMap.z = meta.z || (() => {
    const z = new Float32Array(n);
    for (let iy = 0; iy < H; iy++) for (let ix = 0; ix < W; ix++) {
      const g = unproject(ix + .5, iy + .5);
      z[iy * W + ix] = (g.x + g.y) / Math.SQRT2 * (Math.sqrt(3) / 2);
    }
    return z;
  })();
  ED.baseMap.ground = meta.ground || new Uint8Array(n);   /* 底图模式无地面标记也 OK */
  ED.baseMap.groundZ = meta.groundZ || ED.baseMap.z;

  /* 已有物体的高度重新吸附（底图是平的，统一落 z=0） */
  for (const o of ED.objects) o.z = 0;

  ED_setTool('select');
  ED.dirty = true;
  const ex = document.getElementById('btn-exit-basemap');
  if (ex) ex.style.display = '';
  for (const id of ['sec-tools', 'sec-mats']) {
    const el = document.getElementById(id);
    if (el) el.style.opacity = '.45';
  }
  studioStatus(`底图模式：${meta.url} —— 地形工具锁定，构件编辑开放`, 'ok');
}

/* 底图模式下禁用的工具 */
function ED_toolLocked(tool) {
  return !!ED.baseMap && (tool === 'paint' || tool === 'erase' || tool === 'raise' || tool === 'lower');
}


  /* 场景底图导入 */
  const impBtn = document.getElementById('btn-scene-import');
  if (impBtn) impBtn.addEventListener('click', () => {
    const url = document.getElementById('scene-import-sel').value;
    if (!url) { studioStatus('先在下拉里选一个场景', 'err'); return; }
    if (typeof SCENE_IMPORT !== 'undefined') SCENE_IMPORT.capture(url, 2800);
  });

  const exitBase = document.getElementById('btn-exit-basemap');
  if (exitBase) exitBase.addEventListener('click', () => {
    ED_setBaseMap(null);
    exitBase.style.display = 'none';
    document.getElementById('sec-tools').style.opacity = '';
    document.getElementById('sec-mats').style.opacity = '';
    studioStatus('已退出底图模式，恢复地形编辑', 'ok');
  });


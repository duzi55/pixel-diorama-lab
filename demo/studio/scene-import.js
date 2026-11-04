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
   * 从场景页抓底图（轮询等待烘焙完成，而不是固定睡一段时间）。
   * @param {string} url 场景页地址（如 '../village/index.html'）
   * @param {number} timeoutMs 最长等待烘焙的毫秒数（默认 8s）
   */
  capture(url, timeoutMs) {
    if (SCENE_IMPORT.busy) { studioStatus('正在抓取场景…', 'busy'); return; }
    SCENE_IMPORT.busy = true;
    studioStatus('正在加载场景并抓取底图…', 'busy');

    const frame = document.createElement('iframe');
    frame.src = url;
    frame.style.cssText = 'position:fixed;left:-99999px;top:0;width:800px;height:900px;border:0;';
    document.body.appendChild(frame);

    let done = false;
    const finish = (ok, msg) => {
      if (done) return;
      done = true;
      setTimeout(() => frame.remove(), 50);
      SCENE_IMPORT.busy = false;
      studioStatus(msg, ok ? 'ok' : 'err');
    };

    const deadline = Date.now() + Math.max(3000, timeoutMs || 8000);

    frame.onerror = () => finish(false, '场景页加载失败: ' + url);

    const poll = () => {
      if (done) return;
      let win = null;
      try { win = frame.contentWindow; } catch { /* 跨域 */ }
      if (!win) {
        if (Date.now() < deadline) return setTimeout(poll, 200);
        return finish(false, '无法访问场景页（跨域？）');
      }

      try {
        /* ★ engine 的 W/H/bakedPix 是顶层 let，不挂在 window 上，
           必须走 window.PP_SCENE 的 getter；旧页面没有时退回 window */
        const api = win.PP_SCENE || win;
        const src = api.bakedPix, srcZ = api.bakedZ;
        const SW = api.W, SH = api.H;

        /* 类型/尺寸不对：脚本还没跑完，或该页根本不是 engine 场景 */
        if (!(src instanceof win.Uint32Array) || src.length !== SW * SH ||
            !(srcZ instanceof win.Float32Array)) {
          if (Date.now() < deadline) return setTimeout(poll, 200);
          return finish(false, api === win
            ? '场景页没有可抓取的烘焙底图（window.bakedPix 不存在，且没有 PP_SCENE 接口）'
            : '场景页没有可抓取的烘焙底图（PP_SCENE.bakedPix 不存在）');
        }

        /* 缓冲已建但还没 bake：像素全空，继续等 */
        if (!hasBakedContent(src)) {
          if (Date.now() < deadline) return setTimeout(poll, 200);
          return finish(false, `场景 ${SW}×${SH} 的烘焙缓冲是空的 —— 该页可能没有调用 bake()`);
        }

        /* 拷贝缓冲到编辑器作用域（类型化数组跨 iframe 构造器不同，逐项拷） */
        const n = SW * SH;
        const pix2 = new Uint32Array(n), z2 = new Float32Array(n);
        const g2 = new Uint8Array(n), gz2 = new Float32Array(n);
        pix2.set(src); z2.set(srcZ);
        if (api.ground instanceof win.Uint8Array) g2.set(api.ground);
        if (api.groundZ instanceof win.Float32Array) gz2.set(api.groundZ);

        ED_setBaseMap({
          url,
          W: SW, H: SH,
          pix: Array.from(pix2),
          z: Array.from(z2),
          ground: Array.from(g2),
          groundZ: Array.from(gz2),
        });
        finish(true, `已导入场景底图（${SW}×${SH}）—— 地形工具已锁定，构件编辑全功能开放`);
      } catch (e) {
        finish(false, '抓取失败：' + (e && e.message || e));
      }
    };

    frame.onload = poll;
    setTimeout(poll, 1200);   /* 兜底：onload 没触发（同源缓存等）时也轮询 */
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

/** 烘焙缓冲里有没有真像素（采样扫描，大画布也不慢） */
function hasBakedContent(pix) {
  for (let i = 0; i < pix.length; i += 97) if (pix[i] !== 0) return true;
  return false;
}


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
    if (typeof SCENE_IMPORT !== 'undefined') SCENE_IMPORT.capture(url, 8000);
  });

  const exitBase = document.getElementById('btn-exit-basemap');
  if (exitBase) exitBase.addEventListener('click', () => {
    ED_setBaseMap(null);
    exitBase.style.display = 'none';
    document.getElementById('sec-tools').style.opacity = '';
    document.getElementById('sec-mats').style.opacity = '';
    studioStatus('已退出底图模式，恢复地形编辑', 'ok');
  });


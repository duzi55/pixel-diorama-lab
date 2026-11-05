'use strict';
/* ------------------------------------------------------------------
 * 编辑器 · 构件库（editor-kit.js）
 *
 * 从 editor.js 拆出：搜索 + 分类计数 + 缩略图网格。
 * 缩略图用主引擎渲染后立即恢复画面（同步执行，帧循环不会插进来），
 * 并缓存 dataURL；滚动到可见才渲染（IntersectionObserver）。
 * ------------------------------------------------------------------ */

const KIT_UI = {
  cur: '',             /* 当前分类 */
  q: '',               /* 搜索词 */
  thumbs: new Map(),   /* id → dataURL */
  searchBound: false,
};

const KIT_CAT_LABEL = {
  tree: '树', plant: '草木', building: '建筑', prop: '道具',
  figure: '人物', structure: '结构', vehicle: '载具', effect: '特效',
};

const THUMB_BG = rgb(247, 242, 231);

function ED_buildCats() {
  const catBox = document.getElementById('cats');
  const listBox = document.getElementById('comp-list');
  const search = document.getElementById('kit-search');
  const count = document.getElementById('kit-count');
  if (!catBox || !listBox) return;

  const cats = [...new Set(KIT.list().map(c => c.category))];

  const renderCats = () => {
    catBox.innerHTML = '';
    const mk = (label, val) => {
      const b = document.createElement('button');
      b.className = 'pill' + (KIT_UI.cur === val ? ' on' : '');
      b.textContent = label;
      b.addEventListener('click', () => { KIT_UI.cur = val; renderCats(); renderGrid(); });
      return b;
    };
    catBox.appendChild(mk('全部', ''));
    for (const c of cats) {
      const n = KIT.list().filter(x => x.category === c).length;
      catBox.appendChild(mk((KIT_CAT_LABEL[c] || c) + ' ' + n, c));
    }
  };

  const renderGrid = () => {
    listBox.innerHTML = '';
    const q = KIT_UI.q.trim().toLowerCase();
    const comps = KIT.list().filter(c => {
      if (KIT_UI.cur && c.category !== KIT_UI.cur) return false;
      if (!q) return true;
      return (c.id + ' ' + c.name + ' ' + (c.desc || '')).toLowerCase().includes(q);
    });
    if (count) count.textContent = `(${comps.length}/${KIT.list().length})`;
    if (!comps.length) {
      listBox.innerHTML = '<div class="empty-note">没有匹配的构件</div>';
      return;
    }

    for (const c of comps) {
      const card = document.createElement('button');
      card.className = 'kit-card' + (ED.placing === c.id ? ' on' : '');
      card.title = (c.desc || c.id) + ' · ' + c.id;
      card.innerHTML = '<img alt=""><span class="nm"></span>';
      card.querySelector('.nm').textContent = c.name;

      const img = card.querySelector('img');
      const paint = () => {
        const url = ED_thumbFor(c.id);
        if (!img) return;
        if (url) img.src = url;
        else if (img.style) img.style.visibility = 'hidden';
      };
      if (typeof IntersectionObserver === 'function') {
        const io = new IntersectionObserver(entries => {
          if (entries.some(e => e.isIntersecting)) { io.disconnect(); paint(); }
        }, { root: listBox });
        io.observe(card);
      } else {
        paint();
      }

      card.addEventListener('click', () => {
        ED.placing = c.id;
        ED_setTool('place');
        /* 只更新选中态，不重建整个网格 */
        for (const el of listBox.children) el.classList && el.classList.remove('on');
        card.classList.add('on');
        studioStatus(`放置「${c.name}」—— 点画布放置，滚轮旋转，Esc 取消`);
      });
      listBox.appendChild(card);
    }
  };

  if (search && !KIT_UI.searchBound) {
    KIT_UI.searchBound = true;
    search.addEventListener('input', () => {
      KIT_UI.q = search.value;
      renderGrid();
    });
  }

  renderCats();
  renderGrid();
}

/* ---------------- 缩略图 ---------------- */

/** 用主引擎渲染构件并裁出 bbox → dataURL（渲染后立即恢复画面） */
function ED_thumbFor(id) {
  if (KIT_UI.thumbs.has(id)) return KIT_UI.thumbs.get(id);
  const comp = KIT.get(id);
  if (!comp) return null;

  const savedPix = pix.slice(), savedZb = zb.slice();
  const savedGround = ground.slice(), savedKinds = kinds.slice();
  try {
    zb.fill(-1e9);
    pix.fill(THUMB_BG);
    ground.fill(0);
    kinds.fill(KIND_NONE);
    shadowMask.fill(0);
    darkened.fill(0);

    const o = {
      id: 'thumb', kind: id, x: 0, y: 0, z: 0, rot: 0, scale: 1,
      params: KIT.defaults(id), seed: 7,
    };
    comp.draw(KIT_RENDER.makeCtx(o), o);
    shadeEdges();

    const url = ED_cropPix(THUMB_BG);
    KIT_UI.thumbs.set(id, url);
    return url;
  } catch (e) {
    console.warn('[kit] 缩略图失败', id, e);
    return null;
  } finally {
    pix.set(savedPix);
    zb.set(savedZb);
    ground.set(savedGround);
    kinds.set(savedKinds);
  }
}

/** 扫描 pix 的非背景 bbox → dataURL（透明底） */
function ED_cropPix(bg) {
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let iy = 0; iy < H; iy++) {
    for (let ix = 0; ix < W; ix++) {
      if (pix[iy * W + ix] === bg) continue;
      if (ix < x0) x0 = ix;
      if (ix > x1) x1 = ix;
      if (iy < y0) y0 = iy;
      if (iy > y1) y1 = iy;
    }
  }
  if (x1 < 0) return null;

  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (!g) return null;               /* 测试沙箱没有真实 canvas */

  const img = g.createImageData(w, h);
  const u32 = new Uint32Array(img.data.buffer);
  for (let iy = 0; iy < h; iy++) {
    for (let ix = 0; ix < w; ix++) {
      const p = pix[(y0 + iy) * W + (x0 + ix)];
      u32[iy * w + ix] = p === bg ? 0 : p;
    }
  }
  g.putImageData(img, 0, 0);
  return c.toDataURL('image/png');
}

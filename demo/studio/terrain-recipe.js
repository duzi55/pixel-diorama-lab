'use strict';
/* ------------------------------------------------------------------
 * 地形配方（terrain-recipe.js）
 *
 * 一套地形 = 主体（core）+ 过渡（blend）+ 边缘（edge）三层。
 * 配方只描述"材质怎么分区"，形状仍用 TERRAIN_SHAPES 的原语。
 *
 *   1. 按形状铺满主体材质
 *   2. BFS 算每格到边缘的距离
 *   3. 边缘向内 blendWidth 格按噪声换成过渡材质（成片，不是均匀撒点）
 *
 * 这样画出来的地形自带"中心实、边缘柔"的层次，
 * 而不是单一材质铺一块硬邦邦的色块。
 * ------------------------------------------------------------------ */

const TERRAIN_RECIPES = {
  'autumn-island': {
    id: 'autumn-island',
    name: '秋日落叶岛',
    core: 'grass',
    blend: 'soil',
    blendWidth: 1.6,
  },
  'sandy-cay': {
    id: 'sandy-cay',
    name: '沙滩小洲',
    core: 'sand',
    blend: 'water',
    blendWidth: 1.2,
  },
  'stone-terrace': {
    id: 'stone-terrace',
    name: '石台',
    core: 'stone',
    blend: 'grass',
    blendWidth: 1.0,
  },
  'plain-grass': {
    id: 'plain-grass',
    name: '纯草地',
    core: 'grass',
    blend: null,
    blendWidth: 0,
  },
  'water-pool': {
    id: 'water-pool',
    name: '水塘',
    core: 'water',
    blend: 'sand',
    blendWidth: 0.9,
  },
};

/* ---------------- 边缘过渡 ---------------- */

/**
 * 把地形边缘向内 blendWidth 格换成交替材质。
 * @param {string} core 主体材质
 * @param {string} blend 过渡材质（null 时不做）
 * @param {number} width 过渡带宽度（格）
 */
function terrainBlendEdges(core, blend, width) {
  if (!blend || width <= 0) return 0;

  /* 1. 收集主体材质格 + 边缘格 */
  const cells = [...TERRAIN.cells.values()].filter(c => c.mat === core);
  if (!cells.length) return 0;

  const key = (gx, gy) => gx + ',' + gy;
  const set = new Set(cells.map(c => key(c.gx, c.gy)));
  const has = (gx, gy) => set.has(key(gx, gy));

  const dist = new Map();
  const queue = [];
  for (const c of cells) {
    if (!has(c.gx + 1, c.gy) || !has(c.gx - 1, c.gy) ||
        !has(c.gx, c.gy + 1) || !has(c.gx, c.gy - 1)) {
      dist.set(key(c.gx, c.gy), 0);
      queue.push(c);
    }
  }

  /* 2. BFS 向内扩散 */
  let head = 0;
  const maxD = Math.ceil(width);
  while (head < queue.length) {
    const c = queue[head++];
    const d = dist.get(key(c.gx, c.gy));
    if (d >= maxD) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = c.gx + dx, ny = c.gy + dy;
      const k = key(nx, ny);
      if (!set.has(k) || dist.has(k)) continue;
      dist.set(k, d + 1);
      queue.push({ gx: nx, gy: ny });
    }
  }

  /* 3. 按距离 + 低频噪声换成过渡材质（成片抖动） */
  let changed = 0;
  for (const c of cells) {
    const d = dist.get(key(c.gx, c.gy));
    if (d == null || d > width) continue;

    /* 越靠近边缘越可能换：d=0 时概率 ~0.85，d=width 时 ~0.25 */
    const t = 1 - d / (width + 1);
    const n = noise(c.gx * 0.62 + 3.7, c.gy * 0.62 + 8.1);
    const p = 0.2 + t * 0.65;
    if (n < p) {
      TERRAIN.set(c.gx, c.gy, blend, c.z || 0);
      changed++;
    }
  }
  return changed;
}

/* ---------------- 配方生成 ---------------- */

/**
 * 按配方生成一块地形。
 * @param {object} recipe 配方（TERRAIN_RECIPES 里的一项）
 * @param {object} opts { shape, cx, cy, rx, ry, wobble, clear }
 */
function terrainApplyRecipe(recipe, opts = {}) {
  if (!recipe) return null;
  if (typeof TERRAIN_SHAPES === 'undefined') return null;

  if (opts.clear !== false) TERRAIN.clear();

  const shape = {
    type: opts.shape || 'island',
    cx: opts.cx || 0,
    cy: opts.cy || 0,
    rx: opts.rx || 9,
    ry: opts.ry || 7,
    mat: recipe.core,
    z: opts.z || 0,
    wobble: opts.wobble == null ? 0.16 : opts.wobble,
  };

  TERRAIN_SHAPES.apply({ name: recipe.name, shapes: [shape] });

  const blended = terrainBlendEdges(recipe.core, recipe.blend, recipe.blendWidth);
  return { cells: TERRAIN.cells.size, blended };
}

/* ---------------- UI ---------------- */

function initTerrainRecipeUI() {
  const sel = document.getElementById('recipe-sel');
  const btn = document.getElementById('btn-recipe-gen');
  if (!sel || !btn) return;

  sel.innerHTML = Object.values(TERRAIN_RECIPES)
    .map(r => `<option value="${r.id}">${r.name}</option>`).join('');

  btn.addEventListener('click', () => {
    const recipe = TERRAIN_RECIPES[sel.value];
    if (!recipe) return;
    ED_snapshot('地形配方：' + recipe.name);
    const res = terrainApplyRecipe(recipe);
    if (res) {
      const hint = document.getElementById('recipe-hint');
      if (hint) hint.textContent = `已生成 ${res.cells} 格 · 其中过渡 ${res.blended} 格`;
      ED.dirty = true;
      studioStatus(`地形「${recipe.name}」已生成`, 'ok');
    }
  });
}

initTerrainRecipeUI();

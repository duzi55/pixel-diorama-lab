'use strict';
/* ------------------------------------------------------------------
 * 全局场景导航（注入到每个 demo 页面左上角）
 *
 * - 本工作区场景直接跳转
 * - 参考项目走 127.0.0.1:5300（需先 `cd reference/pixel-plays && node serve.mjs`）
 * - 当前页高亮；HUD 统一下移，避开左上角按钮
 * ------------------------------------------------------------------ */
(function () {
  /* 无头渲染器（tools/render.mjs）没有 location / querySelector，直接跳过 */
  if (typeof window === 'undefined' || typeof location === 'undefined') return;
  if (!document.body || typeof document.body.appendChild !== 'function') return;
  if (window.__PD_NAV__) return;
  window.__PD_NAV__ = true;

  const scenes = [
    { title: '基础 Demo', href: '/index.html', path: '/' },
    { title: '秋日山村', href: '/village/index.html', path: '/village' },
    { title: '树林', href: '/forest.html', path: '/forest.html' },
    { title: '秋日野餐', href: '/autumn.html', path: '/autumn.html' },
    { title: '屋顶晾衣', href: '/laundry/index.html', path: '/laundry' },
    { title: '像素大奖赛', href: '/racetrack/index.html', path: '/racetrack' },
  ];
  const refs = [
    ['Balote', 'balote'],
    ['Stari Most', 'stari-most'],
    ['Rooftop Laundry', 'laundry'],
    ['Tie-Break', 'tie-break'],
    ['Mini Ramp', 'mini-ramp'],
  ];

  const norm = h => (h.replace(/\/index\.html$/, '').replace(/\/+$/, '') || '/');
  const here = norm(location.pathname);
  const current = scenes.find(s => norm(s.href) === here) || null;

  /* 参考项目：本机 5300；file:// 打开时用 127.0.0.1 */
  const host = location.hostname || '127.0.0.1';
  const refBase = `${location.protocol.startsWith('http') ? location.protocol : 'http:'}//${host}:5300`;

  const css = `
    #pd-nav {
      position: fixed; top: max(10px, env(safe-area-inset-top)); left: max(14px, env(safe-area-inset-left));
      z-index: 100; font: 12px/1.4 ui-monospace, "Cascadia Mono", Consolas, Menlo, monospace;
      user-select: none;
    }
    #pd-nav button {
      font: inherit; color: #2a2118; background: #fffdf5; border: 1px solid #2a2118;
      padding: 6px 10px; cursor: pointer; letter-spacing: .02em;
    }
    #pd-nav button:hover, #pd-nav button:focus-visible { background: #2a2118; color: #fffdf5; outline: none; }
    #pd-nav .chev { margin-left: 6px; }
    #pd-nav-menu {
      position: absolute; top: 100%; left: 0; margin-top: 4px; min-width: 210px;
      background: #fffdf5; border: 1px solid #2a2118; padding: 4px 0;
      box-shadow: 2px 2px 0 rgba(42, 33, 24, .12);
    }
    #pd-nav-menu[hidden] { display: none; }
    #pd-nav .group {
      padding: 6px 10px 3px; color: #9a8b78; font-size: 11px; letter-spacing: .04em;
    }
    #pd-nav a {
      display: flex; justify-content: space-between; gap: 18px;
      padding: 6px 10px; color: #2a2118; text-decoration: none; white-space: nowrap;
    }
    #pd-nav a:hover, #pd-nav a:focus-visible { background: #2a2118; color: #fffdf5; outline: none; }
    #pd-nav a.current::after { content: "•"; }
    #pd-nav a .tag { color: inherit; opacity: .55; font-size: 11px; }
    /* 页面原有的左上 HUD 下移，给导航让位 */
    #hud, #scores, #lap {
      top: calc(max(14px, env(safe-area-inset-top)) + 44px) !important;
    }
  `;

  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const sceneLinks = scenes.map(s =>
    `<a href="${s.href}" class="${current && current.path === s.path ? 'current' : ''}">${s.title}</a>`
  ).join('');
  const refLinks = refs.map(([title, id]) =>
    `<a href="${refBase}/${id}/" target="_blank" rel="noopener">${title}<span class="tag">↗</span></a>`
  ).join('');

  const nav = document.createElement('nav');
  nav.id = 'pd-nav';
  nav.setAttribute('aria-label', '场景导航');
  nav.innerHTML = `
    <button id="pd-nav-toggle" type="button" aria-expanded="false" aria-haspopup="true">
      场景 · ${current ? current.title : '选择'} <span class="chev">▾</span>
    </button>
    <div id="pd-nav-menu" hidden>
      <div class="group">本工作区</div>
      ${sceneLinks}
      <div class="group">参考项目 · 5300</div>
      ${refLinks}
    </div>
  `;
  document.body.appendChild(nav);

  const toggle = nav.querySelector('#pd-nav-toggle');
  const menu = nav.querySelector('#pd-nav-menu');
  const setOpen = open => {
    menu.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  };
  toggle.addEventListener('click', e => {
    e.stopPropagation();
    setOpen(menu.hidden);
  });
  document.addEventListener('click', e => { if (!nav.contains(e.target)) setOpen(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') setOpen(false); });
  if (location.hash === '#menu') setOpen(true);
})();

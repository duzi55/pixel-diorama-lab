'use strict';
// Shared chrome for every game: game menu (top centre) and rules popup (top right).
window.PixelPlays = (() => {
  // add a game here and give it a folder; `soon` entries show in the menu but do not link
  const GAMES = [
    { id: 'balote', title: 'Balote' },
    { id: 'stari-most', title: 'Stari Most' },
    { id: 'laundry', title: 'Rooftop Laundry' },
    { id: 'tie-break', title: 'Tie-Break' },
    { id: 'mini-ramp', title: 'Mini Ramp' },
  ];
  const MUSIC_VOLUME = .4;
  const CREDITS = [
    ['Concept by', 'abhi', 'https://x.com/awwbhi2'],
    ['Game by', 'AmirMushich', 'https://x.com/AmirMushich'],
  ];
  const css = `
    .pp-link { font: inherit; color: #8b877f; background: none; border: 0; padding: 10px; margin: 0; cursor: pointer; }
    .pp-link:hover, .pp-link:focus-visible, .pp-link[aria-expanded="true"] { color: #1c1b19; }
    #pp-menu { position: fixed; top: max(4px, env(safe-area-inset-top)); left: 50%; transform: translateX(-50%); z-index: 5; text-align: center; }
    #pp-list { list-style: none; margin: 0; padding: 4px 0; background: #fff; border: 1px solid #1c1b19; min-width: 150px; text-align: left; }
    #pp-list[hidden] { display: none; }
    #pp-list a, #pp-list span { display: flex; justify-content: space-between; gap: 16px; padding: 8px 12px; color: #1c1b19; text-decoration: none; }
    #pp-list a:hover, #pp-list a:focus-visible { background: #1c1b19; color: #fff; outline: none; }
    #pp-list a[aria-current="page"]::after { content: "•"; }
    #pp-list span { color: #b3afa7; }
    #pp-rules-open { position: fixed; top: max(4px, env(safe-area-inset-top)); right: max(6px, env(safe-area-inset-right)); z-index: 5; }
    #pp-rules { width: min(340px, calc(100vw - 32px)); padding: 16px; border: 1px solid #1c1b19; color: #1c1b19; background: #fff; font: inherit; }
    #pp-rules::backdrop { background: rgba(255, 255, 255, .72); }
    #pp-rules h2 { margin: 0 0 10px; font: inherit; font-weight: 600; }
    #pp-rules ol { margin: 0 0 8px; padding-left: 18px; }
    #pp-rules li { margin-bottom: 8px; }
    #pp-rules form { text-align: right; }
    #pp-rules .pp-link { margin: 0 -10px -10px; color: #1c1b19; }
    #pp-credits { position: fixed; bottom: max(14px, env(safe-area-inset-bottom)); left: 50%; transform: translateX(-50%); z-index: 4; display: flex; gap: 16px; color: #8b877f; white-space: nowrap; pointer-events: none; }
    #pp-credits a { color: inherit; text-decoration: underline; text-underline-offset: 2px; pointer-events: auto; }
    #pp-credits a:hover, #pp-credits a:focus-visible { color: #1c1b19; }
    /* long end-of-game status lines run towards the centre, so the credits step above them */
    @media (max-width: 1200px) { #pp-credits { bottom: max(38px, calc(env(safe-area-inset-bottom) + 24px)); } }
    @media (max-width: 600px) { #pp-credits { bottom: max(72px, calc(env(safe-area-inset-bottom) + 58px)); } }
  `;
  function mount({ id, rules }) {
    const game = GAMES.find(g => g.id === id);
    const style = document.createElement('style');
    style.textContent = css;
    document.head.append(style);

    const menu = document.createElement('nav');
    menu.id = 'pp-menu';
    menu.setAttribute('aria-label', 'Games');
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'pp-link';
    toggle.textContent = game.title + ' ▾';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', 'pp-list');
    const list = document.createElement('ul');
    list.id = 'pp-list';
    list.hidden = true;
    for (const g of GAMES) {
      const item = document.createElement('li');
      if (g.soon) {
        const label = document.createElement('span');
        label.innerHTML = '<span style="padding:0">' + g.title + '</span><span style="padding:0">soon</span>';
        item.append(label);
      } else {
        const link = document.createElement('a');
        link.href = '../' + g.id + '/';
        link.textContent = g.title;
        if (g.id === id) link.setAttribute('aria-current', 'page');
        item.append(link);
      }
      list.append(item);
    }
    menu.append(toggle, list);
    const setOpen = open => {
      list.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
    };
    toggle.addEventListener('click', () => setOpen(list.hidden));
    document.addEventListener('pointerdown', e => { if (!menu.contains(e.target)) setOpen(false); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !list.hidden) { setOpen(false); toggle.focus(); }
    });

    const open = document.createElement('button');
    open.type = 'button';
    open.id = 'pp-rules-open';
    open.className = 'pp-link';
    open.textContent = 'Rules';
    const dialog = document.createElement('dialog');
    dialog.id = 'pp-rules';
    dialog.setAttribute('aria-labelledby', 'pp-rules-title');
    const title = document.createElement('h2');
    title.id = 'pp-rules-title';
    title.textContent = game.title;
    const steps = document.createElement('ol');
    for (const rule of rules) {
      const li = document.createElement('li');
      li.textContent = rule;
      steps.append(li);
    }
    const form = document.createElement('form');
    form.method = 'dialog';
    form.innerHTML = '<button class="pp-link">Close</button>';
    dialog.append(title, steps, form);
    open.addEventListener('click', () => dialog.showModal());
    dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });

    const credits = document.createElement('div');
    credits.id = 'pp-credits';
    for (const [label, name, url] of CREDITS) {
      const line = document.createElement('span');
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = name;
      line.append(label + ' ', link);
      credits.append(line);
    }

    document.body.append(menu, open, dialog, credits);
    startMusic(id);
  }
  // each game loops <id>/<id>.mp3 from the first gesture, because browsers block sound before one.
  // The game's own sound button mutes it too.
  function startMusic(id) {
    const music = new Audio(id + '.mp3');
    music.loop = true;
    music.volume = MUSIC_VOLUME;
    music.preload = 'none';
    let started = false;
    const start = () => {
      started = true;
      music.play().catch(() => { started = false; });
    };
    for (const kind of ['pointerdown', 'keydown']) document.addEventListener(kind, () => { if (!started) start(); });
    document.getElementById('mute').addEventListener('click', () => { music.muted = !music.muted; });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) music.pause();
      else if (started) start();
    });
    PixelPlays.music = music;
  }
  return { mount, GAMES };
})();

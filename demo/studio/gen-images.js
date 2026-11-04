'use strict';
/* ------------------------------------------------------------------
 * 参考图输入（gen-images.js）
 *
 * 三种来源，走同一条管线（压缩到最长边 768px 的 JPEG → GEN.refImages）：
 *   1. ＋ 按钮选文件
 *   2. 剪贴板粘贴（⌘/Ctrl+V，截图直接进参考图）
 *   3. 拖拽图片到页面任意位置
 *
 * 参考图随生成请求发给服务端，AI 用 Read 工具读图提取形态与配色。
 * ------------------------------------------------------------------ */

const REF_MAX = 3;          /* 最多参考图张数 */
const REF_MAX_EDGE = 768;   /* 压缩后最长边（控制请求体大小） */

/* ---------------- 缩略图 ---------------- */

function renderRefThumbs() {
  const row = el('ref-row');
  if (!row) return;

  /* 清掉旧缩略图（保留 ＋ 添加按钮） */
  for (const c of [...row.children]) if (c.classList.contains('ref-thumb')) c.remove();

  GEN.refImages.forEach((dataUrl, k) => {
    const d = document.createElement('div');
    d.className = 'ref-thumb';
    d.innerHTML = `<img src="${dataUrl}" alt="参考图${k + 1}"><button class="ref-del" title="移除">×</button>`;
    d.querySelector('.ref-del').addEventListener('click', () => {
      GEN.refImages.splice(k, 1);
      renderRefThumbs();
    });
    row.insertBefore(d, row.lastElementChild);
  });

  const add = row.querySelector('.ref-add');
  if (add) {
    const full = GEN.refImages.length >= REF_MAX;
    add.classList.toggle('is-full', full);
    add.title = full ? `最多 ${REF_MAX} 张参考图` : '选文件，或直接粘贴 / 拖入图片';
  }
}

/* ---------------- 单张图片 → 压缩 dataURL ---------------- */

function refFileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const rd = new FileReader();
    rd.onerror = () => reject(rd.error || new Error('读取失败'));
    rd.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('不是有效的图片'));
      img.onload = () => {
        const k = Math.min(1, REF_MAX_EDGE / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * k));
        c.height = Math.max(1, Math.round(img.height * k));
        const g = c.getContext('2d');
        /* JPEG 没有 alpha：透明 PNG（截图/元素导出）先铺白底，否则会变黑 */
        g.fillStyle = '#fff';
        g.fillRect(0, 0, c.width, c.height);
        g.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.82));
      };
      img.src = rd.result;
    };
    rd.readAsDataURL(file);
  });
}

/* ---------------- 批量加入（选文件 / 粘贴 / 拖拽共用） ---------------- */

async function addRefImages(items) {
  const files = [...(items || [])].filter(f => f && /^image\//.test(f.type || ''));
  if (!files.length) return 0;

  let added = 0, hitCap = false;
  for (const f of files) {
    if (GEN.refImages.length >= REF_MAX) { hitCap = true; break; }
    try {
      GEN.refImages.push(await refFileToDataURL(f));
      added++;
      renderRefThumbs();
    } catch (e) {
      studioStatus('图片读取失败：' + e.message, 'err');
    }
  }
  /* 上限提示不能被「已添加」覆盖（一次粘贴超过剩余额度时两者同时成立） */
  if (hitCap) studioStatus(`已添加 ${added} 张；参考图最多 ${REF_MAX} 张`, added ? 'ok' : 'err');
  else if (added) studioStatus(`已添加 ${added} 张参考图（共 ${GEN.refImages.length} 张）`, 'ok');
  return added;
}

/* ---------------- 从剪贴板 / 拖拽里取图片 ---------------- */

/** DataTransfer → 图片 File 列表。必须同步调用（事件结束后 DataTransfer 失效） */
function pickImageFiles(dt) {
  const out = [];
  if (!dt) return out;
  if (dt.items) {
    for (const it of dt.items) {
      if (it.kind === 'file' && /^image\//.test(it.type || '')) {
        const f = it.getAsFile();
        if (f) out.push(f);
      }
    }
  }
  if (!out.length && dt.files) {
    for (const f of dt.files) if (/^image\//.test(f.type || '')) out.push(f);
  }
  return out;
}

/* ---------------- 初始化 ---------------- */

function initRefImages() {
  const input = el('ref-input');
  if (!input) return;

  /* 1) 选文件 */
  input.addEventListener('change', () => {
    addRefImages(input.files).finally(() => { input.value = ''; });
  });

  /* 2) 粘贴：任意位置生效。只有剪贴板里有图片时才拦截，
        纯文本粘贴（描述需求、贴代码）完全不受影响 */
  document.addEventListener('paste', e => {
    const files = pickImageFiles(e.clipboardData);
    if (!files.length) return;
    e.preventDefault();
    addRefImages(files);
  });

  /* 3) 拖拽：拖入页面时高亮参考图区，松手即加入 */
  const isFileDrag = e => !!e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');
  const row = () => el('ref-row');

  document.addEventListener('dragover', e => {
    if (!isFileDrag(e)) return;
    e.preventDefault();                    /* 阻止浏览器直接打开文件 */
    e.dataTransfer.dropEffect = 'copy';
    /* 拖动期间持续高亮（不依赖 dragenter 一定先到） */
    const r = row();
    if (r) r.classList.add('drop-active');
  });
  document.addEventListener('dragenter', e => {
    if (!isFileDrag(e)) return;
    const r = row();
    if (r) r.classList.add('drop-active');
  });
  document.addEventListener('dragleave', e => {
    /* 离开窗口才取消高亮（在元素间移动也会触发 dragleave） */
    if (e.relatedTarget === null) {
      const r = row();
      if (r) r.classList.remove('drop-active');
    }
  });
  document.addEventListener('drop', e => {
    if (!e.dataTransfer) return;
    e.preventDefault();
    const r = row();
    if (r) r.classList.remove('drop-active');
    addRefImages(pickImageFiles(e.dataTransfer));
  });
}

/* 初始化时机由 gen.js 的启动段负责（el()/GEN 在 gen.js 里定义） */

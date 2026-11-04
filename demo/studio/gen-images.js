'use strict';
/* ------------------------------------------------------------------
 * 参考图上传（gen-images.js）
 *
 * 从 gen.js 拆出（500 行约束）：最多 3 张参考图（自动压到 768px），
 * 随生成请求发到服务端，AI 用 Read 工具读图提取形态与配色。
 * ------------------------------------------------------------------ */

/* ---------------- 参考图上传 ---------------- */

function initRefImages() {
  const row = el('ref-row');
  const input = el('ref-input');
  if (!row || !input) return;

  const render = () => {
    /* 清掉旧缩略图（保留 ＋ 添加按钮） */
    for (const c of [...row.children]) if (c.classList.contains('ref-thumb')) c.remove();
    GEN.refImages.forEach((dataUrl, k) => {
      const d = document.createElement('div');
      d.className = 'ref-thumb';
      d.innerHTML = `<img src="${dataUrl}" alt="参考图${k + 1}"><button class="ref-del" title="移除">×</button>`;
      d.querySelector('.ref-del').addEventListener('click', () => {
        GEN.refImages.splice(k, 1);
        render();
      });
      row.insertBefore(d, row.lastElementChild);
    });
  };

  input.addEventListener('change', () => {
    for (const f of input.files) {
      if (GEN.refImages.length >= 3) { studioStatus('最多 3 张参考图', 'err'); break; }
      const rd = new FileReader();
      rd.onload = () => {
        /* 压到最长边 768px（控制请求体大小） */
        const img = new Image();
        img.onload = () => {
          const maxD = 768, k = Math.min(1, maxD / Math.max(img.width, img.height));
          const c = document.createElement('canvas');
          c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          GEN.refImages.push(c.toDataURL('image/jpeg', 0.82));
          render();
        };
        img.src = rd.result;
      };
      rd.readAsDataURL(f);
    }
    input.value = '';
  });
}

initRefImages();


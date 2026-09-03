// js/animations.js — 全部走 CSS class 切換（規格要求：不用 JS 逐幀動畫，省電且不掉幀）
(function (global) {
  'use strict';
  const $ = (id) => document.getElementById(id);

  const Animations = {
    /** 由勾選框觸發的 +XP 飄字 */
    xpFloat(amount, anchorEl) {
      const box = $('xp-float-container'); if (!box || amount <= 0) return;
      const el = document.createElement('div');
      el.className = 'xp-float';
      el.textContent = `+${amount} XP`;
      const r = anchorEl?.getBoundingClientRect?.();
      if (r) { el.style.left = `${r.left + r.width - 56}px`; el.style.top = `${r.top + window.scrollY}px`; }
      el.classList.add('go');
      box.appendChild(el);
      el.addEventListener('animationend', () => el.remove(), { once: true });
      setTimeout(() => el.remove(), 1400);
    },

    levelUp(level) {
      const ov = $('level-up-overlay'); if (!ov) return;
      const t = $('level-up-title');
      if (t) t.textContent = `Lv.${level.level} ${level.title || ''}`;
      ov.hidden = false; ov.classList.add('show');
      this.confetti();
      setTimeout(() => { ov.hidden = true; ov.classList.remove('show'); }, 2200);
    },

    /** 24 片 DOM confetti；減少動態內容時直接不播放 */
    confetti() {
      if (global.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
      const box = $('confetti-container'); if (!box) return;
      box.innerHTML = '';
      const colors = ['#e94560', '#f5a623', '#4ecdc4', '#ffe66d', '#ff6b6b'];
      for (let i = 0; i < 24; i++) {
        const p = document.createElement('i');
        p.style.left = `${Math.random() * 100}%`;
        p.style.background = colors[i % colors.length];
        p.style.animationDelay = `${Math.random() * 0.35}s`;
        p.style.transform = `rotate(${Math.random() * 360}deg)`;
        p.className = 'confetti-piece';
        box.appendChild(p);
      }
      setTimeout(() => { box.innerHTML = ''; }, 1900);
    },

    /** 打卡成功時卡片閃一下（純 class 切換） */
    pulse(el, cls = 'pulse') {
      if (!el?.classList) return;
      el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
      setTimeout(() => el.classList.remove(cls), 700);
    },

    shake(el) { this.pulse(el, 'shake'); },
  };

  global.Animations = Animations;
})(typeof window !== 'undefined' ? window : globalThis);

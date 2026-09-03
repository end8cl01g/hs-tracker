// src/ui.ts — DOM 渲染（4 個分頁）。只做渲染與事件轉發，業務在 GameEngine/DataLayer。
(function (global) {
  'use strict';
  const $ = (id: string): El => document.getElementById(id) as unknown as El;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const UI = {
    vm: null, checks: new Map(),

    boot() {
      document.querySelectorAll('.tab-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b === btn));
          document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
          $(`tab-${(btn as El).dataset.tab}`)?.classList.add('active');
        });
      });
    },

    // 顯隱一律用 hidden **屬性**（markup 用 `hidden`，CSS 有 `[hidden]{display:none!important}`）；
    // 用 classList 切換 class 對屬性無效，會讓首開卡死在載入畫面（本輪 DOM 測試抓到的真 bug）
    hideLoading(msg) {
      const l = $('loading-screen'); if (!l) return;
      if (msg) {
        l.hidden = false;
        const lt = l.querySelector('.loading-text'); if (lt) lt.textContent = '啟動失敗';
        const e = $('loading-error'); if (e) { e.textContent = msg; e.hidden = false; }
      } else l.hidden = true;
    },
    showApp() { const a = $('app'); if (a) a.hidden = false; },
    /** 啟動第一條路徑：先拿掉 hidden 才 showModal（規範：hidden 的 dialog 不能 showModal）；老機沒 showModal 就退回疊層 */
    showOnboarding() {
      const o: any = $('onboarding-modal'); if (!o) return;
      o.hidden = false; if (o.showModal) o.showModal();
    },
    hideOnboarding() {
      const o: any = $('onboarding-modal'); if (!o) return;
      o.hidden = true; if (o.close && o.open) o.close();
    },

    renderAll(vm) {
      this.vm = vm;
      this.renderToday(vm); this.renderTree(vm); this.renderAchievements(vm); this.renderSettings(vm);
    },

    renderToday(vm) {
      const p = vm.plan || {};
      $('phase-badge').textContent = `Phase ${vm.phase} · ${esc((vm.workoutData?.phases?.[`phase${vm.phase}`]?.title) || '')}`;
      $('streak-display').textContent = `🔥 ${vm.streak.current} 天（最長 ${vm.streak.longest}）`;
      $('level-title').textContent = `Lv.${vm.level.level} ${esc(vm.level.title)}`;
      { const bar: any = $('xp-fill'); if (bar) { bar.max = 100; bar.value = Math.round((vm.level.progress || 0) * 100); } }   // 原生 <progress>，不再手刻 width%
      $('xp-text').textContent = vm.level.next ? `${vm.totalXP} / ${vm.level.next.xpRequired} XP` : `${vm.totalXP} XP（滿級）`;

      const card = $('workout-card');
      if (p.isRestDay) {
        card.innerHTML = `<div class="rest-card"><div class="rest-emoji">🛌</div>
          <h3>今日休息</h3><p>${esc(p.reason === 'rest' ? '依 rest_days 設定，今天是恢復日。' : '今日無課表資料。')}</p>
          <p class="hint">想補練：切到技能樹做一組支撐，或到設定調整休息日。</p></div>`;
        $('btn-complete').disabled = true;
        return;
      }
      $('btn-complete').disabled = false;
      const saved = vm.todayLog;
      const exs = p.workout || [];
      const savedByName: Map<string, any> = new Map((vm.exercises || []).map((e) => [e.exercise_name, e]));
      const pd: any = p.phaseData || {};
      const meta: any = (pd.day_meta || {})[vm.plan.dayKey] || {};
      const rows = exs.map((e, i) => {
        const done = saved ? !!savedByName.get(e.name)?.completed : !!this.checks.get(e.name);
        // note/regression 是計劃的「退階版」要求：做不了時要有替代方案，不是留白（PLAN.md 第三次審議）
        const extra = `${e.note ? `<span class="ex-detail ex-note">${esc(e.note)}</span>` : ''}`
          + `${e.regression ? `<span class="ex-detail ex-reg">退階：${esc(e.regression)}</span>` : ''}`;
        return `<label class="ex-row ${done ? 'done' : ''}" data-name="${esc(e.name)}">
          <input type="checkbox" data-idx="${i}" ${done ? 'checked' : ''}>
          <span class="ex-main"><span class="ex-name">${esc(e.name)}</span>
            <span class="ex-detail">${esc(e.detail || '')}</span>${extra}</span>
          <span class="ex-kind">${esc(vm.kindLabels[e.kind] || e.kind || '')}</span>
          <span class="ex-xp">+${Number(e.xp) || 0}</span></label>`;
      }).join('');
      // 注意：這裡一定要「陣列留著、最後一次 join」。上一版先把 gate join 成字串、又對它 .map()，
      // 结果所有有 gate 的 phase 一渲染就 TypeError（啟動失敗）。改這裡前先想清楚型別。
      const gateList: string[] = Array.isArray(pd.gate) ? pd.gate : [];
      const gateHtml = gateList.length
        ? `<div class="gate"><h4>進階標準（看能力，不看日曆）</h4><ul>`
          + gateList.map((g) => `<li>☐ ${esc(g)}</li>`).join('')
          + `</ul>${pd.gate_note ? `<p class="hint">${esc(pd.gate_note)}</p>` : ''}</div>`
        : '';
      const goals = vm.workoutData?.goals;
      const goalsHtml = goals
        ? `<p class="hint">🎯 必達：${esc((goals.must || []).join('／'))}<br>挑戰：${esc((goals.stretch || []).join('／'))}｜延伸：${esc((goals.bonus || []).join('／'))}</p>`
        : '';
      const footer = gateHtml + goalsHtml;
      card.innerHTML = `<div class="workout-head"><h3>${esc(vm.plan.dayKey?.toUpperCase() || '')} 訓練日${meta.label ? ` · ${esc(meta.label)}` : ''}</h3>
        <span class="chip">${exs.length} 項 · ${exs.reduce((s, e) => s + (Number(e.xp) || 0), 0)} XP</span>
        ${meta.place ? `<span class="chip">📍 ${esc(meta.place)}</span>` : ''}
        ${meta.optional ? '<span class="chip">可選</span>' : ''}</div>
        ${pd.focus ? `<p class="hint">${esc(pd.focus)}</p>` : ''}
        <div class="ex-list">${rows}</div>
        ${saved ? `<p class="hint">已儲存 ${esc(saved.log_date)}：完成 ${saved.completed ? '是' : '否'}，可直接修改再存。</p>` : ''}
        ${footer}`;

      card.querySelectorAll('input[type=checkbox]').forEach((cb) => {
        cb.addEventListener('change', () => {
          const row = cb.closest('.ex-row') as El;
          this.checks.set(row.dataset.name, (cb as El).checked);
          row.classList.toggle('done', (cb as El).checked);
        });
      });
      if (saved && !this.checks.size) {
        (vm.exercises || []).forEach((e) => this.checks.set(e.exercise_name, !!e.completed));
      }
      $('quick-note-input').value = saved?.notes || '';
    },

    /** 星圖視圖狀態（拖曳平移＋滾輪/雙指縮放）；節點多就靠它看細節，不靠把圖壓扁 */
    treeView: { x: 0, y: 0, k: 1 },
    _treeBound: false,
    _layoutCache: '' as any,
    _layout: {} as any,

    /**
     * 放射狀星座配置：分支沿大圓均分、分支內依 tier 往外套環。
     * 兩個實測教訓寫在這裡：
     * ① 純放射一定會撞星（33 顆時最近只隔 6.7 單位，觸控點半徑 26）→ 加確定性斥力解算，不用亂數；
     * ② 把超出畫布的星「夾到矩形邊界」會把整張圖壓成框邊一串珠鏈（看过預覽才知道）→
     *    改成不夾座標、反過來依實際範圍算 viewBox，永遠看得見、也不會擠。
     */
    layoutTree(nodes) {
      const key = nodes.map((n) => n.id).join(',');
      if (key === this._layoutCache) return this._layout;
      // 半徑 = 「這條支線的第幾步」，不是全域 tier：本樹有 8 條支線但深度 1~14 差很大
      // （press 支線 8 顆、wrist 3 顆），拿 tier 當半徑會把內圈擠爆、外圈空轉（實測 viewBox 炸到 1900 寬）。
      const R0 = 132; const STEP = 74; const MIN = 62;
      const branches: string[] = [];
      for (const n of nodes) { const b = (n as any).branch as string; if (b && branches.indexOf(b) < 0) branches.push(b); }
      const groups: Map<string, any[]> = new Map();
      for (const n of nodes) { const k = n.branch; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(n); }
      const pos: any = {};
      branches.forEach((bkey, bi) => {
        const list = [...groups.get(bkey)].sort((a, b) => (a.tier - b.tier) || (a.id < b.id ? -1 : 1));
        const base = -90 + (bi * 360) / Math.max(1, branches.length);
        const byDepth = new Map<number, any[]>();
        list.forEach((n, i) => { const d = i; if (!byDepth.has(d)) byDepth.set(d, []); byDepth.get(d).push(n); });
        byDepth.forEach((sibs, d) => {
          const r = R0 + d * STEP;
          const fan = sibs.length > 1 ? Math.max(9, (MIN * 1.5 * 180) / (Math.PI * r)) : 0;
          sibs.forEach((n, si) => {
            const a = (base + (si - (sibs.length - 1) / 2) * fan) * Math.PI / 180;
            pos[n.id] = { x: 500 + r * Math.cos(a), y: 350 + r * Math.sin(a) * 0.88, depth: d, tier: n.tier, name: n.name, branch: bkey };
          });
        });
      });
      // 剩下只處理「同一深度跨支線」的殘餘碰撞：沿切線推開（不改半徑，免得整張圖膨脹）
      const ids = Object.keys(pos);
      for (let it = 0; it < 10; it++) {
        let moved = 0;
        for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
          const a = pos[ids[i]], b = pos[ids[j]];
          const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
          if (d >= MIN) continue;
          moved++;
          const push = (MIN - d) / 2, ux = dx / (d || 1), uy = dy / (d || 1);
          a.x -= ux * push; a.y -= uy * push; b.x += ux * push; b.y += uy * push;
          for (const p of [a, b]) {                        // 把被推開的星重新壓回所屬深度的圓周上（切線位移）
            const want = R0 + (p.depth || 0) * STEP;
            const rr = Math.hypot(p.x - 500, (p.y - 350) / 0.88) || 1;
            const k = want / rr; p.x = 500 + (p.x - 500) * k; p.y = 350 + ((p.y - 350) / 0.88) * k * 0.88;
          }
        }
        if (!moved) break;
      }
      for (const id of ids) { pos[id].x = +pos[id].x.toFixed(1); pos[id].y = +pos[id].y.toFixed(1); }
      const xs = ids.map((i) => pos[i].x), ys = ids.map((i) => pos[i].y);
      const pad = 56;      // 留給 halo(r22) 與放大後的名字
      this._viewBox = [Math.min(470, Math.min(...xs) - pad), Math.min(318, Math.min(...ys) - pad),
        Math.max(530, Math.max(...xs) + pad), Math.max(382, Math.max(...ys) + pad)];
      this._layoutCache = key; this._layout = pos;
      return pos;
    },

    _viewBox: [0, 0, 1000, 700] as any,
    renderTree(vm) {
      const nodes = vm.skillNodes || [];
      const pos = this.layoutTree(nodes);
      const st = vm.skillStatuses || {};
      const pts = vm.points || { total: 0, spent: 0, available: 0 };
      $('tree-progress').textContent = `${vm.unlockedCount} / ${nodes.length} 已解鎖｜技能點 ${pts.available} 可用（${pts.spent}/${pts.total} 已花）`;
      const bar = $('tree-progressbar'); if (bar) { bar.max = nodes.length || 1; bar.value = vm.unlockedCount || 0; }

      const stateOf = (n) => {
        if (st[n.id] && st[n.id].unlocked) return 'unlocked';
        const gated = (n.requires || []).every((r) => st[r] && st[r].unlocked)
          && vm.totalXP >= (n.min_xp || 0) && vm.streak.current >= (n.min_streak || 0);
        return gated ? (pts.available > 0 ? 'ready' : 'waiting') : 'locked';   // waiting = 條件到了但沒點數可花
      };

      const edges = nodes.flatMap((n) => (n.requires || []).map((r) => {
        const a = pos[r], b = pos[n.id]; if (!a || !b) return [];
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
        const bend = Math.min(24, len * 0.1);                                   // 垂直方向微彎：太彎會變成掃過整張圖的意麵
        const cx = mx - (dy / len) * bend, cy = my + (dx / len) * bend;
        return `<path class="edge ${stateOf(n) === 'unlocked' ? 'on' : ''}" d="M${a.x} ${a.y} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${b.x} ${b.y}"/>`;
      })).join('');

      const zoomed = Number(this.treeView.k) > 1.35;      // 放大才浮名字：像 Skyrim 那樣湊近看，而不是把圖壓扁
      const dots = nodes.map((n) => {
        const p = pos[n.id]; if (!p) return '';
        const sv = stateOf(n);
        return `<g class="sky-node ${sv}" data-skill="${esc(n.id)}" tabindex="0" role="button" aria-label="${esc(n.name)}（${sv}）">`
          + `<circle class="halo" cx="${p.x}" cy="${p.y}" r="22"/><circle class="core" cx="${p.x}" cy="${p.y}" r="${sv === 'unlocked' ? 9 : 7}"/>`
          + `<circle class="hit" cx="${p.x}" cy="${p.y}" r="26"/>`
          + (zoomed ? `<text class="node-label" x="${p.x}" y="${(p.y - 27).toFixed(1)}">${esc(n.name)}</text>` : '') + `</g>`;
      }).join('');
      const maxDepth = Math.max(0, ...nodes.map((n) => (pos[n.id] && pos[n.id].depth) || 0));
      const rings = Array.from({ length: maxDepth + 1 }, (_, i) => {
        const r = 132 + i * 74;
        return `<ellipse class="tier-ring" cx="500" cy="350" rx="${r}" ry="${(r * 0.88).toFixed(0)}"/>`;
      }).join('');
      const hub = `<g class="hub"><circle class="hub-dot" cx="500" cy="350" r="14"/><text x="500" y="344" class="hub-emoji">🤸</text><text x="500" y="376" class="hub-text">HANDSTAND</text></g>`;
      const world = $('tree-world'); if (world) (world as any).innerHTML = rings + hub + edges + dots;
      const vb = this._viewBox as number[];
      const tp = $('tree-points'); if (tp) tp.textContent = pts.available > 0 ? `💥 ${pts.available} 點可花` : `升級才有點數（已花 ${pts.spent}/${pts.total}）`;

      const svg: any = $('skill-tree');
      if (svg && svg.setAttribute && vb) svg.setAttribute('viewBox', `${vb[0]} ${vb[1]} ${(vb[2] - vb[0]).toFixed(0)} ${(vb[3] - vb[1]).toFixed(0)}`);
      if (svg && !svg.__skyBound) {
        svg.__skyBound = 1;
        this._bindTreePan(svg);
        [...(document as any).querySelectorAll('[data-zoom]')].forEach((el: any) => {
          if (!el.__z) { el.__z = 1; el.addEventListener('click', () => this.zoomTree(Number(el.dataset.zoom))); }
        });
      }
      // 節點點擊走事件委託：SVG 每顆星都自己掛 listener 的話，重繪時會累積（重繪頻繁）
      if (svg && !svg.__skyTap) {
        svg.__skyTap = 1;
        svg.addEventListener('click', (ev: any) => {
          const g = ev && ev.target && ev.target.closest ? ev.target.closest('[data-skill]') : null;
          if (g) this.openSkill(g.dataset.skill);
        });
      }
    },

    zoomTree(dir: number) {
      const v = this.treeView;
      if (dir === 0) { v.k = 1; v.x = 0; v.y = 0; }
      else { const nk = v.k * (dir > 0 ? 1.25 : 0.8); v.k = Math.min(4, Math.max(0.5, Number(nk.toFixed(3)))); }
      this.renderTree(this.vm);
    },

    /** 只碰 viewBox/transform，不改資料；touch-action:none 讓雙指不會誤滑到頁面 */
    _bindTreePan(svg) {
      const v = this.treeView; let drag: any = null; let pinch: any = null;
      const world = () => svg.querySelector && svg.querySelector('#tree-world');
      const apply = () => { const w = world(); if (w && w.setAttribute) w.setAttribute('transform', `translate(${v.x} ${v.y}) scale(${v.k.toFixed(3)})`); };
      svg.addEventListener('pointerdown', (ev: any) => {
        if (ev.target && ev.target.closest && ev.target.closest('.sky-node')) return;
        drag = { x: ev.clientX, y: ev.clientY, ox: v.x, oy: v.y };
        if (svg.setPointerCapture) svg.setPointerCapture(ev.pointerId);
      });
      svg.addEventListener('pointermove', (ev: any) => { if (!drag) return; v.x = drag.ox + (ev.clientX - drag.x) * (1.1 / v.k); v.y = drag.oy + (ev.clientY - drag.y) * (1.1 / v.k); apply(); });
      const up = (ev: any) => { if (drag && ev && svg.releasePointerCapture) { try { svg.releasePointerCapture(ev.pointerId); } catch (e) { /* 沒 capture 成功過也沒關係 */ } } drag = null; pinch = null; };
      svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);
      svg.addEventListener('wheel', (ev: any) => { if (ev.preventDefault) ev.preventDefault(); const nk = v.k * (ev.deltaY < 0 ? 1.12 : 0.9); v.k = Math.min(4, Math.max(0.5, Number(nk.toFixed(3)))); apply(); }, { passive: false });
      // 雙指縮放（iOS 上 wheel 不會觸發，一定要這條）
      svg.addEventListener('touchstart', (ev: any) => { const t = ev.touches; if (t && t.length === 2) pinch = Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY); }, { passive: true });
      svg.addEventListener('touchmove', (ev: any) => { const t = ev.touches; if (!pinch || !t || t.length !== 2) return; const d = Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
        const nk = v.k * (d / pinch); v.k = Math.min(4, Math.max(0.5, Number(nk.toFixed(3)))); pinch = d; apply(); if (ev.preventDefault) ev.preventDefault(); }, { passive: false });
    },

    openSkill(skillId) {
      const vm = this.vm; const node = vm.skillNodes.find((n) => n.id === skillId); if (!node) return;
      const st = vm.skillStatuses[skillId] || {};
      const pts = vm.points || { available: 0, total: 0, spent: 0 };
      const un = !!(st.unlocked || node.unlocked);
      const can = !un && (node.requires || []).every((r) => vm.skillStatuses[r] && vm.skillStatuses[r].unlocked)
        && vm.totalXP >= (node.min_xp || 0) && vm.streak.current >= (node.min_streak || 0) && pts.available > 0;
      const why = un ? '已解鎖' : !((node.requires || []).every((r) => vm.skillStatuses[r] && vm.skillStatuses[r].unlocked)) ? '先把前置節點點亮'
        : vm.totalXP < (node.min_xp || 0) ? `XP 不足（需 ${node.min_xp}，目前 ${vm.totalXP}）`
        : pts.available <= 0 ? `沒有技能點：升到 Lv.${(pts.total || 0) + 2} 才會拿到下一點` : '';
      const host = $('skill-modal-content');
      const SK = `<h3 id="sk-title"></h3><p class="hint" id="sk-desc"></p>
        <ul class="req-list" id="sk-req"></ul><p class="hint ex-note" id="sk-warn" hidden></p>
        <label>示範影片 URL<input type="url" id="skill-video" placeholder="https://…"></label>
        <label>筆記<textarea id="skill-notes"></textarea></label>
        <div class="btn-row">
          <button class="btn-primary" id="skill-unlock" type="button">花 1 點解鎖</button>
          <button class="btn-secondary" id="skill-save" type="button">保存</button>
          <button class="btn-secondary" id="skill-close" type="button">關閉</button>
        </div>`;
      // 骨架來自 HTML 的原生 <template>（JS 只填內容，比整段字串拼裝好讀、XSS 面也小）
      const tpl: any = (document as any).getElementById('tpl-skill-detail');
      (host as any).innerHTML = (tpl && tpl.innerHTML) ? tpl.innerHTML : SK;
      const set = (id: string, txt: string) => { const el = $(id); if (el) el.textContent = txt; };
      set('sk-title', `${un ? '✅' : can ? '🔓' : '🔒'} ${node.name}`);
      set('sk-desc', node.desc || '');
      const req = $('sk-req');
      if (req) (req as any).innerHTML = `<li>花費：1 技能點（可用 ${Number(pts.available) || 0}）</li>
        <li>需 XP：${Number(node.min_xp) || 0}（目前 ${vm.totalXP}）</li>
        <li>需連續：${Number(node.min_streak) || 0} 天（目前 ${vm.streak.current}）</li>
        <li>前置：${(node.requires || []).length ? esc(node.requires.join(', ')) : '無'}</li>
        ${st.date_unlocked ? `<li>解鎖日：${esc(st.date_unlocked)}</li>` : ''}`;
      const warn = $('sk-warn'); if (warn) { warn.textContent = why || ''; (warn as any).hidden = !why; }
      if ($('skill-video')) ($('skill-video') as any).value = st.video_url || '';
      if ($('skill-notes')) ($('skill-notes') as any).value = st.notes || '';
      const btn = $('skill-unlock');
      if (btn) { (btn as any).hidden = !!un; (btn as any).disabled = !can; }
      const dlg: any = $('skill-modal'); if (dlg) { dlg.hidden = false; if (dlg.showModal) dlg.showModal(); }
      $('skill-close').onclick = () => this.closeSkillAndRefresh();
      $('skill-save').onclick = async () => {
        await global.DataLayer.setSkillMeta(skillId, { videoUrl: $('skill-video').value, notes: $('skill-notes').value });
        this.toast('已保存'); this.closeSkillAndRefresh();
      };
      if ($('skill-unlock')) $('skill-unlock').onclick = async () => {
        const r = await global.GameEngine.tryUnlockSkill(skillId);
        if (!r.ok) this.toast(r.why === 'no-points' ? '沒有技能點了——今天多練一組再回來' : `無法解鎖：${r.why}${r.need != null ? `（需 ${r.need}）` : ''}`, true);
        else { global.Animations?.confetti?.(); this.toast('解鎖！節點點亮 ＋50 XP'); }
        this.closeSkillAndRefresh();
      };
    },
    closeSkillAndRefresh() { const m: any = $('skill-modal'); if (m) { m.hidden = true; m.close && m.open && m.close(); } this.checks.clear(); this.renderTree(this.vm); },

    renderAchievements(vm) {
      const s = vm.badgeStats || {};
      const cells = [
        ['總 XP', vm.totalXP], ['等級', `Lv.${vm.level.level}`], ['目前連續', `${vm.streak.current} 天`],
        ['最長連續', `${vm.streak.longest} 天`], ['訓練日數', s.total_sessions ?? '—'], ['解鎖技能', vm.unlockedCount],
      ];
      $('stats-grid').innerHTML = cells.map(([k, v]) => `<div class="stat"><span class="stat-k">${esc(k)}</span><span class="stat-v">${esc(v)}</span></div>`).join('');
      $('badge-grid').innerHTML = (vm.badges || []).map((b) => {
        const got = !!vm.badgeStatuses[b.id];
        return `<div class="badge ${got ? 'got' : ''}"><span class="badge-icon">${b.icon}</span>
          <span class="badge-name">${esc(b.name)}</span><span class="badge-desc">${esc(b.desc || '')}</span></div>`;
      }).join('');
      const max = Math.max(1, ...(vm.weekly || []).map((w) => w.sessions));
      $('weekly-chart').innerHTML = (vm.weekly || []).slice().reverse().map((w) => {
        const h = Math.round((w.sessions / max) * 100);
        return `<div class="wbar" title="${esc(w.start)} ~ ${esc(w.end)}：${w.sessions} 次 / ${w.xp} XP">
          <div class="wbar-fill" style="height:${Math.max(4, h)}%"></div><span>${w.sessions}</span></div>`;
      }).join('');
    },

    renderSettings(vm) {
      const st = vm.settings || {};
      if ($('setting-start-date')) $('setting-start-date').value = st.startDate || '';
      if ($('setting-phase')) $('setting-phase').value = String(vm.phase ?? 0);
      if ($('setting-gas-url')) $('setting-gas-url').value = st.gas_url || '';
      if ($('setting-gas-secret')) $('setting-gas-secret').value = st.gas_secret || '';
      const rd = (vm.workoutData?.rest_days || [0, 6]).map((i) => ['日', '一', '二', '三', '四', '五', '六'][i]).join('、');
      const el = $('rest-days-label'); if (el) el.textContent = `休息日：週${rd}（取自 data/workout.json 的 rest_days）`;
      if ($('about-version')) $('about-version').textContent = `v${global.APP_VERSION || 'dev'} · build ${global.BUILD || 'dev'}`;
      if ($('conflict-count')) $('conflict-count').textContent = vm.conflicts ?? 0;
      this.renderSync(global.SyncManager?.state || { status: 'init' });
    },

    renderSync(state) {
      const map = {
        init: ['⏳', '檢查中', 'init'], disabled: ['☁️', '未啟用雲端（純離線）', 'off'],
        syncing: ['🔄', '同步中…', 'busy'], retrying: ['️', '重試中…', 'busy'],
        ok: ['✅', '已同步', 'ok'], error: ['❗', `同步失敗：${state.lastError || ''}`, 'bad'],
        partial: ['🟡', `未推完：${state.lastError || '還有殘留佇列'}`, 'busy'],
      };
      const [icon, text, tone] = map[state.status] || map.init;
      const bar = $('sync-bar'); if (bar) bar.dataset.status = tone;
      if ($('sync-icon')) $('sync-icon').textContent = icon;
      if ($('sync-text')) $('sync-text').textContent = text;
      if ($('sync-status-label')) $('sync-status-label').textContent = text;
      if ($('last-sync-time') && state.lastSyncAt) $('last-sync-time').textContent = new Date(state.lastSyncAt).toLocaleString();
      if ($('pending-sync-count')) $('pending-sync-count').textContent = state.pending ?? '—';
    },

    toast(msg, bad = false) {
      const t = $('toast'); if (!t) return;
      t.textContent = msg; t.className = `toast ${bad ? 'bad' : ''}`; t.hidden = false;
      clearTimeout(this._tt); this._tt = setTimeout(() => { t.hidden = true; }, 2600);
    },

    async refresh() {
      const vm = await global.GameEngine.buildViewModel();
      vm.workoutData = global.GameEngine.workoutData;
      vm.badgeStats = await global.GameEngine.badgeStats();
      vm.conflicts = await global.DataLayer.getConflictCount();
      this.renderAll(vm);
    },
  };

  global.UI = UI;
})(typeof window !== 'undefined' ? window : globalThis);

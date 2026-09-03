// js/ui.js — DOM 渲染（4 個分頁）。只做渲染與事件轉發，業務在 GameEngine/DataLayer。
(function (global) {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const UI = {
    vm: null, checks: new Map(),

    boot() {
      document.querySelectorAll('.tab-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b === btn));
          document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
          $(`tab-${btn.dataset.tab}`)?.classList.add('active');
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
    showOnboarding() { const o = $('onboarding-modal'); if (o) o.hidden = false; },

    renderAll(vm) {
      this.vm = vm;
      this.renderToday(vm); this.renderTree(vm); this.renderAchievements(vm); this.renderSettings(vm);
    },

    renderToday(vm) {
      const p = vm.plan || {};
      $('phase-badge').textContent = `Phase ${vm.phase} · ${esc((vm.workoutData?.phases?.[`phase${vm.phase}`]?.title) || '')}`;
      $('streak-display').textContent = `🔥 ${vm.streak.current} 天（最長 ${vm.streak.longest}）`;
      $('level-title').textContent = `Lv.${vm.level.level} ${esc(vm.level.title)}`;
      $('xp-fill').style.width = `${Math.round((vm.level.progress || 0) * 100)}%`;
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
      const savedByName = new Map((vm.exercises || []).map((e) => [e.exercise_name, e]));
      const rows = exs.map((e, i) => {
        const done = saved ? !!savedByName.get(e.name)?.completed : !!this.checks.get(e.name);
        return `<label class="ex-row ${done ? 'done' : ''}" data-name="${esc(e.name)}">
          <input type="checkbox" data-idx="${i}" ${done ? 'checked' : ''}>
          <span class="ex-main"><span class="ex-name">${esc(e.name)}</span>
            <span class="ex-detail">${esc(e.detail || '')}</span></span>
          <span class="ex-kind">${esc(vm.kindLabels[e.kind] || e.kind || '')}</span>
          <span class="ex-xp">+${Number(e.xp) || 0}</span></label>`;
      }).join('');
      card.innerHTML = `<div class="workout-head"><h3>${esc(vm.plan.dayKey?.toUpperCase() || '')} 訓練日</h3>
        <span class="chip">${exs.length} 項 · ${exs.reduce((s, e) => s + (Number(e.xp) || 0), 0)} XP</span></div>
        <div class="ex-list">${rows}</div>
        ${saved ? `<p class="hint">已儲存 ${esc(saved.log_date)}：完成 ${saved.completed ? '是' : '否'}，可直接修改再存。</p>` : ''}`;

      card.querySelectorAll('input[type=checkbox]').forEach((cb) => {
        cb.addEventListener('change', () => {
          const name = cb.closest('.ex-row').dataset.name;
          this.checks.set(name, cb.checked);
          cb.closest('.ex-row').classList.toggle('done', cb.checked);
        });
      });
      if (saved && !this.checks.size) {
        (vm.exercises || []).forEach((e) => this.checks.set(e.exercise_name, !!e.completed));
      }
      $('quick-note-input').value = saved?.notes || '';
    },

    renderTree(vm) {
      const nodes = vm.skillNodes || [];
      $('tree-progress').textContent = `${vm.unlockedCount} / ${nodes.length} 已解鎖`;
      const byBranch = new Map();
      for (const n of nodes) {
        if (!byBranch.has(n.branch)) byBranch.set(n.branch, { label: n.branch_label, items: [] });
        byBranch.get(n.branch).items.push(n);
      }
      $('skill-tree-container').innerHTML = [...byBranch.values()].map((b) => {
        const done = b.items.filter((n) => vm.skillStatuses[n.id]?.unlocked).length;
        return `<div class="branch"><div class="branch-head"><span>${esc(b.label)}</span>
          <span class="chip">${done}/${b.items.length}</span></div>
          ${b.items.map((n) => {
            const un = !!vm.skillStatuses[n.id]?.unlocked;
            const can = !un && (n.requires || []).every((r) => vm.skillStatuses[r]?.unlocked)
              && vm.totalXP >= (n.min_xp || 0) && (vm.streak.current >= (n.min_streak || 0));
            return `<button class="node ${un ? 'unlocked' : can ? 'ready' : 'locked'}" data-skill="${esc(n.id)}" type="button">
              <span class="node-tier">L${n.tier}</span><span class="node-name">${esc(n.name)}</span>
              <span class="node-mark">${un ? '✅' : can ? '🔓' : '🔒'}</span></button>`;
          }).join('')}</div>`;
      }).join('');
      $('skill-tree-container').querySelectorAll('[data-skill]').forEach((el) => {
        el.addEventListener('click', () => this.openSkill(el.dataset.skill));
      });
    },

    openSkill(skillId) {
      const vm = this.vm; const node = vm.skillNodes.find((n) => n.id === skillId); if (!node) return;
      const st = vm.skillStatuses[skillId] || {};
      $('skill-modal-content').innerHTML = `<h3>${node.unlocked || st.unlocked ? '✅' : '🔒'} ${esc(node.name)}</h3>
        <p class="hint">${esc(node.desc || '')}</p>
        <ul class="req-list">
          <li>需 XP：${node.min_xp || 0}（目前 ${vm.totalXP}）</li>
          <li>需連續：${node.min_streak || 0} 天（目前 ${vm.streak.current}）</li>
          <li>前置：${(node.requires || []).map(esc).join(', ') || '無'}</li>
          ${st.date_unlocked ? `<li>解鎖日：${esc(st.date_unlocked)}</li>` : ''}
        </ul>
        <label>示範影片 URL<input type="url" id="skill-video" value="${esc(st.video_url || '')}" placeholder="https://…"></label>
        <label>筆記<textarea id="skill-notes">${esc(st.notes || '')}</textarea></label>
        <div class="btn-row"><button class="btn-primary" id="skill-save" type="button">保存</button>
        ${st.unlocked ? '' : '<button class="btn-secondary" id="skill-unlock" type="button">標記解鎖 (+50 XP)</button>'}
        <button class="btn-secondary" id="skill-close" type="button">關閉</button></div>`;
      $('skill-modal').hidden = false;
      $('skill-close').onclick = () => this.closeSkillAndRefresh();
      $('skill-save').onclick = async () => {
        await global.DataLayer.setSkillMeta(skillId, { videoUrl: $('skill-video').value, notes: $('skill-notes').value });
        this.toast('已保存'); this.closeSkillAndRefresh();
      };
      if ($('skill-unlock')) $('skill-unlock').onclick = async () => {
        const r = await global.GameEngine.tryUnlockSkill(skillId);
        if (!r.ok) this.toast(`無法解鎖：${r.why}${r.need != null ? `（需 ${r.need}）` : ''}`, true);
        else { global.Animations?.confetti?.(); this.toast('解鎖！+50 XP'); }
        this.closeSkillAndRefresh();
      };
    },
    closeSkillAndRefresh() { const m = $('skill-modal'); if (m) m.hidden = true; this.checks.clear(); },

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

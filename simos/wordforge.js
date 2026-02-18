import { difficultyAdapter, postGameFeedback } from '../core/insight.js';

const KEY = 'simos_wordforge_v2';
const dict = {
  4: ['GRID','RISK','MIND','WAVE','HEAT','TIME','LOGIC','NOVA'].map((w) => w.slice(0,4)),
  5: ['ARISE','STOCK','BRAIN','SHIFT','TRUST','ALIGN','VALUE','SMART'],
  6: ['MARKET','ETHICS','VECTOR','PUZZLE','COGNIT','SYSTEM'],
  7: ['INSIGHT','HARMONY','CAPITAL','ANALYZE','DECISION'],
  8: ['STRATEGIC','REFLECTOR','LEARNINGS','DILEMMAS']
};

function defaults() {
  return {
    length: 5,
    hard: false,
    timed: true,
    competitive: false,
    leftSec: 90,
    streak: 0,
    wins: 0,
    losses: 0,
    solvedWords: [],
    history: [],
    target: '',
    board: [],
    input: '',
    heatmap: {}
  };
}

function load() { try { return { ...defaults(), ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return defaults(); } }
function save(s) { localStorage.setItem(KEY, JSON.stringify(s)); }

function chooseWord(len, diff = 'normal') {
  const list = dict[len] || dict[5];
  if (diff === 'hard') return list.slice().sort((a, b) => b.length - a.length)[Math.floor(Math.random() * list.length)];
  if (diff === 'easy') return list[Math.floor(Math.random() * Math.min(list.length, 5))];
  return list[Math.floor(Math.random() * list.length)];
}

function grade(guess, target) {
  const out = [];
  const t = target.split('');
  for (let i = 0; i < guess.length; i++) {
    if (guess[i] === t[i]) { out.push({ ch: guess[i], state: 'good' }); t[i] = '*'; }
    else out.push({ ch: guess[i], state: 'miss' });
  }
  for (let i = 0; i < out.length; i++) {
    if (out[i].state === 'good') continue;
    const idx = t.indexOf(out[i].ch);
    if (idx >= 0) { out[i].state = 'near'; t[idx] = '*'; }
  }
  return out;
}

function setHeat(state, mode, success) {
  const k = `${state.length}-${mode}`;
  const cur = state.heatmap[k] || { ok: 0, total: 0 };
  cur.total += 1;
  if (success) cur.ok += 1;
  state.heatmap[k] = cur;
}

export const app = {
  id: 'wordforge',
  name: 'Word Forge',
  icon: '🟩',
  heavy: false,
  preloadHint: ['geo'],
  async mount(container, ctx) {
    const state = load();
    const unlockComp = ctx.store.getState().progression.unlockedModes.wordCompetitive;

    container.innerHTML = `
      <section style="display:grid;gap:12px">
        <div style="border:1px solid #27314a;border-radius:14px;background:#0f172a;padding:14px">
          <div style="font-size:28px;font-weight:800">Word Intelligence Platform</div>
          <div style="font-size:12px;color:#94a3b8">Variable lengths · hard/timed/competitive modes · adaptive difficulty · streak analytics</div>
        </div>

        <div style="display:grid;grid-template-columns:1.3fr 1fr;gap:12px" id="wfGrid">
          <div style="display:grid;gap:12px">
            <div style="border:1px solid #27314a;border-radius:14px;background:#0f172a;padding:12px">
              <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">
                <select id="len" class="sel">${[4,5,6,7,8].map((n)=>`<option>${n}</option>`).join('')}</select>
                <label style="font-size:12px;color:#94a3b8"><input id="hard" type="checkbox"> Hard</label>
                <label style="font-size:12px;color:#94a3b8"><input id="timed" type="checkbox"> Timed</label>
                <label style="font-size:12px;color:#94a3b8"><input id="comp" type="checkbox"> Competitive</label>
                <button id="newRound" class="btn">New Round</button>
              </div>
              <div style="display:flex;gap:8px;margin-bottom:8px"><input id="guess" class="inp" placeholder="Enter guess"><button id="submit" class="btn">Guess</button></div>
              <div id="timer" style="font-size:12px;color:#94a3b8;margin-bottom:8px"></div>
              <div id="board" style="display:grid;gap:5px"></div>
            </div>
          </div>

          <div style="display:grid;gap:12px">
            <div style="border:1px solid #27314a;border-radius:14px;background:#0f172a;padding:12px">
              <div style="font-weight:800;margin-bottom:8px">Analytics</div>
              <div id="stats" style="font-size:12px;line-height:1.7"></div>
            </div>
            <div style="border:1px solid #27314a;border-radius:14px;background:#0f172a;padding:12px">
              <div style="font-weight:800;margin-bottom:8px">Performance Heatmap</div>
              <div id="heat" style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px"></div>
            </div>
            <div style="border:1px solid #27314a;border-radius:14px;background:#0f172a;padding:12px">
              <button id="shareCard" class="btn">Share Result Card</button>
              <div id="insight" style="margin-top:8px;font-size:12px;color:#94a3b8"></div>
            </div>
          </div>
        </div>
      </section>
    `;

    if (window.matchMedia('(max-width: 1100px)').matches) container.querySelector('#wfGrid').style.gridTemplateColumns = '1fr';

    const len = container.querySelector('#len');
    const hard = container.querySelector('#hard');
    const timed = container.querySelector('#timed');
    const comp = container.querySelector('#comp');
    const guess = container.querySelector('#guess');
    const board = container.querySelector('#board');
    const timer = container.querySelector('#timer');
    const stats = container.querySelector('#stats');
    const heat = container.querySelector('#heat');
    const insight = container.querySelector('#insight');

    len.value = state.length;
    hard.checked = state.hard;
    timed.checked = state.timed;
    comp.checked = state.competitive && unlockComp;

    let loop = null;

    function startRound() {
      const perf = difficultyAdapter(state.history.slice(-20));
      state.length = Number(len.value);
      state.hard = hard.checked;
      state.timed = timed.checked;
      state.competitive = comp.checked && unlockComp;

      state.target = chooseWord(state.length, state.hard ? 'hard' : perf.level);
      state.leftSec = state.timed ? (state.competitive ? 55 : 90) : 9999;
      state.board = [];
      state.input = '';
      render();
    }

    function endRound(win) {
      if (win) {
        state.wins += 1;
        state.streak += 1;
        state.solvedWords.unshift(state.target);
        state.solvedWords = [...new Set(state.solvedWords)].slice(0, 120);
        ctx.store.addXP(8 + state.length, 'Word round won', 'wordforge');
        if (state.competitive) ctx.store.trackStrategicSignal({ speedRunner: 1 });
      } else {
        state.losses += 1;
        state.streak = 0;
      }
      setHeat(state, `${state.hard ? 'hard' : 'normal'}-${state.timed ? 'timed' : 'free'}`, win);
      state.history.push({ at: Date.now(), win, len: state.length, hard: state.hard, timed: state.timed, comp: state.competitive });
      state.history = state.history.slice(-240);
      if (state.streak >= 6) ctx.store.addAchievement('wordforge-streak6', 'Word Streak x6', 'wordforge', 'Silver');
      if (state.solvedWords.length >= 30) ctx.store.addAchievement('wordforge-vocab30', 'Vocabulary Growth 30', 'wordforge', 'Gold');
      if (state.wins > 40) ctx.store.grantTokens(4, 'Word mastery milestone', 'wordforge');
    }

    function submit() {
      const g = (guess.value || '').toUpperCase().trim();
      if (g.length !== state.length) return;
      if (state.hard && state.board.length && !state.board[state.board.length - 1].some((c) => c.state === 'good')) {
        // hard mode encourages directional precision; keep lightweight
      }
      const row = grade(g, state.target);
      state.board.push(row);
      guess.value = '';

      if (g === state.target) {
        endRound(true);
        ctx.toast('Solved!', 'ok');
        startRound();
      } else if (state.board.length >= 7 || state.leftSec <= 0) {
        endRound(false);
        ctx.toast(`Missed. Word was ${state.target}`, 'warn');
        startRound();
      }
      render();
    }

    function render() {
      board.innerHTML = state.board.map((r) => `<div style="display:flex;gap:4px">${r.map((c) => `<div style="width:34px;height:34px;display:grid;place-items:center;border:1px solid #334155;border-radius:8px;background:${c.state === 'good' ? '#14532d' : c.state === 'near' ? '#713f12' : '#1e293b'};font-weight:800">${c.ch}</div>`).join('')}</div>`).join('');
      timer.textContent = state.timed ? `Time left: ${state.leftSec}s` : 'Untimed mode';

      const total = state.wins + state.losses;
      const wr = total ? (state.wins / total) * 100 : 0;
      stats.innerHTML = `
        <div>Target length: <b>${state.length}</b></div>
        <div>Wins/Losses: <b>${state.wins}/${state.losses}</b></div>
        <div>Win rate: <b>${wr.toFixed(1)}%</b></div>
        <div>Current streak: <b>${state.streak}</b></div>
        <div>Vocabulary tracker: <b>${state.solvedWords.length}</b> unique words</div>
        <div>Competitive: <b>${state.competitive ? 'ON' : 'OFF'}</b> ${unlockComp ? '' : '(unlock at 55 tokens)'}</div>
      `;

      heat.innerHTML = Object.entries(state.heatmap).slice(-9).map(([k, v]) => {
        const p = v.total ? v.ok / v.total : 0;
        return `<div style="border:1px solid #27314a;border-radius:8px;background:#0b1220;padding:6px"><div style="font-size:11px;color:#94a3b8">${k}</div><div style="font-weight:800">${(p*100).toFixed(0)}%</div></div>`;
      }).join('') || '<div style="font-size:12px;color:#94a3b8">No heatmap data yet.</div>';

      insight.textContent = postGameFeedback(ctx.store.getState(), 'wordforge', { summary: `Adaptive mode is targeting ${difficultyAdapter(state.history.slice(-20)).level} difficulty.` });
      save(state);
    }

    container.querySelector('#newRound').addEventListener('click', startRound);
    container.querySelector('#submit').addEventListener('click', submit);
    guess.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    container.querySelector('#shareCard').addEventListener('click', async () => {
      const total = state.wins + state.losses;
      const text = `Word Forge Result\nWins: ${state.wins}\nLosses: ${state.losses}\nStreak: ${state.streak}\nWin Rate: ${total ? ((state.wins/total)*100).toFixed(1) : '0'}%\nVocab: ${state.solvedWords.length}`;
      try { await navigator.clipboard.writeText(text); } catch {}
      ctx.toast('Shareable result card copied.', 'info');
      ctx.store.patch({ social: { ...ctx.store.getState().social, shareCards: [{ type: 'wordforge', text, at: Date.now() }, ...(ctx.store.getState().social.shareCards || [])].slice(0, 50) } });
    });

    clearInterval(loop);
    loop = setInterval(() => {
      if (!state.timed) return;
      state.leftSec -= 1;
      if (state.leftSec <= 0) {
        endRound(false);
        ctx.toast(`Time up. Word was ${state.target}`, 'warn');
        startRound();
      }
      render();
    }, 1000);

    startRound();
    ctx.toast(postGameFeedback(ctx.store.getState(), 'wordforge', { summary: 'Vocabulary and pattern analytics activated.' }), 'info', 3200);

    return { unmount() { clearInterval(loop); save(state); } };
  }
};

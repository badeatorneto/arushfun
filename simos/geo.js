import { difficultyAdapter, postGameFeedback } from '../core/insight.js';

const KEY = 'simos_geo_v2';
const countries = [
  { c: 'Japan', cap: 'Tokyo', flag: '🇯🇵', region: 'asia', lat: 36, lon: 138 },
  { c: 'Brazil', cap: 'Brasilia', flag: '🇧🇷', region: 'americas', lat: -10, lon: -55 },
  { c: 'Canada', cap: 'Ottawa', flag: '🇨🇦', region: 'americas', lat: 56, lon: -106 },
  { c: 'Kenya', cap: 'Nairobi', flag: '🇰🇪', region: 'africa', lat: 0, lon: 37 },
  { c: 'France', cap: 'Paris', flag: '🇫🇷', region: 'europe', lat: 46, lon: 2 },
  { c: 'India', cap: 'New Delhi', flag: '🇮🇳', region: 'asia', lat: 21, lon: 78 },
  { c: 'Mexico', cap: 'Mexico City', flag: '🇲🇽', region: 'americas', lat: 23, lon: -102 },
  { c: 'Egypt', cap: 'Cairo', flag: '🇪🇬', region: 'africa', lat: 26, lon: 30 },
  { c: 'Australia', cap: 'Canberra', flag: '🇦🇺', region: 'oceania', lat: -25, lon: 133 },
  { c: 'Germany', cap: 'Berlin', flag: '🇩🇪', region: 'europe', lat: 51, lon: 10 }
];

function defaults() {
  return {
    mode: 'flags',
    region: 'all',
    dailySeed: new Date().toISOString().slice(0,10),
    score: 0,
    streak: 0,
    bestStreak: 0,
    elo: 1000,
    rounds: 0,
    history: [],
    question: null,
    opts: [],
    startedAt: 0,
    multiplier: 1
  };
}
function load() { try { return { ...defaults(), ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return defaults(); } }
function save(s) { localStorage.setItem(KEY, JSON.stringify(s)); }

function sample(list, n) { return [...list].sort(() => Math.random() - 0.5).slice(0, n); }

function buildQuestion(state) {
  const pool = state.region === 'all' ? countries : countries.filter((x) => x.region === state.region);
  const q = pool[Math.floor(Math.random() * pool.length)];
  let opts = [];
  if (state.mode === 'flags') opts = sample([q.c, ...sample(pool.filter((x) => x.c !== q.c).map((x) => x.c), 3)], 4);
  if (state.mode === 'capitals') opts = sample([q.cap, ...sample(pool.filter((x) => x.c !== q.c).map((x) => x.cap), 3)], 4);
  if (state.mode === 'map') opts = sample(pool.filter((x) => x.c !== q.c), 3).concat([q]).sort(() => Math.random() - 0.5).map((x) => `${x.c} (${x.lat},${x.lon})`);
  if (state.mode === 'blitz') opts = sample([q.c, ...sample(pool.filter((x) => x.c !== q.c).map((x) => x.c), 3)], 4);
  state.question = q;
  state.opts = opts;
  state.startedAt = performance.now();
}

function eloDelta(win, elo) {
  const opp = 1020;
  const expected = 1 / (1 + Math.pow(10, (opp - elo) / 400));
  const score = win ? 1 : 0;
  return Math.round(24 * (score - expected));
}

export const app = {
  id: 'geo',
  name: 'Geo Rush',
  icon: '🗺️',
  heavy: false,
  preloadHint: ['wordforge'],
  async mount(container, ctx) {
    const state = load();
    const unlockedRanked = ctx.store.getState().progression.unlockedModes.geoRanked;

    container.innerHTML = `
      <section style="display:grid;gap:12px">
        <div style="border:1px solid #27314a;border-radius:14px;background:#0f172a;padding:14px">
          <div style="font-size:28px;font-weight:800">Geo Rush Competitive Platform</div>
          <div style="font-size:12px;color:#94a3b8">Modes: Flags, Capitals, Map click, Timed blitz · ELO ranking · streak combos · daily challenge</div>
        </div>

        <div style="display:grid;grid-template-columns:1.4fr 1fr;gap:12px" id="geoGrid">
          <div style="display:grid;gap:12px">
            <div style="border:1px solid #27314a;border-radius:14px;background:#0f172a;padding:12px">
              <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
                <select id="mode" class="sel"><option value="flags">Flags</option><option value="capitals">Capitals</option><option value="map">Map click</option><option value="blitz">Timed blitz</option></select>
                <select id="region" class="sel"><option value="all">All Regions</option><option value="asia">Asia</option><option value="europe">Europe</option><option value="africa">Africa</option><option value="americas">Americas</option><option value="oceania">Oceania</option></select>
                <button id="next" class="btn">Next</button>
                <button id="daily" class="btn alt">Daily Challenge</button>
              </div>
              <div id="prompt" style="font-size:24px;font-weight:800;margin-bottom:10px"></div>
              <div id="options" style="display:grid;gap:8px"></div>
              <div id="feedback" style="margin-top:8px;font-size:12px;color:#94a3b8"></div>
            </div>
          </div>

          <div style="display:grid;gap:12px">
            <div style="border:1px solid #27314a;border-radius:14px;background:#0f172a;padding:12px">
              <div style="font-weight:800;margin-bottom:8px">Rank + XP</div>
              <div id="rank" style="font-size:12px;line-height:1.7"></div>
            </div>
            <div style="border:1px solid #27314a;border-radius:14px;background:#0f172a;padding:12px">
              <div style="font-weight:800;margin-bottom:8px">Global Leaderboard (anonymous sim)</div>
              <div id="board" style="font-size:12px;line-height:1.6"></div>
            </div>
          </div>
        </div>
      </section>
    `;

    if (window.matchMedia('(max-width: 1100px)').matches) container.querySelector('#geoGrid').style.gridTemplateColumns = '1fr';

    const mode = container.querySelector('#mode');
    const region = container.querySelector('#region');
    const prompt = container.querySelector('#prompt');
    const options = container.querySelector('#options');
    const feedback = container.querySelector('#feedback');
    const rank = container.querySelector('#rank');
    const board = container.querySelector('#board');

    mode.value = state.mode;
    region.value = state.region;

    function renderBoard() {
      const names = ['atlas_fox', 'delta_carto', 'north_lens', 'geo_hawk', 'pixel_mapper'];
      const local = { name: ctx.store.getState().auth.handle || 'you', elo: state.elo, score: state.score };
      const rows = names.map((n, i) => ({ name: n, elo: 940 + i * 34 + Math.floor(Math.random()*24), score: 40 + i*8 }))
        .concat([local])
        .sort((a,b) => b.elo - a.elo)
        .slice(0, 8);
      board.innerHTML = rows.map((r, i) => `<div>${i + 1}. ${r.name} · ELO ${r.elo} · Score ${r.score}</div>`).join('');
    }

    function render() {
      const q = state.question;
      prompt.textContent = !q ? 'Loading...' : (state.mode === 'flags' ? q.flag : state.mode === 'capitals' ? q.c : state.mode === 'map' ? `Pick location for ${q.c}` : `Blitz: ${q.flag}`);
      options.innerHTML = state.opts.map((o) => `<button data-o="${o}" style="text-align:left;border:1px solid #334155;background:#111827;color:#e5e7eb;border-radius:10px;padding:10px;cursor:pointer">${o}</button>`).join('');
      options.querySelectorAll('[data-o]').forEach((b) => b.addEventListener('click', () => answer(b.dataset.o)));

      const perf = difficultyAdapter(state.history.slice(-20));
      rank.innerHTML = `
        <div>ELO: <b>${state.elo}</b> ${unlockedRanked ? '' : '<span style="color:#f59e0b">(ranked unlock at 45 tokens)</span>'}</div>
        <div>Score: <b>${state.score}</b></div>
        <div>Streak: <b>${state.streak}</b> (best ${state.bestStreak})</div>
        <div>Rounds: <b>${state.rounds}</b></div>
        <div>Adaptive difficulty: <b>${perf.level}</b></div>
        <div>Speed multiplier: <b>x${state.multiplier.toFixed(2)}</b></div>
      `;
      renderBoard();
    }

    function next() {
      state.mode = mode.value;
      state.region = region.value;
      buildQuestion(state);
      render();
      save(state);
    }

    function answer(val) {
      const q = state.question;
      let correct = false;
      if (state.mode === 'flags' || state.mode === 'blitz') correct = val === q.c;
      if (state.mode === 'capitals') correct = val === q.cap;
      if (state.mode === 'map') correct = val.startsWith(q.c + ' ');

      const ms = performance.now() - state.startedAt;
      const speed = Math.max(0.55, Math.min(1.8, 2800 / Math.max(900, ms)));
      state.multiplier = speed;

      if (correct) {
        state.streak += 1;
        state.bestStreak = Math.max(state.bestStreak, state.streak);
        const gain = Math.round(8 * speed + Math.min(12, state.streak * 0.7));
        state.score += gain;
        ctx.store.addXP(Math.round(4 + gain / 4), 'Geo correct answer', 'geo');
        ctx.store.trackStrategicSignal({ speedRunner: speed > 1.2 ? 1 : 0, analyst: speed <= 1.2 ? 1 : 0 });
      } else {
        state.streak = 0;
      }

      if (unlockedRanked) state.elo += eloDelta(correct, state.elo);
      state.rounds += 1;
      state.history.push({ win: correct, ms, mode: state.mode, at: Date.now() });
      state.history = state.history.slice(-180);

      if (state.bestStreak >= 7) ctx.store.addAchievement('geo-streak-7', 'Geo Combo x7', 'geo', 'Silver');
      if (state.elo >= 1150) ctx.store.addAchievement('geo-elo-1150', 'Geo Ranked 1150', 'geo', 'Gold');
      if (state.score > 240) ctx.store.grantTokens(3, 'Geo session milestone', 'geo');

      feedback.textContent = correct ? `Correct. +${Math.round(8 * speed)} points (speed x${speed.toFixed(2)}).` : `Incorrect. Correct answer: ${state.mode === 'capitals' ? q.cap : q.c}`;
      render();
      save(state);
      setTimeout(next, state.mode === 'blitz' ? 240 : 650);
    }

    container.querySelector('#next').addEventListener('click', next);
    container.querySelector('#daily').addEventListener('click', () => {
      const day = new Date().toISOString().slice(0,10);
      state.dailySeed = day;
      const idx = day.split('-').join('').split('').reduce((a,b)=>a+Number(b),0) % countries.length;
      const q = countries[idx];
      state.mode = 'flags';
      state.region = q.region;
      state.question = q;
      state.opts = sample([q.c, ...sample(countries.filter((x)=>x.c!==q.c).map((x)=>x.c),3)],4);
      state.startedAt = performance.now();
      feedback.textContent = `Daily challenge for ${day}`;
      render();
      ctx.store.addXP(6, 'Opened daily geo challenge', 'geo');
    });

    next();
    ctx.toast(postGameFeedback(ctx.store.getState(), 'geo', { summary: 'Competitive geography telemetry enabled.' }), 'info', 3200);
    return { unmount() { save(state); } };
  }
};

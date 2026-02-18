import { drawLineChart } from '../lib/charts.js';
import { postGameFeedback } from '../core/insight.js';

const KEY = 'simos_lifearc_v2';

function defaults() {
  return {
    profileA: { sleep: 7, diet: 6, exercise: 3, stress: 6, smoking: 0, alcohol: 3 },
    profileB: { sleep: 6, diet: 4, exercise: 1, stress: 8, smoking: 1, alcohol: 6 },
    compare: 0.5,
    resultA: null,
    resultB: null
  };
}

function load() {
  try { return { ...defaults(), ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { return defaults(); }
}
function save(s) { localStorage.setItem(KEY, JSON.stringify(s)); }

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function riskModel(p, age) {
  const sleepPenalty = Math.abs(7.5 - p.sleep) * 0.8;
  const lifestyle = (10 - p.diet) * 1.1 + (4 - p.exercise) * 1.5 + p.stress * 1.2 + p.smoking * 7 + p.alcohol * 0.8 + sleepPenalty;
  const ageFactor = (age - 25) * 0.34;
  const base = lifestyle + ageFactor;
  return {
    cardio: clamp(3 + base * 0.62, 0, 100),
    metabolic: clamp(4 + base * 0.54, 0, 100),
    cognitive: clamp(2 + (p.stress * 1.6 + p.sleep < 6 ? 8 : 0) + (age - 25) * 0.24, 0, 100),
    mood: clamp(6 + p.stress * 2 + (8 - p.sleep) * 1.6 + p.alcohol * 0.7, 0, 100)
  };
}

function monteCarlo(profile, runs = 220) {
  const out = [];
  for (let r = 0; r < runs; r++) {
    let health = 84;
    let aging = 0;
    for (let age = 25; age <= 85; age++) {
      const rp = riskModel(profile, age);
      const aggregate = (rp.cardio + rp.metabolic + rp.cognitive + rp.mood) / 4;
      const noise = (Math.random() - 0.5) * 3.8;
      health = clamp(health - aggregate * 0.035 + profile.exercise * 0.08 + profile.diet * 0.05 + noise, 0, 100);
      aging += (100 - health) * 0.011;
    }
    out.push({ health, biologicalAgeDelta: aging });
  }
  out.sort((a, b) => a.health - b.health);
  const p = (q) => out[Math.floor(q * (out.length - 1))];
  return { p10: p(0.1), p50: p(0.5), p90: p(0.9), samples: out };
}

function longImpact(profile) {
  const points = [];
  let score = 82;
  for (let age = 25; age <= 85; age++) {
    const r = riskModel(profile, age);
    const aggregate = (r.cardio + r.metabolic + r.cognitive + r.mood) / 4;
    score = clamp(score - aggregate * 0.05 + profile.exercise * 0.1 + profile.diet * 0.08 + (profile.sleep - 6.8) * 0.4, 0, 100);
    points.push({ age, score, risks: r });
  }
  return points;
}

export const app = {
  id: 'lifearc',
  name: 'Life Arc',
  icon: '🧬',
  heavy: true,
  preloadHint: ['persona'],
  async mount(container, ctx) {
    const state = load();

    container.innerHTML = `
      <section style="display:grid;gap:12px">
        <div style="border:1px solid #27314a;border-radius:14px;background:#0f172a;padding:14px">
          <div style="font-size:28px;font-weight:800">Lifestyle Risk Simulation Engine</div>
          <div style="font-size:12px;color:#94a3b8">Risk probability modeling · scenario comparison slider · Monte Carlo preview · preventative impact score</div>
        </div>

        <div style="display:grid;grid-template-columns:1.4fr 1fr;gap:12px" id="arcGrid">
          <div style="display:grid;gap:12px">
            <div style="border:1px solid #27314a;border-radius:14px;background:#0f172a;padding:12px" id="inputsWrap"></div>
            <div style="border:1px solid #27314a;border-radius:14px;background:#0f172a;padding:12px">
              <div style="font-weight:800;margin-bottom:8px">Long-Term Impact Graph</div>
              <canvas id="impactChart" width="960" height="190" style="width:100%;height:190px;background:#0b1220;border:1px solid #27314a;border-radius:10px"></canvas>
            </div>
            <div style="border:1px solid #27314a;border-radius:14px;background:#0f172a;padding:12px">
              <div style="font-weight:800;margin-bottom:8px">Visual Aging Timeline</div>
              <div id="agingTimeline" style="display:grid;grid-template-columns:repeat(8,1fr);gap:6px"></div>
            </div>
          </div>

          <div style="display:grid;gap:12px">
            <div style="border:1px solid #27314a;border-radius:14px;background:#0f172a;padding:12px">
              <div style="font-weight:800;margin-bottom:8px">Monte Carlo Preview</div>
              <div id="mc" style="font-size:12px;line-height:1.7"></div>
            </div>
            <div style="border:1px solid #27314a;border-radius:14px;background:#0f172a;padding:12px">
              <div style="font-weight:800;margin-bottom:8px">Preventative Impact Score</div>
              <div id="preventScore" style="font-size:12px"></div>
            </div>
            <div style="border:1px solid #27314a;border-radius:14px;background:#0f172a;padding:12px">
              <div style="font-weight:800;margin-bottom:8px">Insight</div>
              <div id="insight" style="font-size:12px;color:#94a3b8"></div>
            </div>
          </div>
        </div>
      </section>
    `;

    if (window.matchMedia('(max-width: 1160px)').matches) container.querySelector('#arcGrid').style.gridTemplateColumns = '1fr';

    const inputsWrap = container.querySelector('#inputsWrap');
    const chart = container.querySelector('#impactChart');
    const timeline = container.querySelector('#agingTimeline');
    const mc = container.querySelector('#mc');
    const prevent = container.querySelector('#preventScore');
    const insight = container.querySelector('#insight');

    function renderInputs() {
      const field = (p, id, label, min, max, step = 1) => `<label style="display:grid;gap:4px;font-size:11px;color:#94a3b8">${label}<input data-p="${p}" data-id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${state[p][id]}"><span>${state[p][id]}</span></label>`;
      inputsWrap.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><div style="font-weight:800">Scenario A vs B</div><label style="font-size:12px;color:#94a3b8">Comparison slider <input id="cmp" type="range" min="0" max="100" value="${Math.round(state.compare*100)}"></label></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div style="border:1px solid #27314a;border-radius:10px;padding:8px;display:grid;gap:6px"><div style="font-weight:700">Scenario A</div>${field('profileA','sleep','Sleep',4,9,.5)}${field('profileA','diet','Diet',1,10)}${field('profileA','exercise','Exercise',0,7)}${field('profileA','stress','Stress',1,10)}${field('profileA','smoking','Smoking',0,1)}${field('profileA','alcohol','Alcohol',0,10)}</div>
          <div style="border:1px solid #27314a;border-radius:10px;padding:8px;display:grid;gap:6px"><div style="font-weight:700">Scenario B</div>${field('profileB','sleep','Sleep',4,9,.5)}${field('profileB','diet','Diet',1,10)}${field('profileB','exercise','Exercise',0,7)}${field('profileB','stress','Stress',1,10)}${field('profileB','smoking','Smoking',0,1)}${field('profileB','alcohol','Alcohol',0,10)}</div>
        </div>
      `;
      inputsWrap.querySelectorAll('input[data-p]').forEach((el) => {
        el.addEventListener('input', () => {
          const p = el.dataset.p, id = el.dataset.id;
          state[p][id] = Number(el.value);
          el.nextElementSibling.textContent = el.value;
          run();
        });
      });
      inputsWrap.querySelector('#cmp').addEventListener('input', (e) => {
        state.compare = Number(e.target.value) / 100;
        run();
      });
    }

    function run() {
      state.resultA = longImpact(state.profileA);
      state.resultB = longImpact(state.profileB);

      const blend = state.resultA.map((a, i) => a.score * state.compare + state.resultB[i].score * (1 - state.compare));
      drawLineChart(chart, blend, '#38bdf8');

      const mcA = monteCarlo(state.profileA);
      const mcB = monteCarlo(state.profileB);
      const scoreA = ((state.profileA.sleep / 9) * 14 + (state.profileA.diet / 10) * 24 + (state.profileA.exercise / 7) * 24 + ((11 - state.profileA.stress) / 10) * 24 + (1 - state.profileA.smoking) * 8 + ((10 - state.profileA.alcohol) / 10) * 6);
      const scoreB = ((state.profileB.sleep / 9) * 14 + (state.profileB.diet / 10) * 24 + (state.profileB.exercise / 7) * 24 + ((11 - state.profileB.stress) / 10) * 24 + (1 - state.profileB.smoking) * 8 + ((10 - state.profileB.alcohol) / 10) * 6);

      mc.innerHTML = `
        <div>A median end-health: <b>${mcA.p50.health.toFixed(1)}</b> (10-90: ${mcA.p10.health.toFixed(1)} - ${mcA.p90.health.toFixed(1)})</div>
        <div>B median end-health: <b>${mcB.p50.health.toFixed(1)}</b> (10-90: ${mcB.p10.health.toFixed(1)} - ${mcB.p90.health.toFixed(1)})</div>
      `;

      prevent.innerHTML = `
        <div>Scenario A score: <b>${scoreA.toFixed(1)}/100</b></div>
        <div>Scenario B score: <b>${scoreB.toFixed(1)}/100</b></div>
      `;

      const mark = [25, 35, 45, 55, 65, 75, 85];
      timeline.innerHTML = mark.map((age) => {
        const a = state.resultA.find((x) => x.age === age) || state.resultA[state.resultA.length - 1];
        const b = state.resultB.find((x) => x.age === age) || state.resultB[state.resultB.length - 1];
        const mix = a.score * state.compare + b.score * (1 - state.compare);
        const color = mix > 70 ? '#34d399' : mix > 50 ? '#f59e0b' : '#f87171';
        return `<div style="border:1px solid #27314a;border-radius:8px;background:#0b1220;padding:8px"><div style="font-size:11px;color:#94a3b8">Age ${age}</div><div style="font-size:16px;font-weight:800;color:${color}">${mix.toFixed(1)}</div></div>`;
      }).join('');

      insight.textContent = postGameFeedback(ctx.store.getState(), 'lifearc', { summary: `Scenario blend indicates ${(state.compare*100).toFixed(0)}% weight toward profile A.` });

      ctx.store.addXP(8, 'Ran lifestyle risk simulation', 'lifearc');
      ctx.store.trackStrategicSignal({ analyst: 1 });
      if (scoreA > 78 || scoreB > 78) ctx.store.addAchievement('lifearc-prevent', 'Preventative Planner', 'lifearc', 'Silver');
      save(state);
    }

    renderInputs();
    run();

    return { unmount() { save(state); } };
  }
};

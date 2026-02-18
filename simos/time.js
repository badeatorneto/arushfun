import { drawLineChart } from '../lib/charts.js';
import { postGameFeedback } from '../core/insight.js';

const KEY = 'simos_time_v1';

const careers = {
  consultant: { name: 'Consulting Track', salary: 95000, growth: 0.082, stress: 0.72, purpose: 0.52 },
  founder: { name: 'Founder Track', salary: 72000, growth: 0.135, stress: 0.85, purpose: 0.76 },
  researcher: { name: 'Research Track', salary: 68000, growth: 0.062, stress: 0.48, purpose: 0.81 },
  policy: { name: 'Policy Track', salary: 74000, growth: 0.058, stress: 0.57, purpose: 0.73 },
  creator: { name: 'Creator Track', salary: 60000, growth: 0.12, stress: 0.66, purpose: 0.69 }
};

function seed() {
  return {
    startAge: 22,
    horizon: 85,
    career: 'consultant',
    hours: 52,
    savingsRate: 0.28,
    healthInvestment: 0.45,
    valueAlignment: 0.62,
    branching: [
      { age: 30, shift: 'stay' },
      { age: 40, shift: 'stay' },
      { age: 52, shift: 'stay' }
    ],
    result: null
  };
}

function load() {
  try { return { ...seed(), ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { return seed(); }
}
function save(s) { localStorage.setItem(KEY, JSON.stringify(s)); }

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function pickBranch(baseCareer, branch, age) {
  if (branch.shift === 'pivot-purpose') return age >= 40 ? 'policy' : 'researcher';
  if (branch.shift === 'pivot-upside') return age >= 40 ? 'founder' : 'creator';
  if (branch.shift === 'sabbatical') return baseCareer;
  return baseCareer;
}

function simulate(cfg) {
  let wealth = 0;
  let happiness = 62;
  let health = 78;
  let burnout = 8;
  let regret = 12;
  let activeCareer = cfg.career;
  const life = [];
  const heat = [];
  const branchMap = Object.fromEntries(cfg.branching.map((b) => [b.age, b.shift]));

  for (let age = cfg.startAge; age <= cfg.horizon; age++) {
    const c = careers[activeCareer];

    if (branchMap[age]) {
      const shift = branchMap[age];
      if (shift === 'sabbatical') {
        wealth *= 1.01;
        burnout = Math.max(0, burnout - 10);
        happiness += 4;
        health += 3;
        regret -= 2;
      } else {
        activeCareer = pickBranch(activeCareer, { shift }, age);
      }
    }

    const career = careers[activeCareer];
    const yearsIn = age - cfg.startAge;
    const salary = career.salary * Math.pow(1 + career.growth, yearsIn);
    const investReturn = 0.028 + cfg.healthInvestment * 0.022 + (1 - burnout / 120) * 0.018;
    wealth = wealth * (1 + investReturn) + salary * cfg.savingsRate;

    const overwork = Math.max(0, cfg.hours - 44) / 10;
    burnout = clamp(burnout + career.stress * 1.9 + overwork * 1.7 - cfg.healthInvestment * 2.3 - (cfg.valueAlignment - .5) * 1.1, 0, 100);
    health = clamp(health - 0.53 - overwork * 0.8 + cfg.healthInvestment * 1.1 - burnout * 0.02, 5, 100);
    happiness = clamp(58 + career.purpose * 18 + cfg.valueAlignment * 20 - burnout * 0.42 + Math.log10(Math.max(1000, wealth)) * 3.1 + health * 0.12, 0, 100);

    const mismatch = Math.abs(cfg.valueAlignment - career.purpose);
    regret = clamp(regret + mismatch * 1.2 + (burnout > 70 ? 1.4 : 0) - (happiness > 72 ? 0.7 : 0), 0, 100);

    life.push({ age, career: activeCareer, wealth, happiness, health, burnout, regret });
    heat.push({ age, stress: burnout, joy: happiness, vitality: health, regret });
  }

  return {
    life,
    heat,
    summary: {
      finalWealth: wealth,
      avgHappiness: life.reduce((a, b) => a + b.happiness, 0) / life.length,
      avgHealth: life.reduce((a, b) => a + b.health, 0) / life.length,
      burnoutPeak: Math.max(...life.map((x) => x.burnout)),
      regretFinal: life[life.length - 1].regret
    }
  };
}

export const app = {
  id: 'time',
  name: 'Life Trajectory',
  icon: '⏳',
  heavy: true,
  preloadHint: ['lifearc'],
  async mount(container, ctx) {
    const state = load();

    container.innerHTML = `
      <section style="display:grid;gap:12px">
        <div style="border:1px solid #27314a;border-radius:14px;background:#0f172a;padding:14px">
          <div style="font-size:28px;font-weight:800">Long-Term Life Trajectory Simulator</div>
          <div style="font-size:12px;color:#94a3b8">Career branching · burnout mechanics · wealth accumulation · happiness/health/regret projection</div>
        </div>

        <div style="display:grid;grid-template-columns:1.35fr 1fr;gap:12px" id="timeGrid">
          <div style="display:grid;gap:12px">
            <div style="border:1px solid #27314a;border-radius:14px;background:#0f172a;padding:12px">
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px">
                <label class="field">Career<select id="careerSel">${Object.entries(careers).map(([k,v]) => `<option value="${k}">${v.name}</option>`).join('')}</select></label>
                <label class="field">Hours / week<input id="hours" type="range" min="30" max="80" value="${state.hours}"><span id="hoursVal"></span></label>
                <label class="field">Savings rate<input id="saveRate" type="range" min="5" max="60" value="${Math.round(state.savingsRate*100)}"><span id="saveVal"></span></label>
                <label class="field">Health investment<input id="healthInv" type="range" min="0" max="100" value="${Math.round(state.healthInvestment*100)}"><span id="healthVal"></span></label>
                <label class="field">Value alignment<input id="align" type="range" min="0" max="100" value="${Math.round(state.valueAlignment*100)}"><span id="alignVal"></span></label>
              </div>
              <div style="margin-top:8px;display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
                <label class="field">Age 30 branch<select id="b30"><option value="stay">Stay</option><option value="pivot-purpose">Pivot Purpose</option><option value="pivot-upside">Pivot Upside</option><option value="sabbatical">Sabbatical</option></select></label>
                <label class="field">Age 40 branch<select id="b40"><option value="stay">Stay</option><option value="pivot-purpose">Pivot Purpose</option><option value="pivot-upside">Pivot Upside</option><option value="sabbatical">Sabbatical</option></select></label>
                <label class="field">Age 52 branch<select id="b52"><option value="stay">Stay</option><option value="pivot-purpose">Pivot Purpose</option><option value="pivot-upside">Pivot Upside</option><option value="sabbatical">Sabbatical</option></select></label>
              </div>
              <div style="display:flex;gap:8px;margin-top:10px"><button id="runSim" class="btn">Run Projection</button><button id="insightBtn" class="btn alt">Insight Mode</button></div>
            </div>

            <div style="border:1px solid #27314a;border-radius:14px;background:#0f172a;padding:12px">
              <div style="font-weight:800;margin-bottom:8px">Wealth Curve</div>
              <canvas id="wealthChart" width="960" height="190" style="width:100%;height:190px;background:#0b1220;border:1px solid #27314a;border-radius:10px"></canvas>
            </div>

            <div style="border:1px solid #27314a;border-radius:14px;background:#0f172a;padding:12px">
              <div style="font-weight:800;margin-bottom:8px">Decision Heatmap</div>
              <div id="heatmap" style="display:grid;grid-template-columns:repeat(16,1fr);gap:3px"></div>
            </div>
          </div>

          <div style="display:grid;gap:12px">
            <div style="border:1px solid #27314a;border-radius:14px;background:#0f172a;padding:12px">
              <div style="font-weight:800;margin-bottom:8px">Projection Summary</div>
              <div id="summary" style="font-size:12px;line-height:1.65"></div>
            </div>
            <div style="border:1px solid #27314a;border-radius:14px;background:#0f172a;padding:12px">
              <div style="font-weight:800;margin-bottom:8px">Life Timeline</div>
              <div id="timeline" style="font-size:12px;max-height:420px;overflow:auto;display:grid;gap:6px"></div>
            </div>
          </div>
        </div>
      </section>
    `;

    if (window.matchMedia('(max-width: 1160px)').matches) container.querySelector('#timeGrid').style.gridTemplateColumns = '1fr';

    const fields = {
      careerSel: container.querySelector('#careerSel'),
      hours: container.querySelector('#hours'),
      saveRate: container.querySelector('#saveRate'),
      healthInv: container.querySelector('#healthInv'),
      align: container.querySelector('#align'),
      b30: container.querySelector('#b30'),
      b40: container.querySelector('#b40'),
      b52: container.querySelector('#b52')
    };

    fields.careerSel.value = state.career;
    fields.b30.value = state.branching.find((b) => b.age === 30)?.shift || 'stay';
    fields.b40.value = state.branching.find((b) => b.age === 40)?.shift || 'stay';
    fields.b52.value = state.branching.find((b) => b.age === 52)?.shift || 'stay';

    const wealthChart = container.querySelector('#wealthChart');
    const heatmap = container.querySelector('#heatmap');
    const summary = container.querySelector('#summary');
    const timeline = container.querySelector('#timeline');

    function pullForm() {
      state.career = fields.careerSel.value;
      state.hours = Number(fields.hours.value);
      state.savingsRate = Number(fields.saveRate.value) / 100;
      state.healthInvestment = Number(fields.healthInv.value) / 100;
      state.valueAlignment = Number(fields.align.value) / 100;
      state.branching = [
        { age: 30, shift: fields.b30.value },
        { age: 40, shift: fields.b40.value },
        { age: 52, shift: fields.b52.value }
      ];
    }

    function syncLabels() {
      container.querySelector('#hoursVal').textContent = `${fields.hours.value}h`;
      container.querySelector('#saveVal').textContent = `${fields.saveRate.value}%`;
      container.querySelector('#healthVal').textContent = `${fields.healthInv.value}%`;
      container.querySelector('#alignVal').textContent = `${fields.align.value}%`;
    }

    function renderResult() {
      if (!state.result) return;
      const { life, summary: s } = state.result;
      drawLineChart(wealthChart, life.map((x) => x.wealth), '#facc15');

      const step = Math.max(1, Math.floor(life.length / 96));
      heatmap.innerHTML = life.filter((_, i) => i % step === 0).map((x) => {
        const stress = Math.round(x.burnout);
        const c = `rgba(${Math.min(255, 80 + stress*2)},${Math.max(40, 220-stress*1.6)},120,.92)`;
        return `<div title="Age ${x.age} | Burnout ${x.burnout.toFixed(0)}" style="height:16px;border-radius:4px;background:${c}"></div>`;
      }).join('');

      summary.innerHTML = `
        <div>Final wealth: <b>$${Math.round(s.finalWealth).toLocaleString()}</b></div>
        <div>Avg happiness: <b>${s.avgHappiness.toFixed(1)}</b></div>
        <div>Avg health: <b>${s.avgHealth.toFixed(1)}</b></div>
        <div>Burnout peak: <b>${s.burnoutPeak.toFixed(1)}</b></div>
        <div>Regret projection: <b>${s.regretFinal.toFixed(1)}</b></div>
      `;

      timeline.innerHTML = life.filter((x) => [22, 30, 40, 52, 65, 75, 85].includes(x.age)).map((x) => `
        <div style="border:1px solid #27314a;background:#0b1220;border-radius:8px;padding:8px">
          <b>Age ${x.age}</b> · ${careers[x.career].name}
          <div style="color:#94a3b8">Wealth $${Math.round(x.wealth).toLocaleString()} · Happiness ${x.happiness.toFixed(0)} · Health ${x.health.toFixed(0)} · Burnout ${x.burnout.toFixed(0)} · Regret ${x.regret.toFixed(0)}</div>
        </div>
      `).join('');
    }

    function run() {
      pullForm();
      state.result = simulate(state);
      renderResult();
      const r = state.result.summary;
      if (r.finalWealth > 2500000) ctx.store.addAchievement('time-wealth-gold', 'Long-Horizon Capital Builder', 'time', 'Gold');
      if (r.avgHappiness > 70 && r.avgHealth > 70) ctx.store.addAchievement('time-balance', 'Balanced Life Architect', 'time', 'Silver');
      ctx.store.addXP(14, 'Ran life trajectory simulation', 'time');
      ctx.store.grantTokens(2, 'Trajectory simulation complete', 'time');
      ctx.store.trackStrategicSignal({ analyst: 1, optimizer: 1 });
      save(state);
    }

    container.querySelector('#runSim').addEventListener('click', run);
    container.querySelector('#insightBtn').addEventListener('click', () => {
      ctx.store.incrementInsightRuns();
      const msg = postGameFeedback(ctx.store.getState(), 'time', { summary: state.result ? `Projected regret ${state.result.summary.regretFinal.toFixed(1)}.` : 'Run a projection first.' });
      ctx.toast(msg, 'info', 4200);
    });

    [fields.hours, fields.saveRate, fields.healthInv, fields.align].forEach((el) => el.addEventListener('input', syncLabels));
    syncLabels();
    run();

    return { unmount() { save(state); } };
  }
};

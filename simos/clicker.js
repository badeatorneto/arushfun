import { drawLineChart } from '../lib/charts.js';
import { postGameFeedback } from '../core/insight.js';

const KEY = 'simos_clicker_v2';
const tiers = [
  { id: 'gold', name: 'Gold', base: 1 },
  { id: 'industry', name: 'Industry', base: 8 },
  { id: 'tech', name: 'Tech', base: 64 },
  { id: 'ai', name: 'AI', base: 480 },
  { id: 'civ', name: 'Civilization', base: 3200 }
];

function defaults() {
  return {
    resources: { gold: 0, industry: 0, tech: 0, ai: 0, civ: 0 },
    generators: { miner: 0, factory: 0, lab: 0, cluster: 0, senate: 0 },
    rates: { gold: 1, industry: 0, tech: 0, ai: 0, civ: 0 },
    multiplier: 1,
    prestige: 0,
    skills: { compounding: false, leverage: false, hedging: false, delegation: false },
    automation: { rebalance: false, autoInvest: false },
    investment: { mode: 'balanced', exposure: 0.5 },
    event: null,
    eventEndsAt: 0,
    chart: [],
    lastTick: Date.now(),
    totalEarned: 0
  };
}

function load() {
  try { return { ...defaults(), ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { return defaults(); }
}
function save(state) { localStorage.setItem(KEY, JSON.stringify(state)); }

function genIncome(s) {
  const g = s.generators;
  const skill = 1 + (s.skills.compounding ? 0.2 : 0) + (s.skills.delegation ? 0.18 : 0);
  const risk = s.investment.mode === 'aggressive' ? 1.25 : s.investment.mode === 'defensive' ? 0.86 : 1;
  const eventBoost = s.event ? s.event.mult : 1;
  return {
    gold: (1 + g.miner * 1.2) * s.multiplier * skill * risk * eventBoost,
    industry: (g.factory * 0.15 + g.miner * 0.02) * s.multiplier * skill * eventBoost,
    tech: (g.lab * 0.08 + g.factory * 0.012) * s.multiplier * skill * eventBoost,
    ai: (g.cluster * 0.03 + g.lab * 0.008) * s.multiplier * skill * eventBoost,
    civ: (g.senate * 0.01 + g.cluster * 0.003) * s.multiplier * skill * eventBoost
  };
}

function applyTick(s, dtSec) {
  const rate = genIncome(s);
  Object.keys(rate).forEach((k) => {
    const delta = rate[k] * dtSec;
    s.resources[k] += delta;
    s.totalEarned += delta * (tiers.find((t) => t.id === k)?.base || 1);
  });
  s.rates = rate;
}

function maybeEvent(s) {
  const now = Date.now();
  if (s.event && now > s.eventEndsAt) {
    s.event = null;
  }
  if (!s.event && Math.random() < 0.06) {
    const pool = [
      { name: 'Commodity Boom', mult: 1.32, note: 'Raw materials surge' },
      { name: 'Regulatory Crackdown', mult: 0.72, note: 'Production throttled' },
      { name: 'AI Breakthrough', mult: 1.5, note: 'Automation accelerates' }
    ];
    s.event = pool[Math.floor(Math.random() * pool.length)];
    s.eventEndsAt = now + 30000;
  }
}

export const app = {
  id: 'clicker',
  name: 'Clicker Economy',
  icon: '🏭',
  heavy: true,
  preloadHint: ['stock'],
  async mount(container, ctx) {
    let state = load();
    const persona = ctx.store.getState().profile.personaImpact || {};

    const elapsed = Math.max(0, (Date.now() - (state.lastTick || Date.now())) / 1000);
    if (elapsed > 3) {
      applyTick(state, Math.min(elapsed, 60 * 60 * 8));
      ctx.store.addXP(Math.min(80, Math.floor(elapsed / 20)), 'Offline progress', 'clicker');
    }
    state.lastTick = Date.now();

    container.innerHTML = `
      <section style="display:grid;gap:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;border:1px solid #27314a;border-radius:14px;padding:14px;background:#0f172a">
          <div>
            <div style="font-size:28px;font-weight:800">Multi-Layer Idle Economy</div>
            <div style="color:#94a3b8;font-size:13px">Gold → Industry → Tech → AI → Civilization</div>
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <button id="clickGold" style="border:1px solid #334155;background:#111827;color:#e5e7eb;border-radius:10px;padding:10px 12px;font-weight:700;cursor:pointer">Mine Gold (+1)</button>
            <button id="prestige" style="border:1px solid #f59e0b;background:#f59e0b;color:#111827;border-radius:10px;padding:10px 12px;font-weight:800;cursor:pointer">Prestige Reset</button>
            <button id="clickerInsight" style="border:1px solid #334155;background:#0b1220;color:#93c5fd;border-radius:10px;padding:10px 12px;font-weight:700;cursor:pointer">Insight</button>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:2fr 1fr;gap:12px" id="layoutGrid">
          <div style="display:grid;gap:12px">
            <div style="border:1px solid #27314a;border-radius:14px;padding:12px;background:#0f172a">
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px" id="resourceCards"></div>
            </div>

            <div style="border:1px solid #27314a;border-radius:14px;padding:12px;background:#0f172a">
              <div style="font-weight:800;margin-bottom:8px">Automation + Investment Layer</div>
              <div style="display:flex;gap:8px;flex-wrap:wrap">
                <button data-auto="rebalance" class="ctrl">Auto Rebalance</button>
                <button data-auto="autoInvest" class="ctrl">Auto Invest</button>
                <select id="invMode" style="border:1px solid #334155;background:#111827;color:#e5e7eb;border-radius:8px;padding:8px">
                  <option value="defensive">Defensive</option>
                  <option value="balanced">Balanced</option>
                  <option value="aggressive">Aggressive</option>
                </select>
              </div>
              <div style="margin-top:8px;color:#94a3b8;font-size:12px" id="eventLine"></div>
            </div>

            <div style="border:1px solid #27314a;border-radius:14px;padding:12px;background:#0f172a">
              <div style="font-weight:800;margin-bottom:8px">Income Graph (Real-time)</div>
              <canvas id="incomeChart" width="860" height="180" style="width:100%;height:180px;background:#0b1220;border:1px solid #27314a;border-radius:10px"></canvas>
            </div>
          </div>

          <div style="display:grid;gap:12px">
            <div style="border:1px solid #27314a;border-radius:14px;padding:12px;background:#0f172a">
              <div style="font-weight:800;margin-bottom:8px">Skill Tree</div>
              <div id="skillTree" style="display:grid;gap:8px"></div>
            </div>
            <div style="border:1px solid #27314a;border-radius:14px;padding:12px;background:#0f172a">
              <div style="font-weight:800;margin-bottom:8px">Optimization Dashboard</div>
              <div id="optimizer" style="font-size:12px;color:#94a3b8;line-height:1.6"></div>
            </div>
            <div style="border:1px solid #27314a;border-radius:14px;padding:12px;background:#0f172a">
              <div style="font-weight:800;margin-bottom:8px">Generator Upgrades</div>
              <div id="genList" style="display:grid;gap:6px"></div>
            </div>
          </div>
        </div>
      </section>
    `;

    if (window.matchMedia('(max-width: 1100px)').matches) {
      container.querySelector('#layoutGrid').style.gridTemplateColumns = '1fr';
    }

    const resourceCards = container.querySelector('#resourceCards');
    const skillTree = container.querySelector('#skillTree');
    const genList = container.querySelector('#genList');
    const optimizer = container.querySelector('#optimizer');
    const eventLine = container.querySelector('#eventLine');
    const chart = container.querySelector('#incomeChart');

    function upgradeCost(id) {
      const g = state.generators;
      const map = { miner: 25, factory: 180, lab: 780, cluster: 3400, senate: 14000 };
      return Math.floor(map[id] * Math.pow(1.18, g[id] || 0));
    }

    function buyGen(id) {
      const c = upgradeCost(id);
      if (state.resources.gold < c) return;
      state.resources.gold -= c;
      state.generators[id] += 1;
      ctx.store.addXP(4, `Bought ${id}`, 'clicker');
      render();
    }

    function buySkill(id) {
      if (state.skills[id]) return;
      const skillCost = { compounding: 12, leverage: 18, hedging: 15, delegation: 25 }[id];
      if (state.profileTokensLocal < skillCost) return;
      state.profileTokensLocal -= skillCost;
      state.skills[id] = true;
      if (id === 'leverage') state.multiplier += 0.25;
      ctx.store.addAchievement(`clicker-skill-${id}`, `Unlocked ${id}`, 'clicker');
      render();
    }

    function prestige() {
      const wealth = state.totalEarned;
      if (wealth < 40000) return;
      const gain = Math.max(1, Math.floor(Math.sqrt(wealth / 50000)));
      state = { ...defaults(), prestige: state.prestige + gain, multiplier: 1 + (state.prestige + gain) * 0.2, profileTokensLocal: state.profileTokensLocal + gain * 5 };
      ctx.store.grantTokens(gain * 3, 'Prestige economy milestone', 'clicker');
      ctx.store.addXP(gain * 30, 'Prestige reset', 'clicker');
      ctx.store.addAchievement('clicker-prestige-1', 'First Prestige', 'clicker');
      render();
    }

    function render() {
      const tokens = ctx.store.getState().profile.tokens;
      state.profileTokensLocal = state.profileTokensLocal ?? tokens;

      resourceCards.innerHTML = tiers.map((t) => {
        const val = state.resources[t.id];
        const r = state.rates[t.id] || 0;
        return `<div style="border:1px solid #27314a;border-radius:10px;padding:8px;background:#0b1220"><div style="font-size:11px;color:#94a3b8">${t.name}</div><div style="font-size:18px;font-weight:800">${Math.floor(val).toLocaleString()}</div><div style="font-size:11px;color:#34d399">+${r.toFixed(2)}/s</div></div>`;
      }).join('');

      genList.innerHTML = [
        ['miner', 'Gold Miner'],
        ['factory', 'Industry Plant'],
        ['lab', 'Tech Lab'],
        ['cluster', 'AI Cluster'],
        ['senate', 'Civ Council']
      ].map(([id, name]) => {
        const c = upgradeCost(id);
        const disabled = state.resources.gold < c;
        return `<button data-buy="${id}" style="text-align:left;border:1px solid #334155;background:${disabled ? '#0b1220' : '#111827'};color:${disabled ? '#64748b' : '#e5e7eb'};padding:8px;border-radius:10px;cursor:${disabled ? 'not-allowed' : 'pointer'}"><b>${name}</b><br><span style="font-size:11px">Lvl ${state.generators[id]} · Cost ${c.toLocaleString()} gold</span></button>`;
      }).join('');
      genList.querySelectorAll('[data-buy]').forEach((el) => el.addEventListener('click', () => buyGen(el.dataset.buy)));

      const unlocks = ctx.store.getState().progression.unlockedModes;
      skillTree.innerHTML = [
        ['compounding', 'Compounding (+20% total output)', 12],
        ['leverage', 'Leverage (+multiplier growth)', 18],
        ['hedging', 'Hedging (event downside reduced)', 15],
        ['delegation', 'Delegation (+18% automation output)', 25]
      ].map(([id, text, cost]) => {
        const unlocked = state.skills[id];
        const lockedByCrossGame = id === 'hedging' && !unlocks.stockPro;
        return `<button data-skill="${id}" style="text-align:left;border:1px solid #334155;background:${unlocked ? '#14532d' : '#111827'};color:${lockedByCrossGame ? '#64748b' : '#e5e7eb'};padding:8px;border-radius:10px;cursor:${lockedByCrossGame ? 'not-allowed' : 'pointer'}" ${lockedByCrossGame ? 'disabled' : ''}><b>${text}</b><br><span style="font-size:11px">Cost ${cost} tokens ${lockedByCrossGame ? '· unlock stock pro mode first' : ''}</span></button>`;
      }).join('');
      skillTree.querySelectorAll('[data-skill]').forEach((el) => el.addEventListener('click', () => buySkill(el.dataset.skill)));

      const eventText = state.event ? `${state.event.name}: ${state.event.note}` : 'No global event. Market stable.';
      eventLine.textContent = eventText;

      const netPerSec = Object.entries(state.rates).reduce((sum, [k, v]) => sum + v * (tiers.find((t) => t.id === k)?.base || 1), 0);
      const bestGen = Object.entries(state.generators).sort((a, b) => b[1] - a[1])[0];
      optimizer.innerHTML = `
        <div>Net worth flow: <b style="color:#34d399">${Math.floor(netPerSec).toLocaleString()}/s</b></div>
        <div>Prestige level: <b>${state.prestige}</b> (x${state.multiplier.toFixed(2)} multiplier)</div>
        <div>Best producing layer: <b>${bestGen ? bestGen[0] : 'none'}</b></div>
        <div>Risk mode: <b>${state.investment.mode}</b></div>
      `;

      drawLineChart(chart, state.chart, '#22d3ee');
    }

    container.querySelector('#clickGold').addEventListener('click', () => {
      state.resources.gold += 1 * state.multiplier;
      state.totalEarned += 1;
      ctx.store.addXP(1, 'Manual click', 'clicker');
      render();
    });
    container.querySelector('#prestige').addEventListener('click', prestige);
    container.querySelector('#clickerInsight').addEventListener('click', () => {
      ctx.store.incrementInsightRuns();
      ctx.toast(postGameFeedback(ctx.store.getState(), 'clicker', { summary: `Current multiplier x${state.multiplier.toFixed(2)} with ${state.investment.mode} mode.` }), 'info', 4200);
    });

    container.querySelectorAll('[data-auto]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const k = btn.dataset.auto;
        state.automation[k] = !state.automation[k];
        btn.style.borderColor = state.automation[k] ? '#22c55e' : '#334155';
      });
    });
    container.querySelector('#invMode').value = state.investment.mode;
    container.querySelector('#invMode').addEventListener('change', (e) => {
      state.investment.mode = e.target.value;
      render();
    });

    let loop = null;
    let last = Date.now();
    function tick() {
      const now = Date.now();
      const dt = Math.min(1.5, (now - last) / 1000);
      last = now;

      maybeEvent(state);
      applyTick(state, dt);
      if (persona.focusBias) state.totalEarned += persona.focusBias * 0.2;

      if (state.automation.autoInvest && state.resources.gold > 100) {
        const target = ['miner', 'factory', 'lab', 'cluster', 'senate'];
        target.forEach((id) => {
          if (state.resources.gold > upgradeCost(id) * 1.25) buyGen(id);
        });
      }

      if (state.event && state.skills.hedging && state.event.mult < 1) {
        state.rates = Object.fromEntries(Object.entries(state.rates).map(([k, v]) => [k, v * 1.1]));
      }

      const flow = Object.entries(state.rates).reduce((sum, [k, v]) => sum + v * (tiers.find((t) => t.id === k)?.base || 1), 0);
      state.chart.push(flow);
      if (state.chart.length > 100) state.chart.shift();

      if (state.totalEarned > 25000) ctx.store.addAchievement('clicker-25k', '25k Economy Milestone', 'clicker');
      if (state.totalEarned > 250000) {
        ctx.store.grantTokens(8, 'Macro economy milestone', 'clicker');
        ctx.store.addAchievement('clicker-250k', 'Quarter-Million Value', 'clicker');
      }

      state.lastTick = now;
      render();
    }

    render();
    loop = setInterval(tick, 1000);

    return {
      unmount() {
        clearInterval(loop);
        save(state);
      }
    };
  }
};

import { drawRadar } from '../lib/charts.js';
import { generateDilemmaSeed, postGameFeedback } from '../core/insight.js';

const KEY = 'simos_trolley_v2';

const scenarios = {
  intro: {
    id: 'intro',
    text: 'An autonomous tram is heading toward five workers. You can divert to a side track with one worker.',
    choices: [
      { id: 'pull', label: 'Pull the lever', utilitarian: 3, kantian: -1, virtue: 1, next: 'doctor' },
      { id: 'hold', label: 'Do nothing', utilitarian: -3, kantian: 1, virtue: -1, next: 'doctor' }
    ]
  },
  doctor: {
    id: 'doctor',
    text: 'A surgeon can save five patients by sacrificing one healthy visitor for organs.',
    choices: [
      { id: 'sacrifice', label: 'Approve sacrifice', utilitarian: 2, kantian: -4, virtue: -2, next: 'ai' },
      { id: 'refuse', label: 'Refuse sacrifice', utilitarian: -1, kantian: 3, virtue: 2, next: 'ai' }
    ]
  },
  ai: {
    id: 'ai',
    text: 'Your AI policing model lowers crime by 18% but wrongly flags thousands.',
    choices: [
      { id: 'deploy', label: 'Deploy now', utilitarian: 2, kantian: -2, virtue: -1, next: 'finale' },
      { id: 'delay', label: 'Delay until bias drops', utilitarian: -1, kantian: 2, virtue: 2, next: 'finale' }
    ]
  },
  finale: {
    id: 'finale',
    text: 'A climate geoengineering launch could avoid collapse but risks unknown side effects globally.',
    choices: [
      { id: 'launch', label: 'Launch intervention', utilitarian: 3, kantian: -1, virtue: 0, next: null },
      { id: 'withhold', label: 'Withhold intervention', utilitarian: -2, kantian: 2, virtue: 2, next: null }
    ]
  }
};

function init() {
  return {
    node: 'intro',
    path: [],
    frameworks: { utilitarian: 0, kantian: 0, virtue: 0, pragmatist: 0 },
    generated: [],
    globalAggregate: { utilitarian: 58, kantian: 26, virtue: 16 }
  };
}

function load() {
  try { return { ...init(), ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { return init(); }
}
function save(s) { localStorage.setItem(KEY, JSON.stringify(s)); }

function personalityTag(scores) {
  const [k] = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  const tags = {
    utilitarian: 'Outcome Optimizer',
    kantian: 'Principle Guardian',
    virtue: 'Character Builder',
    pragmatist: 'Adaptive Balancer'
  };
  return tags[k] || 'Mixed Ethicist';
}

function randomDilemma() {
  const actors = ['autonomous ambulance', 'nuclear warning system', 'city water AI', 'disaster triage board'];
  const stakes = ['save 10,000 people', 'avoid market collapse', 'prevent blackouts', 'reduce fatalities'];
  const harms = ['violating consent', 'sacrificing a minority district', 'privacy invasion', 'irreversible long-term risk'];
  return `Would you authorize a ${actors[Math.floor(Math.random() * actors.length)]} if it can ${stakes[Math.floor(Math.random() * stakes.length)]} but requires ${harms[Math.floor(Math.random() * harms.length)]}?`;
}

export const app = {
  id: 'trolley',
  name: 'Ethics Engine',
  icon: '⚖️',
  heavy: true,
  preloadHint: ['clicker', 'stock'],
  async mount(container, ctx) {
    const state = load();

    container.innerHTML = `
      <section style="display:grid;gap:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;border:1px solid #27314a;border-radius:14px;padding:14px;background:#0f172a">
          <div>
            <div style="font-size:28px;font-weight:800">Branching Ethical Simulation Engine</div>
            <div style="font-size:12px;color:#94a3b8">Utilitarian vs Kantian vs Virtue ethics · Narrative consequence graph</div>
          </div>
          <button id="genBtn" style="border:1px solid #334155;background:#111827;color:#e5e7eb;border-radius:10px;padding:9px 12px;font-weight:700">Generate AI Dilemma</button>
          <button id="ethicsInsight" style="border:1px solid #334155;background:#0b1220;color:#93c5fd;border-radius:10px;padding:9px 12px;font-weight:700">Insight</button>
        </div>

        <div style="display:grid;grid-template-columns:1.6fr 1fr;gap:12px" id="ethicsGrid">
          <div style="display:grid;gap:12px">
            <div style="border:1px solid #27314a;border-radius:14px;padding:14px;background:#0f172a">
              <div style="font-size:13px;color:#94a3b8;margin-bottom:6px">Current Narrative Node</div>
              <div id="scenarioText" style="font-size:18px;font-weight:700;line-height:1.5"></div>
              <div id="choices" style="display:grid;gap:8px;margin-top:12px"></div>
            </div>

            <div style="border:1px solid #27314a;border-radius:14px;padding:14px;background:#0f172a">
              <div style="font-weight:800;margin-bottom:8px">Decision Tree Visualization</div>
              <svg id="tree" viewBox="0 0 860 220" style="width:100%;height:220px;background:#0b1220;border:1px solid #27314a;border-radius:10px"></svg>
            </div>

            <div style="border:1px solid #27314a;border-radius:14px;padding:14px;background:#0f172a">
              <div style="font-weight:800;margin-bottom:8px">Generated Dilemmas</div>
              <div id="generated" style="display:grid;gap:8px;font-size:12px;color:#cbd5e1"></div>
            </div>
          </div>

          <div style="display:grid;gap:12px">
            <div style="border:1px solid #27314a;border-radius:14px;padding:14px;background:#0f172a">
              <div style="font-weight:800;margin-bottom:8px">Moral Alignment Radar</div>
              <canvas id="radar" width="300" height="230" style="width:100%;height:230px;background:#0b1220;border:1px solid #27314a;border-radius:10px"></canvas>
              <div id="persona" style="margin-top:8px;font-size:12px;color:#94a3b8"></div>
            </div>

            <div style="border:1px solid #27314a;border-radius:14px;padding:14px;background:#0f172a">
              <div style="font-weight:800;margin-bottom:8px">Global Comparison (anonymized sim)</div>
              <div id="globalComp" style="font-size:12px;line-height:1.7"></div>
            </div>
          </div>
        </div>
      </section>
    `;

    if (window.matchMedia('(max-width: 1100px)').matches) {
      container.querySelector('#ethicsGrid').style.gridTemplateColumns = '1fr';
    }

    const textEl = container.querySelector('#scenarioText');
    const choicesEl = container.querySelector('#choices');
    const treeEl = container.querySelector('#tree');
    const radar = container.querySelector('#radar');
    const persona = container.querySelector('#persona');
    const globalComp = container.querySelector('#globalComp');
    const generated = container.querySelector('#generated');

    function renderTree() {
      const points = state.path;
      let svg = '';
      const y = 110;
      const step = points.length ? 760 / Math.max(1, points.length) : 760;
      points.forEach((p, i) => {
        const x = 50 + i * step;
        if (i > 0) {
          const px = 50 + (i - 1) * step;
          svg += `<line x1="${px}" y1="${y}" x2="${x}" y2="${y}" stroke="#334155" stroke-width="2"/>`;
        }
        svg += `<circle cx="${x}" cy="${y}" r="14" fill="#111827" stroke="#38bdf8" stroke-width="2"/>`;
        svg += `<text x="${x}" y="${y + 4}" text-anchor="middle" fill="#e5e7eb" font-size="10">${i + 1}</text>`;
      });
      if (!points.length) svg = '<text x="24" y="30" fill="#64748b" font-size="12">No decisions yet.</text>';
      treeEl.innerHTML = svg;
    }

    function renderGlobal() {
      const g = state.globalAggregate;
      globalComp.innerHTML = `
        <div>Utilitarian: <b>${g.utilitarian}%</b></div>
        <div>Kantian: <b>${g.kantian}%</b></div>
        <div>Virtue: <b>${g.virtue}%</b></div>
      `;
    }

    function render() {
      const node = scenarios[state.node];
      textEl.textContent = node ? node.text : 'Narrative complete. Reset to explore alternate moral paths.';

      choicesEl.innerHTML = node
        ? node.choices.map((c) => `<button data-choice="${c.id}" style="text-align:left;border:1px solid #334155;background:#111827;color:#e5e7eb;border-radius:10px;padding:10px;cursor:pointer"><b>${c.label}</b><br><span style="font-size:11px;color:#94a3b8">U:${c.utilitarian >= 0 ? '+' : ''}${c.utilitarian} K:${c.kantian >= 0 ? '+' : ''}${c.kantian} V:${c.virtue >= 0 ? '+' : ''}${c.virtue}</span></button>`).join('')
        : '<button id="restart" style="border:1px solid #334155;background:#111827;color:#e5e7eb;border-radius:10px;padding:10px;cursor:pointer">Restart Narrative</button>';

      choicesEl.querySelectorAll('[data-choice]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const choice = node.choices.find((c) => c.id === btn.dataset.choice);
          if (!choice) return;
          state.path.push({ at: Date.now(), node: node.id, choice: choice.id });
          state.frameworks.utilitarian += choice.utilitarian;
          state.frameworks.kantian += choice.kantian;
          state.frameworks.virtue += choice.virtue;
          state.frameworks.pragmatist += (choice.utilitarian + choice.kantian + choice.virtue) / 3;

          ctx.store.trackDecision({
            utilitarian: choice.utilitarian,
            kantian: choice.kantian,
            virtue: choice.virtue,
            riskTaking: choice.utilitarian > 0 ? 1 : 0,
            caution: choice.kantian > 0 ? 1 : 0
          });
          ctx.store.addXP(10, 'Ethical decision branch', 'trolley');

          if (!choice.next) {
            ctx.store.grantTokens(7, 'Completed ethics narrative', 'trolley');
            ctx.store.addAchievement('trolley-finish', 'Completed Ethical Arc', 'trolley');
            state.node = null;
          } else {
            state.node = choice.next;
          }
          render();
        });
      });

      choicesEl.querySelector('#restart')?.addEventListener('click', () => {
        state.node = 'intro';
        state.path = [];
        state.frameworks = { utilitarian: 0, kantian: 0, virtue: 0, pragmatist: 0 };
        render();
      });

      drawRadar(radar, state.frameworks);
      persona.textContent = `Pattern detection: ${personalityTag(state.frameworks)}`;
      renderTree();
      renderGlobal();
      generated.innerHTML = state.generated.map((g, i) => `<div>${i + 1}. ${g}</div>`).join('') || '<div>No generated dilemmas yet.</div>';
    }

    container.querySelector('#genBtn').addEventListener('click', () => {
      const unlocked = ctx.store.getState().progression.unlockedModes.trolleyGenerator;
      if (!unlocked) {
        state.generated.unshift('Generator locked. Earn 95 tokens globally to unlock AI dilemma mode.');
      } else {
        const seed = generateDilemmaSeed(ctx.store.getState());
        state.generated.unshift(`${randomDilemma()} [${seed.tone}] ${seed.prompt}`);
        ctx.store.addXP(8, 'Generated dilemma', 'trolley');
        ctx.store.addAchievement('trolley-gen', 'Generated AI Dilemma', 'trolley');
      }
      state.generated = state.generated.slice(0, 12);
      render();
    });
    container.querySelector('#ethicsInsight').addEventListener('click', () => {
      ctx.store.incrementInsightRuns();
      ctx.toast(postGameFeedback(ctx.store.getState(), 'trolley', { summary: `Current pattern: ${personalityTag(state.frameworks)}.` }), 'info', 4300);
    });

    render();

    return {
      unmount() {
        save(state);
      }
    };
  }
};

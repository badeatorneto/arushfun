import { drawRadar } from '../lib/charts.js';
import { postGameFeedback } from '../core/insight.js';

const KEY = 'simos_persona_v2';

const questions = [
  { q: 'I enjoy trying novel ideas quickly.', big5: { O: 1.4 }, mbti: { N: 1, P: 1 } },
  { q: 'I keep structured plans and timelines.', big5: { C: 1.5 }, mbti: { J: 1.2 } },
  { q: 'I gain energy from social settings.', big5: { E: 1.5 }, mbti: { E: 1.4 } },
  { q: 'I prioritize harmony in conflicts.', big5: { A: 1.4 }, mbti: { F: 1.1 } },
  { q: 'I remain calm under pressure.', big5: { N: -1.3 }, mbti: { T: 0.6 } },
  { q: 'I question assumptions and conventions.', big5: { O: 1.2 }, mbti: { N: 1.2 } },
  { q: 'I execute details reliably every day.', big5: { C: 1.3 }, mbti: { S: 0.9, J: 0.7 } },
  { q: 'I make choices from principles over emotion.', big5: { A: -0.6 }, mbti: { T: 1.3 } },
  { q: 'I recover quickly from setbacks.', big5: { N: -1.1, E: 0.4 }, mbti: { J: 0.4 } },
  { q: 'I enjoy abstract systems and models.', big5: { O: 1.2 }, mbti: { N: 1.3, T: 0.7 } }
];

const archetypes = [
  { name: 'Systems Strategist', vec: { O: 78, C: 74, E: 46, A: 51, N: 34 } },
  { name: 'Visionary Builder', vec: { O: 86, C: 62, E: 66, A: 54, N: 41 } },
  { name: 'Empathic Operator', vec: { O: 64, C: 71, E: 58, A: 76, N: 39 } },
  { name: 'Adaptive Explorer', vec: { O: 81, C: 48, E: 69, A: 57, N: 50 } }
];

function defaults() {
  return {
    idx: 0,
    answers: [],
    scores: { O: 50, C: 50, E: 50, A: 50, N: 50 },
    mbti: { E: 0, I: 0, N: 0, S: 0, T: 0, F: 0, J: 0, P: 0 },
    done: false
  };
}

function load() {
  try { return { ...defaults(), ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { return defaults(); }
}
function save(s) { localStorage.setItem(KEY, JSON.stringify(s)); }

function clamp(v) { return Math.max(0, Math.min(100, v)); }

function nearestArchetype(scores) {
  let best = null;
  let bestDist = Infinity;
  archetypes.forEach((a) => {
    const d = ['O', 'C', 'E', 'A', 'N'].reduce((sum, k) => sum + Math.pow((scores[k] || 0) - a.vec[k], 2), 0);
    if (d < bestDist) { bestDist = d; best = a; }
  });
  return best;
}

function mbtiString(m) {
  const a = m.E >= m.I ? 'E' : 'I';
  const b = m.N >= m.S ? 'N' : 'S';
  const c = m.T >= m.F ? 'T' : 'F';
  const d = m.J >= m.P ? 'J' : 'P';
  return `${a}${b}${c}${d}`;
}

export const app = {
  id: 'persona',
  name: 'Persona Lab',
  icon: '🧠',
  heavy: false,
  preloadHint: ['wordforge', 'geo'],
  async mount(container, ctx) {
    const state = load();

    container.innerHTML = `
      <section style="display:grid;gap:12px">
        <div style="border:1px solid #27314a;border-radius:14px;background:#0f172a;padding:14px">
          <div style="font-size:28px;font-weight:800">Psychometric Profiling Tool</div>
          <div style="font-size:12px;color:#94a3b8">Big Five model · MBTI-style mapping · archetype comparisons · cross-game personality impact</div>
        </div>

        <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:12px" id="personaGrid">
          <div style="display:grid;gap:12px">
            <div style="border:1px solid #27314a;border-radius:14px;background:#0f172a;padding:12px">
              <div id="progress" style="font-size:12px;color:#94a3b8;margin-bottom:6px"></div>
              <div id="question" style="font-size:18px;font-weight:700;margin-bottom:10px"></div>
              <div id="options" style="display:grid;gap:8px"></div>
            </div>

            <div style="border:1px solid #27314a;border-radius:14px;background:#0f172a;padding:12px">
              <div style="font-weight:800;margin-bottom:8px">Behavioral Prediction Hints</div>
              <div id="hints" style="font-size:12px;line-height:1.7;color:#94a3b8"></div>
            </div>
          </div>

          <div style="display:grid;gap:12px">
            <div style="border:1px solid #27314a;border-radius:14px;background:#0f172a;padding:12px">
              <div style="font-weight:800;margin-bottom:8px">Trait Radar</div>
              <canvas id="radar" width="300" height="240" style="width:100%;height:240px;background:#0b1220;border:1px solid #27314a;border-radius:10px"></canvas>
              <div id="summary" style="margin-top:8px;font-size:12px"></div>
            </div>

            <div style="border:1px solid #27314a;border-radius:14px;background:#0f172a;padding:12px">
              <div style="display:flex;gap:8px;flex-wrap:wrap">
                <button id="saveCard" class="btn">Save Persona Card</button>
                <button id="shareCard" class="btn alt">Share Card</button>
                <button id="restart" class="btn alt">Restart</button>
              </div>
            </div>
          </div>
        </div>
      </section>
    `;

    if (window.matchMedia('(max-width: 1100px)').matches) container.querySelector('#personaGrid').style.gridTemplateColumns = '1fr';

    const progress = container.querySelector('#progress');
    const question = container.querySelector('#question');
    const options = container.querySelector('#options');
    const radar = container.querySelector('#radar');
    const summary = container.querySelector('#summary');
    const hints = container.querySelector('#hints');

    function applyAnswer(v) {
      if (state.done) return;
      const q = questions[state.idx];
      if (!q) return;

      const centered = v - 3;
      Object.entries(q.big5).forEach(([k, w]) => {
        state.scores[k] = clamp(state.scores[k] + centered * w * 2.2);
      });
      Object.entries(q.mbti).forEach(([k, w]) => {
        state.mbti[k] = (state.mbti[k] || 0) + centered * w;
        if (k === 'E') state.mbti.I = (state.mbti.I || 0) - centered * 0.8;
        if (k === 'N') state.mbti.S = (state.mbti.S || 0) - centered * 0.8;
        if (k === 'T') state.mbti.F = (state.mbti.F || 0) - centered * 0.8;
        if (k === 'J') state.mbti.P = (state.mbti.P || 0) - centered * 0.8;
      });

      state.answers.push({ q: state.idx, v });
      state.idx += 1;
      if (state.idx >= questions.length) state.done = true;
      render();
    }

    function personaImpactFromScores(scores) {
      return {
        riskBias: (scores.O - 50) / 100,
        focusBias: (scores.C - 50) / 100,
        empathyBias: (scores.A - 50) / 100,
        speedBias: (scores.E - 50) / 100
      };
    }

    function render() {
      const mt = mbtiString(state.mbti);
      const archetype = nearestArchetype(state.scores);

      drawRadar(radar, { Openness: state.scores.O, Conscientiousness: state.scores.C, Extraversion: state.scores.E, Agreeableness: state.scores.A, Neuroticism: state.scores.N });

      if (!state.done) {
        const q = questions[state.idx];
        progress.textContent = `Question ${state.idx + 1} / ${questions.length}`;
        question.textContent = q.q;
        options.innerHTML = [1,2,3,4,5].map((n) => `<button data-v="${n}" style="text-align:left;border:1px solid #334155;background:#111827;color:#e5e7eb;border-radius:10px;padding:10px;cursor:pointer">${n} · ${['Strongly disagree','Disagree','Neutral','Agree','Strongly agree'][n-1]}</button>`).join('');
        options.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => applyAnswer(Number(b.dataset.v))));
      } else {
        progress.textContent = 'Profile Complete';
        question.textContent = `Archetype: ${archetype?.name || 'Mixed'}`;
        options.innerHTML = `<div style="font-size:12px;color:#94a3b8">Big Five and MBTI-style profile calibrated.</div>`;
      }

      summary.innerHTML = `
        <div>Big Five: O ${state.scores.O.toFixed(0)} · C ${state.scores.C.toFixed(0)} · E ${state.scores.E.toFixed(0)} · A ${state.scores.A.toFixed(0)} · N ${state.scores.N.toFixed(0)}</div>
        <div>MBTI-style map: <b>${mt}</b></div>
        <div>Nearest archetype: <b>${archetype?.name || 'Mixed'}</b></div>
      `;

      hints.innerHTML = `
        <div>${state.scores.C > 65 ? 'High conscientiousness predicts strong follow-through in strategy sims.' : 'Lower conscientiousness suggests using guided checklists in complex sims.'}</div>
        <div>${state.scores.O > 70 ? 'High openness improves adaptation to novel dilemmas and dynamic markets.' : 'Moderate openness favors stable optimization loops over novelty-heavy modes.'}</div>
        <div>${state.scores.N > 58 ? 'Higher neuroticism may amplify regret projection; use scenario planning to reduce anxiety loops.' : 'Lower neuroticism indicates resilience under uncertainty.'}</div>
      `;

      if (state.done) {
        const impact = personaImpactFromScores(state.scores);
        ctx.store.setPersonaProfile({ ...state.scores, mbti: mt, archetype: archetype?.name || 'Mixed' }, impact);
        ctx.store.addXP(18, 'Completed psychometric profile', 'persona');
        ctx.store.grantTokens(5, 'Persona profile completed', 'persona');
        ctx.store.addAchievement('persona-complete', 'Psychometric Completion', 'persona', 'Silver');
      }
      save(state);
    }

    container.querySelector('#saveCard').addEventListener('click', () => {
      const payload = {
        at: Date.now(),
        big5: state.scores,
        mbti: mbtiString(state.mbti),
        archetype: nearestArchetype(state.scores)?.name || 'Mixed'
      };
      const cards = JSON.parse(localStorage.getItem('simos_persona_cards') || '[]');
      cards.unshift(payload);
      localStorage.setItem('simos_persona_cards', JSON.stringify(cards.slice(0, 20)));
      ctx.toast('Persona card saved.', 'ok');
      ctx.store.addAchievement('persona-card', 'Saved Persona Card', 'persona', 'Bronze');
    });

    container.querySelector('#shareCard').addEventListener('click', async () => {
      const card = {
        big5: state.scores,
        mbti: mbtiString(state.mbti),
        archetype: nearestArchetype(state.scores)?.name || 'Mixed'
      };
      const text = `ARUSH.FUN Persona Card\nArchetype: ${card.archetype}\nMBTI-style: ${card.mbti}\nBig Five: O${card.big5.O.toFixed(0)} C${card.big5.C.toFixed(0)} E${card.big5.E.toFixed(0)} A${card.big5.A.toFixed(0)} N${card.big5.N.toFixed(0)}`;
      try { await navigator.clipboard.writeText(text); } catch {}
      ctx.toast('Shareable persona card copied.', 'info');
      ctx.store.patch({ social: { ...ctx.store.getState().social, shareCards: [{ type: 'persona', text, at: Date.now() }, ...(ctx.store.getState().social.shareCards || [])].slice(0, 50) } });
    });

    container.querySelector('#restart').addEventListener('click', () => {
      Object.assign(state, defaults());
      render();
    });

    render();
    ctx.toast(postGameFeedback(ctx.store.getState(), 'persona', { summary: 'Trait-driven cross-game modifiers are now active.' }), 'info', 3000);

    return { unmount() { save(state); } };
  }
};

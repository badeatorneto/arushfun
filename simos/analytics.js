import { drawRadar, drawLineChart } from '../lib/charts.js';
import { analyzeUserPatterns, formatTime } from '../core/insight.js';

export const app = {
  id: 'analytics',
  name: 'Analytics',
  icon: '📊',
  heavy: false,
  preloadHint: ['dashboard'],
  async mount(container, ctx) {
    const s = ctx.store.getState();
    const insights = analyzeUserPatterns(s);

    container.innerHTML = `
      <section style="display:grid;gap:12px">
        <div style="border:1px solid #27314a;border-radius:14px;background:#0f172a;padding:14px">
          <div style="font-size:28px;font-weight:800">Personal Analytics Command Center</div>
          <div style="font-size:12px;color:#94a3b8">Most played sims · decision patterns · risk tolerance · strategic tendency · ethical bias graph · time metrics</div>
        </div>

        <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:12px" id="anaGrid">
          <div style="display:grid;gap:12px">
            <div style="border:1px solid #27314a;border-radius:14px;background:#0f172a;padding:12px">
              <div style="font-weight:800;margin-bottom:8px">Time Spent by Simulation</div>
              <canvas id="timeChart" width="920" height="180" style="width:100%;height:180px;background:#0b1220;border:1px solid #27314a;border-radius:10px"></canvas>
            </div>
            <div style="border:1px solid #27314a;border-radius:14px;background:#0f172a;padding:12px">
              <div style="font-weight:800;margin-bottom:8px">Strategic Tendency Index</div>
              <div id="strategic" style="font-size:12px"></div>
            </div>
            <div style="border:1px solid #27314a;border-radius:14px;background:#0f172a;padding:12px">
              <div style="font-weight:800;margin-bottom:8px">Anonymous Global Stats Board (privacy-safe simulated aggregate)</div>
              <div id="globalBoard" style="font-size:12px;line-height:1.7"></div>
            </div>
          </div>

          <div style="display:grid;gap:12px">
            <div style="border:1px solid #27314a;border-radius:14px;background:#0f172a;padding:12px">
              <div style="font-weight:800;margin-bottom:8px">Ethical Bias Radar</div>
              <canvas id="ethicsRadar" width="300" height="220" style="width:100%;height:220px;background:#0b1220;border:1px solid #27314a;border-radius:10px"></canvas>
            </div>
            <div style="border:1px solid #27314a;border-radius:14px;background:#0f172a;padding:12px">
              <div style="font-weight:800;margin-bottom:8px">Profile Summary</div>
              <div id="summary" style="font-size:12px;line-height:1.7"></div>
              <div id="badges" style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px"></div>
              <button id="shareProfile" style="margin-top:8px;border:1px solid #334155;background:#111827;color:#e5e7eb;border-radius:8px;padding:8px 10px;font-weight:700">Share Public Profile Card</button>
            </div>
          </div>
        </div>
      </section>
    `;

    if (window.matchMedia('(max-width: 1100px)').matches) container.querySelector('#anaGrid').style.gridTemplateColumns = '1fr';

    const timeChart = container.querySelector('#timeChart');
    const ethicsRadar = container.querySelector('#ethicsRadar');
    const strategic = container.querySelector('#strategic');
    const globalBoard = container.querySelector('#globalBoard');
    const summary = container.querySelector('#summary');
    const badges = container.querySelector('#badges');

    const times = Object.entries(s.telemetry.timeSpent || {}).sort((a, b) => b[1] - a[1]);
    drawLineChart(timeChart, times.map(([,v]) => v), '#22d3ee');

    drawRadar(ethicsRadar, {
      Utilitarian: 50 + insights.ethicalSkew.utilitarian * 3,
      Kantian: 50 + insights.ethicalSkew.kantian * 3,
      Virtue: 50 + insights.ethicalSkew.virtue * 3,
      Risk: insights.riskTolerance,
      Strategy: insights.strategicIndex
    });

    const sig = s.telemetry.strategicSignals || {};
    strategic.innerHTML = `
      <div>Optimizer: <b>${sig.optimizer || 0}</b></div>
      <div>Explorer: <b>${sig.explorer || 0}</b></div>
      <div>Speed Runner: <b>${sig.speedRunner || 0}</b></div>
      <div>Analyst: <b>${sig.analyst || 0}</b></div>
      <div style="margin-top:6px;color:#94a3b8">Strategic Index: ${Math.round(insights.strategicIndex)} / 100</div>
    `;

    const global = {
      avgRisk: 52,
      avgStrategy: 49,
      avgEthicsU: 56,
      avgSessionMins: 34
    };
    globalBoard.innerHTML = `
      <div>Avg risk tolerance: <b>${global.avgRisk}</b> (you: ${Math.round(insights.riskTolerance)})</div>
      <div>Avg strategic index: <b>${global.avgStrategy}</b> (you: ${Math.round(insights.strategicIndex)})</div>
      <div>Avg utilitarian score: <b>${global.avgEthicsU}</b></div>
      <div>Avg session length: <b>${global.avgSessionMins}m</b></div>
    `;

    const totalTime = Object.values(s.telemetry.timeSpent || {}).reduce((a,b) => a+b, 0);
    summary.innerHTML = `
      <div>Most played: <b>${insights.mostPlayed}</b></div>
      <div>Total tracked time: <b>${formatTime(totalTime)}</b></div>
      <div>Risk tolerance: <b>${Math.round(insights.riskTolerance)}</b></div>
      <div>Strategic tendency: <b>${Math.round(insights.strategicIndex)}</b></div>
      <div>Achievements: <b>${s.profile.achievements.length}</b></div>
    `;
    badges.innerHTML = s.profile.achievements.slice(0, 8).map((a) => `<span style="font-size:11px;padding:4px 7px;border:1px solid #334155;border-radius:999px;background:#0b1220">${a.tier || 'Bronze'} · ${a.title}</span>`).join('');

    container.querySelector('#shareProfile').addEventListener('click', async () => {
      const card = {
        handle: s.auth.handle,
        level: s.profile.level,
        xp: s.profile.xp,
        risk: Math.round(insights.riskTolerance),
        strategy: Math.round(insights.strategicIndex),
        mostPlayed: insights.mostPlayed
      };
      const text = `SimOS Public Profile\n${JSON.stringify(card, null, 2)}`;
      try { await navigator.clipboard.writeText(text); } catch {}
      ctx.store.patch({ social: { ...s.social, publicProfile: true, shareCards: [{ type: 'profile', text, at: Date.now() }, ...(s.social.shareCards || [])].slice(0, 50) } });
      ctx.toast('Shareable profile card copied.', 'info');
    });

    ctx.store.addXP(6, 'Viewed analytics command center', 'analytics');
    ctx.store.trackStrategicSignal({ analyst: 1 });
    return { unmount() {} };
  }
};

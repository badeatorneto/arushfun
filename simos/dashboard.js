import { analyzeUserPatterns, formatTime } from '../core/insight.js';

function fmtNum(n) {
  return Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function bar(label, value, color = '#38bdf8') {
  const v = Math.max(0, Math.min(100, value));
  return `<div style="margin:4px 0"><div style="display:flex;justify-content:space-between;font-size:11px;color:#94a3b8"><span>${label}</span><span>${Math.round(v)}</span></div><div style="height:7px;background:#0b1220;border:1px solid #27314a;border-radius:999px;overflow:hidden"><div style="height:100%;width:${v}%;background:${color}"></div></div></div>`;
}

export function mountDashboard(panelEl, store) {
  const render = (s) => {
    const p = s.profile;
    const launches = Object.entries(s.telemetry.appLaunches || {}).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const insights = analyzeUserPatterns(s);
    const totalTime = Object.values(s.telemetry.timeSpent || {}).reduce((a, b) => a + b, 0);

    panelEl.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <div style="font-weight:800;letter-spacing:.02em">Personal Analytics Dashboard</div>
        <div style="font-size:11px;color:#94a3b8">Level ${p.level}</div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
        <div style="background:#0f172a;border:1px solid #27314a;border-radius:10px;padding:8px"><div style="font-size:11px;color:#94a3b8">XP</div><div style="font-size:18px;font-weight:800">${fmtNum(p.xp)}</div></div>
        <div style="background:#0f172a;border:1px solid #27314a;border-radius:10px;padding:8px"><div style="font-size:11px;color:#94a3b8">Tokens</div><div style="font-size:18px;font-weight:800">${fmtNum(p.tokens)}</div></div>
        <div style="background:#0f172a;border:1px solid #27314a;border-radius:10px;padding:8px"><div style="font-size:11px;color:#94a3b8">Badges</div><div style="font-size:18px;font-weight:800">${p.achievements.length}</div></div>
        <div style="background:#0f172a;border:1px solid #27314a;border-radius:10px;padding:8px"><div style="font-size:11px;color:#94a3b8">Time Spent</div><div style="font-size:14px;font-weight:800">${formatTime(totalTime)}</div></div>
      </div>

      <div style="font-size:12px;color:#94a3b8;margin-bottom:6px">Cross-Game Progression</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px">
        ${Object.entries(s.progression.unlockedModes).map(([k, v]) => `<span style="font-size:11px;padding:4px 7px;border-radius:999px;border:1px solid ${v ? '#22c55e' : '#334155'};color:${v ? '#86efac' : '#94a3b8'}">${k}</span>`).join('')}
      </div>

      <div style="font-size:12px;color:#94a3b8;margin-bottom:6px">Behavioral Metrics</div>
      ${bar('Risk tolerance', insights.riskTolerance, '#f59e0b')}
      ${bar('Strategic index', insights.strategicIndex, '#22d3ee')}

      <div style="font-size:12px;color:#94a3b8;margin-top:8px;margin-bottom:6px">Ethical Bias Graph</div>
      ${bar('Utilitarian', 50 + insights.ethicalSkew.utilitarian * 3, '#34d399')}
      ${bar('Kantian', 50 + insights.ethicalSkew.kantian * 3, '#a78bfa')}
      ${bar('Virtue', 50 + insights.ethicalSkew.virtue * 3, '#f472b6')}

      <div style="font-size:12px;color:#94a3b8;margin-top:10px;margin-bottom:6px">Most Played Simulations</div>
      <div style="font-size:12px;line-height:1.6;margin-bottom:10px">
        ${launches.length ? launches.map(([k, v]) => `<div>${k}: ${v}</div>`).join('') : '<div>No launches yet.</div>'}
      </div>

      <div style="font-size:12px;color:#94a3b8;margin-bottom:4px">Insight</div>
      <div style="font-size:12px;line-height:1.5;color:#cbd5e1">${insights.hints[0]}</div>
    `;
  };

  render(store.getState());
  const unsub = store.subscribe(render);
  return () => unsub();
}

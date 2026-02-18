function pct(n) { return `${(n * 100).toFixed(0)}%`; }

export function analyzeUserPatterns(state) {
  const d = state.profile.decisionAnalytics || {};
  const s = state.telemetry.strategicSignals || {};
  const t = state.telemetry.timeSpent || {};

  const riskTolerance = Math.max(0, Math.min(100, 50 + (d.riskTaking || 0) * 2 - (d.caution || 0) * 1.4 + (state.profile.personaImpact?.riskBias || 0) * 18));
  const strategicIndex = Math.max(0, Math.min(100, 45 + (s.analyst || 0) * 2 + (s.optimizer || 0) * 1.5 - (s.speedRunner || 0) * 1.1));
  const ethicalSkew = {
    utilitarian: d.utilitarian || 0,
    kantian: d.kantian || 0,
    virtue: d.virtue || 0
  };

  const mostPlayed = Object.entries(state.telemetry.appLaunches || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || 'n/a';
  const totalTime = Object.values(t).reduce((a, b) => a + b, 0);

  const hints = [];
  if (riskTolerance > 70) hints.push('You favor upside-heavy decisions. Consider downside hedges in Stock Pro.');
  if (riskTolerance < 35) hints.push('You are risk-averse; explore selective high-upside bets to reduce regret drift.');
  if (strategicIndex > 70) hints.push('Strong systems thinking detected. Advanced optimization modes are a good fit.');
  if (!hints.length) hints.push('Balanced decision profile. Rotate across simulations for richer behavioral signal.');

  return {
    riskTolerance,
    strategicIndex,
    ethicalSkew,
    mostPlayed,
    totalTime,
    hints
  };
}

export function difficultyAdapter(history = []) {
  if (!history.length) return { level: 'normal', target: 0.6 };
  const wins = history.filter((h) => h.win).length;
  const rate = wins / history.length;
  if (rate > 0.78) return { level: 'hard', target: 0.8 };
  if (rate < 0.38) return { level: 'easy', target: 0.45 };
  return { level: 'normal', target: 0.6 };
}

export function generateMarketEvent(state) {
  const p = analyzeUserPatterns(state);
  const risk = p.riskTolerance / 100;
  const polarity = Math.random() > 0.5 ? 1 : -1;
  const baseVol = 1.4 + Math.random() * 3.4;
  const mag = baseVol * (0.7 + risk * 0.8);
  const tags = [
    'Macro liquidity shift',
    'Policy signal surprise',
    'Earnings regime break',
    'Supply-chain compression',
    'Consumer sentiment shock'
  ];
  return {
    tag: tags[Math.floor(Math.random() * tags.length)],
    impactPct: Number((mag * polarity).toFixed(2))
  };
}

export function generateDilemmaSeed(state) {
  const p = analyzeUserPatterns(state);
  const tone = p.ethicalSkew.utilitarian >= p.ethicalSkew.kantian ? 'outcome' : 'principle';
  return {
    tone,
    prompt: tone === 'outcome'
      ? 'Would you allow a controlled rights violation if it prevents systemic collapse?'
      : 'Would you preserve rights even if aggregate harm rises materially?'
  };
}

export function postGameFeedback(state, appId, local = {}) {
  const p = analyzeUserPatterns(state);
  const base = `Insight Mode: ${appId} shows risk ${Math.round(p.riskTolerance)} and strategy ${Math.round(p.strategicIndex)}.`;
  const addon = local.summary ? ` ${local.summary}` : '';
  return `${base}${addon} Next move: ${p.hints[0]}`;
}

export function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

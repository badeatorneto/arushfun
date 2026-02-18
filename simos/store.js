const STORE_KEY = 'simos_state_v2';

function safeParse(v, fallback) {
  try { return JSON.parse(v); } catch { return fallback; }
}

function calcLevel(xp) {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 120)) + 1;
}

const ACHIEVEMENTS = [
  { id: 'xp-bronze', tier: 'Bronze', title: 'First 100 XP', hidden: false, test: (s) => s.profile.xp >= 100 },
  { id: 'xp-silver', tier: 'Silver', title: 'XP 1,000', hidden: false, test: (s) => s.profile.xp >= 1000 },
  { id: 'xp-gold', tier: 'Gold', title: 'XP 5,000', hidden: false, test: (s) => s.profile.xp >= 5000 },
  { id: 'xp-legend', tier: 'Legendary', title: 'XP 15,000', hidden: false, test: (s) => s.profile.xp >= 15000 },
  { id: 'apps-explorer', tier: 'Silver', title: 'Simulation Explorer', hidden: false, test: (s) => Object.keys(s.telemetry.appLaunches || {}).length >= 6 },
  { id: 'token-gold', tier: 'Gold', title: 'Token Architect', hidden: false, test: (s) => s.profile.tokens >= 120 },
  { id: 'insight-first', tier: 'Bronze', title: 'Insight Seeker', hidden: false, test: (s) => (s.profile.insightRuns || 0) >= 1 },
  { id: 'ethics-bias', tier: 'Hidden', title: 'Moral Gravity', hidden: true, test: (s) => {
      const d = s.profile.decisionAnalytics || {};
      return Math.abs((d.utilitarian || 0) - (d.kantian || 0)) > 18;
    }
  },
  { id: 'night-owl', tier: 'Hidden', title: 'Midnight Operator', hidden: true, test: (s) => (s.profile.nightLaunches || 0) >= 5 },
  { id: 'consistency', tier: 'Gold', title: 'Consistency Loop', hidden: false, test: (s) => {
      const ts = Object.values(s.telemetry.timeSpent || {});
      return ts.length >= 4 && ts.filter((v) => v >= 600).length >= 3;
    }
  }
];

function seedState() {
  return {
    theme: 'dark',
    session: { currentApp: 'dashboard', startedAt: Date.now(), insightMode: true },
    auth: { provider: null, handle: 'Guest', cloudConfigured: false, publicId: null },
    cloud: { endpoint: '', apiKey: '' },
    social: {
      publicProfile: false,
      shareCards: [],
      friendComparisons: []
    },
    profile: {
      xp: 0,
      level: 1,
      tokens: 0,
      achievements: [],
      playHistory: [],
      insightRuns: 0,
      nightLaunches: 0,
      persona: null,
      personaImpact: {
        riskBias: 0,
        focusBias: 0,
        empathyBias: 0,
        speedBias: 0
      },
      decisionAnalytics: {
        utilitarian: 0,
        kantian: 0,
        virtue: 0,
        riskTaking: 0,
        caution: 0
      }
    },
    progression: {
      unlockedModes: {
        clickerAdvanced: false,
        stockPro: false,
        trolleyGenerator: false,
        geoRanked: false,
        wordCompetitive: false
      }
    },
    telemetry: {
      transitionMatrix: {},
      appLaunches: {},
      lastApp: 'dashboard',
      timeSpent: {},
      strategicSignals: {
        optimizer: 0,
        explorer: 0,
        speedRunner: 0,
        analyst: 0
      }
    },
    modules: {
      clicker: null,
      stock: null,
      trolley: null,
      time: null,
      lifearc: null,
      persona: null,
      geo: null,
      wordforge: null
    }
  };
}

export function createStore() {
  const loaded = safeParse(localStorage.getItem(STORE_KEY), null);
  const seeded = seedState();
  let state = {
    ...seeded,
    ...(loaded || {}),
    session: { ...seeded.session, ...((loaded && loaded.session) || {}) },
    auth: { ...seeded.auth, ...((loaded && loaded.auth) || {}) },
    cloud: { ...seeded.cloud, ...((loaded && loaded.cloud) || {}) },
    social: { ...seeded.social, ...((loaded && loaded.social) || {}) },
    profile: {
      ...seeded.profile,
      ...((loaded && loaded.profile) || {}),
      personaImpact: { ...seeded.profile.personaImpact, ...((loaded && loaded.profile && loaded.profile.personaImpact) || {}) },
      decisionAnalytics: { ...seeded.profile.decisionAnalytics, ...((loaded && loaded.profile && loaded.profile.decisionAnalytics) || {}) }
    },
    progression: {
      ...seeded.progression,
      ...((loaded && loaded.progression) || {}),
      unlockedModes: { ...seeded.progression.unlockedModes, ...((loaded && loaded.progression && loaded.progression.unlockedModes) || {}) }
    },
    telemetry: {
      ...seeded.telemetry,
      ...((loaded && loaded.telemetry) || {}),
      strategicSignals: { ...seeded.telemetry.strategicSignals, ...((loaded && loaded.telemetry && loaded.telemetry.strategicSignals) || {}) }
    },
    modules: { ...seeded.modules, ...((loaded && loaded.modules) || {}) }
  };
  const listeners = new Set();
  let achievementListener = null;

  function persistAndNotify() {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
    listeners.forEach((fn) => fn(state));
  }

  function grantAchievement(item, appId = null) {
    if (state.profile.achievements.some((a) => a.id === item.id)) return;
    const payload = {
      id: item.id,
      title: item.title,
      tier: item.tier,
      hidden: item.hidden,
      at: Date.now(),
      appId: appId || state.session.currentApp
    };
    state = {
      ...state,
      profile: {
        ...state.profile,
        achievements: [payload, ...state.profile.achievements]
      }
    };
    achievementListener && achievementListener(payload);
  }

  function evaluateAchievements(appId = null) {
    ACHIEVEMENTS.forEach((a) => {
      if (!state.profile.achievements.some((x) => x.id === a.id) && a.test(state)) grantAchievement(a, appId);
    });
  }

  const api = {
    getState() { return state; },
    setState(updater) {
      const next = typeof updater === 'function' ? updater(state) : updater;
      state = next;
      evaluateAchievements();
      persistAndNotify();
    },
    patch(partial) { api.setState((s) => ({ ...s, ...partial })); },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    setAchievementListener(fn) {
      achievementListener = fn;
    },
    addXP(amount, reason, appId) {
      if (!amount) return;
      state = (() => {
        const xp = state.profile.xp + amount;
        const level = calcLevel(xp);
        const playHistory = [
          { at: Date.now(), appId: appId || state.session.currentApp, reason, xp: amount },
          ...state.profile.playHistory
        ].slice(0, 300);
        return { ...state, profile: { ...state.profile, xp, level, playHistory } };
      })();
      evaluateAchievements(appId);
      persistAndNotify();
    },
    grantTokens(amount, reason, appId) {
      if (!amount) return;
      state = (() => {
        const tokens = state.profile.tokens + amount;
        const playHistory = [
          { at: Date.now(), appId: appId || state.session.currentApp, reason, tokens: amount },
          ...state.profile.playHistory
        ].slice(0, 300);
        return { ...state, profile: { ...state.profile, tokens, playHistory } };
      })();
      api.evaluateUnlocks();
      evaluateAchievements(appId);
      persistAndNotify();
    },
    addAchievement(id, title, appId, tier = 'Bronze', hidden = false) {
      if (state.profile.achievements.some((a) => a.id === id)) return;
      const payload = { id, title, tier, hidden, at: Date.now(), appId: appId || state.session.currentApp };
      state = { ...state, profile: { ...state.profile, achievements: [payload, ...state.profile.achievements] } };
      achievementListener && achievementListener(payload);
      evaluateAchievements(appId);
      persistAndNotify();
    },
    trackDecision(delta) {
      state = {
        ...state,
        profile: {
          ...state.profile,
          decisionAnalytics: {
            ...state.profile.decisionAnalytics,
            ...Object.fromEntries(Object.entries(delta).map(([k, v]) => [k, (state.profile.decisionAnalytics[k] || 0) + v]))
          }
        }
      };
      evaluateAchievements();
      persistAndNotify();
    },
    setPersonaProfile(persona, impact) {
      state = {
        ...state,
        profile: {
          ...state.profile,
          persona,
          personaImpact: { ...state.profile.personaImpact, ...(impact || {}) }
        }
      };
      evaluateAchievements('persona');
      persistAndNotify();
    },
    incrementInsightRuns() {
      state = {
        ...state,
        profile: { ...state.profile, insightRuns: (state.profile.insightRuns || 0) + 1 }
      };
      evaluateAchievements();
      persistAndNotify();
    },
    trackStrategicSignal(delta) {
      state = {
        ...state,
        telemetry: {
          ...state.telemetry,
          strategicSignals: {
            ...state.telemetry.strategicSignals,
            ...Object.fromEntries(Object.entries(delta).map(([k, v]) => [k, (state.telemetry.strategicSignals[k] || 0) + v]))
          }
        }
      };
      persistAndNotify();
    },
    evaluateUnlocks() {
      const t = state.profile.tokens;
      state = {
        ...state,
        progression: {
          ...state.progression,
          unlockedModes: {
            clickerAdvanced: t >= 35,
            stockPro: t >= 65,
            trolleyGenerator: t >= 95,
            geoRanked: t >= 45,
            wordCompetitive: t >= 55
          }
        }
      };
    },
    trackLaunch(nextApp) {
      const now = Date.now();
      const from = state.telemetry.lastApp || 'dashboard';
      const elapsed = Math.max(0, Math.floor((now - (state.session.startedAt || now)) / 1000));

      const matrix = { ...state.telemetry.transitionMatrix };
      matrix[from] = matrix[from] || {};
      matrix[from][nextApp] = (matrix[from][nextApp] || 0) + 1;

      const launches = { ...state.telemetry.appLaunches, [nextApp]: (state.telemetry.appLaunches[nextApp] || 0) + 1 };
      const timeSpent = { ...state.telemetry.timeSpent, [from]: (state.telemetry.timeSpent[from] || 0) + elapsed };

      const hour = new Date().getHours();
      const nightLaunches = state.profile.nightLaunches + ((hour >= 23 || hour <= 4) ? 1 : 0);

      state = {
        ...state,
        session: { ...state.session, currentApp: nextApp, startedAt: now },
        profile: { ...state.profile, nightLaunches },
        telemetry: { ...state.telemetry, transitionMatrix: matrix, appLaunches: launches, lastApp: nextApp, timeSpent }
      };

      evaluateAchievements(nextApp);
      persistAndNotify();
    }
  };

  api.evaluateUnlocks();
  evaluateAchievements();
  persistAndNotify();
  return api;
}

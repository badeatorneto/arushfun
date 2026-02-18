import { createStore } from './core/store.js';
import { mountDock } from './ui/dock.js';
import { mountDashboard } from './ui/dashboard.js';
import { createNotifier } from './ui/notifications.js';
import { analyzeUserPatterns } from './core/insight.js';
import { loadCloudConfig, loginWithProvider, saveCloudConfig, syncState } from './core/cloudSync.js';

const store = createStore();
const notifier = createNotifier('notifyRoot');

const registry = [
  { id: 'dashboard', name: 'Dashboard', icon: '🏠', loader: () => import('./apps/dashboard.js') },
  { id: 'time', name: 'Life Trajectory', icon: '⏳', loader: () => import('./apps/time.js') },
  { id: 'lifearc', name: 'Life Arc', icon: '🧬', loader: () => import('./apps/lifearc.js') },
  { id: 'persona', name: 'Persona', icon: '🧠', loader: () => import('./apps/persona.js') },
  { id: 'wordforge', name: 'Word Forge', icon: '🟩', loader: () => import('./apps/wordforge.js') },
  { id: 'geo', name: 'Geo Rush', icon: '🗺️', loader: () => import('./apps/geo.js') },
  { id: 'clicker', name: 'Clicker', icon: '🏭', loader: () => import('./apps/clicker.js') },
  { id: 'stock', name: 'Stock Pro', icon: '📈', loader: () => import('./apps/stock.js') },
  { id: 'trolley', name: 'Ethics', icon: '⚖️', loader: () => import('./apps/trolley.js') },
  { id: 'analytics', name: 'Analytics', icon: '📊', loader: () => import('./apps/analytics.js') }
];

const lookup = new Map(registry.map((x) => [x.id, x]));
const loaded = new Map();
let active = null;
let unmountActive = null;

const viewport = document.getElementById('appViewport');
const dockEl = document.getElementById('dock');
const statsPanel = document.getElementById('statsPanel');

const dock = mountDock(dockEl, registry, (id) => navigate(id));
const unmountDashboard = mountDashboard(statsPanel, store);

store.setAchievementListener((a) => notifier.achievement(a));

const cfg = loadCloudConfig();
store.setState((s) => ({
  ...s,
  cloud: { endpoint: cfg.endpoint || s.cloud.endpoint, apiKey: cfg.apiKey || s.cloud.apiKey },
  auth: { ...s.auth, cloudConfigured: Boolean(cfg.endpoint) }
}));

function toast(message, type = 'info', ttl = 2600) {
  notifier.push(message, type, ttl);
}

function skeleton() {
  viewport.innerHTML = `<div class="skeleton"><div class="sk big"></div><div class="sk"></div><div class="sk"></div><div class="sk"></div><div class="sk" style="width:70%"></div></div>`;
}

async function loadApp(id) {
  if (loaded.has(id)) return loaded.get(id);
  const entry = lookup.get(id);
  if (!entry) return null;
  const mod = await entry.loader();
  loaded.set(id, mod.app);
  return mod.app;
}

function likelyNextApp(current) {
  const matrix = store.getState().telemetry.transitionMatrix[current] || {};
  const best = Object.entries(matrix).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (best) return best;
  return loaded.get(current)?.preloadHint?.[0] || null;
}

function preloadPrediction(current) {
  const candidate = likelyNextApp(current);
  if (!candidate || loaded.has(candidate)) return;
  const entry = lookup.get(candidate);
  if (entry) entry.loader().then((m) => loaded.set(candidate, m.app)).catch(() => {});
}

async function navigate(id) {
  const app = await loadApp(id);
  if (!app) return;
  if (active === id) return;

  store.trackLaunch(id);

  if (unmountActive) {
    try { unmountActive(); } catch {}
    unmountActive = null;
  }

  viewport.classList.remove('module-enter');
  viewport.classList.add('module-exit');
  await new Promise((r) => setTimeout(r, 150));

  if (app.heavy) skeleton();
  viewport.innerHTML = '';

  const mountResult = await app.mount(viewport, { store, navigate, toast });
  unmountActive = mountResult?.unmount || app.unmount || null;

  viewport.classList.remove('module-exit');
  viewport.classList.add('module-enter');
  active = id;
  dock.setActive(id);

  if (id !== 'dashboard') store.addXP(2, 'Simulation launch', id);
  preloadPrediction(id);
}

function wireControls() {
  const modal = document.getElementById('authModal');
  const authBtn = document.getElementById('authBtn');
  const syncBtn = document.getElementById('syncBtn');
  const themeBtn = document.getElementById('themeBtn');
  const insightBtn = document.getElementById('insightBtn');

  const closeAuth = document.getElementById('closeAuth');
  const googleLogin = document.getElementById('googleLogin');
  const githubLogin = document.getElementById('githubLogin');
  const saveCloud = document.getElementById('saveCloudConfig');
  const endpointInput = document.getElementById('cloudEndpoint');
  const keyInput = document.getElementById('cloudApiKey');

  const patchAuthBtn = () => {
    const s = store.getState();
    authBtn.textContent = s.auth.provider ? s.auth.handle : 'Login';
    insightBtn.textContent = `Insight: ${s.session.insightMode ? 'ON' : 'OFF'}`;
  };
  patchAuthBtn();
  store.subscribe(patchAuthBtn);

  authBtn.addEventListener('click', () => {
    const s = store.getState();
    endpointInput.value = s.cloud.endpoint || '';
    keyInput.value = s.cloud.apiKey || '';
    modal.classList.add('open');
  });
  closeAuth.addEventListener('click', () => modal.classList.remove('open'));
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('open'); });

  googleLogin.addEventListener('click', () => {
    loginWithProvider(store, 'google');
    toast('Connected identity: Google', 'ok');
  });
  githubLogin.addEventListener('click', () => {
    loginWithProvider(store, 'github');
    toast('Connected identity: GitHub', 'ok');
  });

  saveCloud.addEventListener('click', () => {
    const endpoint = endpointInput.value.trim();
    const apiKey = keyInput.value.trim();
    store.setState((s) => ({
      ...s,
      cloud: { endpoint, apiKey },
      auth: { ...s.auth, cloudConfigured: Boolean(endpoint) }
    }));
    saveCloudConfig({ endpoint, apiKey });
    toast(endpoint ? 'Cloud config saved.' : 'Cloud config cleared.', endpoint ? 'ok' : 'warn');
  });

  syncBtn.addEventListener('click', async () => {
    const res = await syncState(store, 'push');
    toast(res.message, res.ok ? 'ok' : 'bad', 3200);
  });

  themeBtn.addEventListener('click', () => {
    store.setState((s) => ({ ...s, theme: s.theme === 'dark' ? 'light' : 'dark' }));
    applyTheme();
  });

  insightBtn.addEventListener('click', () => {
    store.setState((s) => ({ ...s, session: { ...s.session, insightMode: !s.session.insightMode } }));
    const on = store.getState().session.insightMode;
    toast(on ? 'Insight mode enabled.' : 'Insight mode paused.', on ? 'ok' : 'warn');
  });

  document.addEventListener('keydown', (e) => {
    if (/^[1-9]$/.test(e.key)) {
      const idx = Number(e.key) - 1;
      const app = registry[idx];
      if (app) navigate(app.id);
    }
    if (e.key === '0') {
      const app = registry[9];
      if (app) navigate(app.id);
    }
    if (e.key === '[' || e.key === ']') {
      const idx = registry.findIndex((a) => a.id === active);
      if (idx < 0) return;
      const next = e.key === '[' ? registry[Math.max(0, idx - 1)] : registry[Math.min(registry.length - 1, idx + 1)];
      if (next) navigate(next.id);
    }
  });
}

function applyTheme() {
  const dark = store.getState().theme === 'dark';
  document.body.classList.toggle('theme-light', !dark);
}

window.addEventListener('beforeunload', () => {
  try { unmountActive && unmountActive(); } catch {}
  unmountDashboard();
});

setInterval(() => {
  const i = analyzeUserPatterns(store.getState());
  if (store.getState().session.insightMode && Math.random() < 0.06) {
    toast(`Insight pulse: risk ${Math.round(i.riskTolerance)} · strategy ${Math.round(i.strategicIndex)}.`, 'info', 2300);
  }
}, 8000);

wireControls();
applyTheme();
navigate(store.getState().session.currentApp || 'dashboard');

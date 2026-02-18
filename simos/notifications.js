export function createNotifier(containerId = 'notifyRoot') {
  let root = document.getElementById(containerId);
  if (!root) {
    root = document.createElement('div');
    root.id = containerId;
    root.style.cssText = 'position:fixed;right:14px;bottom:84px;z-index:220;display:grid;gap:8px;max-width:340px';
    document.body.appendChild(root);
  }

  function push(message, type = 'info', ttl = 2600) {
    const colors = {
      info: ['#0f172a', '#60a5fa', '#dbeafe'],
      ok: ['#052e16', '#22c55e', '#bbf7d0'],
      warn: ['#3b1d04', '#f59e0b', '#fde68a'],
      bad: ['#3f0f1a', '#f87171', '#fecaca'],
      legendary: ['#2e1065', '#a78bfa', '#ede9fe']
    };
    const [bg, border, text] = colors[type] || colors.info;
    const el = document.createElement('div');
    el.style.cssText = `border:1px solid ${border};background:${bg};color:${text};border-radius:12px;padding:10px 12px;box-shadow:0 14px 30px rgba(0,0,0,.35);font-size:12px;line-height:1.45;backdrop-filter:blur(8px);transform:translateY(10px);opacity:0;transition:.18s`;
    el.textContent = message;
    root.appendChild(el);
    requestAnimationFrame(() => { el.style.transform = 'translateY(0)'; el.style.opacity = '1'; });
    setTimeout(() => {
      el.style.transform = 'translateY(8px)';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 220);
    }, ttl);
  }

  function achievement(a) {
    const t = (a.tier || '').toLowerCase();
    const type = t === 'legendary' ? 'legendary' : t === 'gold' ? 'warn' : t === 'silver' ? 'info' : 'ok';
    push(`Achievement Unlocked: [${a.tier}] ${a.title}`, type, 3600);
  }

  return { push, achievement };
}

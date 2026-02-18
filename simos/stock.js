import { drawCandles, drawLineChart } from '../lib/charts.js';
import { generateMarketEvent, postGameFeedback } from '../core/insight.js';

const KEY = 'simos_stock_v2';
const symbols = ['AAPL', 'NVDA', 'MSFT', 'TSLA', 'AMZN', 'META', 'SPY', 'BTC'];

function initState() {
  return {
    cash: 100000,
    holdings: {},
    orders: [],
    candles: {},
    selected: 'AAPL',
    journal: [],
    news: [],
    replay: { active: false, index: 0 },
    history: [],
    heat: {},
    lastTick: Date.now()
  };
}

function load() {
  const base = initState();
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { ...base, ...parsed };
  } catch {
    return base;
  }
}
function save(s) { localStorage.setItem(KEY, JSON.stringify(s)); }

function seedCandles(state) {
  symbols.forEach((sym, idx) => {
    if (state.candles[sym]?.length) return;
    let p = 70 + idx * 35;
    state.candles[sym] = [];
    for (let i = 0; i < 160; i++) {
      const drift = (Math.random() - 0.48) * (1 + idx * 0.08);
      const o = p;
      const c = Math.max(2, p + drift);
      const h = Math.max(o, c) + Math.random() * 1.2;
      const l = Math.min(o, c) - Math.random() * 1.2;
      p = c;
      state.candles[sym].push({ o, h, l, c, t: Date.now() - (160 - i) * 60000 });
    }
    state.heat[sym] = 0;
  });
}

function price(state, sym) {
  const arr = state.candles[sym] || [];
  return arr[arr.length - 1]?.c || 0;
}

function SMA(arr, len) {
  if (arr.length < len) return null;
  const cut = arr.slice(arr.length - len);
  return cut.reduce((a, b) => a + b, 0) / len;
}

function RSI(closes, period = 14) {
  if (closes.length <= period) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gains += d;
    else losses += Math.abs(d);
  }
  const rs = gains / Math.max(0.0001, losses);
  return 100 - 100 / (1 + rs);
}

function EMA(values, period) {
  const k = 2 / (period + 1);
  let ema = values[0] || 0;
  for (let i = 1; i < values.length; i++) ema = values[i] * k + ema * (1 - k);
  return ema;
}

function MACD(closes) {
  if (closes.length < 40) return { macd: 0, signal: 0 };
  const e12 = EMA(closes.slice(-80), 12);
  const e26 = EMA(closes.slice(-80), 26);
  const macd = e12 - e26;
  const signal = EMA([macd, ...closes.slice(-9).map((_, i) => macd * (1 - i * 0.03))], 9);
  return { macd, signal };
}

function riskScore(state) {
  const total = state.cash + symbols.reduce((sum, sym) => sum + (state.holdings[sym] || 0) * price(state, sym), 0);
  if (total <= 0) return 0;
  let concentration = 0;
  let vol = 0;
  symbols.forEach((sym) => {
    const val = (state.holdings[sym] || 0) * price(state, sym);
    const weight = val / total;
    concentration += weight * weight;
    vol += Math.abs(state.heat[sym] || 0) * weight;
  });
  return Math.min(100, Math.round(concentration * 150 + vol * 8));
}

function executeOrder(state, order, px) {
  const qty = Math.max(1, Math.floor(order.qty));
  if (order.side === 'buy') {
    const cost = qty * px;
    if (state.cash < cost) return false;
    state.cash -= cost;
    state.holdings[order.sym] = (state.holdings[order.sym] || 0) + qty;
  } else {
    const have = state.holdings[order.sym] || 0;
    const sellQty = Math.min(have, qty);
    if (sellQty <= 0) return false;
    state.holdings[order.sym] = have - sellQty;
    state.cash += sellQty * px;
  }
  state.journal.unshift({
    at: Date.now(),
    sym: order.sym,
    side: order.side,
    qty,
    px,
    type: order.type,
    note: order.note || ''
  });
  state.journal = state.journal.slice(0, 180);
  return true;
}

export const app = {
  id: 'stock',
  name: 'Stock Pro',
  icon: '📈',
  heavy: true,
  preloadHint: ['trolley'],
  async mount(container, ctx) {
    const state = load();
    seedCandles(state);
    const persona = ctx.store.getState().profile.personaImpact || {};

    container.innerHTML = `
      <section style="display:grid;gap:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;border:1px solid #27314a;border-radius:14px;padding:14px;background:#0f172a">
          <div>
            <div style="font-size:28px;font-weight:800">Professional Trading Simulator</div>
            <div style="font-size:12px;color:#94a3b8">Candles · RSI · MACD · Limit/Stop/Trailing · Replay · Backtest</div>
          </div>
          <div style="text-align:right;font-size:12px;color:#94a3b8">
            <div>Cash: <b id="cashLine" style="color:#e5e7eb"></b></div>
            <div>Risk Score: <b id="riskLine" style="color:#fbbf24"></b></div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:2fr 1fr;gap:12px" id="stockGrid">
          <div style="display:grid;gap:12px">
            <div style="border:1px solid #27314a;border-radius:14px;padding:12px;background:#0f172a">
              <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px">
                <select id="symPick" style="border:1px solid #334155;background:#111827;color:#e5e7eb;border-radius:8px;padding:8px">${symbols.map((s) => `<option>${s}</option>`).join('')}</select>
                <button id="toggleReplay" style="border:1px solid #334155;background:#111827;color:#e5e7eb;border-radius:8px;padding:8px 10px">Replay</button>
                <button id="runBacktest" style="border:1px solid #334155;background:#111827;color:#e5e7eb;border-radius:8px;padding:8px 10px">Backtest MA</button>
                <button id="stockInsight" style="border:1px solid #334155;background:#0b1220;color:#93c5fd;border-radius:8px;padding:8px 10px">Insight</button>
                <span id="indicatorLine" style="font-size:12px;color:#94a3b8"></span>
              </div>
              <canvas id="candleChart" width="980" height="310" style="width:100%;height:310px;background:#0b1220;border:1px solid #27314a;border-radius:10px"></canvas>
              <canvas id="perfChart" width="980" height="110" style="width:100%;height:110px;margin-top:8px;background:#0b1220;border:1px solid #27314a;border-radius:10px"></canvas>
            </div>

            <div style="border:1px solid #27314a;border-radius:14px;padding:12px;background:#0f172a">
              <div style="font-weight:800;margin-bottom:8px">Simulated News Feed</div>
              <div id="newsFeed" style="display:grid;gap:6px;font-size:12px"></div>
            </div>
          </div>

          <div style="display:grid;gap:12px">
            <div style="border:1px solid #27314a;border-radius:14px;padding:12px;background:#0f172a">
              <div style="font-weight:800;margin-bottom:8px">Order Ticket</div>
              <div style="display:grid;gap:7px">
                <select id="orderType" style="border:1px solid #334155;background:#111827;color:#e5e7eb;border-radius:8px;padding:8px"><option value="market">Market</option><option value="limit">Limit</option><option value="stop">Stop</option><option value="trailing">Trailing Stop</option></select>
                <select id="orderSide" style="border:1px solid #334155;background:#111827;color:#e5e7eb;border-radius:8px;padding:8px"><option value="buy">Buy</option><option value="sell">Sell</option></select>
                <input id="orderQty" type="number" min="1" value="10" style="border:1px solid #334155;background:#111827;color:#e5e7eb;border-radius:8px;padding:8px" />
                <input id="orderTrig" type="number" step="0.01" placeholder="Trigger price (for limit/stop/trailing)" style="border:1px solid #334155;background:#111827;color:#e5e7eb;border-radius:8px;padding:8px" />
                <input id="orderNote" type="text" placeholder="Journal note" style="border:1px solid #334155;background:#111827;color:#e5e7eb;border-radius:8px;padding:8px" />
                <button id="placeOrder" style="border:1px solid #22c55e;background:#14532d;color:#bbf7d0;border-radius:8px;padding:8px 10px;font-weight:700">Place Order</button>
              </div>
            </div>

            <div style="border:1px solid #27314a;border-radius:14px;padding:12px;background:#0f172a">
              <div style="font-weight:800;margin-bottom:8px">Portfolio Allocation</div>
              <div id="allocList" style="font-size:12px;line-height:1.65"></div>
              <div style="font-weight:800;margin:10px 0 6px">Heatmap</div>
              <div id="heatmap" style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px"></div>
            </div>

            <div style="border:1px solid #27314a;border-radius:14px;padding:12px;background:#0f172a">
              <div style="font-weight:800;margin-bottom:8px">Trading Journal</div>
              <div id="journal" style="font-size:11px;max-height:260px;overflow:auto"></div>
            </div>
          </div>
        </div>
      </section>
    `;

    if (window.matchMedia('(max-width: 1200px)').matches) {
      container.querySelector('#stockGrid').style.gridTemplateColumns = '1fr';
    }

    const symPick = container.querySelector('#symPick');
    const candleCanvas = container.querySelector('#candleChart');
    const perfCanvas = container.querySelector('#perfChart');
    const indicatorLine = container.querySelector('#indicatorLine');
    const newsFeed = container.querySelector('#newsFeed');
    const allocList = container.querySelector('#allocList');
    const heatmap = container.querySelector('#heatmap');
    const journal = container.querySelector('#journal');

    symPick.value = state.selected;

    function pushNews(line, impact = 0) {
      state.news.unshift({ line, at: Date.now(), impact });
      state.news = state.news.slice(0, 24);
    }

    function render() {
      container.querySelector('#cashLine').textContent = `$${state.cash.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
      container.querySelector('#riskLine').textContent = `${riskScore(state)}/100`;

      const sym = state.selected;
      const c = state.candles[sym];
      const closes = c.map((x) => x.c);
      const rsi = RSI(closes);
      const macd = MACD(closes);
      const sma20 = SMA(closes, 20) || closes[closes.length - 1];
      indicatorLine.textContent = `Price ${price(state, sym).toFixed(2)} · RSI ${rsi.toFixed(1)} · MACD ${macd.macd.toFixed(2)}/${macd.signal.toFixed(2)} · SMA20 ${sma20.toFixed(2)}`;

      const viewCandles = state.replay.active ? c.slice(0, Math.max(20, state.replay.index)) : c.slice(-120);
      drawCandles(candleCanvas, viewCandles);

      const portfolioValue = symbols.reduce((sum, s) => sum + (state.holdings[s] || 0) * price(state, s), 0);
      const net = state.cash + portfolioValue;
      state.history.push(net);
      if (state.history.length > 170) state.history.shift();
      drawLineChart(perfCanvas, state.history, '#facc15');

      allocList.innerHTML = symbols
        .filter((s) => state.holdings[s])
        .map((s) => {
          const val = (state.holdings[s] || 0) * price(state, s);
          const pct = net > 0 ? (val / net) * 100 : 0;
          return `<div>${s}: ${state.holdings[s]} shares · $${val.toFixed(2)} · ${pct.toFixed(1)}%</div>`;
        })
        .join('') || 'No positions.';

      heatmap.innerHTML = symbols.map((s) => {
        const h = state.heat[s] || 0;
        const bg = h >= 0 ? `rgba(52,211,153,${Math.min(0.9, 0.2 + Math.abs(h) / 8)})` : `rgba(248,113,113,${Math.min(0.9, 0.2 + Math.abs(h) / 8)})`;
        return `<div style="border:1px solid #334155;border-radius:8px;padding:6px;background:${bg};font-size:11px">${s}<br>${h.toFixed(2)}%</div>`;
      }).join('');

      newsFeed.innerHTML = state.news.map((n) => `<div style="border:1px solid #27314a;background:#0b1220;border-radius:8px;padding:7px">${n.line}<div style="color:#64748b">${new Date(n.at).toLocaleTimeString()}</div></div>`).join('') || '<div>No news yet.</div>';
      journal.innerHTML = state.journal.map((j) => `<div style="border-bottom:1px solid #27314a;padding:6px 0">${new Date(j.at).toLocaleTimeString()} · <b>${j.side.toUpperCase()}</b> ${j.qty} ${j.sym} @ ${j.px.toFixed(2)} <div style="color:#94a3b8">${j.type}${j.note ? ' · ' + j.note : ''}</div></div>`).join('') || 'No trades yet.';
    }

    function evolveMarket() {
      symbols.forEach((sym) => {
        const arr = state.candles[sym];
        const last = arr[arr.length - 1];
        const volShock = Math.random() < 0.08 ? (Math.random() - 0.5) * (6 + (persona.riskBias || 0) * 2.2) : 0;
        const drift = (Math.random() - 0.5) * 1.2 + volShock;
        const o = last.c;
        const c = Math.max(1, o + drift);
        const h = Math.max(o, c) + Math.random() * 0.9;
        const l = Math.min(o, c) - Math.random() * 0.9;
        arr.push({ o, h, l, c, t: Date.now() });
        if (arr.length > 300) arr.shift();
        state.heat[sym] = ((c - o) / o) * 100;
      });

      if (Math.random() < 0.12) {
        const sym = symbols[Math.floor(Math.random() * symbols.length)];
        const ev = generateMarketEvent(ctx.store.getState());
        const pct = ev.impactPct;
        const arr = state.candles[sym];
        const last = arr[arr.length - 1];
        const shocked = Math.max(1, last.c * (1 + pct / 100));
        arr.push({ o: last.c, h: Math.max(last.c, shocked), l: Math.min(last.c, shocked), c: shocked, t: Date.now() });
        pushNews(`${sym} moved ${pct >= 0 ? '+' : ''}${pct.toFixed(2)}% after AI event: ${ev.tag}.`, pct);
      }
    }

    function checkOrders() {
      const remaining = [];
      state.orders.forEach((o) => {
        const px = price(state, o.sym);
        let fire = false;
        if (o.type === 'market') fire = true;
        if (o.type === 'limit') fire = o.side === 'buy' ? px <= o.trigger : px >= o.trigger;
        if (o.type === 'stop') fire = o.side === 'buy' ? px >= o.trigger : px <= o.trigger;
        if (o.type === 'trailing') {
          if (!o.trailingTop) o.trailingTop = px;
          o.trailingTop = Math.max(o.trailingTop, px);
          const stopPx = o.trailingTop * (1 - o.trigger / 100);
          fire = px <= stopPx;
        }
        if (fire) {
          executeOrder(state, o, px);
          ctx.store.addXP(5, 'Executed order', 'stock');
        } else {
          remaining.push(o);
        }
      });
      state.orders = remaining;
    }

    container.querySelector('#placeOrder').addEventListener('click', () => {
      const order = {
        sym: state.selected,
        type: container.querySelector('#orderType').value,
        side: container.querySelector('#orderSide').value,
        qty: Number(container.querySelector('#orderQty').value || 1),
        trigger: Number(container.querySelector('#orderTrig').value || 0),
        note: container.querySelector('#orderNote').value || ''
      };
      state.orders.push(order);
      ctx.store.addAchievement('stock-order', 'Placed Advanced Order', 'stock');
      render();
    });

    container.querySelector('#runBacktest').addEventListener('click', () => {
      const sym = state.selected;
      const arr = state.candles[sym];
      let cash = 10000, shares = 0;
      for (let i = 30; i < arr.length; i++) {
        const closes = arr.slice(0, i + 1).map((x) => x.c);
        const ma10 = SMA(closes, 10), ma30 = SMA(closes, 30);
        const px = closes[closes.length - 1];
        if (ma10 > ma30 && cash > px) { const q = Math.floor(cash / px); shares += q; cash -= q * px; }
        if (ma10 < ma30 && shares > 0) { cash += shares * px; shares = 0; }
      }
      const final = cash + shares * arr[arr.length - 1].c;
      pushNews(`Backtest (${sym} MA crossover) result: $${final.toFixed(2)} from $10,000.`);
      ctx.store.addXP(12, 'Backtest strategy', 'stock');
      render();
    });

    container.querySelector('#toggleReplay').addEventListener('click', () => {
      state.replay.active = !state.replay.active;
      state.replay.index = 24;
    });
    container.querySelector('#stockInsight').addEventListener('click', () => {
      ctx.store.incrementInsightRuns();
      const rs = riskScore(state);
      ctx.toast(postGameFeedback(ctx.store.getState(), 'stock', { summary: `Portfolio risk score ${rs}/100 with ${state.orders.length} pending orders.` }), 'info', 4400);
    });

    symPick.addEventListener('change', (e) => {
      state.selected = e.target.value;
      render();
    });

    render();
    let loop = null;
    loop = setInterval(() => {
      evolveMarket();
      checkOrders();
      if (state.replay.active) {
        state.replay.index += 2;
        if (state.replay.index >= state.candles[state.selected].length) state.replay.active = false;
      }

      const portfolioValue = symbols.reduce((sum, s) => sum + (state.holdings[s] || 0) * price(state, s), 0);
      const net = state.cash + portfolioValue;
      if (net > 108000) {
        ctx.store.grantTokens(4, 'Portfolio +8%', 'stock');
        ctx.store.addAchievement('stock-8pct', 'Portfolio Up 8%', 'stock');
      }

      render();
    }, 1300);

    return {
      unmount() {
        clearInterval(loop);
        save(state);
      }
    };
  }
};

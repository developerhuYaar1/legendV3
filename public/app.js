const numberFormat = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
const instrumentButtons = [...document.querySelectorAll('.instrument-tabs button')];
let selectedSymbol = 'NIFTY';
let marketData = null;
let activeView = 'overview';

function formatNumber(value) {
  return Number.isFinite(value) ? numberFormat.format(value) : '--';
}

function formatSigned(value, suffix = '') {
  if (!Number.isFinite(value)) return '--';
  return `${value > 0 ? '+' : ''}${numberFormat.format(value)}${suffix}`;
}

function setTone(element, value) {
  element.classList.toggle('positive', Number.isFinite(value) && value > 0);
  element.classList.toggle('negative', Number.isFinite(value) && value < 0);
}

function formatTime(timestamp) {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(new Date(timestamp));
}

function renderOpeningConviction(instrument) {
  const conviction = instrument.openingConviction || {};
  const labels = {
    UP: 'OPENED ABOVE VALUE',
    DOWN: 'OPENED BELOW VALUE',
    INSIDE: 'OPENED INSIDE VALUE',
    WAITING_OPEN: 'WAITING FOR OPEN',
    WAITING_PRIOR_VALUE: 'NO PRIOR VALUE',
    WAITING_FOR_MARKET_SESSION: 'WAITING FOR NEXT MARKET SESSION'
  };
  const status = labels[conviction.direction] || 'WAITING';
  const comparison = conviction.direction === 'UP'
    ? `Open ${formatNumber(conviction.open)} > prior VAH ${formatNumber(conviction.previousVah)}`
    : conviction.direction === 'DOWN'
      ? `Open ${formatNumber(conviction.open)} < prior VAL ${formatNumber(conviction.previousVal)}`
      : conviction.direction === 'INSIDE'
        ? `Open ${formatNumber(conviction.open)} inside ${formatNumber(conviction.previousVal)} to ${formatNumber(conviction.previousVah)}`
        : '--';
  const reference = conviction.previousDate
    ? `${conviction.previousDate} | VAH ${formatNumber(conviction.previousVah)} | VAL ${formatNumber(conviction.previousVal)}`
    : 'No saved prior session value area';

  const element = document.getElementById('opening-status');
  element.textContent = status;
  element.dataset.bias = conviction.direction || 'waiting';
  document.getElementById('opening-comparison').textContent = comparison;
  document.getElementById('opening-reference').textContent = reference;
}

function updateInstrument() {
  if (!marketData) return;
  const instrument = marketData.instruments?.[selectedSymbol];
  if (!instrument) return;

  document.getElementById('symbol-label').textContent = instrument.symbol || `${selectedSymbol} FUTURES`;
  const contract = instrument.contract;
  document.getElementById('active-contract').textContent = contract
    ? `${selectedSymbol} CONTRACT · ${contract.symbol} · ${contract.description} · EXPIRY ${contract.expiryLabel || contract.expiryDate || 'DATE UNAVAILABLE'}${contract.expired ? ' · EXPIRED' : ''}`
    : `${selectedSymbol} CONTRACT · ${instrument.symbol || 'waiting for FYERS symbol master'}`;
  document.getElementById('ltp').textContent = formatNumber(instrument.price);
  const changeText = Number.isFinite(instrument.change)
    ? `${formatSigned(instrument.change)} (${formatSigned(instrument.changePercent, '%')})`
    : '--';
  const change = document.getElementById('change');
  change.textContent = changeText;
  setTone(change, instrument.change);

  document.getElementById('open').textContent = formatNumber(instrument.open);
  document.getElementById('high').textContent = formatNumber(instrument.high);
  document.getElementById('low').textContent = formatNumber(instrument.low);
  const delta = document.getElementById('delta');
  delta.textContent = instrument.deltaSource === 'FYERS_CHART'
    ? formatSigned(instrument.delta)
    : '--';
  setTone(delta, instrument.delta);
  document.getElementById('delta-note').textContent = instrument.deltaSource === 'FYERS_CHART'
    ? 'FYERS footprint · 5-minute candle'
    : 'waiting for FYERS capture';
  const cvd = document.getElementById('cvd');
  cvd.textContent = instrument.cvdSource === 'FYERS_CHART'
    ? formatSigned(instrument.cvd)
    : '--';
  setTone(cvd, instrument.cvd);
  document.getElementById('cvd-note').textContent = instrument.cvdSource === 'FYERS_CHART'
    ? 'FYERS captured Bid/Ask volume'
    : 'waiting for FYERS capture';
  renderOpeningConviction(instrument);
}

function setView(view) {
  activeView = view;
  document.querySelectorAll('[data-overview]').forEach((section) => {
    section.hidden = view !== 'overview';
  });
  document.getElementById('market-read-view').hidden = view !== 'read';
}

function renderBaselineAreas(areas = [], { comparison = false } = {}) {
  const section = document.getElementById('baseline-areas');
  const grid = document.getElementById('baseline-area-grid');
  document.getElementById('baseline-areas-eyebrow').textContent = comparison ? 'PULLBACK VS BASELINE' : 'BASELINE FOOTPRINT';
  document.getElementById('baseline-areas-title').textContent = comparison
    ? 'Did strong areas hold?'
    : 'Strong buyer & seller areas';
  document.getElementById('baseline-areas-caption').textContent = comparison
    ? 'Price acceptance + zone volume/delta'
    : 'Captured volume + delta';
  document.querySelector('.baseline-area-method').textContent = comparison
    ? 'Hold/break confirmation uses two completed 5-minute closes beyond the area edge. Volume and delta are compared only at captured prices inside each baseline area; this is evidence, not a guarantee.'
    : 'Strong area: level volume ≥3% of average 5m volume, dominant-side volume ≥1.5× the other side, and delta ≥20% of the strongest level on that side. Not guaranteed support/resistance or a reversal signal.';
  grid.replaceChildren();
  section.hidden = false;
  if (!areas.length) {
    const empty = document.createElement('p');
    empty.className = 'baseline-area-empty';
    empty.textContent = comparison
      ? 'Saved baseline mein compare karne ke liye strong areas nahi hain.'
      : 'Is baseline range mein strong price-level area nahi mila. Captured footprint data check karein.';
    grid.append(empty);
    return;
  }

  areas.forEach((area) => {
    const card = document.createElement('article');
    card.className = `baseline-area-card ${area.direction === 'BUY' ? 'buy-area' : 'sell-area'}`;
    const side = document.createElement('span');
    side.className = 'baseline-area-side';
    side.textContent = area.direction === 'BUY' ? 'BUYER AREA' : 'SELLER AREA';
    const price = document.createElement('strong');
    price.className = 'baseline-area-price';
    price.textContent = area.low === area.high
      ? formatNumber(area.low)
      : `${formatNumber(area.low)} – ${formatNumber(area.high)}`;
    card.append(side, price);
    if (comparison) {
      const status = document.createElement('strong');
      status.className = `baseline-area-status ${area.priceStatus.startsWith('HOLD') ? 'held' : area.priceStatus.startsWith('BREAK') ? 'broken' : 'waiting'}`;
      status.textContent = area.priceStatus;
      card.append(status);
    }
    const stats = document.createElement('div');
    stats.className = 'baseline-area-stats';
    const metrics = comparison ? [
      ['BASELINE VOLUME', formatNumber(area.volume)],
      ['PULLBACK VOLUME', formatNumber(area.pullbackVolume)],
      ['VOLUME VS BASELINE', area.volumeRatio === null ? '--' : `${Math.round(area.volumeRatio * 100)}%`],
      ['BASELINE DELTA', formatSigned(area.netDelta)],
      ['PULLBACK DELTA', formatSigned(area.pullbackDelta)],
      ['DELTA CHANGE', formatSigned(area.deltaChange)]
    ] : [
      ['TOTAL VOLUME', formatNumber(area.volume)],
      ['NET DELTA', formatSigned(area.netDelta)],
      ['BUY / SELL', `${formatNumber(area.buyVolume)} / ${formatNumber(area.sellVolume)}`]
    ];
    metrics.forEach(([label, value]) => {
      const item = document.createElement('div');
      const caption = document.createElement('span');
      caption.textContent = label;
      const metric = document.createElement('strong');
      metric.textContent = value;
      item.append(caption, metric);
      stats.append(item);
    });
    card.append(side, price, stats);
    grid.append(card);
  });
}

function renderTradeSummary(data) {
  const analysis = data?.analysis;
  const summary = document.getElementById('market-summary-content');
  if (!summary) return;
  const move = Number.isFinite(analysis?.sessionMove)
    ? `Open se ${formatSigned(analysis.sessionMove, ' pts')}`
    : 'Open se move unavailable';
  const area = analysis?.deltaArea;
  const dataFresh = Boolean(data.marketDay && analysis?.marketDataFresh && analysis?.footprintDataFresh);
  const zoneLabel = area
    ? `${area.direction === 'UP' ? 'Buy' : 'Sell'} delta area ${formatNumber(area.low)}–${formatNumber(area.high)} (net Δ ${formatSigned(area.netDelta)})`
    : 'Strong aligned buy/sell delta area abhi nahi mila';
  const recommendation = !dataFresh
    ? 'Fresh live data ka wait; entry nahi'
    : !area
      ? 'No entry'
      : area.accepted
        ? `Accepted · pullback entry ${formatNumber(area.low)}–${formatNumber(area.high)}`
        : 'Acceptance ka wait; abhi entry nahi';

  summary.innerHTML = `
    <p><strong>${move}</strong> · ${zoneLabel} · ${recommendation}</p>
  `;

  const reversalSummary = document.getElementById('reversal-summary-content');
  const reversal = analysis?.reversalSetup;
  const reversalDirection = reversal?.direction === 'DOWN' ? 'SHORT' : 'LONG';
  const reversalText = !dataFresh
    ? 'Fresh live market aur footprint data ka wait; reversal signal nahi.'
    : !reversal
    ? 'Reversal setup ke liye clear 5-minute trend aur enough footprint candles ka wait.'
    : reversal.status === 'SIGNAL'
      ? `${reversalDirection} reversal signal · Delta divergence, absorption ${formatNumber(reversal.absorptionRange.low)}–${formatNumber(reversal.absorptionRange.high)}, exhaustion${reversal.stackedImbalance ? ' · stacked imbalance confirm' : ''} · trigger ${formatNumber(reversal.entryTrigger)}`
      : reversal.status === 'WATCH'
        ? `${reversalDirection} reversal watch · ${reversal.conditionsMet}/3 core conditions${reversal.stackedImbalance ? ' · stacked imbalance confirm' : ''}`
        : `${reversalDirection} reversal · delta divergence, high-volume absorption aur volume exhaustion teeno ka wait`;
  reversalSummary.textContent = reversalText;
}

function renderMarketRead(data) {
  const analysis = data.analysis;
  const current = data.sessions.at(-1);
  const previous = data.sessions.find((session) => session.date === analysis.previousDate);
  document.getElementById('market-read-title').textContent = `${data.instrument} · Detailed market read`;
  const status = document.getElementById('market-read-status');
  const dataTime = current?.updatedAt ? formatTime(Date.parse(current.updatedAt)) : 'unknown';
  const marketStatus = data.marketDay || analysis.readiness === 'MARKET_CLOSED' ? '' : 'MARKET CLOSED (WEEKEND) · ';
  const freshness = [
    analysis.marketDataFresh ? `live data as of ${dataTime} IST` : 'live market data is stale',
    analysis.footprintDataFresh ? '5-minute footprint fresh' : '5-minute footprint stale'
  ].join(' · ');
  status.textContent = `${marketStatus}${analysis.readiness.replaceAll('_', ' ')} · ${freshness} · ${data.sessions.length} session(s) saved · FYERS footprint`;
  status.dataset.state = analysis.readiness === 'CONTINUATION_AREA_ACCEPTED' ? 'ready' : 'waiting';
  const move = document.getElementById('read-session-move');
  move.textContent = Number.isFinite(analysis.sessionMove) ? formatSigned(analysis.sessionMove, ' pts') : '--';
  setTone(move, analysis.sessionMove);
  document.getElementById('read-session-move-label').textContent = data.marketDay ? 'SESSION MOVE' : 'LAST SESSION MOVE';
  document.getElementById('read-session-range').textContent = current
    ? `${current.date} · Open ${formatNumber(analysis.sessionOpen)} → close/last ${formatNumber(analysis.currentPrice)} · H ${formatNumber(current.high)} / L ${formatNumber(current.low)}`
    : 'Waiting for session data';
  document.getElementById('read-structure').textContent = analysis.trendDirection === 'UP'
    ? 'UPWARD'
    : analysis.trendDirection === 'DOWN' ? 'DOWNWARD' : 'MIXED';
  document.getElementById('read-structure-detail').textContent = `${current?.candleCount || 0} captured 5-minute candles; only completed candles count toward setup checks.`;
  const delta = document.getElementById('read-delta');
  delta.textContent = formatSigned(analysis.recentDelta);
  setTone(delta, analysis.recentDelta);
  document.getElementById('read-cvd').textContent = `Session CVD: ${formatSigned(analysis.cumulativeDelta)}`;
  const imbalance = analysis.lastImbalance;
  const imbalanceLabel = imbalance?.direction === 'UP'
    ? `BUY STACK ×${imbalance.buyStack}`
    : imbalance?.direction === 'DOWN' ? `SELL STACK ×${imbalance.sellStack}` : 'NO STACKED IMBALANCE';
  document.getElementById('read-imbalance').textContent = imbalanceLabel;
  document.getElementById('read-imbalance-detail').textContent = imbalance
    ? `${imbalance.buyImbalanceCount} buy / ${imbalance.sellImbalanceCount} sell diagonal imbalances in the latest completed candle.`
    : 'No completed footprint candle yet.';

  document.getElementById('read-previous-date').textContent = previous?.date || 'No prior session loaded';
  document.getElementById('read-opening-context').textContent = `Open context: ${analysis.openingDirection || 'UNKNOWN'} · supporting clue only`;
  const priorLevels = document.getElementById('read-prior-levels');
  priorLevels.replaceChildren();
  const levelValues = previous ? [
    ['SESSION VAH', current?.vah],
    ['SESSION POC', current?.poc],
    ['SESSION VAL', current?.val],
    ['VAH', previous.vah],
    ['POC', previous.poc],
    ['VAL', previous.val],
    ['PRIOR HIGH', previous.high],
    ['PRIOR LOW', previous.low],
    ['PRIOR HVNS', analysis.previousLevels?.hvns?.length ? analysis.previousLevels.hvns.slice(0, 5).map(formatNumber).join(' · ') : null],
    ['PRIOR LVNS', analysis.previousLevels?.lvns?.length ? analysis.previousLevels.lvns.slice(0, 5).map(formatNumber).join(' · ') : null]
  ] : [['PRIOR SESSION', null]];
  levelValues.forEach(([label, value]) => {
    const item = document.createElement('div');
    const heading = document.createElement('span');
    heading.textContent = label;
    const content = document.createElement('strong');
    content.textContent = Array.isArray(value) ? value.join(' · ') : Number.isFinite(value) ? formatNumber(value) : value || '--';
    item.append(heading, content);
    priorLevels.append(item);
  });

  renderTradeSummary(data);

  const plan = analysis.tradePlan;
  document.getElementById('read-plan-title').textContent = plan
    ? `${plan.direction === 'UP' ? 'LONG' : 'SHORT'} · ${plan.model}`
    : 'No qualified entry';
  document.getElementById('read-plan-reason').textContent = analysis.reason;
  document.getElementById('read-evidence-score').textContent = plan ? `EVIDENCE ${plan.evidenceScore}/100` : 'NO TRADE';
  const planDetails = document.getElementById('read-plan-details');
  planDetails.replaceChildren();
  if (plan) {
    [
      ['ENTRY TRIGGER', formatNumber(plan.entry)],
      ['STOP LOSS', formatNumber(plan.stop)],
      ['TAKE PROFIT', formatNumber(plan.target)],
      ['RISK : REWARD', `1 : ${numberFormat.format(plan.riskReward)}`],
      ['SETUP STATUS', plan.status.replaceAll('_', ' ')]
    ].forEach(([label, value]) => {
      const item = document.createElement('div');
      const heading = document.createElement('span');
      heading.textContent = label;
      const content = document.createElement('strong');
      content.textContent = value;
      item.append(heading, content);
      planDetails.append(item);
    });
  }

  const confluenceList = document.getElementById('read-confluences');
  confluenceList.replaceChildren();
  (analysis.confluences || []).forEach((factor) => {
    const item = document.createElement('div');
    item.className = `confluence-item${factor.present ? ' present' : ' absent'}`;
    const heading = document.createElement('strong');
    heading.textContent = factor.name;
    const detail = document.createElement('span');
    detail.textContent = factor.detail;
    item.append(heading, detail);
    confluenceList.append(item);
  });

  const demoTrades = document.getElementById('read-demo-trades');
  demoTrades.replaceChildren();
  const openTrades = data.demoTrades || [];
  if (!openTrades.length) {
    const empty = document.createElement('p');
    empty.className = 'demo-trade-empty';
    empty.textContent = 'No saved setup is waiting or open. Qualified setups are saved automatically; a demo trade opens only after the live price touches its entry trigger.';
    demoTrades.append(empty);
  } else {
    openTrades.forEach((trade) => {
      const card = document.createElement('article');
      card.className = `demo-trade-card ${trade.status === 'ACTIVE' ? 'active' : 'waiting'}`;
      const heading = document.createElement('div');
      heading.className = 'demo-trade-card-heading';
      const title = document.createElement('strong');
      title.textContent = `${trade.direction === 'UP' ? 'LONG' : 'SHORT'} · ${trade.model}`;
      const state = document.createElement('span');
      state.textContent = trade.status === 'ACTIVE' ? 'OPEN · DEMO' : 'WAITING FOR ENTRY';
      heading.append(title, state);
      const levels = document.createElement('p');
      levels.textContent = `Entry ${formatNumber(trade.entry)} · Stop ${formatNumber(trade.stop)} · Target ${formatNumber(trade.target)} · Live ${formatNumber(trade.currentPrice)}`;
      card.append(heading, levels);
      if (trade.status === 'ACTIVE' && Number.isFinite(trade.unrealizedR)) {
        const result = document.createElement('small');
        result.textContent = `Unrealized ${formatSigned(trade.unrealizedR, 'R')} · simulated from live price`;
        card.append(result);
      }
      demoTrades.append(card);
    });
  }

}

async function openMarketRead({ refresh = false } = {}) {
  if (!refresh) setView('read');
  const status = document.getElementById('market-read-status');
  if (!refresh) {
    status.textContent = 'Loading saved FYERS footprint and session history…';
    status.dataset.state = 'loading';
  }
  try {
    const response = await fetch(`/api/orderflow-history/${encodeURIComponent(selectedSymbol)}`);
    if (!response.ok) throw new Error(`Market history request failed (${response.status})`);
    renderMarketRead(await response.json());
  } catch (error) {
    status.textContent = `Could not load market history: ${error.message}`;
    status.dataset.state = 'error';
  }
}

async function submitRangeAnalysis(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const action = form.dataset.action;
  const button = form.querySelector('button[type="submit"]');
  const status = document.getElementById('range-analysis-status');
  const result = document.getElementById('range-analysis-result');
  button.disabled = true;
  status.textContent = `Analyzing ${selectedSymbol} captured footprint…`;
  result.hidden = true;

  try {
    const baselineId = localStorage.getItem(`flowdesk:range-baseline:${selectedSymbol}`);
    const response = await fetch(`/api/range-analysis/${encodeURIComponent(selectedSymbol)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        start: form.querySelector('input[id$="-start"]').value,
        end: form.querySelector('input[id$="-end"]').value,
        baselineId: action === 'pullback' ? baselineId : undefined
      })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `Range analysis failed (${response.status})`);
    if (action === 'baseline') {
      if (typeof payload.baselineId !== 'string') throw new Error('The app did not return a baseline ID.');
      localStorage.setItem(`flowdesk:range-baseline:${selectedSymbol}`, payload.baselineId);
      renderBaselineAreas(payload.strongAreas);
    } else {
      renderBaselineAreas(payload.areaComparisons, { comparison: true });
    }
    result.textContent = payload.result;
    result.hidden = false;
    status.textContent = action === 'baseline'
      ? `${selectedSymbol} baseline saved for this market session.`
      : `${selectedSymbol} pullback compared with its saved baseline.`;
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

function updateConnection(state) {
  const status = document.getElementById('feed-status-wrap');
  const label = document.getElementById('feed-status');
  const message = document.getElementById('feed-message');
  const connectButton = document.getElementById('connect-button');
  status.dataset.state = state.status;
  label.textContent = state.status === 'connected'
    ? 'LIVE TICKS'
    : state.status === 'connecting' ? 'CONNECTING' : 'DISCONNECTED';
  message.textContent = state.message;
  connectButton.hidden = state.status === 'connected' || state.status === 'connecting';
}

function selectSymbol(symbol) {
  selectedSymbol = symbol;
  document.querySelectorAll('[data-symbol]').forEach((button) => {
    button.classList.toggle('active', button.dataset.symbol === symbol);
  });
  updateInstrument();
  if (activeView === 'read') openMarketRead();
}

instrumentButtons.forEach((button) => {
  button.addEventListener('click', () => {
    selectSymbol(button.dataset.symbol);
  });
});

document.getElementById('market-read-toggle').addEventListener('click', openMarketRead);
document.getElementById('market-read-refresh').addEventListener('click', openMarketRead);
document.getElementById('market-read-back').addEventListener('click', () => setView('overview'));
document.getElementById('baseline-form').addEventListener('submit', submitRangeAnalysis);
document.getElementById('pullback-form').addEventListener('submit', submitRangeAnalysis);
const stream = new EventSource('/api/market-stream');
stream.addEventListener('message', (event) => {
  marketData = JSON.parse(event.data);
  updateConnection(marketData);
  updateInstrument();
});
stream.addEventListener('error', () => {
  if (stream.readyState === EventSource.CLOSED) {
    document.getElementById('feed-status-wrap').dataset.state = 'disconnected';
    document.getElementById('feed-status').textContent = 'SERVER OFFLINE';
    document.getElementById('feed-message').textContent = 'Dashboard stream closed.';
    return;
  }
  document.getElementById('feed-status-wrap').dataset.state = 'connecting';
  document.getElementById('feed-status').textContent = 'RECONNECTING';
  document.getElementById('feed-message').textContent = 'Dashboard updates paused; the browser is reconnecting. FYERS feed status will update when the stream returns.';
});

function updateClock() {
  document.getElementById('session-time').textContent = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(new Date());
}

updateClock();
setInterval(updateClock, 1000);
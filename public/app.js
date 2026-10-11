const numberFormat = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
const instrumentButtons = [...document.querySelectorAll('.instrument-tabs button')];
let selectedSymbol = 'NIFTY';
let marketData = null;

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
    ? 'Hold/break confirmation uses two completed 5-minute closes beyond the area edge. Volume and delta are compared at captured prices inside each baseline area; this is evidence, not a guarantee.'
    : 'Strong areas use captured price-level volume and delta. They are not guaranteed support, resistance, or reversal signals.';
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

    if (comparison) {
      const status = document.createElement('strong');
      status.className = `baseline-area-status ${area.priceStatus.startsWith('HOLD') ? 'held' : area.priceStatus.startsWith('BREAK') ? 'broken' : 'waiting'}`;
      status.textContent = area.priceStatus;
      card.append(status);
    }

    const stats = document.createElement('div');
    stats.className = 'baseline-area-stats';
    metrics.forEach(([label, value]) => {
      const item = document.createElement('div');
      const caption = document.createElement('span');
      caption.textContent = label;
      const metric = document.createElement('strong');
      metric.textContent = value;
      item.append(caption, metric);
      stats.append(item);
    });
    card.append(stats);
    grid.append(card);
  });
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
}

instrumentButtons.forEach((button) => {
  button.addEventListener('click', () => selectSymbol(button.dataset.symbol));
});

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

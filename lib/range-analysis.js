import { indiaDateKey } from './session-profile.js';

const indiaClock = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
});

function parseTime(value) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

export function analyzeCandleRange(candles, startText, endText, { now = Date.now(), date, tickSize = 0.05 } = {}) {
  const safeTickSize = Number.isFinite(tickSize) && tickSize > 0 ? tickSize : 0.05;
  const start = parseTime(startText);
  const end = parseTime(endText);
  if (start === null || end === null || start >= end) {
    throw new TypeError('Time range must use HH:MM HH:MM with the start before the end');
  }
  if (start < 9 * 60 || end > 15 * 60 + 30) {
    throw new TypeError('Time range must be within the NSE session (09:00-15:30 IST)');
  }

  const selected = candles.filter((candle) => {
    if (!Number.isFinite(candle.time) || candle.time + 5 * 60000 > now) return false;
    const candleDate = indiaDateKey(new Date(candle.time));
    if (date && candleDate !== date) return false;
    const [hour, minute] = indiaClock.format(new Date(candle.time)).split(':').map(Number);
    const minuteOfDay = hour * 60 + minute;
    return minuteOfDay >= start && minuteOfDay < end;
  }).sort((left, right) => left.time - right.time);

  if (!selected.length) {
    throw new TypeError(`No completed 5-minute footprint candles found from ${startText} to ${endText}`);
  }

  const totals = selected.reduce((result, candle) => ({
    volume: result.volume + candle.volume,
    buyVolume: result.buyVolume + candle.positiveVolume,
    sellVolume: result.sellVolume + candle.negativeVolume,
    delta: result.delta + candle.delta,
    positiveDeltaCandles: result.positiveDeltaCandles + Number(candle.delta > 0),
    negativeDeltaCandles: result.negativeDeltaCandles + Number(candle.delta < 0)
  }), {
    volume: 0,
    buyVolume: 0,
    sellVolume: 0,
    delta: 0,
    positiveDeltaCandles: 0,
    negativeDeltaCandles: 0
  });
  const priceLevels = new Map();
  for (const candle of selected) {
    for (const level of candle.levels || []) {
      const price = Number(level.price);
      const buyVolume = Number(level.positiveVolume);
      const sellVolume = Number(level.negativeVolume);
      if (![price, buyVolume, sellVolume].every(Number.isFinite) || buyVolume < 0 || sellVolume < 0) continue;

      const tick = Math.round(price / safeTickSize);
      const alignedPrice = Number((tick * safeTickSize).toFixed(8));
      const key = String(tick);
      const aggregate = priceLevels.get(key) || { price: alignedPrice, tick, buyVolume: 0, sellVolume: 0 };
      aggregate.buyVolume += buyVolume;
      aggregate.sellVolume += sellVolume;
      priceLevels.set(key, aggregate);
    }
  }
  const rankedPriceLevels = [...priceLevels.values()]
    .map((level) => ({
      ...level,
      volume: level.buyVolume + level.sellVolume,
      delta: level.buyVolume - level.sellVolume
    }))
    .sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta)
      || right.volume - left.volume
      || right.price - left.price);
  const strongestDeltaBySide = {
    BUY: Math.max(0, ...rankedPriceLevels.filter((level) => level.delta > 0).map((level) => level.delta)),
    SELL: Math.max(0, ...rankedPriceLevels.filter((level) => level.delta < 0).map((level) => Math.abs(level.delta)))
  };
  const minimumVolume = Math.max(1, (totals.volume / selected.length) * 0.03);
  const candidates = rankedPriceLevels
    .map((level) => ({ ...level, direction: level.delta > 0 ? 'BUY' : 'SELL' }))
    .filter((level) => {
      const dominantVolume = level.direction === 'BUY' ? level.buyVolume : level.sellVolume;
      const opposingVolume = level.direction === 'BUY' ? level.sellVolume : level.buyVolume;
      return level.delta !== 0
        && level.volume >= minimumVolume
        && Math.abs(level.delta) >= Math.max(1, strongestDeltaBySide[level.direction] * 0.2)
        && dominantVolume >= opposingVolume * 1.5;
    })
    .sort((left, right) => left.tick - right.tick);
  const strongAreas = [];
  for (const level of candidates) {
    const previous = strongAreas.at(-1);
    if (previous && previous.direction === level.direction && level.tick === previous.lastTick + 1) {
      previous.high = level.price;
      previous.lastTick = level.tick;
      previous.volume += level.volume;
      previous.buyVolume += level.buyVolume;
      previous.sellVolume += level.sellVolume;
      previous.netDelta += level.delta;
      previous.levelCount += 1;
    } else {
      strongAreas.push({
        direction: level.direction,
        low: level.price,
        high: level.price,
        lastTick: level.tick,
        volume: level.volume,
        buyVolume: level.buyVolume,
        sellVolume: level.sellVolume,
        netDelta: level.delta,
        levelCount: 1
      });
    }
  }
  const selectedStrongAreas = ['BUY', 'SELL']
    .flatMap((direction) => strongAreas
      .filter((area) => area.direction === direction)
      .sort((left, right) => Math.abs(right.netDelta) - Math.abs(left.netDelta)
        || right.volume - left.volume)
      .slice(0, 3))
    .sort((left, right) => Math.abs(right.netDelta) - Math.abs(left.netDelta)
      || right.volume - left.volume);

  return {
    date: date || indiaDateKey(new Date(selected[0].time)),
    start: startText,
    end: endText,
    candles: selected.map((candle) => ({
      time: indiaClock.format(new Date(candle.time)),
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume,
      buyVolume: candle.positiveVolume,
      sellVolume: candle.negativeVolume,
      delta: candle.delta,
      levels: candle.levels || []
    })),
    priceLevels: rankedPriceLevels.map(({ tick, ...level }) => level),
    strongAreas: selectedStrongAreas.map(({ lastTick, ...area }) => area),
    candleCount: selected.length,
    ...totals,
    averageVolume: totals.volume / selected.length,
    averageBuyVolume: totals.buyVolume / selected.length,
    averageSellVolume: totals.sellVolume / selected.length,
    averageDelta: totals.delta / selected.length
  };
}

function formatNumber(value) {
  return Math.round(value).toLocaleString('en-IN');
}

function formatPrice(value) {
  return Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

export function formatRangeSummary(summary, label) {
  const lines = [
    `${label} · ${summary.date} · ${summary.start}-${summary.end} IST`,
    `Completed candles: ${summary.candleCount}`,
    `Avg volume/candle: ${formatNumber(summary.averageVolume)}`,
    `Avg buy/sell volume: ${formatNumber(summary.averageBuyVolume)} / ${formatNumber(summary.averageSellVolume)}`,
    `Avg delta: ${formatNumber(summary.averageDelta)} · positive candles ${summary.positiveDeltaCandles}/${summary.candleCount}`,
    '5m candles · time volume buy sell delta'
  ];
  for (const candle of summary.candles) {
    lines.push(`${candle.time} V${formatNumber(candle.volume)} B${formatNumber(candle.buyVolume)} S${formatNumber(candle.sellVolume)} D${candle.delta > 0 ? '+' : ''}${formatNumber(candle.delta)}`);
  }
  lines.push(`${label} strong footprint areas · price range total volume net delta`);
  if (summary.strongAreas?.length) {
    for (const area of summary.strongAreas) {
      const priceRange = area.low === area.high
        ? formatPrice(area.low)
        : `${formatPrice(area.low)}-${formatPrice(area.high)}`;
      lines.push(`${area.direction === 'BUY' ? 'BUY' : 'SELL'} ${priceRange} V${formatNumber(area.volume)} Δ${area.netDelta > 0 ? '+' : ''}${formatNumber(area.netDelta)} (buy ${formatNumber(area.buyVolume)} / sell ${formatNumber(area.sellVolume)})`);
    }
  } else {
    lines.push('No strong price-level Bid/Ask area found in captured data.');
  }
  return lines.join('\n');
}

export function compareRanges(baseline, pullback) {
  if (baseline.date !== pullback.date) {
    throw new TypeError('Baseline aur pullback same market date ke hone chahiye');
  }
  const deltaChange = pullback.averageDelta - baseline.averageDelta;
  const volumeRatio = baseline.averageVolume > 0 ? pullback.averageVolume / baseline.averageVolume : null;
  const baselineLevels = new Map((baseline.priceLevels || []).map((level) => [level.price.toFixed(2), level]));
  const pullbackLevels = new Map((pullback.priceLevels || []).map((level) => [level.price.toFixed(2), level]));
  const sharedLevels = [...baselineLevels.keys()]
    .filter((price) => pullbackLevels.has(price))
    .map((price) => ({
      price: Number(price),
      baseline: baselineLevels.get(price),
      pullback: pullbackLevels.get(price)
    }))
    .sort((left, right) => Math.max(Math.abs(right.baseline.delta), Math.abs(right.pullback.delta))
      - Math.max(Math.abs(left.baseline.delta), Math.abs(left.pullback.delta)))
    .slice(0, 5);
  let read = 'Mixed / inconclusive footprint; price context ke saath dekho.';
  if (baseline.averageDelta > 0 && pullback.averageDelta >= 0 && volumeRatio !== null && volumeRatio < 1) {
    read = 'Pullback baseline ke muqable lower-volume aur non-negative-delta hai; buyers abhi dominate kar rahe hain, lekin reversal confirm nahi.';
  } else if (baseline.averageDelta > 0 && pullback.averageDelta < 0 && volumeRatio !== null && volumeRatio >= 1) {
    read = 'Pullback mein negative delta aur baseline jitna/zyada volume hai; selling pressure badha hai, hold confirm nahi.';
  } else if (baseline.averageDelta < 0 && pullback.averageDelta <= 0 && volumeRatio !== null && volumeRatio < 1) {
    read = 'Pullback baseline ke muqable lower-volume aur non-positive-delta hai; sellers abhi dominate kar rahe hain, lekin bearish continuation price se confirm karo.';
  } else if (baseline.averageDelta < 0 && pullback.averageDelta <= 0 && volumeRatio !== null && volumeRatio >= 1) {
    read = 'Pullback mein non-positive delta aur baseline jitna/zyada volume hai; selling pressure active hai, bearish continuation ko price context se confirm karo.';
  } else if (baseline.averageDelta < 0 && pullback.averageDelta > 0 && volumeRatio !== null && volumeRatio >= 1) {
    read = 'Pullback mein positive delta aur baseline jitna/zyada volume hai; buying pressure badha hai, bearish continuation confirm nahi.';
  }
  const levelComparison = sharedLevels.length
    ? [
      'Shared price levels · baseline Δ → pullback Δ (volume)',
      ...sharedLevels.map(({ price, baseline: before, pullback: after }) =>
        `${formatPrice(price)} ${before.delta > 0 ? '+' : ''}${formatNumber(before.delta)} → ${after.delta > 0 ? '+' : ''}${formatNumber(after.delta)} (V${formatNumber(after.volume)})`)
    ]
    : ['Baseline aur pullback mein same price levels ka captured Bid/Ask overlap nahi hai.'];
  return [
    formatRangeSummary(pullback, 'PULLBACK'),
    `Baseline avg volume: ${formatNumber(baseline.averageVolume)} · baseline avg delta: ${formatNumber(baseline.averageDelta)}`,
    `Avg delta change: ${formatNumber(deltaChange)} · volume vs baseline: ${volumeRatio === null ? 'n/a' : `${Math.round(volumeRatio * 100)}%`}`,
    ...levelComparison,
    read,
    'Yeh footprint summary hai, trade recommendation nahi.'
  ].join('\n');
}

export function compareStrongAreas(baseline, pullback) {
  const pullbackLevels = pullback.priceLevels || [];
  const candles = pullback.candles || [];
  return (baseline.strongAreas || []).map((area) => {
    const levelsInArea = pullbackLevels.filter((level) => level.price >= area.low && level.price <= area.high);
    const volume = levelsInArea.reduce((total, level) => total + level.volume, 0);
    const netDelta = levelsInArea.reduce((total, level) => total + level.delta, 0);
    const touched = candles.some((candle) => Number.isFinite(candle.low)
      && Number.isFinite(candle.high)
      && candle.low <= area.high
      && candle.high >= area.low);
    let priceStatus = touched ? 'TESTED · WAITING FOR CONFIRMATION' : 'NOT TESTED';
    for (let index = candles.length - 1; index > 0; index -= 1) {
      const previousClose = candles[index - 1].close;
      const close = candles[index].close;
      if (!Number.isFinite(previousClose) || !Number.isFinite(close)) continue;

      const broken = area.direction === 'BUY'
        ? previousClose < area.low && close < area.low
        : previousClose > area.high && close > area.high;
      const held = area.direction === 'BUY'
        ? previousClose > area.high && close > area.high
        : previousClose < area.low && close < area.low;
      if (broken) {
        priceStatus = 'BREAK CONFIRMED · 2 CLOSES';
        break;
      }
      if (held && touched) {
        priceStatus = 'HOLD CONFIRMED · 2 CLOSES';
        break;
      }
    }
    return {
      ...area,
      priceStatus,
      pullbackVolume: volume,
      pullbackDelta: netDelta,
      volumeRatio: area.volume > 0 ? volume / area.volume : null,
      deltaChange: netDelta - area.netDelta
    };
  });
}

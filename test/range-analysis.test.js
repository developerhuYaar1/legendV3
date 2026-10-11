import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeCandleRange, compareRanges, compareStrongAreas, formatRangeSummary } from '../lib/range-analysis.js';

const base = Date.parse('2026-10-09T04:15:00Z');
const candle = (minute, volume, delta, levels = []) => ({
  time: base + minute * 60000,
  volume,
  positiveVolume: Math.max(0, (volume + delta) / 2),
  negativeVolume: Math.max(0, (volume - delta) / 2),
  delta,
  levels
});

test('aggregates only completed candles in a NIFTY time window', () => {
  const result = analyzeCandleRange([
    candle(0, 100, 20),
    candle(5, 200, 40),
    candle(10, 300, -20)
  ], '09:45', '09:55', { now: base + 20 * 60000, date: '2026-10-09' });

  assert.equal(result.candleCount, 2);
  assert.equal(result.volume, 300);
  assert.equal(result.delta, 60);
  assert.equal(result.positiveDeltaCandles, 2);
});

test('rejects missing bars and invalid ranges rather than fabricating a baseline', () => {
  assert.throws(() => analyzeCandleRange([], '09:15', '10:00'), /No completed/);
  assert.throws(() => analyzeCandleRange([], '10:00', '09:15'), /start before the end/);
});

test('compares same-session pullback volume and delta to the baseline', () => {
  const baseline = analyzeCandleRange([candle(0, 100, 30), candle(5, 100, 30)], '09:45', '09:55', {
    now: base + 20 * 60000,
    date: '2026-10-09'
  });
  const pullback = analyzeCandleRange([candle(10, 60, 5), candle(15, 70, 5)], '09:55', '10:05', {
    now: base + 25 * 60000,
    date: '2026-10-09'
  });

  assert.match(compareRanges(baseline, pullback), /lower-volume aur non-negative-delta/);
});

test('interprets bearish baseline pullbacks using delta and relative volume', () => {
  const baseline = analyzeCandleRange([candle(0, 100, -30), candle(5, 100, -30)], '09:45', '09:55', {
    now: base + 20 * 60000,
    date: '2026-10-09'
  });
  const lowerVolumeSelling = analyzeCandleRange([candle(10, 60, -10), candle(15, 70, -10)], '09:55', '10:05', {
    now: base + 25 * 60000,
    date: '2026-10-09'
  });
  const higherVolumeSelling = analyzeCandleRange([candle(10, 120, -40), candle(15, 130, -40)], '09:55', '10:05', {
    now: base + 25 * 60000,
    date: '2026-10-09'
  });
  const higherVolumeBuying = analyzeCandleRange([candle(10, 120, 40), candle(15, 130, 40)], '09:55', '10:05', {
    now: base + 25 * 60000,
    date: '2026-10-09'
  });

  assert.match(compareRanges(baseline, lowerVolumeSelling), /sellers abhi dominate kar rahe hain/);
  assert.match(compareRanges(baseline, higherVolumeSelling), /selling pressure active hai/);
  assert.match(compareRanges(baseline, higherVolumeBuying), /buying pressure badha hai/);
});

test('aggregates footprint volume and net delta at each price for the requested range', () => {
  const result = analyzeCandleRange([
    candle(0, 100, 30, [
      { price: 22160, positiveVolume: 80, negativeVolume: 20 },
      { price: 22165, positiveVolume: 10, negativeVolume: 40 }
    ]),
    candle(5, 90, 20, [
      { price: 22160, positiveVolume: 30, negativeVolume: 10 },
      { price: 22165, positiveVolume: 5, negativeVolume: 15 }
    ])
  ], '09:45', '09:55', { now: base + 20 * 60000, date: '2026-10-09' });

  assert.deepEqual(result.priceLevels, [
    { price: 22160, buyVolume: 110, sellVolume: 30, volume: 140, delta: 80 },
    { price: 22165, buyVolume: 15, sellVolume: 55, volume: 70, delta: -40 }
  ]);
});

test('finds adjacent strong buyer and seller baseline areas with price, volume and delta', () => {
  const result = analyzeCandleRange([
    candle(0, 500, 0, [
      { price: 100, positiveVolume: 80, negativeVolume: 20 },
      { price: 105, positiveVolume: 80, negativeVolume: 20 },
      { price: 120, positiveVolume: 20, negativeVolume: 80 },
      { price: 125, positiveVolume: 20, negativeVolume: 80 }
    ]),
    candle(5, 500, 0, [
      { price: 100, positiveVolume: 80, negativeVolume: 20 },
      { price: 105, positiveVolume: 80, negativeVolume: 20 },
      { price: 120, positiveVolume: 20, negativeVolume: 80 },
      { price: 125, positiveVolume: 20, negativeVolume: 80 }
    ])
  ], '09:45', '09:55', { now: base + 20 * 60000, date: '2026-10-09', tickSize: 5 });

  assert.deepEqual(result.strongAreas, [
    {
      direction: 'BUY',
      low: 100,
      high: 105,
      volume: 400,
      buyVolume: 320,
      sellVolume: 80,
      netDelta: 240,
      levelCount: 2
    },
    {
      direction: 'SELL',
      low: 120,
      high: 125,
      volume: 400,
      buyVolume: 80,
      sellVolume: 320,
      netDelta: -240,
      levelCount: 2
    }
  ]);
  assert.match(formatRangeSummary(result, 'BASELINE'), /BUY 100-105 V400 Δ\+240/);
  assert.match(formatRangeSummary(result, 'BASELINE'), /SELL 120-125 V400 Δ-240/);
});

test('checks baseline area hold or break and compares pullback volume and delta in its price band', () => {
  const baseline = {
    strongAreas: [{
      direction: 'BUY',
      low: 100,
      high: 105,
      volume: 400,
      buyVolume: 320,
      sellVolume: 80,
      netDelta: 240
    }]
  };
  const held = compareStrongAreas(baseline, {
    priceLevels: [
      { price: 100, volume: 120, delta: 60 },
      { price: 105, volume: 80, delta: -20 }
    ],
    candles: [
      { low: 103, high: 110, close: 107 },
      { low: 106, high: 111, close: 107 },
      { low: 107, high: 112, close: 108 }
    ]
  })[0];
  const broken = compareStrongAreas(baseline, {
    priceLevels: [{ price: 100, volume: 300, delta: -100 }],
    candles: [
      { low: 99, high: 106, close: 102 },
      { low: 97, high: 101, close: 99 },
      { low: 95, high: 100, close: 98 }
    ]
  })[0];
  const untested = compareStrongAreas(baseline, {
    priceLevels: [],
    candles: [{ low: 110, high: 115, close: 112 }]
  })[0];
  const sellerBaseline = {
    strongAreas: [{
      direction: 'SELL',
      low: 120,
      high: 125,
      volume: 400,
      buyVolume: 80,
      sellVolume: 320,
      netDelta: -240
    }]
  };
  const sellerHeld = compareStrongAreas(sellerBaseline, {
    priceLevels: [],
    candles: [
      { low: 115, high: 121, close: 119 },
      { low: 114, high: 120, close: 118 },
      { low: 113, high: 119, close: 117 }
    ]
  })[0];
  const sellerBroken = compareStrongAreas(sellerBaseline, {
    priceLevels: [],
    candles: [
      { low: 119, high: 126, close: 123 },
      { low: 124, high: 128, close: 126 },
      { low: 125, high: 130, close: 127 }
    ]
  })[0];

  assert.equal(held.priceStatus, 'HOLD CONFIRMED · 2 CLOSES');
  assert.equal(held.pullbackVolume, 200);
  assert.equal(held.pullbackDelta, 40);
  assert.equal(held.volumeRatio, 0.5);
  assert.equal(held.deltaChange, -200);
  assert.equal(broken.priceStatus, 'BREAK CONFIRMED · 2 CLOSES');
  assert.equal(broken.pullbackDelta, -100);
  assert.equal(untested.priceStatus, 'NOT TESTED');
  assert.equal(sellerHeld.priceStatus, 'HOLD CONFIRMED · 2 CLOSES');
  assert.equal(sellerBroken.priceStatus, 'BREAK CONFIRMED · 2 CLOSES');
});

test('compares net delta at shared footprint price levels between baseline and pullback', () => {
  const baseline = analyzeCandleRange([
    candle(0, 100, 30, [{ price: 22160, positiveVolume: 80, negativeVolume: 20 }])
  ], '09:45', '09:50', { now: base + 20 * 60000, date: '2026-10-09' });
  const pullback = analyzeCandleRange([
    candle(10, 60, -10, [{ price: 22160, positiveVolume: 20, negativeVolume: 50 }])
  ], '09:55', '10:00', { now: base + 20 * 60000, date: '2026-10-09' });

  assert.match(compareRanges(baseline, pullback), /22,160 \+60 → -30/);
});

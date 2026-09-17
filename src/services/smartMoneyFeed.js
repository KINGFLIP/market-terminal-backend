import { EventEmitter } from 'events';
import { recordTrade } from './walletPnl.js';

export const smartMoneyEvents = new EventEmitter();
export const smartMoneyFeed = []; // most recent first, capped below
const MAX_FEED_LENGTH = 200;

// Market Pulse: a rolling window of directional (BUY/SELL) trades, used to
// compute live sentiment. Only entries where we actually know the direction
// (a tracked wallet's own buy or sell) count — an untracked large transfer
// has no clear "intent," so it's excluded rather than guessed at.
const pulseWindow = [];
const PULSE_WINDOW_MAX = 200;

export function pushSmartMoneyEntry(entry) {
  smartMoneyFeed.unshift(entry);
  if (smartMoneyFeed.length > MAX_FEED_LENGTH) smartMoneyFeed.pop();
  smartMoneyEvents.emit('activity', entry);
  recordTrade(entry);

  if (entry.direction && entry.amountUsd != null) {
    pulseWindow.unshift({ direction: entry.direction, amountUsd: entry.amountUsd, time: entry.time });
    if (pulseWindow.length > PULSE_WINDOW_MAX) pulseWindow.pop();
  }
}

export function getMarketPulse() {
  let buyUsd = 0, sellUsd = 0;
  for (const e of pulseWindow) {
    if (e.direction === 'BUY') buyUsd += e.amountUsd;
    else if (e.direction === 'SELL') sellUsd += e.amountUsd;
  }
  const total = buyUsd + sellUsd;
  // 50 = neutral default when there's no directional data yet at all.
  const score = total > 0 ? (buyUsd / total) * 100 : 50;
  return { score, buyVolumeUsd: buyUsd, sellVolumeUsd: sellUsd, sampleSize: pulseWindow.length };
}

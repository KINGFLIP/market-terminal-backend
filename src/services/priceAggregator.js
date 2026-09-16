import { EventEmitter } from 'events';
import { config } from '../config.js';
import { getAllStockTokenChainlinkPrices } from './chainlinkService.js';
import { getRestPrices, getAssetMetadata } from './robinhoodApiService.js';
import { getCryptoPrices } from './cryptoService.js';

export const priceEvents = new EventEmitter();

// In-memory cache the REST routes read from. Good enough for a small terminal;
// swap for Redis if you need multiple backend instances later.
export const priceCache = {
  stockTokens: {},
  crypto: {},
  cryptoLastUpdated: null, // separate from lastUpdated — crypto refreshes on its own, slower interval
  lastUpdated: null,
};

const DIVERGENCE_WARN_PCT = 5; // flag if REST vs. Chainlink differ by more than this, after multiplier adjustment
const DAY_MS = 24 * 3600 * 1000;

// CoinGecko's free, no-key tier rate-limits aggressively. Polling it as often as the
// Chainlink/REST stock data (every few seconds) reliably triggers 429s, which used to
// leave stale crypto prices sitting in the cache indefinitely with no indication they
// were stale. Crypto gets its own, much slower interval instead.
const CRYPTO_POLL_INTERVAL_MS = Math.max(config.pollIntervalMs * 12, 60000); // at least 60s

// Real, shared 24h high/low per symbol — one source of truth every device reads,
// instead of each browser tab computing its own from whatever ticks it happened
// to see. Resets its window every 24h. Like everything else here, this lives in
// memory only: a backend restart starts a fresh window (honestly reflected by
// windowStartedAt, which the frontend can use to know how much real range this
// actually covers rather than assuming a full day has been observed).
const dayRanges = {}; // symbol -> { high, low, windowStartedAt }

function updateDayRange(symbol, price) {
  if (price == null) return null;
  const now = Date.now();
  let r = dayRanges[symbol];
  if (!r || now - r.windowStartedAt > DAY_MS) {
    r = { high: price, low: price, windowStartedAt: now };
    dayRanges[symbol] = r;
  } else {
    if (price > r.high) r.high = price;
    if (price < r.low) r.low = price;
  }
  return { high: r.high, low: r.low, windowStartedAt: new Date(r.windowStartedAt).toISOString() };
}

async function refreshStockTokens() {
  const symbols = config.assets.stockTokens.map((a) => a.symbol);
  if (symbols.length === 0) return;

  const [chainlinkPrices, restPrices, metadata] = await Promise.allSettled([
    getAllStockTokenChainlinkPrices(),
    getRestPrices(symbols),
    getAssetMetadata(symbols),
  ]);

  const chainlink = chainlinkPrices.status === 'fulfilled' ? chainlinkPrices.value : {};
  const rest = restPrices.status === 'fulfilled' ? restPrices.value : {};
  const meta = metadata.status === 'fulfilled' ? metadata.value : { assets: [] };

  for (const asset of config.assets.stockTokens) {
    const sym = asset.symbol;
    const cl = chainlink[sym];
    const r = rest[sym];
    const m = (meta.assets || []).find((a) => a.tokenSymbol === sym);
    const multiplier = m ? Number(m.currentMultiplier || 1) : 1;
    const price = cl && !cl.error ? cl.price : null;

    let divergencePct = null;
    if (cl && !cl.error && r) {
      // REST price is raw underlying-equity price; multiply by the multiplier
      // to compare against the Chainlink value, which is already multiplier-adjusted.
      const restAdjusted = r.mid * multiplier;
      divergencePct = cl.price ? (Math.abs(cl.price - restAdjusted) / cl.price) * 100 : null;
    }

    const range = updateDayRange(sym, price);

    priceCache.stockTokens[sym] = {
      symbol: sym,
      name: asset.name,
      chainlinkPrice: price,
      chainlinkStale: cl ? cl.isStale : null,
      dayHigh: range ? range.high : null,
      dayLow: range ? range.low : null,
      dayRangeWindowStartedAt: range ? range.windowStartedAt : null,
      restBid: r ? r.bid : null,
      restAsk: r ? r.ask : null,
      dailyVolume: r ? r.dailyVolume : null,
      isTradingHalt: r ? r.isTradingHalt : null,
      multiplier,
      divergencePct,
      divergenceWarning: divergencePct !== null && divergencePct > DIVERGENCE_WARN_PCT,
      source: cl && !cl.error ? 'chainlink' : r ? 'rest' : 'unavailable',
      error: cl?.error || null,
    };
  }
}

async function refreshCrypto() {
  try {
    const fresh = await getCryptoPrices();
    for (const [sym, data] of Object.entries(fresh)) {
      const range = updateDayRange(sym, data.price);
      fresh[sym] = { ...data, dayHigh: range ? range.high : null, dayLow: range ? range.low : null, dayRangeWindowStartedAt: range ? range.windowStartedAt : null };
    }
    priceCache.crypto = fresh;
    priceCache.cryptoLastUpdated = new Date().toISOString();
  } catch (err) {
    // Leave the previous prices in place, but do NOT touch cryptoLastUpdated —
    // that's what lets consumers detect "this hasn't actually refreshed in a while."
    console.error('[priceAggregator] crypto refresh failed (keeping last known prices):', err.message);
  }
}

export async function refreshStockTokensAndEmit() {
  await refreshStockTokens();
  priceCache.lastUpdated = new Date().toISOString();
  priceEvents.emit('update', priceCache);
}

export async function refreshCryptoAndEmit() {
  await refreshCrypto();
  priceEvents.emit('update', priceCache);
}

export async function refreshAll() {
  await Promise.all([refreshStockTokens(), refreshCrypto()]);
  priceCache.lastUpdated = new Date().toISOString();
  priceEvents.emit('update', priceCache);
}

export function startPricePolling() {
  // Initial load: get everything once, immediately.
  refreshAll().catch((err) => console.error('[priceAggregator] initial refresh failed:', err.message));

  // Stock tokens: fast, per config (Robinhood's REST API tolerates this fine).
  setInterval(() => {
    refreshStockTokensAndEmit().catch((err) => console.error('[priceAggregator] stock refresh failed:', err.message));
  }, config.pollIntervalMs);

  // Crypto: slow, separate interval — see CRYPTO_POLL_INTERVAL_MS comment above.
  setInterval(() => {
    refreshCryptoAndEmit().catch((err) => console.error('[priceAggregator] crypto refresh failed:', err.message));
  }, CRYPTO_POLL_INTERVAL_MS);
}

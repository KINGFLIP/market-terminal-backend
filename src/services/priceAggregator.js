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
  lastUpdated: null,
};

const DIVERGENCE_WARN_PCT = 5; // flag if REST vs. Chainlink differ by more than this, after multiplier adjustment

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

    let divergencePct = null;
    if (cl && !cl.error && r) {
      // REST price is raw underlying-equity price; multiply by the multiplier
      // to compare against the Chainlink value, which is already multiplier-adjusted.
      const restAdjusted = r.mid * multiplier;
      divergencePct = cl.price ? (Math.abs(cl.price - restAdjusted) / cl.price) * 100 : null;
    }

    priceCache.stockTokens[sym] = {
      symbol: sym,
      name: asset.name,
      chainlinkPrice: cl && !cl.error ? cl.price : null,
      chainlinkStale: cl ? cl.isStale : null,
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
    priceCache.crypto = await getCryptoPrices();
  } catch (err) {
    console.error('[priceAggregator] crypto refresh failed:', err.message);
  }
}

export async function refreshAll() {
  await Promise.all([refreshStockTokens(), refreshCrypto()]);
  priceCache.lastUpdated = new Date().toISOString();
  priceEvents.emit('update', priceCache);
}

export function startPricePolling() {
  refreshAll().catch((err) => console.error('[priceAggregator] initial refresh failed:', err.message));
  setInterval(() => {
    refreshAll().catch((err) => console.error('[priceAggregator] refresh failed:', err.message));
  }, config.pollIntervalMs);
}

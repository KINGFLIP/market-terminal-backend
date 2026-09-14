import fetch from 'node-fetch';
import { config } from '../config.js';

/**
 * GET /rhj/prices — raw underlying-equity bid/ask, NOT multiplier-adjusted.
 * Robinhood's docs are explicit that this differs from the Chainlink value:
 * apply currentMultiplier from /assets if you need the token-equivalent price.
 */
export async function getRestPrices(symbols) {
  const url = `${config.robinhoodApiBase}/prices?symbols=${symbols.join(',')}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Robinhood /prices failed: ${res.status} ${res.statusText}`);
  const data = await res.json();

  const bySymbol = {};
  for (const q of data.quotes || []) {
    bySymbol[q.tokenSymbol] = {
      bid: Number(q.bid),
      ask: Number(q.ask),
      mid: (Number(q.bid) + Number(q.ask)) / 2,
      dailyVolume: Number(q.dailyTradingVolume),
      isTradingHalt: q.isTradingHalt,
      generatedAt: q.generatedAt,
    };
  }
  return bySymbol;
}

/**
 * GET /rhj/assets — metadata including currentMultiplier and deployments
 * (the onchain token address + chain id for each Stock Token).
 */
export async function getAssetMetadata(symbols) {
  const url = `${config.robinhoodApiBase}/assets?symbols=${symbols.join(',')}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Robinhood /assets failed: ${res.status} ${res.statusText}`);
  return res.json();
}

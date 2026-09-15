import fetch from 'node-fetch';
import { config } from '../config.js';

async function fetchFromCoinGecko() {
  const ids = config.assets.cryptoAssets.map((a) => a.coingeckoId).join(',');
  if (!ids) return null;

  const url = `${config.coingeckoApiBase}/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`CoinGecko request failed: ${res.status} ${res.statusText}`);
  const data = await res.json();

  const bySymbol = {};
  for (const asset of config.assets.cryptoAssets) {
    const d = data[asset.coingeckoId];
    if (!d) continue;
    bySymbol[asset.symbol] = { price: d.usd, change24h: d.usd_24h_change, volume24h: d.usd_24h_vol };
  }
  return Object.keys(bySymbol).length ? bySymbol : null;
}

// CoinGecko's free tier shares rate limits across everyone on the same hosting
// provider's IPs — a busy neighbor on Render can get us 429'd even at a light
// polling interval. CoinPaprika (confirmed free, no API key, as of writing) is
// used purely as a fallback when CoinGecko is unavailable.
async function fetchFromCoinPaprika() {
  const bySymbol = {};
  for (const asset of config.assets.cryptoAssets) {
    const id = asset.coinpaprikaId;
    if (!id) continue;
    try {
      const res = await fetch(`https://api.coinpaprika.com/v1/tickers/${id}?quotes=USD`);
      if (!res.ok) continue;
      const d = await res.json();
      const q = d.quotes && d.quotes.USD;
      if (!q) continue;
      bySymbol[asset.symbol] = { price: q.price, change24h: q.percent_change_24h, volume24h: q.volume_24h };
    } catch (e) {
      // skip this one asset, try the rest
    }
  }
  return Object.keys(bySymbol).length ? bySymbol : null;
}

export async function getCryptoPrices() {
  try {
    const result = await fetchFromCoinGecko();
    if (result) return result;
  } catch (err) {
    console.warn('[cryptoService] CoinGecko unavailable, falling back to CoinPaprika:', err.message);
  }

  try {
    const fallback = await fetchFromCoinPaprika();
    if (fallback) return fallback;
  } catch (err) {
    console.warn('[cryptoService] CoinPaprika fallback also failed:', err.message);
  }

  throw new Error('Both CoinGecko and CoinPaprika failed — no crypto price source available right now');
}

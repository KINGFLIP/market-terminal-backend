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
// polling interval. CoinCap is a separate, independent free data source used
// purely as a fallback when CoinGecko is unavailable.
async function fetchFromCoinCap() {
  const ids = config.assets.cryptoAssets.map((a) => a.coincapId || a.coingeckoId).join(',');
  if (!ids) return null;

  const url = `https://api.coincap.io/v2/assets?ids=${ids}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`CoinCap request failed: ${res.status} ${res.statusText}`);
  const data = await res.json();

  const bySymbol = {};
  for (const asset of config.assets.cryptoAssets) {
    const id = asset.coincapId || asset.coingeckoId;
    const d = (data.data || []).find((x) => x.id === id);
    if (!d) continue;
    bySymbol[asset.symbol] = {
      price: Number(d.priceUsd),
      change24h: Number(d.changePercent24Hr),
      volume24h: Number(d.volumeUsd24Hr),
    };
  }
  return Object.keys(bySymbol).length ? bySymbol : null;
}

export async function getCryptoPrices() {
  try {
    const result = await fetchFromCoinGecko();
    if (result) return result;
  } catch (err) {
    console.warn('[cryptoService] CoinGecko unavailable, falling back to CoinCap:', err.message);
  }

  try {
    const fallback = await fetchFromCoinCap();
    if (fallback) return fallback;
  } catch (err) {
    console.warn('[cryptoService] CoinCap fallback also failed:', err.message);
  }

  throw new Error('Both CoinGecko and CoinCap failed — no crypto price source available right now');
}

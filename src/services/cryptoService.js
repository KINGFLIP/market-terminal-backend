import fetch from 'node-fetch';
import { config } from '../config.js';

export async function getCryptoPrices() {
  const ids = config.assets.cryptoAssets.map((a) => a.coingeckoId).join(',');
  if (!ids) return {};

  const url = `${config.coingeckoApiBase}/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`CoinGecko request failed: ${res.status} ${res.statusText}`);
  const data = await res.json();

  const bySymbol = {};
  for (const asset of config.assets.cryptoAssets) {
    const d = data[asset.coingeckoId];
    if (!d) continue;
    bySymbol[asset.symbol] = {
      price: d.usd,
      change24h: d.usd_24h_change,
      volume24h: d.usd_24h_vol,
    };
  }
  return bySymbol;
}

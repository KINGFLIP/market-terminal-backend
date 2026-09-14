import { ethers } from 'ethers';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { config } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const aggregatorAbi = JSON.parse(
  readFileSync(path.join(__dirname, '../abi/aggregatorV3.json'), 'utf-8')
);

let provider = null;
function getProvider() {
  if (!config.robinhoodChainRpcUrl) {
    throw new Error(
      'ROBINHOOD_CHAIN_RPC_URL is not set. Get a Robinhood Chain RPC endpoint (e.g. from Chainstack) and add it to .env'
    );
  }
  if (!provider) {
    provider = new ethers.JsonRpcProvider(config.robinhoodChainRpcUrl, config.robinhoodChainId);
  }
  return provider;
}

/**
 * Reads the latest price from a single Stock Token's Chainlink feed.
 * Per Robinhood Chain docs: the Chainlink price already includes the
 * corporate-action multiplier (dividends/splits) — do NOT re-apply it.
 */
export async function getChainlinkPrice(feedAddress) {
  const p = getProvider();
  const feed = new ethers.Contract(feedAddress, aggregatorAbi, p);
  const [decimals, roundData] = await Promise.all([feed.decimals(), feed.latestRoundData()]);
  const [, answer, , updatedAt] = roundData;

  if (answer <= 0n) throw new Error(`Invalid Chainlink answer for feed ${feedAddress}`);

  const price = Number(answer) / 10 ** Number(decimals);
  const updatedAtMs = Number(updatedAt) * 1000;
  const ageSeconds = (Date.now() - updatedAtMs) / 1000;

  // Staleness guard — Chainlink docs recommend checking updatedAt.
  // 1 hour is a conservative default; tune per feed's expected heartbeat.
  const isStale = ageSeconds > 3600;

  return { price, updatedAt: updatedAtMs, isStale };
}

export async function getAllStockTokenChainlinkPrices() {
  const results = {};
  for (const asset of config.assets.stockTokens) {
    if (asset.chainlinkFeedAddress.startsWith('REPLACE_WITH')) {
      results[asset.symbol] = { error: 'Feed address not configured yet' };
      continue;
    }
    try {
      results[asset.symbol] = await getChainlinkPrice(asset.chainlinkFeedAddress);
    } catch (err) {
      results[asset.symbol] = { error: err.message };
    }
  }
  return results;
}

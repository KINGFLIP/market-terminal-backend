import { ethers } from 'ethers';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { config } from '../config.js';
import { priceCache } from './priceAggregator.js';
import { pushSmartMoneyEntry, smartMoneyFeed, smartMoneyEvents } from './smartMoneyFeed.js';
import { isTracked } from './trackedWallets.js';

export { smartMoneyFeed, smartMoneyEvents }; // re-exported for backward compatibility with existing imports

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const erc20Abi = JSON.parse(readFileSync(path.join(__dirname, '../abi/erc20.json'), 'utf-8'));

let provider = null;
function getProvider() {
  if (!provider) {
    provider = new ethers.JsonRpcProvider(config.robinhoodChainRpcUrl, config.robinhoodChainId);
  }
  return provider;
}

let lastCheckedBlock = null;

async function scanAsset(asset) {
  if (asset.tokenAddress.startsWith('REPLACE_WITH')) return; // not configured yet

  const p = getProvider();
  const contract = new ethers.Contract(asset.tokenAddress, erc20Abi, p);
  const latestBlock = await p.getBlockNumber();
  const fromBlock = lastCheckedBlock ?? latestBlock - 500; // first run: look back ~500 blocks

  // If the chain hasn't produced a new block since our last checkpoint,
  // fromBlock can end up greater than latestBlock — asking the RPC for a
  // negative range, which it (understandably) rejects. Nothing new to see
  // yet, so just skip this asset until next cycle instead of erroring.
  if (fromBlock > latestBlock) return;

  const events = await contract.queryFilter(contract.filters.Transfer(), fromBlock, latestBlock);
  const decimals = await contract.decimals().catch(() => 18);

  for (const evt of events) {
    const { from, to, value } = evt.args;
    const amountTokens = Number(value) / 10 ** Number(decimals);

    const priceInfo = priceCache.stockTokens[asset.symbol];
    const price = priceInfo?.chainlinkPrice ?? priceInfo?.restAsk ?? null;
    const amountUsd = price ? amountTokens * price : null;

    const isTrackedWallet = isTracked(from) || isTracked(to);
    const isLarge = amountUsd !== null && amountUsd >= config.smartMoneyMinUsd;

    if (!isTrackedWallet && !isLarge) continue;

    // Which side (if any) is a wallet we're tracking, and was it a buy or sell for them?
    let trackedWallet = null, direction = null;
    if (isTracked(to)) { trackedWallet = to; direction = 'BUY'; }
    else if (isTracked(from)) { trackedWallet = from; direction = 'SELL'; }

    pushSmartMoneyEntry({
      time: new Date().toISOString(),
      asset: asset.symbol,
      from,
      to,
      amountTokens,
      amountUsd,
      txHash: evt.transactionHash,
      network: 'Robinhood Chain',
      isTrackedWallet,
      isLarge,
      trackedWallet,
      direction,
    });
  }
}

export async function scanAllAssets() {
  for (const asset of config.assets.stockTokens) {
    try {
      await scanAsset(asset);
    } catch (err) {
      console.error(`[smartMoneyWatcher] scan failed for ${asset.symbol}:`, err.message);
    }
  }
  lastCheckedBlock = (await getProvider().getBlockNumber()) + 1;
}

export function startSmartMoneyWatcher() {
  if (!config.robinhoodChainRpcUrl) {
    console.warn('[smartMoneyWatcher] ROBINHOOD_CHAIN_RPC_URL not set — smart money tracking disabled.');
    return;
  }
  scanAllAssets().catch((err) => console.error('[smartMoneyWatcher] initial scan failed:', err.message));
  setInterval(() => {
    scanAllAssets().catch((err) => console.error('[smartMoneyWatcher] scan failed:', err.message));
  }, config.pollIntervalMs * 3); // event scans are heavier than price polls — run less often
}

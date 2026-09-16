import fetch from 'node-fetch';
import { config } from '../config.js';
import { priceCache } from './priceAggregator.js';
import { pushSmartMoneyEntry } from './smartMoneyFeed.js';

// Solana has no equivalent of eth_getLogs — the standard pattern is to page through
// a wallet's transaction signatures and inspect each one for balance changes.
// This version tracks native SOL balance changes only (not SPL token transfers) —
// a deliberate scope limit to keep this shippable; SPL tracking (e.g. USDC-on-Solana)
// would be a reasonable follow-up.

const lastSignatureByWallet = {};

async function rpcCall(method, params) {
  const res = await fetch(config.solanaRpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`Solana RPC HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(`Solana RPC error: ${data.error.message}`);
  return data.result;
}

async function scanWallet(address) {
  const options = { limit: 10 };
  if (lastSignatureByWallet[address]) options.until = lastSignatureByWallet[address];

  const signatures = await rpcCall('getSignaturesForAddress', [address, options]);
  if (!signatures || signatures.length === 0) return;

  lastSignatureByWallet[address] = signatures[0].signature;
  const toProcess = signatures.slice().reverse(); // oldest first, so the feed reads chronologically

  for (const sigInfo of toProcess) {
    if (sigInfo.err) continue; // skip failed transactions
    try {
      const tx = await rpcCall('getTransaction', [
        sigInfo.signature,
        { maxSupportedTransactionVersion: 0, encoding: 'jsonParsed' },
      ]);
      if (!tx || !tx.meta) continue;

      const accountKeys = tx.transaction.message.accountKeys.map((k) => (typeof k === 'string' ? k : k.pubkey));
      const idx = accountKeys.indexOf(address);
      if (idx === -1) continue;

      const deltaLamports = tx.meta.postBalances[idx] - tx.meta.preBalances[idx];
      const deltaSol = deltaLamports / 1e9;
      if (Math.abs(deltaSol) < 0.001) continue; // ignore fee-only noise

      const solPrice = priceCache.crypto?.SOL?.price ?? null;
      const amountUsd = solPrice ? Math.abs(deltaSol) * solPrice : null;
      const isLarge = amountUsd !== null && amountUsd >= config.smartMoneyMinUsd;

      pushSmartMoneyEntry({
        time: new Date((sigInfo.blockTime || Date.now() / 1000) * 1000).toISOString(),
        asset: 'SOL',
        from: deltaSol < 0 ? address : null,
        to: deltaSol > 0 ? address : null,
        amountTokens: Math.abs(deltaSol),
        amountUsd,
        txHash: sigInfo.signature,
        network: 'Solana',
        isTrackedWallet: true, // every Solana wallet here is explicitly tracked (no threshold-only mode yet)
        isLarge,
        trackedWallet: address,
        direction: deltaSol > 0 ? 'BUY' : 'SELL',
      });
    } catch (err) {
      console.error(`[solanaWatcher] failed to process ${sigInfo.signature}:`, err.message);
    }
  }
}

export async function scanAllSolanaWallets() {
  for (const address of config.solanaTrackedWallets) {
    try {
      await scanWallet(address);
    } catch (err) {
      console.error(`[solanaWatcher] scan failed for ${address}:`, err.message);
    }
  }
}

export function startSolanaWatcher() {
  if (config.solanaTrackedWallets.length === 0) {
    console.warn('[solanaWatcher] No SOLANA_TRACKED_WALLETS configured — Solana tracking disabled.');
    return;
  }
  scanAllSolanaWallets().catch((err) => console.error('[solanaWatcher] initial scan failed:', err.message));
  setInterval(() => {
    scanAllSolanaWallets().catch((err) => console.error('[solanaWatcher] scan failed:', err.message));
  }, config.pollIntervalMs * 6); // Solana's public RPC is also rate-limited — don't hammer it
}

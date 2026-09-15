import 'dotenv/config';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assetRegistry = JSON.parse(
  readFileSync(path.join(__dirname, 'assets.config.json'), 'utf-8')
);

export const config = {
  port: Number(process.env.PORT || 4000),
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS || 5000),

  // Defaults to Robinhood's own public RPC — free, no signup. Rate-limited,
  // so override with a dedicated provider (Chainstack/QuickNode/Alchemy) if you outgrow it.
  robinhoodChainRpcUrl: process.env.ROBINHOOD_CHAIN_RPC_URL || 'https://rpc.mainnet.chain.robinhood.com',
  robinhoodChainId: Number(process.env.ROBINHOOD_CHAIN_ID || 4663),

  robinhoodApiBase: process.env.ROBINHOOD_API_BASE || 'https://api.robinhood.com/rhj',
  coingeckoApiBase: process.env.COINGECKO_API_BASE || 'https://api.coingecko.com/api/v3',

  smartMoneyMinUsd: Number(process.env.SMART_MONEY_MIN_USD || 50000),
  trackedWallets: (process.env.TRACKED_WALLETS || '')
    .split(',')
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean),

  // Solana's own public RPC — free, no signup, separately rate-limited from everything above.
  solanaRpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
  // Solana addresses are base58 and case-sensitive — do NOT lowercase these.
  solanaTrackedWallets: (process.env.SOLANA_TRACKED_WALLETS || '')
    .split(',')
    .map((w) => w.trim())
    .filter(Boolean),

  assets: assetRegistry,
};

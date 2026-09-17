import { config } from '../config.js';

// A hard cap protects memory/scan-time growth from unlimited public submissions.
// Checking membership against this set costs nothing extra per RPC scan — we
// still only scan once per Stock Token, not once per wallet — so this limit is
// about sane bounds, not performance.
const MAX_TRACKED_WALLETS = 200;
const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

const wallets = new Set(config.trackedWallets); // seeded from TRACKED_WALLETS env var at startup

export function getTrackedWallets() {
  return wallets;
}

export function isTracked(address) {
  if (!address) return false;
  return wallets.has(address.toLowerCase());
}

export function addTrackedWallet(address) {
  if (typeof address !== 'string' || !EVM_ADDRESS_RE.test(address.trim())) {
    return { ok: false, error: 'Not a valid Robinhood Chain address (expected 0x followed by 40 hex characters).' };
  }
  const normalized = address.trim().toLowerCase();
  if (wallets.has(normalized)) {
    return { ok: true, alreadyTracked: true, count: wallets.size };
  }
  if (wallets.size >= MAX_TRACKED_WALLETS) {
    return { ok: false, error: `Tracked wallet limit (${MAX_TRACKED_WALLETS}) reached — try again later.` };
  }
  wallets.add(normalized);
  return { ok: true, alreadyTracked: false, count: wallets.size };
}

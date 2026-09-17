import { Router } from 'express';
import { addTrackedWallet, getTrackedWallets } from '../services/trackedWallets.js';

export const trackedWalletsRouter = Router();

// Simple in-memory per-IP rate limit — no database, resets on restart like
// everything else here. Good enough to stop casual spam, not a defense
// against a determined attacker with many IPs.
const submissionLog = new Map(); // ip -> [timestamps]
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX = 5;

function checkRateLimit(ip) {
  const now = Date.now();
  const recent = (submissionLog.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX) return false;
  recent.push(now);
  submissionLog.set(ip, recent);
  return true;
}

trackedWalletsRouter.get('/', (req, res) => {
  const wallets = getTrackedWallets();
  res.json({ count: wallets.size, wallets: [...wallets] });
});

trackedWalletsRouter.post('/', (req, res) => {
  const ip = req.ip || 'unknown';
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ ok: false, error: 'Too many submissions from this connection — try again later.' });
  }
  const { address } = req.body || {};
  const result = addTrackedWallet(address);
  if (!result.ok) return res.status(400).json(result);
  res.json(result);
});

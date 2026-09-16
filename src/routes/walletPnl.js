import { Router } from 'express';
import { getWalletPnlSummary, getLeaderboard } from '../services/walletPnl.js';

export const walletPnlRouter = Router();

// Must come before '/:address' — otherwise Express would treat "leaderboard"
// as a wallet address and try to look it up.
walletPnlRouter.get('/leaderboard', (req, res) => {
  res.json(getLeaderboard());
});

walletPnlRouter.get('/:address', (req, res) => {
  res.json(getWalletPnlSummary(req.params.address));
});

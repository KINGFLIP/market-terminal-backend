import { Router } from 'express';
import { getWalletPnlSummary } from '../services/walletPnl.js';

export const walletPnlRouter = Router();

walletPnlRouter.get('/:address', (req, res) => {
  res.json(getWalletPnlSummary(req.params.address));
});

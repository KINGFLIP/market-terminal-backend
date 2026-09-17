import { Router } from 'express';
import { getMarketPulse } from '../services/smartMoneyFeed.js';

export const marketPulseRouter = Router();

marketPulseRouter.get('/', (req, res) => {
  res.json(getMarketPulse());
});

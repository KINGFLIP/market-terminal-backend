import { Router } from 'express';
import { smartMoneyFeed } from '../services/smartMoneyFeed.js';

export const smartMoneyRouter = Router();

smartMoneyRouter.get('/', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  res.json(smartMoneyFeed.slice(0, limit));
});

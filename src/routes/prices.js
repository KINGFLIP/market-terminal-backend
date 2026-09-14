import { Router } from 'express';
import { priceCache } from '../services/priceAggregator.js';

export const pricesRouter = Router();

pricesRouter.get('/', (req, res) => {
  res.json(priceCache);
});

pricesRouter.get('/:symbol', (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const data = priceCache.stockTokens[symbol] || priceCache.crypto[symbol];
  if (!data) return res.status(404).json({ error: `No price data for ${symbol}` });
  res.json(data);
});

import { Router } from 'express';
import { config } from '../config.js';

export const assetsRouter = Router();

assetsRouter.get('/', (req, res) => {
  res.json({
    stockTokens: config.assets.stockTokens.map((a) => ({ symbol: a.symbol, name: a.name })),
    cryptoAssets: config.assets.cryptoAssets.map((a) => ({ symbol: a.symbol })),
  });
});

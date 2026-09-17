import express from 'express';
import cors from 'cors';
import http from 'http';
import { config } from './config.js';
import { pricesRouter } from './routes/prices.js';
import { assetsRouter } from './routes/assets.js';
import { smartMoneyRouter } from './routes/smartMoney.js';
import { walletPnlRouter } from './routes/walletPnl.js';
import { trackedWalletsRouter } from './routes/trackedWallets.js';
import { startPricePolling } from './services/priceAggregator.js';
import { startSmartMoneyWatcher } from './services/smartMoneyWatcher.js';
import { startSolanaWatcher } from './services/solanaWatcher.js';
import { attachWebSocketServer } from './ws.js';

const app = express();
app.set('trust proxy', true); // Render sits behind a proxy — needed so req.ip is the real visitor IP, not Render's, for rate limiting
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));
app.use('/api/prices', pricesRouter);
app.use('/api/assets', assetsRouter);
app.use('/api/smart-money', smartMoneyRouter);
app.use('/api/wallet-pnl', walletPnlRouter);
app.use('/api/tracked-wallets', trackedWalletsRouter);

const server = http.createServer(app);
attachWebSocketServer(server);

server.listen(config.port, () => {
  console.log(`$MARKET backend listening on port ${config.port}`);
  console.log(`REST:      http://localhost:${config.port}/api/prices`);
  console.log(`WebSocket: ws://localhost:${config.port}/ws`);

  startPricePolling();
  startSmartMoneyWatcher();
  startSolanaWatcher();
});

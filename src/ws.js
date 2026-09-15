import { WebSocketServer } from 'ws';
import { priceEvents, priceCache } from './services/priceAggregator.js';
import { smartMoneyEvents } from './services/smartMoneyFeed.js';

export function attachWebSocketServer(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (socket) => {
    // Send current snapshot immediately so the client doesn't wait for the next tick.
    socket.send(JSON.stringify({ type: 'prices', data: priceCache }));

    const onPriceUpdate = (data) => {
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify({ type: 'prices', data }));
      }
    };
    const onSmartMoney = (entry) => {
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify({ type: 'smart_money', data: entry }));
      }
    };

    priceEvents.on('update', onPriceUpdate);
    smartMoneyEvents.on('activity', onSmartMoney);

    socket.on('close', () => {
      priceEvents.off('update', onPriceUpdate);
      smartMoneyEvents.off('activity', onSmartMoney);
    });
  });

  return wss;
}

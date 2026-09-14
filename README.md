# $MARKET backend

This is the service that gets real prices into the terminal. It does three things on a loop:

1. Reads Stock Token prices two ways — onchain via each token's Chainlink feed, and offchain via Robinhood's read-only REST API — and flags it if the two disagree by more than 5%.
2. Reads crypto prices (ETH, SOL, ARB) from CoinGecko's public API.
3. Watches for large or tracked-wallet Stock Token transfers on Robinhood Chain and logs them as "smart money" activity.

It exposes this over a normal REST API and a WebSocket, so the frontend terminal can either poll it or get pushed live updates.

## 1. What you need before this will show real data

- **Node.js 18+** installed on your machine or hosting provider.
- **A Robinhood Chain RPC URL — already handled.** `.env.example` defaults to `https://rpc.mainnet.chain.robinhood.com`, Robinhood's own free public endpoint. No signup, no API key. It's rate-limited, so if the terminal gets serious traffic later, swap in a dedicated provider (Chainstack, QuickNode, or Alchemy all support Robinhood Chain, chain ID `4663`) — but for now, you can skip that step entirely.
- **Real Stock Token + Chainlink feed addresses — done.** `src/assets.config.json` now has real NVDA, AAPL, and TSLA token contract addresses (from Robinhood's official page) and their Chainlink Standard Proxy feed addresses (from Chainlink's tokenized equity feeds page, Robinhood Chain Mainnet). Add more assets to the same file the same way if you want more than three — each needs a token address and a feed address, both from those two official pages, not a third-party site.
- No API key is needed for Robinhood's REST endpoints or CoinGecko's basic tier, per their public docs — if that changes, add a key in `.env`.

## 2. Local setup

```bash
cd market-terminal-backend
npm install
cp .env.example .env
```

The RPC URL is already filled in with Robinhood's public endpoint, so you can leave `.env` as-is for now. Then:

```bash
npm start
```

You should see:

```
$MARKET backend listening on port 4000
REST:      http://localhost:4000/api/prices
WebSocket: ws://localhost:4000/ws
```

Visit `http://localhost:4000/api/prices` in a browser — you should see JSON with your configured assets. If a symbol shows `"error": "Feed address not configured yet"`, that's the placeholder-address reminder from step 1.

## 3. Connecting the frontend

The terminal HTML file currently generates its own fake prices in the browser. To make it real, replace that with a WebSocket connection:

```javascript
const ws = new WebSocket('ws://localhost:4000/ws'); // or wss://your-deployed-url/ws
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === 'prices') {
    // msg.data.stockTokens.NVDA.chainlinkPrice, msg.data.crypto.ETH.price, etc.
    // update your asset cards/table here instead of calling nudge()
  }
  if (msg.type === 'smart_money') {
    // msg.data is a single new transfer — prepend it to the smart money table
  }
};
```

Say the word and I can wire this into the terminal file directly so the DEMO DATA tag comes off once your `.env` is filled in.

## 4. Deploying it so it's live on the internet

Any Node host works. Two easy free-tier options:

**Render**
1. Push this folder to a GitHub repo.
2. On Render, "New Web Service" → connect the repo.
3. Build command: `npm install`. Start command: `npm start`.
4. Add your `.env` values under Render's "Environment" tab (don't commit `.env` itself — it's already excluded via `.gitignore`).
5. Render gives you a URL like `https://market-backend.onrender.com` — use `wss://` (not `ws://`) for that in the frontend, since Render serves HTTPS.

**Railway** works almost identically — connect the repo, set the same environment variables, deploy.

## 5. A few things worth knowing

- **Corporate-action multiplier**: Robinhood's Chainlink feed price already has the multiplier baked in. The REST `/prices` endpoint does not — it's the raw underlying-equity price. The aggregator multiplies the REST price by `currentMultiplier` (from `/assets`) before comparing the two, so the divergence check is apples-to-apples. Don't apply the multiplier a second time to the Chainlink number.
- **"Very high risk" label**: Chainlink's own feed page flags these Robinhood tokenized-equity feeds as very high risk — this isn't a plain equity price feed, it depends on Robinhood pausing/unpausing the oracle correctly around corporate actions, and Chainlink says explicitly that integrators are responsible for their own risk parameters here. Worth reading their "Selecting Quality Data Feeds" page before treating this as production-grade for anything involving real money.
- **Staleness**: Chainlink feed reads are flagged stale if the last update is over an hour old. Tune `isStale` logic in `chainlinkService.js` per feed if you learn a tighter heartbeat — these feeds don't have heartbeats during off-hours (weekends, market close), so a "stale" read during closed hours can be expected behavior, not a bug.
- **Smart money definition**: the watcher flags a transfer if it's above `SMART_MONEY_MIN_USD` (default $50,000) OR involves one of your `TRACKED_WALLETS`. It doesn't claim either party is a sophisticated trader — that judgment call is still yours, same caveat as in the original project doc.
- **Rate limits**: Robinhood's REST API is capped at 60 requests/second and cached server-side — the default 5-second poll interval is well within that, but don't drop it too low if you add many assets.
- **Scaling note**: prices are cached in memory in a single process. Fine for one backend instance; if you ever run multiple instances behind a load balancer, move `priceCache` into Redis so they share state.

// In-memory per-wallet position ledger. This is NOT a persistent historical
// record — it accumulates from trades observed since this backend process
// last started. On a redeploy, or if the free-tier host spins down and back
// up, this resets to zero. A durable "lifetime P&L" would need a real
// database recording every trade since the wallet's first activity — a
// meaningfully bigger project than this. Treat this as "P&L since we started
// watching," not "this wallet's full track record."

const ledger = {}; // lowercased wallet -> { positions: { asset: {qty, avgCost} }, realizedPnl, closedTrades: [] }
const trackingStartedAt = new Date().toISOString();
const COPY_TRADE_STARTING_BALANCE = 1000;

function getLedger(wallet) {
  const key = wallet.toLowerCase();
  if (!ledger[key]) ledger[key] = { positions: {}, realizedPnl: 0, closedTrades: [] };
  return ledger[key];
}

export function recordTrade(entry) {
  if (!entry.trackedWallet || !entry.direction || entry.amountUsd == null || entry.amountTokens <= 0) return;

  const l = getLedger(entry.trackedWallet);
  const asset = entry.asset;
  if (!l.positions[asset]) l.positions[asset] = { qty: 0, avgCost: 0 };
  const pos = l.positions[asset];
  const pricePerUnit = entry.amountUsd / entry.amountTokens;

  if (entry.direction === 'BUY') {
    const newQty = pos.qty + entry.amountTokens;
    const newTotalCost = pos.qty * pos.avgCost + entry.amountUsd;
    pos.avgCost = newQty > 0 ? newTotalCost / newQty : 0;
    pos.qty = newQty;
    return;
  }

  // SELL — only counts as a "known" trade (for win rate / copy-trade sim) if
  // we actually saw the buy that established a cost basis. A sell with no
  // prior observed buy just means we started watching after they'd already
  // acquired it — logged, but excluded from this math rather than guessed at.
  const hadCostBasis = pos.qty > 0;
  const sellQty = hadCostBasis ? Math.min(entry.amountTokens, pos.qty) : entry.amountTokens;
  const costBasis = hadCostBasis ? sellQty * pos.avgCost : 0;
  const proceeds = sellQty * pricePerUnit;
  const pnl = hadCostBasis ? proceeds - costBasis : 0;
  const pctReturn = hadCostBasis && costBasis > 0 ? (proceeds - costBasis) / costBasis : null;
  pos.qty = Math.max(0, pos.qty - sellQty);

  if (hadCostBasis) l.realizedPnl += pnl;
  l.closedTrades.push({ time: entry.time, asset, pnl, pctReturn, win: pnl > 0, hadCostBasis });
}

// "If you'd copied every one of this wallet's completed trades, putting your
// ENTIRE simulated balance into each one in sequence, what would you have
// now?" This is a simplified, honestly-caveated simulation — it assumes
// 100% position sizing on every trade (no real risk management), which is
// not how anyone should actually copy-trade. It's a hook, not investment advice.
function simulateCopyTrade(knownTrades) {
  let balance = COPY_TRADE_STARTING_BALANCE;
  for (const t of knownTrades) {
    if (t.pctReturn == null) continue;
    balance *= 1 + t.pctReturn;
  }
  return balance;
}

export function getWalletPnlSummary(wallet) {
  const l = getLedger(wallet);
  const knownTrades = l.closedTrades.filter((t) => t.hadCostBasis);
  const wins = knownTrades.filter((t) => t.win).length;
  const thirtyDaysAgo = Date.now() - 30 * 24 * 3600 * 1000;
  const tradesLast30Days = l.closedTrades.filter((t) => new Date(t.time).getTime() >= thirtyDaysAgo).length;

  return {
    trackingStartedAt,
    realizedPnl: l.realizedPnl,
    closedTradeCount: knownTrades.length,
    winRate: knownTrades.length ? (wins / knownTrades.length) * 100 : null,
    tradesLast30Days,
    copyTradeStartingBalance: COPY_TRADE_STARTING_BALANCE,
    copyTradeEndingBalance: knownTrades.length ? simulateCopyTrade(knownTrades) : null,
    openPositions: Object.entries(l.positions)
      .filter(([, p]) => p.qty > 0)
      .map(([asset, p]) => ({ asset, qty: p.qty, avgCost: p.avgCost })),
  };
}

// Ranks every wallet we've recorded at least one closed trade for, by realized
// P&L. Wallets with zero closed trades are left out — nothing meaningful to
// rank yet, and including them would just be clutter at the bottom.
export function getLeaderboard(limit = 20) {
  const rows = Object.keys(ledger)
    .map((wallet) => ({ wallet, ...getWalletPnlSummary(wallet) }))
    .filter((row) => row.closedTradeCount > 0)
    .sort((a, b) => b.realizedPnl - a.realizedPnl);
  return rows.slice(0, limit);
}

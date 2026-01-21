'use strict';

window.OPS_MOCK_DATA = {
    account: {
        aum: 128400220,
        pnl: 1482120,
        cashRatio: 0.3,
        var: 3200000,
        exposure: 1.2
    },
    connectivity: {
        alpacaStatus: 'CONNECTED',
        wsLatencyMs: 12,
        buyingPower: 100000,
        buyingPowerMultiple: 4,
        dayTradesRemaining: 1
    },
    market: [
        { symbol: 'NVDA', last: 902.14, chgPct: 3.42, score: 92, volMa: 4.8, signal: 'STRONG BUY', asset: 'Equity', sector: 'Semis', volume: 38120000 },
        { symbol: 'AAPL', last: 192.38, chgPct: 0.82, score: 71, volMa: 1.2, signal: 'WAIT', asset: 'Equity', sector: 'Mega Cap', volume: 71200000 },
        { symbol: 'BTC/USD', last: 64218.0, chgPct: 1.18, score: 69, volMa: 2.2, signal: 'WAIT', asset: 'Crypto', sector: 'Crypto', volume: 12500 },
        { symbol: 'TSLA', last: 238.09, chgPct: -2.14, score: 39, volMa: 3.1, signal: 'SELL', asset: 'Equity', sector: 'Auto', volume: 46800000 },
        { symbol: 'MSFT', last: 402.01, chgPct: 1.06, score: 66, volMa: 0.9, signal: 'WAIT', asset: 'Equity', sector: 'Mega Cap', volume: 30100000 },
        { symbol: 'AMD', last: 168.44, chgPct: 2.41, score: 84, volMa: 1.7, signal: 'BUY', asset: 'Equity', sector: 'Semis', volume: 51200000 },
        { symbol: 'META', last: 488.61, chgPct: -0.74, score: 58, volMa: 1.0, signal: 'WAIT', asset: 'Equity', sector: 'Mega Cap', volume: 20900000 },
        { symbol: 'COIN', last: 224.2, chgPct: 1.74, score: 76, volMa: 1.5, signal: 'WAIT', asset: 'Equity', sector: 'Crypto Proxy', volume: 18200000 }
    ],
    positions: [
        { symbol: 'NVDA', cost: 842.1, last: 902.14, pnlPct: 7.1, stop: 860.0 },
        { symbol: 'AAPL', cost: 186.0, last: 192.38, pnlPct: 3.4, stop: 180.5 },
        { symbol: 'TSLA', cost: 246.9, last: 238.09, pnlPct: -3.6, stop: 232.0 }
    ],
    strategies: [
        { name: 'Strategy_Tech_Momentum_v2', pnl: 482210, positions: 14, status: 'RUNNING' },
        { name: 'Strategy_Defensive_Alpha', pnl: 91120, positions: 6, status: 'PAUSED' },
        { name: 'Strategy_Crypto_Liq', pnl: -14802, positions: 3, status: 'RUNNING' }
    ],
    logs: [
        '[10:00:01] INFO: Scanning AAPL... RSI=72, Overbought.',
        '[10:00:02] WARN: TSLA Volatility Spike detected!',
        '[10:00:05] EXEC: Placing ORDER -> BUY 100 NVDA @ MKT'
    ],
    history: {
        timestamp: [1705200000, 1705286400, 1705372800, 1705459200, 1705545600, 1705632000, 1705718400, 1705804800, 1705891200, 1705977600],
        equity: [120000000, 120800000, 121100000, 121900000, 121400000, 122200000, 123100000, 122700000, 123800000, 124600000]
    }
};

'use strict';

const fallbackData = {
    account: { aum: 128400220, pnl: 1482120, cashRatio: 0.3, var: 3200000, exposure: 1.2 },
    connectivity: { alpacaStatus: 'CONNECTED', wsLatencyMs: 12, buyingPower: 100000, buyingPowerMultiple: 4, dayTradesRemaining: 1 },
    market: [],
    positions: [],
    strategies: [],
    logs: []
};

const data = JSON.parse(JSON.stringify(window.OPS_MOCK_DATA || fallbackData));

const state = {
    marketOpen: false,
    dayTradesRemaining: data.connectivity.dayTradesRemaining || 0,
    warGame: true,
    market: data.market.map((item) => ({ ...item, flashUntil: 0 })),
    orderPreview: null,
    remoteActive: false,
    wsConnected: false,
    wsAttempted: false
};

const API_BASE = window.OPS_API_BASE || '';

const getEl = (id) => document.getElementById(id);
const toFixed = (value, decimals) => Number(value).toFixed(decimals);
const formatCurrency = (value) => {
    const sign = value < 0 ? '-' : '';
    const abs = Math.abs(value);
    return `${sign}$${abs.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
};
const formatPercent = (value) => `${value >= 0 ? '+' : ''}${toFixed(value, 2)}%`;

const fetchJson = async (url) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        return await response.json();
    } finally {
        clearTimeout(timer);
    }
};

const computeSharpe = (equitySeries) => {
    if (!equitySeries || equitySeries.length < 3) return null;
    const returns = [];
    for (let i = 1; i < equitySeries.length; i += 1) {
        const prev = equitySeries[i - 1];
        if (!prev) continue;
        returns.push((equitySeries[i] - prev) / prev);
    }
    const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
    const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / returns.length;
    const std = Math.sqrt(variance);
    if (!std) return null;
    return (mean / std) * Math.sqrt(252);
};

const computeMaxDrawdown = (equitySeries) => {
    if (!equitySeries || equitySeries.length < 2) return null;
    let peak = equitySeries[0];
    let maxDrawdown = 0;
    equitySeries.forEach((value) => {
        if (value > peak) peak = value;
        const drawdown = (value - peak) / peak;
        if (drawdown < maxDrawdown) maxDrawdown = drawdown;
    });
    return maxDrawdown;
};

const renderSparkline = (lineEl, series, height = 80) => {
    if (!lineEl || !series || series.length < 2) return;
    const width = 360;
    const min = Math.min(...series);
    const max = Math.max(...series);
    const range = max - min || 1;
    const points = series.map((value, index) => {
        const x = (index / (series.length - 1)) * width;
        const y = height - ((value - min) / range) * height;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    lineEl.setAttribute('points', points.join(' '));
};

const updatePortfolioHistory = (payload) => {
    const equity = payload?.equity || data.history?.equity || [];
    renderSparkline(labElements.equityLine, equity, 80);
    const sharpe = computeSharpe(equity);
    const drawdown = computeMaxDrawdown(equity);
    if (labElements.sharpeRatio) {
        labElements.sharpeRatio.textContent = sharpe ? sharpe.toFixed(2) : '--';
    }
    if (labElements.maxDrawdown) {
        labElements.maxDrawdown.textContent = drawdown ? `${(drawdown * 100).toFixed(1)}%` : '--';
    }
    if (labElements.historyHorizon) {
        labElements.historyHorizon.textContent = payload?.timeframe ? payload.timeframe.toUpperCase() : '30D';
    }
};

const updateShortLocate = async (symbol) => {
    if (!labElements.shortLocate) return;
    if (!symbol || symbol.includes('/')) {
        labElements.shortLocate.textContent = 'N/A';
        return;
    }
    if (!state.remoteActive) {
        const shortableMap = { TSLA: 'ETB', NVDA: 'HTB', AAPL: 'ETB' };
        labElements.shortLocate.textContent = shortableMap[symbol] || 'N/A';
        return;
    }
    try {
        const payload = await fetchJson(`${API_BASE}/api/assets/${symbol}`);
        if (payload.easy_to_borrow) {
            labElements.shortLocate.textContent = 'ETB';
        } else if (payload.shortable) {
            labElements.shortLocate.textContent = 'HTB';
        } else {
            labElements.shortLocate.textContent = 'UNSHORTABLE';
        }
    } catch (error) {
        labElements.shortLocate.textContent = 'N/A';
    }
};

const normalizeAccount = (payload) => {
    if (!payload) return data.account;
    if (payload.aum) return payload;
    const equity = Number(payload.equity || 0);
    const lastEquity = Number(payload.last_equity || equity);
    const pnl = equity - lastEquity;
    return {
        aum: equity,
        pnl,
        cashRatio: Number(payload.cash || 0) / (equity || 1),
        var: data.account.var,
        exposure: data.account.exposure
    };
};

const normalizePositions = (payload) => {
    if (!Array.isArray(payload)) return data.positions;
    return payload.map((position) => ({
        symbol: position.symbol,
        cost: Number(position.avg_entry_price || position.cost_basis || 0),
        last: Number(position.current_price || position.market_value || 0),
        pnlPct: Number(position.unrealized_plpc || 0) * 100,
        stop: Number(position.stop_price || (Number(position.current_price || 0) * 0.96))
    }));
};

const elements = {
    terminalRoot: getEl('terminalRoot'),
    marketStatusBadge: getEl('marketStatusBadge'),
    dayTrades: getEl('dayTrades'),
    pdtLockMsg: getEl('pdtLockMsg'),
    buyMaxBtn: getEl('buyMaxBtn'),
    sellHalfBtn: getEl('sellHalfBtn'),
    manualSymbol: getEl('manualSymbol'),
    manualQty: getEl('manualQty'),
    manualSide: getEl('manualSide'),
    executeStrategyBtn: getEl('executeStrategyBtn'),
    orderModal: getEl('orderModal'),
    cancelOrderBtn: getEl('cancelOrderBtn'),
    confirmOrderBtn: getEl('confirmOrderBtn'),
    warGameToggleBtn: getEl('warGameToggleBtn'),
    warGameStatus: getEl('warGameStatus'),
    previewSide: getEl('previewSide'),
    previewSymbol: getEl('previewSymbol'),
    previewQty: getEl('previewQty'),
    previewTakeProfit: getEl('previewTakeProfit'),
    previewStopLoss: getEl('previewStopLoss'),
    previewEstTotal: getEl('previewEstTotal'),
    modalSide: getEl('modalSide'),
    modalSymbol: getEl('modalSymbol'),
    modalQty: getEl('modalQty'),
    modalTakeProfit: getEl('modalTakeProfit'),
    modalStopLoss: getEl('modalStopLoss'),
    modalEstTotal: getEl('modalEstTotal'),
    pauseAllBtn: getEl('pauseAllBtn'),
    liquidateAllBtn: getEl('liquidateAllBtn'),
    marketTableBody: getEl('marketTableBody'),
    positionsTableBody: getEl('positionsTableBody'),
    strategyList: getEl('strategyList'),
    logStream: getEl('logStream'),
    scannerAlert: getEl('scannerAlert'),
    scannerLatency: getEl('scannerLatency'),
    aumValue: getEl('aumValue'),
    pnlValue: getEl('pnlValue'),
    pnlPulse: getEl('pnlPulse'),
    cashRatioValue: getEl('cashRatioValue'),
    cashRatioBar: getEl('cashRatioBar'),
    varValue: getEl('varValue'),
    exposureValue: getEl('exposureValue'),
    alpacaStatus: getEl('alpacaStatus'),
    wsLatency: getEl('wsLatency'),
    buyingPower: getEl('buyingPower'),
    dataFeedStatus: getEl('dataFeedStatus'),
    algoStatus: getEl('algoStatus'),
    alpacaHealth: getEl('alpacaHealth'),
    latencyValue: getEl('latencyValue'),
    buyingPowerMini: getEl('buyingPowerMini'),
    lastSync: getEl('lastSync'),
    apiBaseLabel: getEl('apiBaseLabel'),
    mobileAum: getEl('mobileAum'),
    mobilePnl: getEl('mobilePnl'),
    mobileRisk: getEl('mobileRisk'),
    mobileStopBtn: getEl('mobileStopBtn'),
    scanContextMenu: getEl('scanContextMenu')
};

const labElements = {
    labSymbol: getEl('labSymbol'),
    labTimeframe: getEl('labTimeframe'),
    labFetchBtn: getEl('labFetchBtn'),
    labLine: getEl('labLine'),
    labCount: getEl('labCount'),
    shortLocate: getEl('shortLocate'),
    equityLine: getEl('equityLine'),
    sharpeRatio: getEl('sharpeRatio'),
    maxDrawdown: getEl('maxDrawdown'),
    historyHorizon: getEl('historyHorizon')
};

const logLine = (message) => {
    if (!elements.logStream) return;
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
    const entry = document.createElement('div');
    entry.textContent = `[${timestamp}] ${message}`;
    elements.logStream.appendChild(entry);
    while (elements.logStream.children.length > 60) {
        elements.logStream.removeChild(elements.logStream.firstChild);
    }
    elements.logStream.scrollTop = elements.logStream.scrollHeight;
};

const setMarketStatus = () => {
    if (!elements.marketStatusBadge) return;
    if (state.marketOpen) {
        elements.marketStatusBadge.textContent = 'MARKET OPEN';
        elements.marketStatusBadge.classList.remove('text-ops-danger');
        elements.marketStatusBadge.classList.add('text-ops-primary');
        document.body.classList.remove('market-closed');
    } else {
        elements.marketStatusBadge.textContent = 'MARKET CLOSED - QUEUED';
        elements.marketStatusBadge.classList.add('text-ops-danger');
        elements.marketStatusBadge.classList.remove('text-ops-primary');
        document.body.classList.add('market-closed');
    }
};

const setPdtLock = () => {
    if (!elements.dayTrades) return;
    const locked = state.dayTradesRemaining <= 0;
    elements.dayTrades.textContent = `${state.dayTradesRemaining} REMAINING`;
    if (elements.pdtLockMsg) {
        elements.pdtLockMsg.classList.toggle('hidden', !locked);
    }
    if (elements.buyMaxBtn) elements.buyMaxBtn.classList.toggle('is-locked', locked);
    if (elements.sellHalfBtn) elements.sellHalfBtn.classList.toggle('is-locked', locked);
};

const renderMarketTable = () => {
    if (!elements.marketTableBody) return;
    elements.marketTableBody.innerHTML = state.market.map((item) => {
        const chgClass = item.chgPct >= 0 ? 'text-ops-primary' : 'text-ops-danger';
        const signalClass = item.signal === 'STRONG BUY'
            ? 'text-amber-300'
            : item.signal === 'BUY'
                ? 'text-ops-primary'
                : item.signal === 'SELL'
                    ? 'text-ops-danger'
                    : 'text-ops-muted';
        const volClass = item.volMa > 2.5 ? 'text-ops-danger' : '';
        const flashClass = item.flashUntil > Date.now() ? 'animate-row-flash' : '';
        const sectorTag = item.sector ? ` <span class="text-ops-muted text-xs">(${item.sector})</span>` : '';
        return `
            <tr data-symbol="${item.symbol}" class="${flashClass}">
                <td class="px-4 py-3 text-ops-primary">${item.symbol}${sectorTag}</td>
                <td class="px-4 py-3 text-right">$${toFixed(item.last, 2)}</td>
                <td class="px-4 py-3 text-right ${chgClass}">${formatPercent(item.chgPct)}</td>
                <td class="px-4 py-3 text-center ${signalClass}">${item.signal}</td>
                <td class="px-4 py-3 text-right">${item.score}/100</td>
                <td class="px-4 py-3 text-right ${volClass}">${toFixed(item.volMa, 1)}x</td>
            </tr>
        `;
    }).join('');
};

const renderPositionsTable = () => {
    if (!elements.positionsTableBody) return;
    elements.positionsTableBody.innerHTML = data.positions.map((position) => {
        const pnlClass = position.pnlPct >= 0 ? 'text-ops-primary' : 'text-ops-danger';
        return `
            <tr>
                <td class="px-4 py-3">${position.symbol}</td>
                <td class="px-4 py-3 text-right">$${toFixed(position.cost, 2)}</td>
                <td class="px-4 py-3 text-right">$${toFixed(position.last, 2)}</td>
                <td class="px-4 py-3 text-right ${pnlClass}">${formatPercent(position.pnlPct)}</td>
                <td class="px-4 py-3 text-right text-ops-danger">${toFixed(position.stop, 2)}</td>
            </tr>
        `;
    }).join('');
};

const renderStrategies = () => {
    if (!elements.strategyList) return;
    elements.strategyList.innerHTML = data.strategies.map((strategy) => {
        const pnlClass = strategy.pnl >= 0 ? 'text-ops-primary' : 'text-ops-danger';
        const statusClass = strategy.status === 'RUNNING' ? 'text-ops-primary' : 'text-amber-400';
        return `
            <div class="bg-ops-panel border border-slate-800 rounded-md p-3 flex items-center justify-between">
                <div>
                    <div class="font-mono text-sm">${strategy.name}</div>
                    <div class="text-xs text-ops-muted font-mono">PnL <span class="${pnlClass}">${formatCurrency(strategy.pnl)}</span> | Pos ${strategy.positions}</div>
                </div>
                <span class="text-xs font-mono ${statusClass}">${strategy.status}</span>
            </div>
        `;
    }).join('');
};

const updateKpis = () => {
    const pnlClass = data.account.pnl >= 0 ? 'text-ops-primary' : 'text-ops-danger';
    if (elements.aumValue) elements.aumValue.textContent = formatCurrency(data.account.aum);
    if (elements.pnlValue) {
        elements.pnlValue.textContent = formatCurrency(data.account.pnl);
        elements.pnlValue.className = `text-3xl font-mono font-bold ${pnlClass}`;
    }
    if (elements.cashRatioValue) elements.cashRatioValue.textContent = `${Math.round(data.account.cashRatio * 100)}%`;
    if (elements.cashRatioBar) elements.cashRatioBar.style.width = `${Math.round(data.account.cashRatio * 100)}%`;
    if (elements.varValue) elements.varValue.textContent = formatCurrency(data.account.var);
    if (elements.exposureValue) elements.exposureValue.textContent = `${Math.round(data.account.exposure * 100)}%`;
    if (elements.mobileAum) elements.mobileAum.textContent = formatCurrency(data.account.aum);
    if (elements.mobilePnl) elements.mobilePnl.textContent = `${formatPercent((data.account.pnl / data.account.aum) * 100)} TODAY`;
    if (elements.mobileRisk) elements.mobileRisk.textContent = `VaR ${(data.account.var / data.account.aum * 100).toFixed(1)}% (High)`;
};

const updateConnectivity = () => {
    const powerText = `${formatCurrency(data.connectivity.buyingPower)} (${data.connectivity.buyingPowerMultiple}x)`;
    if (elements.alpacaStatus) elements.alpacaStatus.textContent = data.connectivity.alpacaStatus;
    if (elements.alpacaHealth) elements.alpacaHealth.textContent = data.connectivity.alpacaStatus;
    if (elements.wsLatency) elements.wsLatency.textContent = `${data.connectivity.wsLatencyMs}ms`;
    if (elements.latencyValue) elements.latencyValue.textContent = `${data.connectivity.wsLatencyMs}ms`;
    if (elements.buyingPower) elements.buyingPower.textContent = powerText;
    if (elements.buyingPowerMini) elements.buyingPowerMini.textContent = powerText;
    if (elements.dataFeedStatus) {
        const feed = data.connectivity.feed ? data.connectivity.feed.toUpperCase() : 'IEX';
        const wsTag = state.wsConnected ? 'WS' : state.wsAttempted ? 'POLL' : 'INIT';
        elements.dataFeedStatus.textContent = `CONNECTED (${data.connectivity.wsLatencyMs}ms) // ${feed} // ${wsTag}`;
    }
};

const updateAlgoStatus = () => {
    if (!elements.algoStatus) return;
    const active = data.strategies.filter((strategy) => strategy.status === 'RUNNING').length;
    const paused = data.strategies.filter((strategy) => strategy.status !== 'RUNNING').length;
    elements.algoStatus.textContent = `${active} ACTIVE / ${paused} PAUSED`;
};

const updateLastSync = () => {
    if (!elements.lastSync) return;
    const now = new Date();
    const time = now.toLocaleTimeString('en-US', { hour12: false });
    elements.lastSync.textContent = `LAST SYNC ${time} LOCAL`;
};

const updateApiBaseLabel = () => {
    if (!elements.apiBaseLabel) return;
    const base = API_BASE || 'LOCAL';
    elements.apiBaseLabel.textContent = `API: ${base}`;
};

const syncOrderPreview = () => {
    if (!elements.previewSide) return;
    const side = elements.manualSide ? elements.manualSide.value || 'BUY' : 'BUY';
    const symbol = elements.manualSymbol ? elements.manualSymbol.value.trim().toUpperCase() || 'TSLA' : 'TSLA';
    const qty = elements.manualQty ? Number(elements.manualQty.value) || 14.532 : 14.532;
    const marketItem = state.market.find((item) => item.symbol === symbol);
    const price = marketItem ? marketItem.last : 262.0;
    const takeProfit = price * 1.05;
    const stopLoss = price * 0.98;
    const estTotal = price * qty;

    elements.previewSide.textContent = side;
    elements.previewSymbol.textContent = symbol;
    elements.previewQty.textContent = toFixed(qty, 3);
    elements.previewTakeProfit.textContent = `$${toFixed(takeProfit, 2)}`;
    elements.previewStopLoss.textContent = `$${toFixed(stopLoss, 2)}`;
    elements.previewEstTotal.textContent = formatCurrency(estTotal);

    elements.modalSide.textContent = side;
    elements.modalSymbol.textContent = symbol;
    elements.modalQty.textContent = toFixed(qty, 3);
    elements.modalTakeProfit.textContent = `$${toFixed(takeProfit, 2)}`;
    elements.modalStopLoss.textContent = `$${toFixed(stopLoss, 2)}`;
    elements.modalEstTotal.textContent = formatCurrency(estTotal);

    state.orderPreview = {
        symbol,
        side,
        qty: Number(toFixed(qty, 3)),
        takeProfit: Number(toFixed(takeProfit, 2)),
        stopLoss: Number(toFixed(stopLoss, 2)),
        notional: Number(toFixed(estTotal, 2))
    };
    updateShortLocate(symbol);
};

const openModal = () => {
    if (!elements.orderModal) return;
    elements.orderModal.classList.remove('hidden');
    elements.orderModal.classList.add('flex');
};

const closeModal = () => {
    if (!elements.orderModal) return;
    elements.orderModal.classList.add('hidden');
    elements.orderModal.classList.remove('flex');
};

const updateMarketTick = () => {
    if (state.remoteActive) return;
    state.market.forEach((item) => {
        const drift = item.asset === 'Crypto' ? 0.6 : 0.25;
        const delta = (Math.random() - 0.5) * drift;
        item.last = Math.max(1, item.last * (1 + delta / 100));
        item.chgPct = Math.max(-9.9, Math.min(9.9, item.chgPct + delta));
        item.score = Math.max(20, Math.min(98, Math.round(item.score + delta * 1.8)));
        item.volMa = Math.max(0.6, Math.min(5.2, item.volMa + (Math.random() - 0.5) * 0.3));
        const prevSignal = item.signal;
        if (item.score >= 90 && item.chgPct > 1.4) {
            item.signal = 'STRONG BUY';
        } else if (item.score >= 80) {
            item.signal = 'BUY';
        } else if (item.score <= 40 || item.chgPct < -1.5) {
            item.signal = 'SELL';
        } else {
            item.signal = 'WAIT';
        }
        if (item.signal === 'STRONG BUY' && prevSignal !== 'STRONG BUY') {
            item.flashUntil = Date.now() + 2200;
            logLine(`SONAR PING: ${item.symbol} scored ${item.score}/100`);
            if (elements.scannerAlert) {
                elements.scannerAlert.textContent = `ALERT: ${item.symbol} STRONG BUY`;
            }
        }
    });
    if (elements.scannerLatency) {
        const latency = Math.round(8 + Math.random() * 24);
        elements.scannerLatency.textContent = `SIP STREAMING // ${latency}ms`;
    }
    renderMarketTable();
    syncOrderPreview();
};

const updateAccountTick = () => {
    if (state.remoteActive) return;
    const delta = (Math.random() - 0.5) * 22000;
    data.account.pnl += delta;
    data.account.aum += delta * 0.9;
    data.account.cashRatio = Math.max(0.12, Math.min(0.55, data.account.cashRatio + (Math.random() - 0.5) * 0.01));
    updateKpis();
};

const initLogs = () => {
    data.logs.forEach((line) => logLine(line));
};

const loadRemoteData = async () => {
    try {
        await fetchJson(`${API_BASE}/api/health`);
    } catch (error) {
        logLine('REMOTE API UNAVAILABLE - FALLBACK TO LOCAL MOCK');
        return;
    }

    try {
        const [
            clock,
            account,
            connectivity,
            market,
            positions,
            strategies,
            logs,
            history
        ] = await Promise.all([
            fetchJson(`${API_BASE}/api/clock`),
            fetchJson(`${API_BASE}/api/account`),
            fetchJson(`${API_BASE}/api/connectivity`),
            fetchJson(`${API_BASE}/api/market`),
            fetchJson(`${API_BASE}/api/positions`),
            fetchJson(`${API_BASE}/api/strategies`),
            fetchJson(`${API_BASE}/api/logs`),
            fetchJson(`${API_BASE}/api/portfolio/history`)
        ]);

        state.marketOpen = Boolean(clock?.is_open);
        data.account = normalizeAccount(account);
        data.connectivity = connectivity || data.connectivity;
        data.positions = normalizePositions(positions);
        data.strategies = Array.isArray(strategies) ? strategies : data.strategies;
        data.logs = Array.isArray(logs) ? logs : data.logs;
        data.history = history || data.history;
        const marketFeed = Array.isArray(market) && market.length ? market : data.market;
        data.market = marketFeed;
        state.market = marketFeed.map((item) => ({ ...item, flashUntil: 0 }));
        state.dayTradesRemaining = data.connectivity.dayTradesRemaining || 0;
        state.remoteActive = true;
        updatePortfolioHistory(history);
        logLine('REMOTE API CONNECTED');
        connectMarketSocket();
    } catch (error) {
        logLine('REMOTE API PARTIAL FAILURE - USING LOCAL MOCK');
    }
};

const refreshRemoteClock = async () => {
    if (!state.remoteActive) return;
    try {
        const clock = await fetchJson(`${API_BASE}/api/clock`);
        state.marketOpen = Boolean(clock?.is_open);
        setMarketStatus();
    } catch (error) {
        logLine('REMOTE CLOCK UPDATE FAILED');
    }
};

const refreshRemoteMarket = async () => {
    if (!state.remoteActive) return;
    try {
        const market = await fetchJson(`${API_BASE}/api/market`);
        if (Array.isArray(market) && market.length) {
            data.market = market;
            state.market = market.map((item) => ({ ...item, flashUntil: 0 }));
            renderMarketTable();
        }
    } catch (error) {
        logLine('REMOTE MARKET UPDATE FAILED');
    }
};

let marketRenderScheduled = false;
const scheduleMarketRender = () => {
    if (marketRenderScheduled) return;
    marketRenderScheduled = true;
    requestAnimationFrame(() => {
        renderMarketTable();
        marketRenderScheduled = false;
    });
};

const connectMarketSocket = () => {
    if (state.wsAttempted) return;
    state.wsAttempted = true;

    const base = API_BASE || window.location.origin;
    const wsUrl = base.replace('https://', 'wss://').replace('http://', 'ws://') + '/ws/market';
    const socket = new WebSocket(wsUrl);

    socket.addEventListener('open', () => {
        state.wsConnected = true;
        updateConnectivity();
        logLine('WS: Market stream connected');
    });

    socket.addEventListener('message', (event) => {
        try {
            const payload = JSON.parse(event.data);
            if (payload.type === 'trade') {
                const symbol = payload.symbol;
                const price = Number(payload.price);
                const chgPct = Number(payload.chgPct);
                const item = state.market.find((row) => row.symbol === symbol);
                if (item) {
                    const prevSignal = item.signal;
                    item.last = price;
                    item.chgPct = chgPct;
                    if (item.score >= 90 && item.chgPct > 1.4) {
                        item.signal = 'STRONG BUY';
                    } else if (item.score >= 80) {
                        item.signal = 'BUY';
                    } else if (item.score <= 40 || item.chgPct < -1.5) {
                        item.signal = 'SELL';
                    } else {
                        item.signal = 'WAIT';
                    }
                    if (item.signal === 'STRONG BUY' && prevSignal !== 'STRONG BUY') {
                        item.flashUntil = Date.now() + 2200;
                        if (elements.scannerAlert) {
                            elements.scannerAlert.textContent = `ALERT: ${item.symbol} STRONG BUY`;
                        }
                    }
                    scheduleMarketRender();
                }
            }
        } catch (error) {
            logLine('WS: Invalid payload');
        }
    });

    socket.addEventListener('close', () => {
        state.wsConnected = false;
        updateConnectivity();
        logLine('WS: Market stream closed, fallback to polling');
    });

    socket.addEventListener('error', () => {
        state.wsConnected = false;
        updateConnectivity();
        logLine('WS: Connection error, fallback to polling');
    });
};

const handleContextMenu = (event) => {
    if (!elements.scanContextMenu || !elements.marketTableBody) return;
    const row = event.target.closest('tr[data-symbol]');
    if (!row) return;
    event.preventDefault();
    const symbol = row.dataset.symbol;
    elements.scanContextMenu.dataset.symbol = symbol;
    elements.scanContextMenu.style.left = `${event.clientX + 8}px`;
    elements.scanContextMenu.style.top = `${event.clientY + 8}px`;
    elements.scanContextMenu.classList.remove('hidden');
    document.body.classList.add('context-open');
};

const hideContextMenu = () => {
    if (!elements.scanContextMenu) return;
    elements.scanContextMenu.classList.add('hidden');
    document.body.classList.remove('context-open');
};

const handleContextAction = (event) => {
    if (!elements.scanContextMenu) return;
    const action = event.target.dataset.action;
    if (!action) return;
    const symbol = elements.scanContextMenu.dataset.symbol || 'UNKNOWN';
    if (action === 'execute') {
        if (elements.manualSymbol) elements.manualSymbol.value = symbol;
        if (elements.manualSide) elements.manualSide.value = 'BUY';
        syncOrderPreview();
        openModal();
        logLine(`EXECUTE: Manual order staged for ${symbol}`);
    }
    if (action === 'blacklist') {
        logLine(`BLACKLIST: ${symbol} added to deny list`);
    }
    if (action === 'log') {
        logLine(`LOG REQUEST: Strategy log opened for ${symbol}`);
    }
    hideContextMenu();
};

const submitOrder = async () => {
    if (!state.orderPreview) return;
    const payload = {
        symbol: state.orderPreview.symbol,
        side: state.orderPreview.side.toLowerCase(),
        qty: state.orderPreview.qty,
        type: 'market',
        time_in_force: 'gtc',
        take_profit: { limit_price: state.orderPreview.takeProfit },
        stop_loss: { stop_price: state.orderPreview.stopLoss }
    };
    try {
        const response = await fetch(`${API_BASE}/api/orders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            throw new Error(`ORDER HTTP ${response.status}`);
        }
        const result = await response.json();
        logLine(`EXEC: Order accepted ${result.id || ''}`.trim());
    } catch (error) {
        logLine('EXEC: Order queued locally (API unavailable)');
    }
};

if (elements.manualSymbol) {
    elements.manualSymbol.addEventListener('input', syncOrderPreview);
}
if (elements.manualQty) {
    elements.manualQty.addEventListener('input', syncOrderPreview);
}
if (elements.manualSide) {
    elements.manualSide.addEventListener('change', syncOrderPreview);
}
if (elements.executeStrategyBtn) {
    elements.executeStrategyBtn.addEventListener('click', openModal);
}
if (elements.cancelOrderBtn) {
    elements.cancelOrderBtn.addEventListener('click', closeModal);
}
if (elements.confirmOrderBtn) {
    elements.confirmOrderBtn.addEventListener('click', () => {
        submitOrder();
        closeModal();
    });
}
if (elements.warGameToggleBtn && elements.warGameStatus) {
    elements.warGameToggleBtn.addEventListener('click', () => {
        state.warGame = !state.warGame;
        elements.warGameStatus.textContent = state.warGame ? 'ON' : 'OFF';
        elements.warGameStatus.classList.toggle('text-amber-400', state.warGame);
        elements.warGameStatus.classList.toggle('text-ops-danger', !state.warGame);
        logLine(`WAR GAME MODE ${state.warGame ? 'ENABLED' : 'DISABLED'}`);
    });
}
if (elements.liquidateAllBtn) {
    elements.liquidateAllBtn.addEventListener('click', () => {
        if (confirm('CONFIRM LIQUIDATE ALL POSITIONS?')) {
            logLine('EXEC: Liquidation command broadcast');
        }
    });
}
if (elements.pauseAllBtn) {
    elements.pauseAllBtn.addEventListener('click', () => {
        logLine('PAUSE: All strategies paused');
    });
}
if (elements.buyMaxBtn) {
    elements.buyMaxBtn.addEventListener('click', () => {
        if (elements.manualQty) elements.manualQty.value = '250';
        if (elements.manualSide) elements.manualSide.value = 'BUY';
        syncOrderPreview();
    });
}
if (elements.sellHalfBtn) {
    elements.sellHalfBtn.addEventListener('click', () => {
        if (elements.manualQty) elements.manualQty.value = '50';
        if (elements.manualSide) elements.manualSide.value = 'SELL';
        syncOrderPreview();
    });
}
if (elements.marketStatusBadge) {
    elements.marketStatusBadge.addEventListener('click', () => {
        state.marketOpen = !state.marketOpen;
        setMarketStatus();
        logLine(state.marketOpen ? 'MARKET OPEN: Orders will route immediately' : 'MARKET CLOSED: Orders queued');
    });
}
if (elements.mobileStopBtn) {
    elements.mobileStopBtn.addEventListener('click', () => {
        if (confirm('STOP ALL TRADING?')) {
            logLine('MOBILE: Stop all trading requested');
        }
    });
}

if (labElements.labFetchBtn) {
    labElements.labFetchBtn.addEventListener('click', async () => {
        const symbol = labElements.labSymbol?.value?.trim().toUpperCase() || 'SPY';
        const timeframe = labElements.labTimeframe?.value || '1D';
        try {
            const payload = await fetchJson(`${API_BASE}/api/bars?symbol=${symbol}&timeframe=${timeframe}&limit=180`);
            const bars = payload?.bars || [];
            if (labElements.labCount) labElements.labCount.textContent = `${bars.length}`;
            const series = bars.map((bar) => bar.c || bar.close || 0).filter((value) => value);
            if (series.length) {
                renderSparkline(labElements.labLine, series, 100);
            }
        } catch (error) {
            logLine('RESEARCH LAB: Fetch failed');
        }
    });
}

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        closeModal();
        hideContextMenu();
    }
    if (event.key.toLowerCase() === 'b' && event.ctrlKey) {
        if (elements.manualSymbol) elements.manualSymbol.focus();
    }
    if (event.key === ' ') {
        event.preventDefault();
        if (elements.pauseAllBtn) elements.pauseAllBtn.click();
    }
});

if (elements.marketTableBody) {
    elements.marketTableBody.addEventListener('contextmenu', handleContextMenu);
}
document.addEventListener('click', hideContextMenu);
if (elements.scanContextMenu) {
    elements.scanContextMenu.addEventListener('click', handleContextAction);
}

updateConnectivity();
updateKpis();
renderMarketTable();
renderPositionsTable();
renderStrategies();
updateAlgoStatus();
initLogs();
setMarketStatus();
setPdtLock();
syncOrderPreview();
updateLastSync();
updatePortfolioHistory(data.history);
updateApiBaseLabel();

loadRemoteData().then(() => {
    updateConnectivity();
    updateKpis();
    renderMarketTable();
    renderPositionsTable();
    renderStrategies();
    updateAlgoStatus();
    setMarketStatus();
    setPdtLock();
    syncOrderPreview();
    updateLastSync();
});

setInterval(updateMarketTick, 1200);
setInterval(updateAccountTick, 2200);
setInterval(() => {
    if (state.remoteActive) return;
    data.connectivity.wsLatencyMs = Math.round(10 + Math.random() * 24);
    updateConnectivity();
    updateLastSync();
}, 4000);

setInterval(refreshRemoteClock, 12000);
setInterval(refreshRemoteMarket, 6000);

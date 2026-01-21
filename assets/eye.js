'use strict';

const API_BASE = window.OPS_API_BASE || '';
const data = window.OPS_MOCK_DATA || { market: [] };

const elements = {
    anomalyStream: document.getElementById('anomalyStream'),
    anomalyCount: document.getElementById('anomalyCount'),
    anomalyFilters: Array.from(document.querySelectorAll('.eye-filter')),
    focusSymbol: document.getElementById('focusSymbol'),
    focusApply: document.getElementById('focusApply'),
    focusPrice: document.getElementById('focusPrice'),
    focusSignal: document.getElementById('focusSignal'),
    focusCorr: document.getElementById('focusCorr'),
    focusBid: document.getElementById('focusBid'),
    focusAsk: document.getElementById('focusAsk'),
    focusSpread: document.getElementById('focusSpread'),
    imbalanceBar: document.getElementById('imbalanceBar'),
    imbalanceValue: document.getElementById('imbalanceValue'),
    heatmapCanvas: document.getElementById('heatmapCanvas'),
    heatmapSector: document.getElementById('heatmapSector'),
    powerMeter: document.getElementById('powerMeter'),
    tapeCanvas: document.getElementById('tapeCanvas'),
    focusChart: document.getElementById('focusChart'),
    watchlist: document.getElementById('watchlist'),
    corrValue: document.getElementById('corrValue'),
    spreadValue: document.getElementById('spreadValue'),
    corrAlert: document.getElementById('corrAlert'),
    apiLabel: document.getElementById('eyeApiLabel'),
    streamStatus: document.getElementById('eyeStreamStatus')
};

const state = {
    focus: 'NVDA',
    market: data.market.map((item) => ({ ...item, history: [item.last] })),
    trades: [],
    anomalies: [],
    correlationPairs: [['BTC/USD', 'COIN']],
    tapeBubbles: [],
    wsConnected: false,
    filterSector: null,
    heatmapZoom: 1,
    tickUp: 0,
    tickDown: 0,
    l1: {},
    filters: {
        WHALE_ALERT: true,
        VOL_SPIKE: true,
        FLASH_SPIKE: true,
        FLASH_CRASH: true,
        HALT_RESUME: true
    }
};

const formatPercent = (value) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;

const audioContext = window.AudioContext ? new AudioContext() : null;
const playTone = (frequency, duration = 0.4) => {
    if (!audioContext) return;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.frequency.value = frequency;
    oscillator.type = 'sine';
    gain.gain.value = 0.0001;
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start();
    gain.gain.exponentialRampToValueAtTime(0.2, audioContext.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);
    oscillator.stop(audioContext.currentTime + duration);
};

const triggerEdgeFlash = (className) => {
    document.body.classList.add(className);
    setTimeout(() => document.body.classList.remove(className), 600);
};

const logAnomaly = (payload) => {
    state.anomalies.unshift(payload);
    state.anomalies = state.anomalies.slice(0, 20);
    renderAnomalies();
};

const renderAnomalies = () => {
    if (!elements.anomalyStream) return;
    const filtered = state.anomalies.filter((item) => state.filters[item.kind]);
    if (elements.anomalyCount) {
        elements.anomalyCount.textContent = `${filtered.length}`;
    }
    elements.anomalyStream.innerHTML = filtered.map((item) => `
        <div class="anomaly-tag">
            <div class="text-ops-muted">${item.time}</div>
            <div class="${item.kind === 'WHALE_ALERT' ? 'text-amber-300' : 'text-ops-primary'}">
                ${item.icon} ${item.symbol} | ${item.detail} | $${item.price.toFixed(2)}
            </div>
        </div>
    `).join('');
};

const renderHeatmap = () => {
    const canvas = elements.heatmapCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width = canvas.offsetWidth;
    const height = canvas.height = canvas.offsetHeight;
    ctx.clearRect(0, 0, width, height);

    const items = state.market.filter((item) => !state.filterSector || item.sector === state.filterSector);
    if (!items.length) return;

    const totalVolume = items.reduce((sum, item) => sum + (item.volume || 1), 0);
    let x = 0;
    let y = 0;
    const rowHeight = (height / 3) * state.heatmapZoom;

    items.forEach((item, index) => {
        const ratio = (item.volume || 1) / totalVolume;
        const tileWidth = Math.max(60, ratio * width * 3 * state.heatmapZoom);
        if (x + tileWidth > width) {
            x = 0;
            y += rowHeight;
        }
        const color = item.chgPct >= 0 ? `rgba(16, 185, 129, ${Math.min(0.9, Math.abs(item.chgPct) / 5 + 0.2)})`
            : `rgba(239, 68, 68, ${Math.min(0.9, Math.abs(item.chgPct) / 5 + 0.2)})`;
        ctx.fillStyle = color;
        ctx.fillRect(x, y, tileWidth, rowHeight - 6);
        ctx.fillStyle = '#E2E8F0';
        ctx.font = '12px JetBrains Mono';
        ctx.fillText(item.symbol, x + 6, y + 16);
        ctx.fillText(formatPercent(item.chgPct), x + 6, y + 32);
        item._tile = { x, y, w: tileWidth, h: rowHeight - 6 };
        x += tileWidth + 6;
        if (index === items.length - 1) {
            x = 0;
            y += rowHeight;
        }
    });
    if (elements.heatmapSector) {
        elements.heatmapSector.textContent = state.filterSector || 'ALL';
    }
};

const renderPowerMeter = () => {
    const canvas = elements.powerMeter;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width = canvas.offsetWidth;
    const height = canvas.height = canvas.offsetHeight;
    ctx.clearRect(0, 0, width, height);

    const up = state.market.filter((item) => item.chgPct > 0).length;
    const down = state.market.filter((item) => item.chgPct < 0).length;
    const total = up + down || 1;
    const breadthRatio = up / total;
    const tickTotal = state.tickUp + state.tickDown || 1;
    const tickRatio = state.tickUp / tickTotal;
    const ratio = (breadthRatio * 0.6) + (tickRatio * 0.4);

    const centerX = width / 2;
    const centerY = height * 0.9;
    const radius = Math.min(width, height) * 0.4;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, Math.PI, 0);
    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = 8;
    ctx.stroke();

    const angle = Math.PI + ratio * Math.PI;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius);
    ctx.strokeStyle = ratio > 0.6 ? '#10B981' : ratio < 0.4 ? '#EF4444' : '#94A3B8';
    ctx.lineWidth = 4;
    ctx.stroke();
};

const renderFocusChart = () => {
    const canvas = elements.focusChart;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width = canvas.offsetWidth;
    const height = canvas.height = canvas.offsetHeight;
    ctx.clearRect(0, 0, width, height);

    const item = state.market.find((row) => row.symbol === state.focus);
    if (!item || item.history.length < 2) return;
    const series = item.history.slice(-80);
    const min = Math.min(...series);
    const max = Math.max(...series);
    const range = max - min || 1;
    ctx.strokeStyle = '#3B82F6';
    ctx.lineWidth = 2;
    ctx.beginPath();
    series.forEach((value, index) => {
        const x = (index / (series.length - 1)) * width;
        const y = height - ((value - min) / range) * height;
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.stroke();
};

const renderTape = () => {
    const canvas = elements.tapeCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width = canvas.offsetWidth;
    const height = canvas.height = canvas.offsetHeight;
    ctx.clearRect(0, 0, width, height);

    state.tapeBubbles = state.tapeBubbles.slice(-80);
    state.tapeBubbles.forEach((bubble) => {
        ctx.beginPath();
        ctx.fillStyle = bubble.side === 'B' ? 'rgba(16,185,129,0.7)' : 'rgba(239,68,68,0.7)';
        ctx.arc(bubble.x, bubble.y, bubble.radius, 0, Math.PI * 2);
        ctx.fill();
    });
};

const renderWatchlist = () => {
    if (!elements.watchlist) return;
    const sparkline = (series) => {
        if (!series || series.length < 2) return '';
        const slice = series.slice(-12);
        const min = Math.min(...slice);
        const max = Math.max(...slice);
        const range = max - min || 1;
        return slice.map((value, index) => {
            const x = (index / (slice.length - 1)) * 40;
            const y = 12 - ((value - min) / range) * 12;
            return `${x.toFixed(1)},${y.toFixed(1)}`;
        }).join(' ');
    };
    elements.watchlist.innerHTML = state.market.map((item) => `
        <div class="flex items-center justify-between gap-2 text-xs font-mono">
            <span class="text-ops-primary">${item.symbol}</span>
            <svg width="44" height="14" viewBox="0 0 40 14">
                <polyline fill="none" stroke="${item.chgPct >= 0 ? '#10B981' : '#EF4444'}" stroke-width="1.5"
                    points="${sparkline(item.history)}"></polyline>
            </svg>
            <span class="${item.chgPct >= 0 ? 'text-ops-primary' : 'text-ops-danger'}">${formatPercent(item.chgPct)}</span>
        </div>
    `).join('');
};

const updateFocus = () => {
    const item = state.market.find((row) => row.symbol === state.focus);
    if (!item) return;
    if (elements.focusPrice) {
        elements.focusPrice.textContent = `LAST: $${item.last.toFixed(2)}`;
    }
    if (elements.focusSignal) {
        elements.focusSignal.textContent = `SIGNAL: ${item.signal}`;
    }
    const l1 = state.l1[state.focus];
    if (l1) {
        if (elements.focusBid) elements.focusBid.textContent = `$${l1.bid.toFixed(2)} (${l1.bidSize})`;
        if (elements.focusAsk) elements.focusAsk.textContent = `$${l1.ask.toFixed(2)} (${l1.askSize})`;
        if (elements.focusSpread) elements.focusSpread.textContent = `$${(l1.ask - l1.bid).toFixed(2)}`;
        if (elements.imbalanceBar) {
            elements.imbalanceBar.style.width = `${Math.round(l1.imbalance * 100)}%`;
            elements.imbalanceBar.className = `h-full ${l1.imbalance > 0.7 ? 'bg-ops-primary' : l1.imbalance < 0.3 ? 'bg-ops-danger' : 'bg-ops-accent'}`;
        }
        if (elements.imbalanceValue) {
            elements.imbalanceValue.textContent = `${Math.round(l1.imbalance * 100)}%`;
        }
    }
};

const updateCorrelation = () => {
    const [a, b] = state.correlationPairs[0];
    const itemA = state.market.find((row) => row.symbol === a);
    const itemB = state.market.find((row) => row.symbol === b);
    if (!itemA || !itemB) return;
    const seriesA = itemA.history.slice(-20);
    const seriesB = itemB.history.slice(-20);
    if (seriesA.length < 5 || seriesB.length < 5) return;
    const meanA = seriesA.reduce((sum, val) => sum + val, 0) / seriesA.length;
    const meanB = seriesB.reduce((sum, val) => sum + val, 0) / seriesB.length;
    let cov = 0;
    let varA = 0;
    let varB = 0;
    for (let i = 0; i < seriesA.length; i += 1) {
        cov += (seriesA[i] - meanA) * (seriesB[i] - meanB);
        varA += (seriesA[i] - meanA) ** 2;
        varB += (seriesB[i] - meanB) ** 2;
    }
    const corr = cov / Math.sqrt(varA * varB);
    const spread = Math.abs(itemA.chgPct - itemB.chgPct);
    if (elements.focusCorr) {
        elements.focusCorr.textContent = `CORR: ${corr.toFixed(2)}`;
        elements.focusCorr.className = corr < 0.8 ? 'text-ops-danger text-xs font-mono' : 'text-ops-muted text-xs font-mono';
    }
    if (elements.corrValue) elements.corrValue.textContent = corr.toFixed(2);
    if (elements.spreadValue) elements.spreadValue.textContent = `${spread.toFixed(2)}%`;
    if (elements.corrAlert) {
        const alert = corr < 0.8 && spread > 1.2;
        elements.corrAlert.textContent = alert ? 'STATUS: ARB ALERT' : 'STATUS: NORMAL';
        elements.corrAlert.className = alert ? 'mt-2 text-[10px] font-mono text-amber-300' : 'mt-2 text-[10px] font-mono text-ops-muted';
    }
};

const handleTrade = (payload) => {
    const item = state.market.find((row) => row.symbol === payload.symbol);
    if (!item) return;
    const prev = item.last;
    item.last = payload.price;
    item.chgPct = prev ? ((payload.price - prev) / prev) * 100 : 0;
    item.history.push(payload.price);
    item.history = item.history.slice(-120);
    if (payload.side === 'B') state.tickUp += 1;
    if (payload.side === 'S') state.tickDown += 1;
    if (payload.symbol === state.focus) {
        const series = item.history.slice(-80);
        const min = Math.min(...series);
        const max = Math.max(...series);
        const range = max - min || 1;
        const width = elements.tapeCanvas.offsetWidth || 1;
        const height = elements.tapeCanvas.offsetHeight || 1;
        state.tapeBubbles.push({
            x: Math.random() * width,
            y: height - ((payload.price - min) / range) * height,
            radius: Math.max(3, Math.min(18, payload.size / 200)),
            side: payload.side === 'B' ? 'B' : 'S'
        });
    }
};

const handleQuote = (payload) => {
    const symbol = payload.symbol;
    if (!symbol) return;
    state.l1[symbol] = {
        bid: payload.bid,
        ask: payload.ask,
        bidSize: payload.bidSize,
        askSize: payload.askSize,
        imbalance: payload.imbalance
    };
};

const handleAnomaly = (payload) => {
    const iconMap = {
        WHALE_ALERT: '🐋',
        VOL_SPIKE: '🔥',
        FLASH_SPIKE: '⚡',
        FLASH_CRASH: '🧊',
        HALT_RESUME: '🚀'
    };
    if (payload.kind === 'WHALE_ALERT') {
        playTone(180, 0.6);
        triggerEdgeFlash('whale-alert');
    }
    if (payload.kind === 'HALT_RESUME') {
        playTone(420, 0.2);
        triggerEdgeFlash('halt-alert');
    }
    logAnomaly({
        icon: iconMap[payload.kind] || '⚡',
        symbol: payload.symbol,
        detail: payload.detail,
        price: payload.price,
        kind: payload.kind,
        time: new Date().toLocaleTimeString('en-US', { hour12: false })
    });
};

const connectEyeSocket = () => {
    const base = API_BASE || window.location.origin;
    const wsUrl = base.replace('https://', 'wss://').replace('http://', 'ws://') + '/ws/eye';
    const socket = new WebSocket(wsUrl);
    if (elements.streamStatus) elements.streamStatus.textContent = 'WS: CONNECTING';
    socket.addEventListener('open', () => {
        state.wsConnected = true;
        if (elements.streamStatus) elements.streamStatus.textContent = 'WS: LIVE';
    });
    socket.addEventListener('message', (event) => {
        const payload = JSON.parse(event.data);
        if (payload.type === 'trade') handleTrade(payload);
        if (payload.type === 'anomaly') handleAnomaly(payload);
        if (payload.type === 'quote') handleQuote(payload);
    });
    socket.addEventListener('close', () => {
        state.wsConnected = false;
        if (elements.streamStatus) elements.streamStatus.textContent = 'WS: CLOSED';
        setTimeout(connectEyeSocket, 5000);
    });
    socket.addEventListener('error', () => {
        state.wsConnected = false;
        if (elements.streamStatus) elements.streamStatus.textContent = 'WS: ERROR';
    });
};

const drawLoop = () => {
    renderHeatmap();
    renderPowerMeter();
    renderFocusChart();
    renderTape();
    renderWatchlist();
    updateFocus();
    updateCorrelation();
    state.tickUp = Math.max(0, state.tickUp - 0.05);
    state.tickDown = Math.max(0, state.tickDown - 0.05);
    requestAnimationFrame(drawLoop);
};

elements.focusApply?.addEventListener('click', () => {
    state.focus = elements.focusSymbol.value.trim().toUpperCase() || 'NVDA';
    elements.focusSymbol.value = state.focus;
});

elements.heatmapCanvas?.addEventListener('click', (event) => {
    const rect = elements.heatmapCanvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const items = state.market.filter((item) => !state.filterSector || item.sector === state.filterSector);
    const hit = items.find((item) => item._tile && x >= item._tile.x && x <= item._tile.x + item._tile.w && y >= item._tile.y && y <= item._tile.y + item._tile.h);
    if (hit) {
        state.filterSector = state.filterSector === hit.sector ? null : hit.sector;
    }
});

elements.heatmapCanvas?.addEventListener('wheel', (event) => {
    event.preventDefault();
    const delta = event.deltaY > 0 ? -0.05 : 0.05;
    state.heatmapZoom = Math.min(1.6, Math.max(0.7, state.heatmapZoom + delta));
});

elements.anomalyFilters?.forEach((button) => {
    button.classList.add('active');
    button.addEventListener('click', () => {
        const kind = button.dataset.filter;
        state.filters[kind] = !state.filters[kind];
        button.classList.toggle('active', state.filters[kind]);
        renderAnomalies();
    });
});

if (elements.apiLabel) {
    elements.apiLabel.textContent = `API: ${API_BASE || 'LOCAL'}`;
}

connectEyeSocket();
drawLoop();

setInterval(() => {
    if (state.wsConnected) return;
    state.market.forEach((item) => {
        const drift = item.asset === 'Crypto' ? 0.6 : 0.25;
        const delta = (Math.random() - 0.5) * drift;
        handleTrade({
            symbol: item.symbol,
            price: item.last * (1 + delta / 100),
            size: Math.max(20, Math.random() * 600),
            side: Math.random() > 0.5 ? 'B' : 'S'
        });
        if (Math.random() > 0.98) {
            handleAnomaly({
                kind: 'VOL_SPIKE',
                symbol: item.symbol,
                detail: 'Vol Spike',
                price: item.last
            });
        }
    });
}, 1200);

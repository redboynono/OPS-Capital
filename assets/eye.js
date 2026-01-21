'use strict';

const API_BASE = window.OPS_API_BASE || '';
const data = window.OPS_MOCK_DATA || { market: [] };

const elements = {
    anomalyStream: document.getElementById('anomalyStream'),
    focusSymbol: document.getElementById('focusSymbol'),
    focusApply: document.getElementById('focusApply'),
    focusPrice: document.getElementById('focusPrice'),
    focusSignal: document.getElementById('focusSignal'),
    focusCorr: document.getElementById('focusCorr'),
    heatmapCanvas: document.getElementById('heatmapCanvas'),
    powerMeter: document.getElementById('powerMeter'),
    tapeCanvas: document.getElementById('tapeCanvas'),
    focusChart: document.getElementById('focusChart'),
    watchlist: document.getElementById('watchlist'),
    whaleAudio: document.getElementById('whaleAudio'),
    haltAudio: document.getElementById('haltAudio'),
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
    filterSector: null
};

const formatPercent = (value) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;

const logAnomaly = (payload) => {
    state.anomalies.unshift(payload);
    state.anomalies = state.anomalies.slice(0, 20);
    renderAnomalies();
};

const renderAnomalies = () => {
    if (!elements.anomalyStream) return;
    elements.anomalyStream.innerHTML = state.anomalies.map((item) => `
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
    const rowHeight = height / 3;

    items.forEach((item, index) => {
        const ratio = (item.volume || 1) / totalVolume;
        const tileWidth = Math.max(60, ratio * width * 3);
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
    const ratio = up / total;

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
    elements.watchlist.innerHTML = state.market.map((item) => `
        <div class="flex items-center justify-between text-xs font-mono">
            <span class="text-ops-primary">${item.symbol}</span>
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
    if (elements.focusCorr) {
        elements.focusCorr.textContent = `CORR: ${corr.toFixed(2)}`;
        elements.focusCorr.className = corr < 0.8 ? 'text-ops-danger text-xs font-mono' : 'text-ops-muted text-xs font-mono';
    }
};

const handleTrade = (payload) => {
    const item = state.market.find((row) => row.symbol === payload.symbol);
    if (!item) return;
    item.last = payload.price;
    item.chgPct = payload.chgPct;
    item.history.push(payload.price);
    item.history = item.history.slice(-120);
    if (payload.symbol === state.focus) {
        state.tapeBubbles.push({
            x: Math.random() * elements.tapeCanvas.offsetWidth,
            y: Math.random() * elements.tapeCanvas.offsetHeight,
            radius: Math.max(3, Math.min(18, payload.size / 200)),
            side: payload.side === 'B' ? 'B' : 'S'
        });
    }
};

const handleAnomaly = (payload) => {
    const iconMap = {
        WHALE_ALERT: '🐋',
        VOL_SPIKE: '🔥',
        FLASH_SPIKE: '⚡',
        FLASH_CRASH: '🧊',
        HALT_RESUME: '🚀'
    };
    if (payload.kind === 'WHALE_ALERT' && elements.whaleAudio) {
        elements.whaleAudio.play().catch(() => {});
    }
    if (payload.kind === 'HALT_RESUME' && elements.haltAudio) {
        elements.haltAudio.play().catch(() => {});
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
    });
    socket.addEventListener('close', () => {
        state.wsConnected = false;
        if (elements.streamStatus) elements.streamStatus.textContent = 'WS: CLOSED';
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
    requestAnimationFrame(drawLoop);
};

elements.focusApply?.addEventListener('click', () => {
    state.focus = elements.focusSymbol.value.trim().toUpperCase() || 'NVDA';
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

if (elements.apiLabel) {
    elements.apiLabel.textContent = `API: ${API_BASE || 'LOCAL'}`;
}

connectEyeSocket();
drawLoop();

import asyncio
import json
import os
from datetime import datetime, timezone
from typing import List, Optional

import httpx
import websockets
from pydantic import BaseModel

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="OPS Terminal Mock API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


ALPACA_API_KEY = os.getenv("ALPACA_API_KEY")
ALPACA_SECRET_KEY = os.getenv("ALPACA_SECRET_KEY") or os.getenv("ALPACA_API_SECRET")
ALPACA_PAPER = os.getenv("ALPACA_PAPER", "true").lower() == "true"
ALPACA_BASE_URL = os.getenv(
    "ALPACA_BASE_URL",
    "https://paper-api.alpaca.markets" if ALPACA_PAPER else "https://api.alpaca.markets",
)
ALPACA_DATA_URL = os.getenv("ALPACA_DATA_URL", "https://data.alpaca.markets")
ALPACA_FEED = os.getenv("ALPACA_FEED", "iex")


class MockStore:
    account = {
        "aum": 128_400_220,
        "pnl": 1_482_120,
        "cashRatio": 0.30,
        "var": 3_200_000,
        "exposure": 1.2,
    }
    connectivity = {
        "alpacaStatus": "CONNECTED",
        "wsLatencyMs": 12,
        "buyingPower": 100_000,
        "buyingPowerMultiple": 4,
        "dayTradesRemaining": 1,
    }
    market = [
        {"symbol": "NVDA", "last": 902.14, "chgPct": 3.42, "score": 92, "volMa": 4.8, "signal": "STRONG BUY", "asset": "Equity", "sector": "Semis", "volume": 38120000},
        {"symbol": "AAPL", "last": 192.38, "chgPct": 0.82, "score": 71, "volMa": 1.2, "signal": "WAIT", "asset": "Equity", "sector": "Mega Cap", "volume": 71200000},
        {"symbol": "BTC/USD", "last": 64218.0, "chgPct": 1.18, "score": 69, "volMa": 2.2, "signal": "WAIT", "asset": "Crypto", "sector": "Crypto", "volume": 12500},
        {"symbol": "TSLA", "last": 238.09, "chgPct": -2.14, "score": 39, "volMa": 3.1, "signal": "SELL", "asset": "Equity", "sector": "Auto", "volume": 46800000},
        {"symbol": "MSFT", "last": 402.01, "chgPct": 1.06, "score": 66, "volMa": 0.9, "signal": "WAIT", "asset": "Equity", "sector": "Mega Cap", "volume": 30100000},
        {"symbol": "AMD", "last": 168.44, "chgPct": 2.41, "score": 84, "volMa": 1.7, "signal": "BUY", "asset": "Equity", "sector": "Semis", "volume": 51200000},
        {"symbol": "META", "last": 488.61, "chgPct": -0.74, "score": 58, "volMa": 1.0, "signal": "WAIT", "asset": "Equity", "sector": "Mega Cap", "volume": 20900000},
        {"symbol": "COIN", "last": 224.2, "chgPct": 1.74, "score": 76, "volMa": 1.5, "signal": "WAIT", "asset": "Equity", "sector": "Crypto Proxy", "volume": 18200000},
    ]
    positions = [
        {"symbol": "NVDA", "cost": 842.1, "last": 902.14, "pnlPct": 7.1, "stop": 860.0},
        {"symbol": "AAPL", "cost": 186.0, "last": 192.38, "pnlPct": 3.4, "stop": 180.5},
        {"symbol": "TSLA", "cost": 246.9, "last": 238.09, "pnlPct": -3.6, "stop": 232.0},
    ]
    strategies = [
        {"name": "Strategy_Tech_Momentum_v2", "pnl": 482_210, "positions": 14, "status": "RUNNING"},
        {"name": "Strategy_Defensive_Alpha", "pnl": 91_120, "positions": 6, "status": "PAUSED"},
        {"name": "Strategy_Crypto_Liq", "pnl": -14_802, "positions": 3, "status": "RUNNING"},
    ]
    logs = [
        "[10:00:01] INFO: Scanning AAPL... RSI=72, Overbought.",
        "[10:00:02] WARN: TSLA Volatility Spike detected!",
        "[10:00:05] EXEC: Placing ORDER -> BUY 100 NVDA @ MKT",
    ]


@app.get("/api/health")
def health():
    return {"status": "ok", "ts": datetime.now(timezone.utc).isoformat()}


async def alpaca_get(path: str, params: Optional[dict] = None) -> Optional[dict]:
    if not (ALPACA_API_KEY and ALPACA_SECRET_KEY):
        return None
    url = f"{ALPACA_BASE_URL}{path}"
    headers = {
        "APCA-API-KEY-ID": ALPACA_API_KEY,
        "APCA-API-SECRET-KEY": ALPACA_SECRET_KEY,
    }
    async with httpx.AsyncClient(timeout=5.0) as client:
        response = await client.get(url, headers=headers, params=params)
        response.raise_for_status()
        return response.json()


async def alpaca_post(path: str, payload: dict) -> Optional[dict]:
    if not (ALPACA_API_KEY and ALPACA_SECRET_KEY):
        return None
    url = f"{ALPACA_BASE_URL}{path}"
    headers = {
        "APCA-API-KEY-ID": ALPACA_API_KEY,
        "APCA-API-SECRET-KEY": ALPACA_SECRET_KEY,
    }
    async with httpx.AsyncClient(timeout=6.0) as client:
        response = await client.post(url, headers=headers, json=payload)
        response.raise_for_status()
        return response.json()


async def alpaca_data_get(path: str, params: Optional[dict] = None) -> Optional[dict]:
    if not (ALPACA_API_KEY and ALPACA_SECRET_KEY):
        return None
    url = f"{ALPACA_DATA_URL}{path}"
    headers = {
        "APCA-API-KEY-ID": ALPACA_API_KEY,
        "APCA-API-SECRET-KEY": ALPACA_SECRET_KEY,
    }
    async with httpx.AsyncClient(timeout=6.0) as client:
        response = await client.get(url, headers=headers, params=params)
        response.raise_for_status()
        return response.json()


class OrderRequest(BaseModel):
    symbol: str
    side: str
    qty: float
    type: str = "market"
    time_in_force: str = "gtc"
    take_profit: Optional[dict] = None
    stop_loss: Optional[dict] = None


@app.get("/api/clock")
async def clock():
    alpaca_clock = await alpaca_get("/v2/clock")
    if alpaca_clock:
        return alpaca_clock
    now = datetime.now(timezone.utc)
    market_open = now.weekday() < 5 and 13 <= now.hour < 20
    return {
        "is_open": market_open,
        "timestamp": now.isoformat(),
        "next_open": None,
        "next_close": None,
    }


@app.get("/api/account")
async def account():
    alpaca_account = await alpaca_get("/v2/account")
    if alpaca_account:
        return alpaca_account
    return MockStore.account


@app.get("/api/connectivity")
async def connectivity():
    payload = dict(MockStore.connectivity)
    payload["feed"] = ALPACA_FEED
    payload["paper"] = ALPACA_PAPER
    return payload


@app.get("/api/market")
async def market() -> List[dict]:
    if not (ALPACA_API_KEY and ALPACA_SECRET_KEY):
        return MockStore.market

    symbols = [item["symbol"] for item in MockStore.market]
    equity_symbols = [symbol for symbol in symbols if "/" not in symbol]
    crypto_symbols = [symbol for symbol in symbols if "/" in symbol]
    base_map = {item["symbol"]: item for item in MockStore.market}

    result: List[dict] = []
    try:
        if equity_symbols:
            trades_payload = await alpaca_data_get(
                "/v2/stocks/trades/latest",
                params={"symbols": ",".join(equity_symbols), "feed": ALPACA_FEED},
            )
            trades = (trades_payload or {}).get("trades", {})
            for symbol in equity_symbols:
                base = dict(base_map[symbol])
                trade = trades.get(symbol)
                if trade and trade.get("p"):
                    last = float(trade["p"])
                    base_last = float(base["last"])
                    base["last"] = last
                    base["chgPct"] = ((last - base_last) / base_last) * 100
                result.append(base)

        if crypto_symbols:
            crypto_payload = await alpaca_data_get(
                "/v1beta3/crypto/us/latest/trades",
                params={"symbols": ",".join(crypto_symbols)},
            )
            trades = (crypto_payload or {}).get("trades", {})
            for symbol in crypto_symbols:
                base = dict(base_map[symbol])
                trade = trades.get(symbol)
                if trade and trade.get("p"):
                    last = float(trade["p"])
                    base_last = float(base["last"])
                    base["last"] = last
                    base["chgPct"] = ((last - base_last) / base_last) * 100
                result.append(base)

        return result or MockStore.market
    except httpx.HTTPError:
        return MockStore.market


@app.get("/api/positions")
async def positions() -> List[dict]:
    alpaca_positions = await alpaca_get("/v2/positions")
    if alpaca_positions:
        return alpaca_positions
    return MockStore.positions


@app.get("/api/strategies")
def strategies() -> List[dict]:
    return MockStore.strategies


@app.get("/api/logs")
def logs():
    return MockStore.logs


@app.get("/api/portfolio/history")
async def portfolio_history(
    period: str = "1M",
    timeframe: str = "1D",
):
    payload = await alpaca_get(
        "/v2/account/portfolio/history",
        params={"period": period, "timeframe": timeframe},
    )
    if payload:
        return payload
    return {
        "timestamp": [int(datetime.now(timezone.utc).timestamp())],
        "equity": [MockStore.account["aum"]],
    }


@app.get("/api/bars")
async def bars(symbol: str, timeframe: str = "1D", limit: int = 200):
    if not (ALPACA_API_KEY and ALPACA_SECRET_KEY):
        return {"bars": []}
    if "/" in symbol:
        payload = await alpaca_data_get(
            "/v1beta3/crypto/us/bars",
            params={"symbols": symbol, "timeframe": timeframe, "limit": limit},
        )
        bars_data = (payload or {}).get("bars", {}).get(symbol, [])
        return {"bars": bars_data}
    payload = await alpaca_data_get(
        "/v2/stocks/bars",
        params={"symbols": symbol, "timeframe": timeframe, "limit": limit, "feed": ALPACA_FEED},
    )
    bars_data = (payload or {}).get("bars", {}).get(symbol, [])
    return {"bars": bars_data}


@app.get("/api/assets/{symbol}")
async def asset(symbol: str):
    alpaca_asset = await alpaca_get(f"/v2/assets/{symbol}")
    if alpaca_asset:
        return alpaca_asset
    return {"symbol": symbol, "shortable": False, "easy_to_borrow": False}


@app.post("/api/orders")
async def create_order(payload: OrderRequest):
    alpaca_order = await alpaca_post("/v2/orders", payload.model_dump())
    if alpaca_order:
        return alpaca_order
    return {
        "id": "MOCK-ORDER",
        "status": "accepted",
        "symbol": payload.symbol,
        "side": payload.side,
        "qty": payload.qty,
        "type": payload.type,
        "time_in_force": payload.time_in_force,
    }


@app.websocket("/ws/market")
async def market_stream(websocket: WebSocket):
    await websocket.accept()
    if not (ALPACA_API_KEY and ALPACA_SECRET_KEY):
        await websocket.send_json({"type": "error", "message": "ALPACA_KEYS_MISSING"})
        await websocket.close()
        return

    symbols = [item["symbol"] for item in MockStore.market]
    equity_symbols = [symbol for symbol in symbols if "/" not in symbol]
    crypto_symbols = [symbol for symbol in symbols if "/" in symbol]
    last_prices = {item["symbol"]: item["last"] for item in MockStore.market}

    async def pipe_alpaca(url: str, subscribe_payload: dict):
        auth_payload = {"action": "auth", "key": ALPACA_API_KEY, "secret": ALPACA_SECRET_KEY}
        async with websockets.connect(url, ping_interval=20, ping_timeout=20) as alpaca_ws:
            await alpaca_ws.send(json.dumps(auth_payload))
            await alpaca_ws.send(json.dumps(subscribe_payload))
            async for message in alpaca_ws:
                payload = json.loads(message)
                items = payload if isinstance(payload, list) else [payload]
                for item in items:
                    symbol = item.get("S") or item.get("symbol")
                    price = item.get("p") or item.get("price")
                    if not symbol or price is None:
                        continue
                    price = float(price)
                    previous = float(last_prices.get(symbol, price))
                    last_prices[symbol] = price
                    chg_pct = 0.0 if previous == 0 else (price - previous) / previous * 100
                    await websocket.send_json(
                        {"type": "trade", "symbol": symbol, "price": price, "chgPct": chg_pct}
                    )

    tasks = []
    try:
        if equity_symbols:
            tasks.append(
                asyncio.create_task(
                    pipe_alpaca(
                        f"wss://stream.data.alpaca.markets/v2/{ALPACA_FEED}",
                        {"action": "subscribe", "trades": equity_symbols},
                    )
                )
            )
        if crypto_symbols:
            tasks.append(
                asyncio.create_task(
                    pipe_alpaca(
                        "wss://stream.data.alpaca.markets/v1beta3/crypto/us",
                        {"action": "subscribe", "trades": crypto_symbols},
                    )
                )
            )
        await asyncio.gather(*tasks)
    except Exception:
        await websocket.close()
    finally:
        for task in tasks:
            task.cancel()


@app.websocket("/ws/eye")
async def eye_stream(websocket: WebSocket):
    await websocket.accept()
    if not (ALPACA_API_KEY and ALPACA_SECRET_KEY):
        await websocket.send_json({"type": "error", "message": "ALPACA_KEYS_MISSING"})
        await websocket.close()
        return

    symbols = [item["symbol"] for item in MockStore.market]
    equity_symbols = [symbol for symbol in symbols if "/" not in symbol]
    crypto_symbols = [symbol for symbol in symbols if "/" in symbol]

    last_prices = {item["symbol"]: item["last"] for item in MockStore.market}
    last_trade_ts: dict[str, float] = {}
    rolling_prices: dict[str, List[tuple[float, float]]] = {}
    ewma_size: dict[str, float] = {}

    def update_price_window(symbol: str, ts: float, price: float) -> Optional[float]:
        window = rolling_prices.setdefault(symbol, [])
        window.append((ts, price))
        cutoff = ts - 60.0
        while window and window[0][0] < cutoff:
            window.pop(0)
        if len(window) < 2:
            return None
        start_price = window[0][1]
        return 0.0 if start_price == 0 else (price - start_price) / start_price * 100

    async def emit_anomaly(kind: str, symbol: str, detail: str, price: float):
        await websocket.send_json(
            {
                "type": "anomaly",
                "symbol": symbol,
                "kind": kind,
                "detail": detail,
                "price": price,
            }
        )

    async def handle_trade(symbol: str, price: float, size: float, ts: float, side: Optional[str] = None):
        last_prices[symbol] = price
        gap = ts - last_trade_ts.get(symbol, ts)
        last_trade_ts[symbol] = ts

        change_pct = update_price_window(symbol, ts, price)
        avg_size = ewma_size.get(symbol, size)
        ewma_size[symbol] = avg_size * 0.92 + size * 0.08
        notional = price * size

        if gap > 120:
            await emit_anomaly("HALT_RESUME", symbol, "Halt Resume", price)
        if notional > 1_000_000:
            await emit_anomaly("WHALE_ALERT", symbol, f"Whale {notional:,.0f}", price)
        if avg_size and size > avg_size * 5:
            await emit_anomaly("VOL_SPIKE", symbol, f"Vol Spike {size:.0f}", price)
        if change_pct is not None and abs(change_pct) >= 2:
            label = "FLASH_SPIKE" if change_pct > 0 else "FLASH_CRASH"
            await emit_anomaly(label, symbol, f"{change_pct:+.2f}%", price)

        await websocket.send_json(
            {
                "type": "trade",
                "symbol": symbol,
                "price": price,
                "size": size,
                "ts": ts,
                "side": side,
            }
        )

    async def handle_quote(symbol: str, bid: float, ask: float, bid_size: float, ask_size: float):
        total = bid_size + ask_size
        imbalance = 0.0 if total == 0 else bid_size / total
        await websocket.send_json(
            {
                "type": "quote",
                "symbol": symbol,
                "bid": bid,
                "ask": ask,
                "bidSize": bid_size,
                "askSize": ask_size,
                "imbalance": imbalance,
            }
        )

    async def pipe_alpaca(url: str, subscribe_payload: dict):
        auth_payload = {"action": "auth", "key": ALPACA_API_KEY, "secret": ALPACA_SECRET_KEY}
        async with websockets.connect(url, ping_interval=20, ping_timeout=20) as alpaca_ws:
            await alpaca_ws.send(json.dumps(auth_payload))
            await alpaca_ws.send(json.dumps(subscribe_payload))
            async for message in alpaca_ws:
                payload = json.loads(message)
                items = payload if isinstance(payload, list) else [payload]
                for item in items:
                    symbol = item.get("S") or item.get("symbol")
                    if not symbol:
                        continue
                    msg_type = item.get("T") or item.get("type")
                    if msg_type in ("t", "trade", "T"):
                        price = item.get("p") or item.get("price")
                        size = item.get("s") or item.get("size")
                        ts = item.get("t") or item.get("timestamp") or datetime.now(timezone.utc).timestamp()
                        side = item.get("tks") or item.get("side")
                        if price is not None and size is not None:
                            await handle_trade(symbol, float(price), float(size), float(ts), side)
                    if msg_type in ("q", "quote", "Q"):
                        bid = item.get("bp") or item.get("bid")
                        ask = item.get("ap") or item.get("ask")
                        bid_size = item.get("bs") or item.get("bid_size") or 0
                        ask_size = item.get("as") or item.get("ask_size") or 0
                        if bid is not None and ask is not None:
                            await handle_quote(symbol, float(bid), float(ask), float(bid_size), float(ask_size))

    tasks = []
    try:
        if equity_symbols:
            tasks.append(
                asyncio.create_task(
                    pipe_alpaca(
                        f"wss://stream.data.alpaca.markets/v2/{ALPACA_FEED}",
                        {"action": "subscribe", "trades": equity_symbols, "quotes": equity_symbols},
                    )
                )
            )
        if crypto_symbols:
            tasks.append(
                asyncio.create_task(
                    pipe_alpaca(
                        "wss://stream.data.alpaca.markets/v1beta3/crypto/us",
                        {"action": "subscribe", "trades": crypto_symbols},
                    )
                )
            )
        await asyncio.gather(*tasks)
    except Exception:
        await websocket.close()
    finally:
        for task in tasks:
            task.cancel()
